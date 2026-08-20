-- Bug racine du "Manager général voit tout à zéro" : is_multi_site() (0002)
-- ne renvoie true que pour admin/pdg. Or l'app (page.tsx ResumeGestion,
-- caisse/page.tsx "sessions à contrôler"...) traite un manager avec
-- restaurant_id = null comme multi-site et interroge sans filtre de
-- restaurant. Mais quasiment toutes les policies RLS select sont écrites
-- "is_multi_site() or restaurant_id = my_restaurant_id()" : pour un manager
-- multi-site, my_restaurant_id() est null, donc "restaurant_id = null" ne
-- matche jamais aucune ligne en SQL, et is_multi_site() étant false pour ce
-- rôle, RLS ne laisse passer aucune ligne du tout — d'où CA à zéro,
-- réapprovisionnement vide, caisses à contrôler invisibles, alors même que
-- les données existent bien (confirmé par les captures : session "en
-- attente de contrôle" à 5500 F visible côté caissière, invisible côté
-- manager général).
create or replace function is_multi_site() returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() in ('admin', 'pdg')
    or (my_role() = 'manager' and my_restaurant_id() is null)
$$;

-- demandes_update_manager exigeait une égalité stricte de restaurant, donc
-- même une fois la lecture corrigée ci-dessus, un manager multi-site n'aurait
-- pas pu valider/rejeter une demande d'un site précis (restaurant_id = null
-- ne matche jamais). is_multi_site() couvrant maintenant ce cas, on l'ajoute
-- ici en cohérence avec toutes les autres policies du fichier 0002.
drop policy if exists "demandes_update_manager" on demandes_approvisionnement;
create policy "demandes_update_manager" on demandes_approvisionnement
  for update
  using (my_role() = 'manager' and (is_multi_site() or restaurant_id = my_restaurant_id()))
  with check (my_role() = 'manager' and (is_multi_site() or restaurant_id = my_restaurant_id()));
