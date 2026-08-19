-- Processus complet de clôture de caisse : la caissière déclare ce qu'elle
-- détient par moyen de paiement (jusqu'ici seule l'espèces était comptée,
-- Wave/Orange Money étaient clôturés au théorique sans jamais être
-- déclarés/rapprochés) ; le manager vérifie l'espèces remise et décide
-- combien garder comme fonds pour la session suivante, le reste étant
-- transféré au comptable. Wave/Orange Money restent des soldes numériques
-- (comptes marchands déjà accessibles au comptable) : ils sont désormais
-- déclarés et rapprochés comme l'espèces, mais sans mécanisme de remise
-- physique — décision produit, rien à "garder"/transférer dessus.

alter table sessions_caisse
  add column total_compte_wave numeric(10,2),
  add column ecart_wave numeric(10,2),
  add column total_compte_orange_money numeric(10,2),
  add column ecart_orange_money numeric(10,2);

-- Chaîne de transfert espèces : caissière (clôture, montant_remis) -> manager
-- (vérifie, fixe fond_nouvelle_session, le reste = montant_transfere_comptable)
-- -> nouvelle session (consomme la remise vérifiée comme fond_initial_especes).
create table remises_caisse (
  id                           uuid primary key default gen_random_uuid(),
  restaurant_id                uuid not null references restaurants(id),
  session_cloturee_id          uuid not null references sessions_caisse(id) unique,
  caissiere_id                 uuid not null references utilisateurs(id),
  montant_remis                numeric(10,2) not null,
  statut                       text not null default 'en_attente' check (statut in ('en_attente', 'verifiee')),
  manager_id                   uuid references utilisateurs(id),
  fond_nouvelle_session        numeric(10,2),
  montant_transfere_comptable  numeric(10,2),
  session_suivante_id          uuid references sessions_caisse(id),
  verifiee_at                  timestamptz,
  created_at                   timestamptz not null default now()
);

alter table remises_caisse enable row level security;

create policy "remises_caisse_select" on remises_caisse
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

-- Posée par cloturerSession, mêmes droits que la clôture elle-même
-- (sessions_caisse_update, 0015_cloture_immuable.sql).
create policy "remises_caisse_insert" on remises_caisse
  for insert with check (
    (my_role() = 'caissiere' or is_manager_or_admin()) and restaurant_id = my_restaurant_id()
  );

-- Même profil de droits que l'insert : verifierRemise (manager/admin
-- uniquement, appliqué côté Server Action) fixe fond_nouvelle_session /
-- montant_transfere_comptable / statut ; ouvrirSession (caissiere incluse)
-- ne fait que marquer session_suivante_id sur une remise déjà vérifiée.
create policy "remises_caisse_update" on remises_caisse
  for update
  using ((my_role() = 'caissiere' or is_manager_or_admin()) and restaurant_id = my_restaurant_id())
  with check ((my_role() = 'caissiere' or is_manager_or_admin()) and restaurant_id = my_restaurant_id());
