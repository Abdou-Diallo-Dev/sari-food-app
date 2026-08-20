-- Bug : sessions_caisse_update (0015_cloture_immuable) restreint l'update aux
-- lignes statut = 'ouverte' seulement. Cette policy a été écrite avant le
-- workflow de contrôle manager (0032/0033) et n'a jamais été mise à jour :
-- la transition en_attente_controle -> cloturee de controlerCloture est donc
-- silencieusement bloquée par RLS (0 ligne affectée, aucune erreur Postgres
-- renvoyée), ce qui produisait le message trompeur "Cette session a déjà
-- été contrôlée." même sur un tout premier essai.
--
-- Le state machine trigger (verifier_transition_session_caisse, 0033) gère
-- déjà précisément quel rôle peut faire quelle transition ; la policy RLS
-- n'a donc qu'à garder l'immuabilité une fois cloturee, pas à limiter à
-- 'ouverte' seul.

drop policy if exists "sessions_caisse_update" on sessions_caisse;
create policy "sessions_caisse_update" on sessions_caisse
  for update
  using ((caissiere_id = auth.uid() or is_manager_or_admin()) and statut <> 'cloturee')
  with check (caissiere_id = auth.uid() or is_manager_or_admin());
