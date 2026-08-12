-- Stocke l'identifiant de connexion (préfixe de l'email synthétique
-- "identifiant@sari.local") directement sur utilisateurs, pour que
-- l'admin puisse le voir/gérer sans appel à l'API Auth admin.
alter table utilisateurs add column if not exists identifiant text unique;
