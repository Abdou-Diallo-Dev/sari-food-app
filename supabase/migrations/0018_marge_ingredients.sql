-- Vague 4 : modèle de marge/bénéfice.
--
-- Le coût des ingrédients n'existait nulle part dans le schéma. On ajoute
-- un coût unitaire maintenu manuellement (admin/manager) sur chaque
-- ingrédient, dans la même unité que le stock (ex. F par kg). Combiné aux
-- quantités de la recette (table `recettes`), il permet de calculer le
-- coût matière et la marge de chaque produit vendu.
--
-- Même principe que les migrations 0014/0017 : agrégation en SQL bornée
-- par le nombre de produits/ingrédients du catalogue, jamais par le
-- nombre de lignes de vente enregistrées.

alter table ingredients
  add column if not exists cout_unitaire numeric(12, 2) not null default 0;

create or replace function rapport_marge(p_restaurant_id uuid, p_debut timestamptz, p_fin timestamptz)
returns table (
  produit_id uuid,
  nom text,
  quantite numeric,
  ca numeric,
  cout_matiere numeric,
  marge numeric,
  marge_pct numeric
)
language sql
stable
as $$
  with cout_recette as (
    select r.produit_id, sum(r.quantite_utilisee * i.cout_unitaire) as cout_par_unite
    from recettes r
    join ingredients i on i.id = r.ingredient_id
    group by r.produit_id
  )
  select
    p.id,
    p.nom,
    sum(lc.quantite) as quantite,
    sum(lc.quantite * lc.prix_unitaire) as ca,
    sum(lc.quantite * coalesce(cr.cout_par_unite, 0)) as cout_matiere,
    sum(lc.quantite * lc.prix_unitaire) - sum(lc.quantite * coalesce(cr.cout_par_unite, 0)) as marge,
    case
      when sum(lc.quantite * lc.prix_unitaire) > 0
        then round(
          100 * (sum(lc.quantite * lc.prix_unitaire) - sum(lc.quantite * coalesce(cr.cout_par_unite, 0)))
          / sum(lc.quantite * lc.prix_unitaire),
          1
        )
      else 0
    end as marge_pct
  from lignes_commande lc
  join commandes c on c.id = lc.commande_id
  join produits p on p.id = lc.produit_id
  left join cout_recette cr on cr.produit_id = p.id
  where c.restaurant_id = p_restaurant_id
    and c.statut = 'payee'
    and c.created_at >= p_debut
    and c.created_at < p_fin
  group by p.id, p.nom
  order by marge desc;
$$;

grant execute on function rapport_marge(uuid, timestamptz, timestamptz) to authenticated;
