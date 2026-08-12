-- ============================================================
-- Fonctions utilitaires (security definer : contournent RLS
-- pour éviter la récursion, puisqu'elles lisent utilisateurs)
-- ============================================================

create or replace function my_role() returns role_type
language sql stable security definer set search_path = public as $$
  select role from utilisateurs where id = auth.uid()
$$;

create or replace function my_restaurant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select restaurant_id from utilisateurs where id = auth.uid()
$$;

-- admin/pdg : accès multi-site (lecture globale tous restaurants)
create or replace function is_multi_site() returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() in ('admin', 'pdg')
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() = 'admin'
$$;

create or replace function is_manager_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() in ('admin', 'manager')
$$;

create or replace function is_chef() returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() in ('chef_patisserie', 'chef_boulangerie', 'chef_fastfood')
$$;

create or replace function is_chef_or_equipier() returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() in (
    'chef_patisserie', 'chef_boulangerie', 'chef_fastfood',
    'equipier_patisserie', 'equipier_boulangerie', 'equipier_fastfood'
  )
$$;

create or replace function my_pole() returns pole_type
language sql stable security definer set search_path = public as $$
  select pole from utilisateurs where id = auth.uid()
$$;

-- ============================================================
-- RESTAURANTS
-- ============================================================

drop policy if exists "restaurants_select_public" on restaurants;
create policy "restaurants_select_public" on restaurants
  for select using (true);

drop policy if exists "restaurants_write_admin" on restaurants;
create policy "restaurants_write_admin" on restaurants
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- UTILISATEURS
-- ============================================================

drop policy if exists "utilisateurs_select" on utilisateurs;
create policy "utilisateurs_select" on utilisateurs
  for select using (
    id = auth.uid() or is_multi_site() or restaurant_id = my_restaurant_id()
  );

drop policy if exists "utilisateurs_write_admin" on utilisateurs;
create policy "utilisateurs_write_admin" on utilisateurs
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- CATALOGUE PRODUITS
-- ============================================================

drop policy if exists "categories_produits_select" on categories_produits;
create policy "categories_produits_select" on categories_produits
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

drop policy if exists "categories_produits_write" on categories_produits;
create policy "categories_produits_write" on categories_produits
  for all
  using (is_manager_or_admin() and (is_admin() or restaurant_id = my_restaurant_id()))
  with check (is_manager_or_admin() and (is_admin() or restaurant_id = my_restaurant_id()));

drop policy if exists "produits_select" on produits;
create policy "produits_select" on produits
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

drop policy if exists "produits_write" on produits;
create policy "produits_write" on produits
  for all
  using (is_manager_or_admin() and (is_admin() or restaurant_id = my_restaurant_id()))
  with check (is_manager_or_admin() and (is_admin() or restaurant_id = my_restaurant_id()));

-- ============================================================
-- STOCK & RECETTES
-- ============================================================

drop policy if exists "ingredients_select" on ingredients;
create policy "ingredients_select" on ingredients
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

drop policy if exists "ingredients_write" on ingredients;
create policy "ingredients_write" on ingredients
  for all
  using (is_manager_or_admin() and (is_admin() or restaurant_id = my_restaurant_id()))
  with check (is_manager_or_admin() and (is_admin() or restaurant_id = my_restaurant_id()));

drop policy if exists "recettes_select" on recettes;
create policy "recettes_select" on recettes
  for select using (
    exists (
      select 1 from produits p
      where p.id = recettes.produit_id
        and (is_multi_site() or p.restaurant_id = my_restaurant_id())
    )
  );

drop policy if exists "recettes_write" on recettes;
create policy "recettes_write" on recettes
  for all using (is_manager_or_admin()) with check (is_manager_or_admin());

drop policy if exists "mouvements_stock_select" on mouvements_stock;
create policy "mouvements_stock_select" on mouvements_stock
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

drop policy if exists "mouvements_stock_insert" on mouvements_stock;
create policy "mouvements_stock_insert" on mouvements_stock
  for insert with check (
    (is_manager_or_admin() or is_chef()) and
    (is_admin() or restaurant_id = my_restaurant_id()) and
    utilisateur_id = auth.uid()
  );

-- ============================================================
-- APPROVISIONNEMENT & URGENCES
-- ============================================================

drop policy if exists "fournisseurs_select" on fournisseurs;
create policy "fournisseurs_select" on fournisseurs
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

drop policy if exists "fournisseurs_write" on fournisseurs;
create policy "fournisseurs_write" on fournisseurs
  for all
  using (is_manager_or_admin() and (is_admin() or restaurant_id = my_restaurant_id()))
  with check (is_manager_or_admin() and (is_admin() or restaurant_id = my_restaurant_id()));

drop policy if exists "demandes_select" on demandes_approvisionnement;
create policy "demandes_select" on demandes_approvisionnement
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

drop policy if exists "demandes_insert_chef" on demandes_approvisionnement;
create policy "demandes_insert_chef" on demandes_approvisionnement
  for insert with check (
    is_chef() and chef_id = auth.uid() and restaurant_id = my_restaurant_id()
  );

drop policy if exists "demandes_update_manager" on demandes_approvisionnement;
create policy "demandes_update_manager" on demandes_approvisionnement
  for update
  using (my_role() = 'manager' and restaurant_id = my_restaurant_id())
  with check (my_role() = 'manager' and restaurant_id = my_restaurant_id());

drop policy if exists "demandes_update_comptable" on demandes_approvisionnement;
create policy "demandes_update_comptable" on demandes_approvisionnement
  for update
  using (my_role() = 'comptable' and restaurant_id = my_restaurant_id())
  with check (my_role() = 'comptable' and restaurant_id = my_restaurant_id());

drop policy if exists "demandes_update_chef_reception" on demandes_approvisionnement;
create policy "demandes_update_chef_reception" on demandes_approvisionnement
  for update
  using (is_chef() and chef_id = auth.uid())
  with check (is_chef() and chef_id = auth.uid());

-- ============================================================
-- CAISSE
-- ============================================================

drop policy if exists "sessions_caisse_select" on sessions_caisse;
create policy "sessions_caisse_select" on sessions_caisse
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

drop policy if exists "sessions_caisse_insert" on sessions_caisse;
create policy "sessions_caisse_insert" on sessions_caisse
  for insert with check (
    my_role() = 'caissiere' and caissiere_id = auth.uid() and restaurant_id = my_restaurant_id()
  );

drop policy if exists "sessions_caisse_update" on sessions_caisse;
create policy "sessions_caisse_update" on sessions_caisse
  for update
  using (caissiere_id = auth.uid() or is_manager_or_admin())
  with check (caissiere_id = auth.uid() or is_manager_or_admin());

drop policy if exists "transactions_caisse_select" on transactions_caisse;
create policy "transactions_caisse_select" on transactions_caisse
  for select using (
    exists (
      select 1 from sessions_caisse s
      where s.id = transactions_caisse.session_id
        and (is_multi_site() or s.restaurant_id = my_restaurant_id())
    )
  );

drop policy if exists "transactions_caisse_insert" on transactions_caisse;
create policy "transactions_caisse_insert" on transactions_caisse
  for insert with check (
    utilisateur_id = auth.uid() and
    exists (
      select 1 from sessions_caisse s
      where s.id = session_id and s.caissiere_id = auth.uid() and s.statut = 'ouverte'
    )
  );

-- ============================================================
-- COMMANDES
-- ============================================================

drop policy if exists "commandes_select" on commandes;
create policy "commandes_select" on commandes
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

drop policy if exists "commandes_insert" on commandes;
create policy "commandes_insert" on commandes
  for insert with check (
    my_role() = 'caissiere' and restaurant_id = my_restaurant_id()
  );

drop policy if exists "commandes_update" on commandes;
create policy "commandes_update" on commandes
  for update
  using (my_role() = 'caissiere' or is_manager_or_admin())
  with check (my_role() = 'caissiere' or is_manager_or_admin());

drop policy if exists "lignes_commande_select" on lignes_commande;
create policy "lignes_commande_select" on lignes_commande
  for select using (
    exists (
      select 1 from commandes c
      where c.id = lignes_commande.commande_id
        and (is_multi_site() or c.restaurant_id = my_restaurant_id())
    )
  );

drop policy if exists "lignes_commande_insert" on lignes_commande;
create policy "lignes_commande_insert" on lignes_commande
  for insert with check (
    exists (
      select 1 from commandes c
      where c.id = commande_id and c.restaurant_id = my_restaurant_id()
    )
  );

drop policy if exists "lignes_commande_update" on lignes_commande;
create policy "lignes_commande_update" on lignes_commande
  for update
  using (is_chef_or_equipier() and pole = my_pole())
  with check (is_chef_or_equipier() and pole = my_pole());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

drop policy if exists "notifications_select" on notifications;
create policy "notifications_select" on notifications
  for select using (destinataire_id = auth.uid() or is_multi_site());

drop policy if exists "notifications_insert" on notifications;
create policy "notifications_insert" on notifications
  for insert with check (is_multi_site() or restaurant_id = my_restaurant_id());

drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own" on notifications
  for update using (destinataire_id = auth.uid()) with check (destinataire_id = auth.uid());
