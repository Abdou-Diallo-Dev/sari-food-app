-- journal_audit : la policy de lecture initiale (0001_init.sql) comparait
-- restaurant_id à un sous-select sur utilisateurs.restaurant_id, ce qui
-- exclut silencieusement les admins multi-site (restaurant_id = null) —
-- ils ne verraient alors AUCUNE ligne du journal d'audit. On aligne sur le
-- pattern is_multi_site() / my_restaurant_id() utilisé partout ailleurs.

drop policy if exists "journal_audit_read_own_restaurant" on journal_audit;
create policy "journal_audit_read_own_restaurant" on journal_audit
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());
