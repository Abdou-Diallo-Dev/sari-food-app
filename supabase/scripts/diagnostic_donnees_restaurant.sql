-- Diagnostic : compte, pour chaque restaurant, le nombre de lignes liées
-- dans chaque table qui référence restaurants(id). À coller tel quel dans
-- l'éditeur SQL Supabase. Lecture seule, ne modifie rien.

select r.id, r.nom,
  (select count(*) from utilisateurs t where t.restaurant_id = r.id) as utilisateurs,
  (select count(*) from categories_produits t where t.restaurant_id = r.id) as categories_produits,
  (select count(*) from produits t where t.restaurant_id = r.id) as produits,
  (select count(*) from ingredients t where t.restaurant_id = r.id) as ingredients,
  (select count(*) from fournisseurs t where t.restaurant_id = r.id) as fournisseurs,
  (select count(*) from demandes_approvisionnement t where t.restaurant_id = r.id) as demandes_approvisionnement,
  (select count(*) from sessions_caisse t where t.restaurant_id = r.id) as sessions_caisse,
  (select count(*) from commandes t where t.restaurant_id = r.id) as commandes,
  (select count(*) from mouvements_stock t where t.restaurant_id = r.id) as mouvements_stock,
  (select count(*) from notifications t where t.restaurant_id = r.id) as notifications,
  (select count(*) from journal_audit t where t.restaurant_id = r.id) as journal_audit,
  (select count(*) from commandes_en_ligne t where t.restaurant_id = r.id) as commandes_en_ligne,
  (select count(*) from production_jour t where t.restaurant_id = r.id) as production_jour,
  (select count(*) from mouvements_caisse_globale t where t.restaurant_id = r.id) as mouvements_caisse_globale,
  (select count(*) from zones_livraison t where t.restaurant_id = r.id) as zones_livraison,
  (select count(*) from points_fidelite_mouvements t where t.restaurant_id = r.id) as points_fidelite_mouvements,
  (select count(*) from objectifs_production t where t.restaurant_id = r.id) as objectifs_production,
  (select count(*) from production_jour_contributions t where t.restaurant_id = r.id) as production_jour_contributions
from restaurants r
order by r.nom;
