-- Cahier des charges §4.3 : circuit d'urgence d'approvisionnement
-- (déclenchée → validée/rejetée → décaissée → réceptionnée), avec
-- "impossible de sauter une étape ou de décaisser sans validation".
--
-- Les policies RLS (0002) autorisent déjà chef/manager/comptable à modifier
-- la ligne dont ils sont responsables, mais une policy RLS "on possède la
-- ligne" ne vérifie pas QUEL changement de statut est fait ni QUI a le droit
-- de le faire (ex: rien n'empêchait un chef d'auto-valider sa propre
-- demande). On verrouille donc la machine à états et le rôle autorisé à
-- chaque étape directement dans un trigger, comme recommandé en §8 pour la
-- logique critique. La mise à jour du stock à réception est faite ici aussi,
-- pour rester atomique avec le changement de statut.

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
    if not (my_role() = 'comptable' or is_admin()) then
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
    if not (is_chef() and new.chef_id = auth.uid()) and not is_admin() then
      raise exception 'Seul le chef à l''origine de la demande peut confirmer la réception.';
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

drop trigger if exists trg_verifier_transition_demande on demandes_approvisionnement;
create trigger trg_verifier_transition_demande
  before update on demandes_approvisionnement
  for each row
  execute function verifier_transition_demande();

create or replace function notifier_declenchement_demande() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ingredient_nom text;
begin
  select nom into v_ingredient_nom from ingredients where id = new.ingredient_id;

  insert into notifications (restaurant_id, destinataire_id, type, message, lien)
  select new.restaurant_id, u.id, 'approvisionnement',
    'Nouvelle demande de réapprovisionnement : ' || coalesce(v_ingredient_nom, '') || ' (' || new.quantite_demandee || ')',
    '/approvisionnement'
  from utilisateurs u
  where u.restaurant_id = new.restaurant_id and u.role = 'manager' and u.actif;

  return new;
end;
$$;

drop trigger if exists trg_notifier_declenchement_demande on demandes_approvisionnement;
create trigger trg_notifier_declenchement_demande
  after insert on demandes_approvisionnement
  for each row
  execute function notifier_declenchement_demande();
