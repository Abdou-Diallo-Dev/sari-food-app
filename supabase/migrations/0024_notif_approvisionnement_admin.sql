-- L'admin a un rôle de supervision/audit sur tout ce que fait le manager
-- (voir circuit d'approvisionnement, 0010) : il ne doit pas être exclu d'une
-- notification opérationnelle réservée jusqu'ici au seul manager. Le
-- déclenchement d'une nouvelle demande ne notifiait que role = 'manager' ;
-- on ajoute l'admin sans toucher au reste du circuit (validation/rejet/
-- décaissement/réception restent inchangés, déjà correctement routés).

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
  where u.restaurant_id = new.restaurant_id and u.actif
    and u.role in ('manager', 'admin');

  return new;
end;
$$;
