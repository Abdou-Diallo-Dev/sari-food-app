-- Autorise manager/admin à supprimer une commande de test (et ses lignes),
-- restreint à leur restaurant (ou tout restaurant pour l'admin). La
-- contrainte de clé étrangère depuis transactions_caisse empêche déjà la
-- suppression d'une commande encaissée : dans ce cas Postgres renvoie une
-- erreur que l'action serveur traduit en message clair.

drop policy if exists "lignes_commande_delete" on lignes_commande;
create policy "lignes_commande_delete" on lignes_commande
  for delete using (
    is_manager_or_admin() and
    exists (
      select 1 from commandes c
      where c.id = lignes_commande.commande_id
        and (c.restaurant_id = my_restaurant_id() or is_admin())
    )
  );

drop policy if exists "commandes_delete" on commandes;
create policy "commandes_delete" on commandes
  for delete using (
    is_manager_or_admin() and (restaurant_id = my_restaurant_id() or is_admin())
  );
