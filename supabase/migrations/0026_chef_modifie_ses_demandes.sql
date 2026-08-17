-- Un chef peut modifier la quantité ou supprimer sa propre demande
-- d'approvisionnement tant qu'elle n'a pas encore été traitée par le
-- manager (statut 'declenchee'). Comme le rappelle le commentaire de 0010,
-- une policy RLS "on possède la ligne" ne suffit pas ici : la policy
-- "demandes_update_chef_reception" existante autorise déjà le chef à
-- modifier n'importe laquelle de ses demandes, quel que soit son statut
-- (elle sert à la confirmation de réception). Sans verrou supplémentaire,
-- un chef pourrait donc modifier la quantité après validation via un appel
-- direct à l'API. On verrouille ce champ précisément dans le trigger de
-- transition, qui est déjà l'endroit qui fait autorité sur "qui a le droit
-- de changer quoi et quand".

create or replace function verifier_transition_demande() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ingredient_nom text;
begin
  if new.statut = old.statut then
    if new.quantite_demandee is distinct from old.quantite_demandee then
      if old.statut <> 'declenchee' then
        raise exception 'La quantité ne peut plus être modifiée après traitement par le manager.';
      end if;
      if not (is_chef() and old.chef_id = auth.uid()) and not is_admin() then
        raise exception 'Seul le chef à l''origine de la demande peut modifier la quantité.';
      end if;
    end if;
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

drop policy if exists "demandes_delete_chef" on demandes_approvisionnement;
create policy "demandes_delete_chef" on demandes_approvisionnement
  for delete
  using (is_chef() and chef_id = auth.uid() and statut = 'declenchee');
