-- Script ponctuel de remise à zéro des données de test avant démo — PAS une
-- migration (ne touche à aucun schéma), à coller une seule fois dans
-- l'éditeur SQL Supabase puis à jeter.
--
-- Vide tout le transactionnel : sessions_caisse, transactions_caisse,
-- mouvements_caisse_globale, commandes, lignes_commande, commandes_en_ligne,
-- notifications, demandes_approvisionnement, production_jour (+ ses
-- contributions par pôle), points_fidelite_mouvements, journal_audit.
--
-- Conservé intact : restaurants, utilisateurs, produits, ingrédients,
-- catégories, zones de livraison, planning (objectifs_production).
--
-- mouvements_stock (historique de stock) n'est PAS vidé — hors du périmètre
-- demandé, et surtout ingredients.stock_actuel n'est pas recalculé à partir
-- de ce journal (colonne maintenue par trigger à l'écriture), donc le
-- purger ne changerait aucun niveau de stock affiché, juste l'historique.
-- Ses colonnes commande_id/demande_id sont nullables : on les détache au
-- lieu de les supprimer, pour ne pas casser la suppression de commandes et
-- demandes_approvisionnement tout en gardant l'historique de stock intact.

begin;

update mouvements_stock set commande_id = null where commande_id is not null;
update mouvements_stock set demande_id = null where demande_id is not null;

delete from notifications;
delete from journal_audit;
delete from points_fidelite_mouvements;
delete from transactions_caisse;
delete from mouvements_caisse_globale;
delete from lignes_commande;
delete from commandes_en_ligne;
delete from commandes;
delete from sessions_caisse;
delete from demandes_approvisionnement;
delete from production_jour_contributions;
delete from production_jour;

commit;
