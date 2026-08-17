-- La notification de déclenchement d'une demande de réapprovisionnement
-- affichait la quantité brute castée en texte (numeric(12,3) => toujours 3
-- décimales, ex: "100.000") sans unité, ce qui la rendait ambiguë
-- ("100.000" au lieu de "100 kg"). On ajoute l'unité et on nettoie les
-- zéros de fin, sur le même principe que le trigger de stock bas (0012) qui
-- inclut déjà correctement new.unite dans son message.

create or replace function notifier_declenchement_demande() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ingredient_nom text;
  v_ingredient_unite text;
  v_quantite text;
begin
  select nom, unite into v_ingredient_nom, v_ingredient_unite
  from ingredients where id = new.ingredient_id;

  v_quantite := regexp_replace(new.quantite_demandee::text, '\.?0+$', '');

  insert into notifications (restaurant_id, destinataire_id, type, message, lien)
  select new.restaurant_id, u.id, 'approvisionnement',
    'Nouvelle demande de réapprovisionnement : ' || coalesce(v_ingredient_nom, '') ||
      ' (' || v_quantite || ' ' || coalesce(v_ingredient_unite, '') || ')',
    '/approvisionnement'
  from utilisateurs u
  where u.restaurant_id = new.restaurant_id and u.actif
    and u.role in ('manager', 'admin');

  return new;
end;
$$;
