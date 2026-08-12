-- ============================================================
-- Ajustements RLS pour la prise de commande (POS) et le suivi
-- cuisine (KDS) : l'admin doit pouvoir créer/gérer des commandes
-- même sans restaurant_id propre (accès multi-site), et
-- manager/admin doivent pouvoir intervenir sur les lignes de
-- commande en plus du chef/équipier du pôle concerné.
-- ============================================================

drop policy if exists "commandes_insert" on commandes;
create policy "commandes_insert" on commandes
  for insert with check (
    (my_role() = 'caissiere' or is_admin()) and
    (restaurant_id = my_restaurant_id() or is_admin())
  );

drop policy if exists "lignes_commande_insert" on lignes_commande;
create policy "lignes_commande_insert" on lignes_commande
  for insert with check (
    exists (
      select 1 from commandes c
      where c.id = commande_id
        and (c.restaurant_id = my_restaurant_id() or is_admin())
    )
  );

drop policy if exists "lignes_commande_update" on lignes_commande;
create policy "lignes_commande_update" on lignes_commande
  for update
  using ((is_chef_or_equipier() and pole = my_pole()) or is_manager_or_admin())
  with check ((is_chef_or_equipier() and pole = my_pole()) or is_manager_or_admin());
