-- Cahier des charges §4.1bis : une dépense catégorisée "Achat stock" doit
-- incrémenter automatiquement l'ingrédient concerné. La caissière qui
-- enregistre la dépense n'a pas les droits RLS pour écrire sur
-- ingredients/mouvements_stock (réservés à manager/admin/chef), donc comme
-- pour la déduction de stock à la vente, on passe par un trigger
-- security definer plutôt que par l'application.

alter table transactions_caisse
  add column ingredient_id uuid references ingredients(id),
  add column quantite_stock numeric(12,3);

create or replace function incrementer_stock_achat() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_restaurant_id uuid;
begin
  if new.type = 'depense' and new.categorie_depense = 'achat_stock'
     and new.ingredient_id is not null and new.quantite_stock is not null then

    update ingredients
    set stock_actuel = stock_actuel + new.quantite_stock
    where id = new.ingredient_id
    returning restaurant_id into v_restaurant_id;

    insert into mouvements_stock
      (restaurant_id, ingredient_id, type, quantite, motif, utilisateur_id)
    values
      (v_restaurant_id, new.ingredient_id, 'entree',
       new.quantite_stock, coalesce(new.libelle, 'Achat stock (caisse)'), new.utilisateur_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_incrementer_stock_achat on transactions_caisse;
create trigger trg_incrementer_stock_achat
  after insert on transactions_caisse
  for each row
  execute function incrementer_stock_achat();
