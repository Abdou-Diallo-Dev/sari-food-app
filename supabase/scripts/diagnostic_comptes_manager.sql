-- Diagnostic : pour chaque compte manager/admin/pdg, montre à quel
-- restaurant il est rattaché (ou "Multi-site" si restaurant_id est NULL).
-- Lecture seule, ne modifie rien.
select u.nom, u.identifiant, u.role, u.restaurant_id,
  coalesce(r.nom, 'Multi-site (voit tout)') as restaurant_rattache
from utilisateurs u
left join restaurants r on r.id = u.restaurant_id
where u.role in ('manager', 'admin', 'pdg')
order by u.role, u.nom;
