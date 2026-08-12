-- L'admin (contrôle/test de tout) et la manager (aucune limite sur la
-- gestion interne du restaurant) doivent pouvoir effectuer eux-mêmes
-- toute opération que les rôles métier (caissière, chef, comptable)
-- peuvent faire — pas seulement les consulter en lecture seule.
--
-- Deux couches à corriger, comme déjà vu sur commandes_insert (0002) :
-- 1. RLS : plusieurs policies n'admettaient QUE le rôle métier concerné
--    (ex: sessions_caisse_insert = 'caissiere' uniquement, demandes_insert_chef
--    = is_chef() uniquement), donc même avec un requireRole() élargi côté
--    app, la requête aurait été bloquée silencieusement par Postgres.
-- 2. Trigger : verifier_transition_demande() autorisait déjà is_admin()
--    en secours sur chaque transition, mais comme AUCUNE policy RLS
--    n'admettait admin sur demandes_approvisionnement, ce bypass n'était
--    jamais atteint. On ajoute donc une policy RLS dédiée à l'admin, et on
--    élargit le trigger pour que la manager (déjà admise par RLS via
--    demandes_update_manager) ait le même bypass que l'admin sur le
--    décaissement et la réception.

-- ============================================================
-- CAISSE : admin/manager peuvent ouvrir et opérer leur propre session
-- ============================================================

drop policy if exists "sessions_caisse_insert" on sessions_caisse;
create policy "sessions_caisse_insert" on sessions_caisse
  for insert with check (
    (my_role() = 'caissiere' or is_manager_or_admin())
    and caissiere_id = auth.uid()
    and restaurant_id = my_restaurant_id()
  );

-- ============================================================
-- APPROVISIONNEMENT : admin/manager peuvent déclencher une demande
-- (comme un chef) et l'admin peut modifier n'importe quelle demande
-- ============================================================

drop policy if exists "demandes_insert_chef" on demandes_approvisionnement;
create policy "demandes_insert_chef" on demandes_approvisionnement
  for insert with check (
    (is_chef() or is_manager_or_admin())
    and chef_id = auth.uid()
    and restaurant_id = my_restaurant_id()
  );

drop policy if exists "demandes_update_admin" on demandes_approvisionnement;
create policy "demandes_update_admin" on demandes_approvisionnement
  for update
  using (is_admin())
  with check (is_admin());

-- ============================================================
-- Trigger : la manager obtient le même bypass que l'admin sur le
-- décaissement et la réception (déjà acquis pour valider/rejeter).
-- ============================================================

create or replace function verifier_transition_demande() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ingredient_nom text;
begin
  if new.statut = old.statut then
    return new;
  end if;

  select nom into v_ingredient_nom from ingredients where id = new.ingredient_id;

  if new.statut = 'validee' then
    if old.statut <> 'declenchee' then
      raise exception 'Seule une demande déclenchée peut être validée.';
    end if;
    if not (my_role() = 'manager' or is_admin()) then
      raise exception 'Seul un manager peut valider une demande.';
    end if;
    new.manager_id := auth.uid();
    new.validee_at := now();

    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    values (new.restaurant_id, new.chef_id, 'approvisionnement',
      'Votre demande de réapprovisionnement (' || coalesce(v_ingredient_nom, '') || ') a été validée.',
      '/approvisionnement');

    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    select new.restaurant_id, u.id, 'approvisionnement',
      'Demande validée à décaisser : ' || coalesce(v_ingredient_nom, ''),
      '/approvisionnement'
    from utilisateurs u
    where u.restaurant_id = new.restaurant_id and u.role = 'comptable' and u.actif;

  elsif new.statut = 'rejetee' then
    if old.statut <> 'declenchee' then
      raise exception 'Seule une demande déclenchée peut être rejetée.';
    end if;
    if not (my_role() = 'manager' or is_admin()) then
      raise exception 'Seul un manager peut rejeter une demande.';
    end if;
    if new.motif_rejet is null or length(trim(new.motif_rejet)) = 0 then
      raise exception 'Un motif est obligatoire pour rejeter une demande.';
    end if;
    new.manager_id := auth.uid();
    new.validee_at := now();

    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    values (new.restaurant_id, new.chef_id, 'approvisionnement',
      'Votre demande de réapprovisionnement (' || coalesce(v_ingredient_nom, '') || ') a été rejetée : ' || new.motif_rejet,
      '/approvisionnement');

  elsif new.statut = 'decaissee' then
    if old.statut <> 'validee' then
      raise exception 'Seule une demande validée peut être décaissée.';
    end if;
    if not (my_role() = 'comptable' or is_manager_or_admin()) then
      raise exception 'Seul le comptable peut décaisser une demande.';
    end if;
    if new.montant_decaisse is null or new.montant_decaisse <= 0 then
      raise exception 'Le montant décaissé est requis.';
    end if;
    new.comptable_id := auth.uid();
    new.decaissee_at := now();

    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    values (new.restaurant_id, new.chef_id, 'approvisionnement',
      'Fonds décaissés pour votre demande (' || coalesce(v_ingredient_nom, '') || '). Confirmez la réception à l''arrivée.',
      '/approvisionnement');

  elsif new.statut = 'receptionnee' then
    if old.statut <> 'decaissee' then
      raise exception 'Seule une demande décaissée peut être réceptionnée.';
    end if;
    if not ((is_chef() or my_role() = 'manager') and new.chef_id = auth.uid()) and not is_admin() then
      raise exception 'Seul le chef (ou la manager) à l''origine de la demande peut confirmer la réception.';
    end if;
    new.receptionnee_at := now();

    update ingredients
    set stock_actuel = stock_actuel + new.quantite_demandee
    where id = new.ingredient_id;

    insert into mouvements_stock
      (restaurant_id, ingredient_id, type, quantite, motif, demande_id, utilisateur_id)
    values
      (new.restaurant_id, new.ingredient_id, 'entree', new.quantite_demandee,
       'Réception demande d''approvisionnement', new.id, auth.uid());

    if new.manager_id is not null then
      insert into notifications (restaurant_id, destinataire_id, type, message, lien)
      values (new.restaurant_id, new.manager_id, 'approvisionnement',
        'Réception confirmée pour la demande (' || coalesce(v_ingredient_nom, '') || '). Stock mis à jour.',
        '/approvisionnement');
    end if;

  else
    raise exception 'Transition de statut non autorisée.';
  end if;

  return new;
end;
$$;
