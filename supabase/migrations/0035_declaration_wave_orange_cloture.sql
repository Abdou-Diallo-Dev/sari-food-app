-- Déclaration/rapprochement Wave et Orange Money à la clôture de caisse,
-- jusqu'ici traités uniquement au théorique (0012). Le processus de contrôle
-- manager (garder un fonds vs transférer au comptable) vit désormais dans
-- 0032/0033 (state machine sur sessions_caisse, espèces uniquement — pas de
-- remise physique à modéliser sur Wave/Orange Money, déjà des soldes
-- numériques accessibles au comptable).
-- if not exists : ces colonnes ont déjà été posées par une version
-- antérieure de cette migration (celle qui créait encore remises_caisse,
-- retirée depuis — voir 0037_drop_remises_caisse.sql).
alter table sessions_caisse
  add column if not exists total_compte_wave numeric(10,2),
  add column if not exists ecart_wave numeric(10,2),
  add column if not exists total_compte_orange_money numeric(10,2),
  add column if not exists ecart_orange_money numeric(10,2);
