-- 1. Adresse de livraison sur les commandes en ligne (demandée par le client
--    après le numéro de téléphone) : stockée sur le staging le temps du
--    paiement, puis recopiée sur `commandes` lors de la matérialisation pour
--    que le staff y ait accès (comme client_nom/client_telephone, 0020).
alter table commandes_en_ligne add column adresse_livraison text;
alter table commandes add column adresse_livraison text;

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
    restaurant_id, canal, total, numero, client_nom, client_telephone, adresse_livraison
  )
  values (
    v_cel.restaurant_id, 'en_ligne', v_cel.total, v_numero,
    v_cel.client_nom, v_cel.client_telephone, v_cel.adresse_livraison
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

-- 2. Realtime sur `notifications` : nécessaire pour l'alerte sonore côté
--    admin (components/NotificationSound.tsx), qui écoute les inserts en
--    postgres_changes. Sans cet ajout à la publication, aucun évènement
--    n'est diffusé — la RLS existante (notifications_select,
--    0002_rls_policies.sql) suffit déjà à restreindre qui les reçoit.
alter publication supabase_realtime add table notifications;
