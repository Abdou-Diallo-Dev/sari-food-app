-- Points de fidélité (app client en ligne uniquement, identifiée par
-- numéro de téléphone — pas de compte client, cf. 0020). Règle retenue :
-- +1 point par commande en ligne payée, quel que soit son montant ;
-- échangeable contre un produit dont le manager a fixé un coût en points
-- (comme le prix, sur le catalogue). Ledger (même principe que
-- mouvements_stock) plutôt qu'un solde stocké : auditable, et le solde se
-- recalcule simplement par somme.
create table points_fidelite_mouvements (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants(id),
  client_telephone  text not null,
  delta             integer not null,
  motif             text not null,
  commande_id       uuid references commandes(id),
  created_at        timestamptz not null default now()
);

-- Deny-by-default pour anon/authenticated : seul le service_role (Server
-- Actions de l'app client, RPC de matérialisation) y touche, même principe
-- que commandes_en_ligne (0020_commandes_en_ligne.sql).
alter table points_fidelite_mouvements enable row level security;

alter table produits
  add column cout_points integer check (cout_points is null or cout_points > 0);

alter table commandes_en_ligne add column points_utilises integer not null default 0;
alter table commandes add column points_utilises integer not null default 0;

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
    adresse_livraison, zone_livraison_id, frais_livraison, points_utilises
  )
  values (
    v_cel.restaurant_id, 'en_ligne', v_cel.total, v_numero,
    v_cel.client_nom, v_cel.client_telephone,
    v_cel.adresse_livraison, v_cel.zone_livraison_id, v_cel.frais_livraison, v_cel.points_utilises
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

  return v_commande_id;
end;
$$;

grant execute on function materialiser_commande_en_ligne(uuid, text) to service_role;

-- +1 point par commande en ligne payée (indépendant de l'échange
-- ci-dessus, qui se fait dans la même fonction juste avant que ce trigger
-- ne se déclenche sur le update statut='payee').
create or replace function attribuer_points_fidelite_commande() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into points_fidelite_mouvements
    (restaurant_id, client_telephone, delta, motif, commande_id)
  values
    (new.restaurant_id, new.client_telephone, 1, 'Commande n°' || new.numero, new.id);

  return new;
end;
$$;

drop trigger if exists trg_attribuer_points_fidelite on commandes;
create trigger trg_attribuer_points_fidelite
  after update of statut on commandes
  for each row
  when (new.canal = 'en_ligne' and new.statut = 'payee' and old.statut is distinct from 'payee')
  execute function attribuer_points_fidelite_commande();
