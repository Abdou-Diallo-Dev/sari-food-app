-- Traçabilité & sécurité : une fois une session de caisse clôturée, plus
-- personne (même manager/admin) ne doit pouvoir modifier ses données de
-- clôture. La policy précédente autorisait n'importe quelle update tant que
-- l'utilisateur était la caissière propriétaire ou manager/admin, y compris
-- sur une session déjà clôturée — ce qui permettait de recalculer/écraser
-- silencieusement un écart de caisse déjà validé.

drop policy if exists "sessions_caisse_update" on sessions_caisse;
create policy "sessions_caisse_update" on sessions_caisse
  for update
  using ((caissiere_id = auth.uid() or is_manager_or_admin()) and statut = 'ouverte')
  with check (caissiere_id = auth.uid() or is_manager_or_admin());
