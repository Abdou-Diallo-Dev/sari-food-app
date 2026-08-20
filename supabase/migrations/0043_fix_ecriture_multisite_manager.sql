-- Suite de 0042 : is_multi_site() reconnaît maintenant un manager général
-- (restaurant_id = null) comme multi-site, ce qui a corrigé la LECTURE
-- (policies "_select", déjà écrites "is_multi_site() or restaurant_id =
-- my_restaurant_id()"). Mais quasiment toutes les policies d'ÉCRITURE
-- (insert/update/delete/all) du schéma comparent restaurant_id à
-- my_restaurant_id() par égalité stricte, sans jamais admettre
-- is_multi_site() en alternative. Or my_restaurant_id() vaut null pour un
-- manager multi-site : "restaurant_id = null" ne matche jamais aucune ligne
-- en SQL, quelle que soit la valeur de restaurant_id réellement écrite.
-- Résultat concret (bug remonté par l'utilisateur) : une fois la lecture
-- corrigée par 0042, le manager général voyait bien un restaurant choisi via
-- le sélecteur (app/(app)/*, lib/restaurant-actif.ts), mais toute tentative
-- d'écriture pour ce restaurant (ouvrir la caisse, prendre une commande,
-- déclarer une production planifiée, un mouvement de stock, une demande de
-- réappro, créer un produit/ingrédient/fournisseur...) échouait
-- silencieusement (0 ligne affectée, aucune erreur Postgres).
--
-- On applique ici le même correctif qu'en 0042 (ajouter is_multi_site() en
-- alternative à l'égalité stricte) à chaque policy d'écriture concernée,
-- repérée par un grep exhaustif de "my_restaurant_id()" sur les migrations.
-- Pour les policies qui utilisaient déjà "is_admin()" comme échappatoire
-- (categories_produits_write, produits_write, ingredients_write,
-- fournisseurs_write, zones_livraison_write, objectifs_production_write), on
-- remplace is_admin() par is_multi_site() : is_multi_site() couvre toujours
-- au moins ce que is_admin() couvrait (admin y est toujours vrai), donc
-- aucune régression, et ça ajoute le cas manager multi-site manquant.

-- ============================================================
-- POS : commandes / lignes_commande
-- ============================================================

drop policy if exists "commandes_insert" on commandes;
create policy "commandes_insert" on commandes
  for insert with check (
    (my_role() = 'caissiere' and restaurant_id = my_restaurant_id())
    or (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()))
  );

drop policy if exists "lignes_commande_insert" on lignes_commande;
create policy "lignes_commande_insert" on lignes_commande
  for insert with check (
    exists (
      select 1 from commandes c
      where c.id = commande_id
        and (is_multi_site() or c.restaurant_id = my_restaurant_id())
    )
  );

drop policy if exists "commandes_delete" on commandes;
create policy "commandes_delete" on commandes
  for delete using (
    is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id())
  );

drop policy if exists "lignes_commande_delete" on lignes_commande;
create policy "lignes_commande_delete" on lignes_commande
  for delete using (
    is_manager_or_admin() and
    exists (
      select 1 from commandes c
      where c.id = lignes_commande.commande_id
        and (is_multi_site() or c.restaurant_id = my_restaurant_id())
    )
  );

-- ============================================================
-- CAISSE : ouverture de session
-- ============================================================

drop policy if exists "sessions_caisse_insert" on sessions_caisse;
create policy "sessions_caisse_insert" on sessions_caisse
  for insert with check (
    caissiere_id = auth.uid()
    and (
      (my_role() = 'caissiere' and restaurant_id = my_restaurant_id())
      or (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()))
    )
  );

-- ============================================================
-- APPROVISIONNEMENT
-- ============================================================

drop policy if exists "demandes_insert_chef" on demandes_approvisionnement;
create policy "demandes_insert_chef" on demandes_approvisionnement
  for insert with check (
    chef_id = auth.uid()
    and (
      (is_chef() and restaurant_id = my_restaurant_id())
      or (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()))
    )
  );

drop policy if exists "fournisseurs_write" on fournisseurs;
create policy "fournisseurs_write" on fournisseurs
  for all
  using (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()))
  with check (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()));

-- ============================================================
-- STOCK
-- ============================================================

drop policy if exists "ingredients_write" on ingredients;
create policy "ingredients_write" on ingredients
  for all
  using (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()))
  with check (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()));

drop policy if exists "mouvements_stock_insert" on mouvements_stock;
create policy "mouvements_stock_insert" on mouvements_stock
  for insert with check (
    (is_manager_or_admin() or is_chef()) and
    (is_multi_site() or restaurant_id = my_restaurant_id()) and
    utilisateur_id = auth.uid()
  );

-- ============================================================
-- CATALOGUE PRODUITS
-- ============================================================

drop policy if exists "categories_produits_write" on categories_produits;
create policy "categories_produits_write" on categories_produits
  for all
  using (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()))
  with check (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()));

drop policy if exists "produits_write" on produits;
create policy "produits_write" on produits
  for all
  using (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()))
  with check (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()));

-- ============================================================
-- LIVRAISON
-- ============================================================

drop policy if exists "zones_livraison_write" on zones_livraison;
create policy "zones_livraison_write" on zones_livraison
  for all
  using (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()))
  with check (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()));

-- ============================================================
-- PLANNING / OBJECTIFS DE PRODUCTION
-- ============================================================

drop policy if exists "objectifs_production_write" on objectifs_production;
create policy "objectifs_production_write" on objectifs_production
  for all
  using (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()))
  with check (is_manager_or_admin() and (is_multi_site() or restaurant_id = my_restaurant_id()));
