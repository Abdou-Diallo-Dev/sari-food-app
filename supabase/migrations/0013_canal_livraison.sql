-- Ajoute le canal "livraison" à la prise de commande (POS), en plus de
-- "sur_place" et "emporter".
alter type canal_commande add value 'livraison';
