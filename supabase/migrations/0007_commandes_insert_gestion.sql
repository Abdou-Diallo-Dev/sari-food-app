-- Le POS est accessible à admin/manager/caissiere (voir app/(app)/pos/actions.ts),
-- mais la policy commandes_insert ne laissait passer que caissiere : un
-- admin/manager qui prenait une commande se heurtait à un échec RLS silencieux
-- ("Impossible de créer la commande"). On aligne la policy sur l'accès réel.

drop policy if exists "commandes_insert" on commandes;
create policy "commandes_insert" on commandes
  for insert with check (
    (my_role() = 'caissiere' or is_manager_or_admin())
    and restaurant_id = my_restaurant_id()
  );
