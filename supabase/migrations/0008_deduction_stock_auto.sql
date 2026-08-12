-- Cahier des charges §4.2 : quand une commande est finalisée (payée), le
-- stock des matières premières diminue automatiquement selon la recette du
-- produit vendu. §8 précise que cette logique critique doit être exécutée
-- en trigger PostgreSQL (transactionnel, impossible à contourner depuis le
-- frontend) plutôt que côté application — la caissière qui encaisse n'a de
-- toute façon pas les droits RLS pour écrire sur ingredients/mouvements_stock,
-- d'où le security definer.

create or replace function deduire_stock_commande() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select rec.ingredient_id, (rec.quantite_utilisee * lc.quantite) as qte
    from lignes_commande lc
    join recettes rec on rec.produit_id = lc.produit_id
    where lc.commande_id = new.id
  loop
    update ingredients
    set stock_actuel = stock_actuel - r.qte
    where id = r.ingredient_id;

    insert into mouvements_stock
      (restaurant_id, ingredient_id, type, quantite, motif, commande_id, utilisateur_id)
    values
      (new.restaurant_id, r.ingredient_id, 'sortie', r.qte,
       'Vente commande n°' || new.numero, new.id, auth.uid());
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_deduire_stock_commande on commandes;
create trigger trg_deduire_stock_commande
  after update of statut on commandes
  for each row
  when (new.statut = 'payee' and old.statut is distinct from 'payee')
  execute function deduire_stock_commande();
