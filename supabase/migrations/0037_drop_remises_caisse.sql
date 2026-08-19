-- remises_caisse (ancienne chaîne de transfert caissière -> manager,
-- espèces uniquement) est remplacée par la state machine sessions_caisse.statut
-- (ouverte -> en_attente_controle -> cloturee) posée en 0032/0033, plus
-- complète (trigger, notifications, rôles) et déjà adoptée côté app
-- (app/(app)/caisse/actions.ts : controlerCloture). Table jamais alimentée
-- en production (0 ligne au moment de ce nettoyage) : suppression directe,
-- sans migration de données.
drop table if exists remises_caisse;
