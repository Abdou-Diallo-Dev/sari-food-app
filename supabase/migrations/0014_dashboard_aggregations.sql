-- Fonctions d'agrégation SQL pour le tableau de bord.
--
-- Le tableau de bord calculait ses indicateurs en rapatriant les commandes /
-- lignes de commande / transactions bruteS côté application puis en les
-- agrégeant en JS, avec une limite de lignes arbitraire pour éviter de
-- dépasser les plafonds par défaut de PostgREST. Cette limite est
-- dangereuse : au-delà du seuil, les indicateurs deviennent silencieusement
-- faux (données tronquées) au lieu d'échouer bruyamment.
--
-- On calcule donc les sommes/comptages/regroupements directement en SQL :
-- le volume renvoyé à l'application est borné par le nombre de catégories
-- (produits, employés...) et non par le nombre d'opérations enregistrées,
-- qui lui n'a aucune limite.
--
-- SECURITY INVOKER (par défaut, pas de "security definer") : les RLS des
-- tables sous-jacentes s'appliquent normalement selon l'utilisateur
-- appelant, exactement comme un select direct.

create or replace function dashboard_resume(p_restaurant_id uuid)
returns table (
  ca_jour numeric,
  ca_hier numeric,
  ca_semaine numeric,
  ca_semaine_precedente numeric,
  ca_mois numeric,
  ca_mois_precedent numeric,
  ca_annee numeric,
  ca_annee_precedente numeric,
  nb_commandes_jour bigint,
  nb_commandes_payees_jour bigint,
  commandes_en_attente bigint,
  depenses_jour numeric,
  sessions_ouvertes bigint,
  ecart_jour numeric,
  alertes_stock bigint,
  production_jour numeric
)
language plpgsql
stable
as $$
declare
  v_jour_debut timestamptz := date_trunc('day', now());
  v_jour_fin timestamptz := v_jour_debut + interval '1 day';
  v_hier_debut timestamptz := v_jour_debut - interval '1 day';
  v_semaine_debut timestamptz := date_trunc('week', now());
  v_semaine_fin timestamptz := v_semaine_debut + interval '7 days';
  v_semaine_prec_debut timestamptz := v_semaine_debut - interval '7 days';
  v_mois_debut timestamptz := date_trunc('month', now());
  v_mois_fin timestamptz := v_mois_debut + interval '1 month';
  v_mois_prec_debut timestamptz := v_mois_debut - interval '1 month';
  v_annee_debut timestamptz := date_trunc('year', now());
  v_annee_fin timestamptz := v_annee_debut + interval '1 year';
  v_annee_prec_debut timestamptz := v_annee_debut - interval '1 year';
begin
  return query
  select
    coalesce((select sum(c.total) from commandes c where c.restaurant_id = p_restaurant_id and c.statut = 'payee' and c.created_at >= v_jour_debut and c.created_at < v_jour_fin), 0),
    coalesce((select sum(c.total) from commandes c where c.restaurant_id = p_restaurant_id and c.statut = 'payee' and c.created_at >= v_hier_debut and c.created_at < v_jour_debut), 0),
    coalesce((select sum(c.total) from commandes c where c.restaurant_id = p_restaurant_id and c.statut = 'payee' and c.created_at >= v_semaine_debut and c.created_at < v_semaine_fin), 0),
    coalesce((select sum(c.total) from commandes c where c.restaurant_id = p_restaurant_id and c.statut = 'payee' and c.created_at >= v_semaine_prec_debut and c.created_at < v_semaine_debut), 0),
    coalesce((select sum(c.total) from commandes c where c.restaurant_id = p_restaurant_id and c.statut = 'payee' and c.created_at >= v_mois_debut and c.created_at < v_mois_fin), 0),
    coalesce((select sum(c.total) from commandes c where c.restaurant_id = p_restaurant_id and c.statut = 'payee' and c.created_at >= v_mois_prec_debut and c.created_at < v_mois_debut), 0),
    coalesce((select sum(c.total) from commandes c where c.restaurant_id = p_restaurant_id and c.statut = 'payee' and c.created_at >= v_annee_debut and c.created_at < v_annee_fin), 0),
    coalesce((select sum(c.total) from commandes c where c.restaurant_id = p_restaurant_id and c.statut = 'payee' and c.created_at >= v_annee_prec_debut and c.created_at < v_annee_debut), 0),
    (select count(*) from commandes c where c.restaurant_id = p_restaurant_id and c.created_at >= v_jour_debut and c.created_at < v_jour_fin),
    (select count(*) from commandes c where c.restaurant_id = p_restaurant_id and c.statut = 'payee' and c.created_at >= v_jour_debut and c.created_at < v_jour_fin),
    (select count(*) from commandes c where c.restaurant_id = p_restaurant_id and c.statut in ('recue', 'en_preparation', 'prete')),
    coalesce((select sum(t.montant) from transactions_caisse t join sessions_caisse s on s.id = t.session_id where s.restaurant_id = p_restaurant_id and t.type = 'depense' and t.created_at >= v_jour_debut and t.created_at < v_jour_fin), 0),
    (select count(*) from sessions_caisse s where s.restaurant_id = p_restaurant_id and s.statut = 'ouverte'),
    coalesce((select sum(s.ecart) from sessions_caisse s where s.restaurant_id = p_restaurant_id and s.ouverte_at >= v_jour_debut and s.ouverte_at < v_jour_fin and s.ecart is not null), 0),
    (select count(*) from ingredients i where i.restaurant_id = p_restaurant_id and i.stock_actuel <= i.seuil_alerte),
    coalesce((select sum(lc.quantite) from lignes_commande lc join commandes c on c.id = lc.commande_id where c.restaurant_id = p_restaurant_id and lc.pret_at >= v_jour_debut and lc.pret_at < v_jour_fin), 0);
end;
$$;

create or replace function dashboard_produits_mois(p_restaurant_id uuid)
returns table (produit_id uuid, nom text, quantite numeric)
language sql
stable
as $$
  select p.id, p.nom, sum(lc.quantite) as quantite
  from lignes_commande lc
  join commandes c on c.id = lc.commande_id
  join produits p on p.id = lc.produit_id
  where c.restaurant_id = p_restaurant_id
    and c.statut = 'payee'
    and c.created_at >= date_trunc('month', now())
    and c.created_at < date_trunc('month', now()) + interval '1 month'
  group by p.id, p.nom
  order by quantite desc;
$$;

create or replace function dashboard_production_employes_jour(p_restaurant_id uuid)
returns table (utilisateur_id uuid, nom text, quantite numeric, nb_lignes bigint, temps_moyen_minutes numeric)
language sql
stable
as $$
  select
    u.id,
    u.nom,
    sum(lc.quantite) as quantite,
    count(*) as nb_lignes,
    avg(extract(epoch from (lc.pret_at - lc.pris_en_charge_at)) / 60)
      filter (where lc.pris_en_charge_at is not null and lc.pret_at >= lc.pris_en_charge_at) as temps_moyen_minutes
  from lignes_commande lc
  join commandes c on c.id = lc.commande_id
  join utilisateurs u on u.id = lc.responsable_id
  where c.restaurant_id = p_restaurant_id
    and lc.pret_at >= date_trunc('day', now())
    and lc.pret_at < date_trunc('day', now()) + interval '1 day'
  group by u.id, u.nom
  order by quantite desc;
$$;

create or replace function dashboard_performance_caissiers_jour(p_restaurant_id uuid)
returns table (utilisateur_id uuid, nom text, nb_ventes bigint, ca numeric)
language sql
stable
as $$
  select u.id, u.nom, count(*) as nb_ventes, sum(t.montant) as ca
  from transactions_caisse t
  join sessions_caisse s on s.id = t.session_id
  join utilisateurs u on u.id = t.utilisateur_id
  where s.restaurant_id = p_restaurant_id
    and t.type = 'encaissement'
    and t.created_at >= date_trunc('day', now())
    and t.created_at < date_trunc('day', now()) + interval '1 day'
  group by u.id, u.nom
  order by ca desc;
$$;

create or replace function dashboard_ca_quotidien(p_restaurant_id uuid, p_jours int default 14)
returns table (jour date, ca numeric)
language sql
stable
as $$
  select
    d::date as jour,
    coalesce((
      select sum(c.total) from commandes c
      where c.restaurant_id = p_restaurant_id
        and c.statut = 'payee'
        and c.created_at >= d
        and c.created_at < d + interval '1 day'
    ), 0) as ca
  from generate_series(
    date_trunc('day', now()) - (p_jours - 1) * interval '1 day',
    date_trunc('day', now()),
    interval '1 day'
  ) as d;
$$;

grant execute on function dashboard_resume(uuid) to authenticated;
grant execute on function dashboard_produits_mois(uuid) to authenticated;
grant execute on function dashboard_production_employes_jour(uuid) to authenticated;
grant execute on function dashboard_performance_caissiers_jour(uuid) to authenticated;
grant execute on function dashboard_ca_quotidien(uuid, int) to authenticated;
