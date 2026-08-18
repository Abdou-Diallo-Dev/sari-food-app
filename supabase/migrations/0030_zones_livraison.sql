-- Frais de livraison par zone, gérés par le manager (comme le catalogue
-- produits, cf. produits_write) : le client choisit une zone à la
-- commande, le frais associé est ajouté au total. Jamais de frais envoyé
-- par le navigateur pour le calcul du total — comme pour les articles
-- (app/actions.ts côté client), on revérifie côté serveur.
create table zones_livraison (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  nom           text not null,
  frais         numeric(10,2) not null check (frais >= 0),
  actif         boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table zones_livraison enable row level security;

create policy "zones_livraison_select" on zones_livraison
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

create policy "zones_livraison_write" on zones_livraison
  for all
  using (is_manager_or_admin() and (is_admin() or restaurant_id = my_restaurant_id()))
  with check (is_manager_or_admin() and (is_admin() or restaurant_id = my_restaurant_id()));

-- Lecture publique (app client, clé anon, aucune session) : même principe
-- que produits_select_public/categories_produits_select_public
-- (0021_commandes_en_ligne_fn.sql).
create policy "zones_livraison_select_public" on zones_livraison
  for select to anon using (actif = true);

alter table commandes_en_ligne
  add column zone_livraison_id uuid references zones_livraison(id),
  add column frais_livraison numeric(10,2) not null default 0;

alter table commandes
  add column zone_livraison_id uuid references zones_livraison(id),
  add column frais_livraison numeric(10,2) not null default 0;

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
    adresse_livraison, zone_livraison_id, frais_livraison
  )
  values (
    v_cel.restaurant_id, 'en_ligne', v_cel.total, v_numero,
    v_cel.client_nom, v_cel.client_telephone,
    v_cel.adresse_livraison, v_cel.zone_livraison_id, v_cel.frais_livraison
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

  return v_commande_id;
end;
$$;

grant execute on function materialiser_commande_en_ligne(uuid, text) to service_role;
