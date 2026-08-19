-- 1. Planning production (manager) : objectif journalier réparti par pôle,
--    comparable à la production réellement réalisée par pôle.
--
--    Design : production_jour (0027) reste EXACTEMENT le pool vendable
--    combiné par produit+jour, avec son trigger de décrément de vente
--    inchangé (verifier_et_decrementer_production) — la répartition par
--    pôle décidée par le manager est un outil de planification de charge
--    de travail, pas une isolation de stocks : une vente décrémente le
--    total combiné, peu importe quel pôle a produit. Le détail "qui a
--    produit combien" vit dans production_jour_contributions, uniquement
--    pour le suivi/écart, et alimente production_jour par delta.

create table objectifs_production (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants(id),
  jour              date not null default current_date,
  produit_id        uuid not null references produits(id),
  pole              pole_type not null,
  quantite_prevue   integer not null check (quantite_prevue >= 0),
  cree_par          uuid references utilisateurs(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (produit_id, pole, jour)
);

alter table objectifs_production enable row level security;

create policy "objectifs_production_select" on objectifs_production
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

create policy "objectifs_production_write" on objectifs_production
  for all
  using (is_manager_or_admin() and (is_admin() or restaurant_id = my_restaurant_id()))
  with check (is_manager_or_admin() and (is_admin() or restaurant_id = my_restaurant_id()));

create table production_jour_contributions (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants(id),
  produit_id        uuid not null references produits(id),
  pole              pole_type not null,
  jour              date not null default current_date,
  quantite_produite integer not null check (quantite_produite >= 0),
  chef_id           uuid not null references utilisateurs(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (produit_id, pole, jour)
);

alter table production_jour_contributions enable row level security;

create policy "production_jour_contributions_select" on production_jour_contributions
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

-- Pas de policy d'écriture directe : uniquement via definir_production_jour
-- ci-dessous (security definer), même principe que production_jour (0027).

drop function if exists definir_production_jour(uuid, integer);

create or replace function definir_production_jour(p_produit_id uuid, p_pole pole_type, p_quantite integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_restaurant_id uuid;
  v_ancienne_contribution integer;
  v_delta integer;
begin
  if p_quantite is null or p_quantite < 0 then
    raise exception 'La quantité produite doit être un nombre positif ou nul.';
  end if;
  if not (is_chef() or is_manager_or_admin()) then
    raise exception 'Rôle non autorisé à renseigner la production.';
  end if;
  if is_chef() and p_pole <> my_pole() then
    raise exception 'Vous ne pouvez renseigner la production que pour votre pôle.';
  end if;

  select restaurant_id into v_restaurant_id from produits where id = p_produit_id;
  if v_restaurant_id is null then
    raise exception 'Produit introuvable.';
  end if;
  if not is_admin() and v_restaurant_id <> my_restaurant_id() then
    raise exception 'Ce produit n''appartient pas à votre restaurant.';
  end if;

  select quantite_produite into v_ancienne_contribution
  from production_jour_contributions
  where produit_id = p_produit_id and pole = p_pole and jour = current_date;

  v_ancienne_contribution := coalesce(v_ancienne_contribution, 0);
  v_delta := p_quantite - v_ancienne_contribution;

  insert into production_jour_contributions
    (restaurant_id, produit_id, pole, chef_id, jour, quantite_produite)
  values
    (v_restaurant_id, p_produit_id, p_pole, auth.uid(), current_date, p_quantite)
  on conflict (produit_id, pole, jour) do update
    set quantite_produite = p_quantite, chef_id = auth.uid(), updated_at = now();

  insert into production_jour
    (restaurant_id, produit_id, chef_id, jour, quantite_produite, quantite_restante)
  values
    (v_restaurant_id, p_produit_id, auth.uid(), current_date, p_quantite, p_quantite)
  on conflict (produit_id, jour) do update
    set quantite_restante = production_jour.quantite_restante + v_delta,
        quantite_produite = production_jour.quantite_produite + v_delta,
        chef_id = auth.uid(),
        updated_at = now()
    where production_jour.quantite_restante + v_delta >= 0;

  if not found then
    raise exception 'Cette quantité est inférieure à ce qui a déjà été vendu aujourd''hui.';
  end if;
end;
$$;

grant execute on function definir_production_jour(uuid, pole_type, integer) to authenticated;

-- verifier_et_decrementer_production et notifier_rupture_production
-- (0027) : AUCUN changement — production_jour garde exactement son
-- fonctionnement actuel côté vente.

-- ============================================================
-- 2. Commandes en ligne rattachées à une session de caisse ouverte.
--    Le blocage (aucune session ouverte -> commande refusée) se fait côté
--    app cliente AVANT tout paiement (app/actions.ts, sari-foood-client) ;
--    cette colonne stocke la session choisie à ce moment-là (la plus
--    ancienne session ouverte du restaurant), recopiée sur `commandes` et
--    utilisée pour l'encaissement lors de la matérialisation.
-- ============================================================

alter table commandes_en_ligne add column session_caisse_id uuid references sessions_caisse(id);

-- utilisateur_id doit accepter null : la matérialisation s'exécute en
-- service_role (aucun auth.uid() réel), même raison que
-- mouvements_stock.utilisateur_id (0022_push_notifications.sql).
alter table transactions_caisse alter column utilisateur_id drop not null;

create or replace function materialiser_commande_en_ligne(p_id uuid, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cel commandes_en_ligne%rowtype;
  v_numero bigint;
  v_commande_id uuid;
  v_debut_journee timestamptz := date_trunc('day', now());
  v_item jsonb;
begin
  select * into v_cel
  from commandes_en_ligne
  where id = p_id and statut = 'en_attente'
  for update;

  if not found then
    return null;
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero
  from commandes
  where restaurant_id = v_cel.restaurant_id
    and created_at >= v_debut_journee;

  insert into commandes (
    restaurant_id, canal, total, numero, client_nom, client_telephone,
    adresse_livraison, zone_livraison_id, frais_livraison, points_utilises,
    session_id
  )
  values (
    v_cel.restaurant_id, 'en_ligne', v_cel.total, v_numero,
    v_cel.client_nom, v_cel.client_telephone,
    v_cel.adresse_livraison, v_cel.zone_livraison_id, v_cel.frais_livraison,
    v_cel.points_utilises, v_cel.session_caisse_id
  )
  returning id into v_commande_id;

  for v_item in select * from jsonb_array_elements(v_cel.panier)
  loop
    insert into lignes_commande (commande_id, produit_id, pole, quantite, prix_unitaire)
    values (
      v_commande_id,
      (v_item ->> 'produit_id')::uuid,
      (v_item ->> 'pole')::pole_type,
      (v_item ->> 'quantite')::integer,
      (v_item ->> 'prix_unitaire')::numeric
    );
  end loop;

  update commandes set statut = 'payee' where id = v_commande_id;

  update commandes_en_ligne
  set statut = 'payee', commande_id = v_commande_id, reference_paiement = p_reference
  where id = p_id;

  if v_cel.points_utilises > 0 then
    insert into points_fidelite_mouvements
      (restaurant_id, client_telephone, delta, motif, commande_id)
    values
      (v_cel.restaurant_id, v_cel.client_telephone, -v_cel.points_utilises,
       'Échange commande n°' || v_numero, v_commande_id);
  end if;

  if v_cel.session_caisse_id is not null then
    insert into transactions_caisse
      (session_id, type, montant, moyen_paiement, commande_id, utilisateur_id, libelle)
    values
      (v_cel.session_caisse_id, 'encaissement', v_cel.total, v_cel.mode_paiement::moyen_paiement,
       v_commande_id, null, 'Commande en ligne n°' || v_numero);
  end if;

  return v_commande_id;
end;
$$;

grant execute on function materialiser_commande_en_ligne(uuid, text) to service_role;
