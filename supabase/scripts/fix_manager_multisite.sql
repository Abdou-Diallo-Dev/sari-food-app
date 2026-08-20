-- Le rôle "manager" est libellé "Manager général" (lib/roles.ts) : il est
-- censé voir/couvrir tous les restaurants, donc restaurant_id doit être NULL
-- (convention "multi-site" utilisée partout dans l'app : dashboard, caisse,
-- approvisionnement...). Un manager avec un restaurant_id précis se retrouve
-- scopé sur un seul site et voit tout vide si ce site n'a pas d'activité.
--
-- Le rôle "pdg" est lui aussi toujours censé tout voir (traité en
-- "lectureSeule" multi-site dans toutes les pages : dashboard, caisse-globale,
-- admin/planning, admin/produits, stock, admin/livraison, kds, pos...),
-- jamais rattaché à un site précis. Même correction pour lui.
update utilisateurs
set restaurant_id = null
where role in ('manager', 'pdg')
  and restaurant_id is not null;
