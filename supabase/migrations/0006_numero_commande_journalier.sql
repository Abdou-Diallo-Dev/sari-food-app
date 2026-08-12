-- Le numéro de commande était un identifiant global auto-incrémenté qui ne
-- reflétait plus la réalité après suppression de commandes de test (ex :
-- 3 commandes supprimées, la 4e commande créée arrivait quand même à n°4
-- au lieu de n°1). On le remplace par un numéro de ticket calculé côté
-- application : par restaurant, remis à zéro chaque jour, et basé sur le
-- plus grand numéro encore existant aujourd'hui (donc auto-cohérent après
-- suppression).

alter table commandes alter column numero drop identity if exists;
alter table commandes alter column numero set not null;
