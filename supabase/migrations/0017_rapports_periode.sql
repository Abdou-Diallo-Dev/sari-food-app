-- Rapports automatiques par période arbitraire (jour/semaine/mois/année/
-- personnalisée) pour la page /admin/rapports.
--
-- Même principe que les fonctions du tableau de bord (migration 0014) :
-- agrégation directement en SQL, bornée par le nombre de catégories
-- (produits, employés, jours de la période) et non par le nombre
-- d'opérations enregistrées. SECURITY INVOKER par défaut : les RLS des
-- tables sous-jacentes s'appliquent normalement selon l'utilisateur
-- appelant.

create or replace function rapport_resume(p_restaurant_id uuid, p_debut timestamptz, p_fin timestamptz)
returns table (
  ca_total numeric,
  nb_commandes bigint,
  nb_commandes_payees bigint,
  nb_commandes_annulees bigint,
  panier_moyen numeric,
  depenses_total numeric,
  ecart_caisse_total numeric,
  production_total numeric,
  nb_sessions_caisse bigint
)
language plpgsql
stable
as $$
declare
  v_ca_total numeric;
  v_nb_commandes bigint;
  v_nb_payees bigint;
  v_nb_annulees bigint;
  v_depenses numeric;
  v_ecart numeric;
  v_production numeric;
  v_sessions bigint;
begin
  select
    coalesce(sum(c.total) filter (where c.statut = 'payee'), 0),
    count(*),
    count(*) filter (where c.statut = 'payee'),
    count(*) filter (where c.statut = 'annulee')
  into v_ca_total, v_nb_commandes, v_nb_payees, v_nb_annulees
  from commandes c
  where c.restaurant_id = p_restaurant_id and c.created_at >= p_debut and c.created_at < p_fin;

  select coalesce(sum(t.montant), 0) into v_depenses
  from transactions_caisse t
  join sessions_caisse s on s.id = t.session_id
  where s.restaurant_id = p_restaurant_id and t.type = 'depense'
    and t.created_at >= p_debut and t.created_at < p_fin;

  select coalesce(sum(s.ecart), 0) into v_ecart
  from sessions_caisse s
  where s.restaurant_id = p_restaurant_id and s.ecart is not null
    and s.cloturee_at >= p_debut and s.cloturee_at < p_fin;

  select coalesce(sum(lc.quantite), 0) into v_production
  from lignes_commande lc
  join commandes c on c.id = lc.commande_id
  where c.restaurant_id = p_restaurant_id and lc.pret_at >= p_debut and lc.pret_at < p_fin;

  select count(*) into v_sessions
  from sessions_caisse s
  where s.restaurant_id = p_restaurant_id and s.ouverte_at >= p_debut and s.ouverte_at < p_fin;

  return query
  select
    v_ca_total,
    v_nb_commandes,
    v_nb_payees,
    v_nb_annulees,
    case when v_nb_payees > 0 then v_ca_total / v_nb_payees else 0 end,
    v_depenses,
    v_ecart,
    v_production,
    v_sessions;
end;
$$;

create or replace function rapport_produits(p_restaurant_id uuid, p_debut timestamptz, p_fin timestamptz)
returns table (produit_id uuid, nom text, quantite numeric, ca numeric)
language sql
stable
as $$
  select p.id, p.nom, sum(lc.quantite) as quantite, sum(lc.quantite * lc.prix_unitaire) as ca
  from lignes_commande lc
  join commandes c on c.id = lc.commande_id
  join produits p on p.id = lc.produit_id
  where c.restaurant_id = p_restaurant_id
    and c.statut = 'payee'
    and c.created_at >= p_debut
    and c.created_at < p_fin
  group by p.id, p.nom
  order by quantite desc;
$$;

create or replace function rapport_caissiers(p_restaurant_id uuid, p_debut timestamptz, p_fin timestamptz)
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
    and t.created_at >= p_debut
    and t.created_at < p_fin
  group by u.id, u.nom
  order by ca desc;
$$;

create or replace function rapport_employes(p_restaurant_id uuid, p_debut timestamptz, p_fin timestamptz)
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
    and lc.pret_at >= p_debut
    and lc.pret_at < p_fin
  group by u.id, u.nom
  order by quantite desc;
$$;

create or replace function rapport_ca_quotidien(p_restaurant_id uuid, p_debut timestamptz, p_fin timestamptz)
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
  from generate_series(date_trunc('day', p_debut), date_trunc('day', p_fin - interval '1 second'), interval '1 day') as d;
$$;

grant execute on function rapport_resume(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function rapport_produits(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function rapport_caissiers(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function rapport_employes(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function rapport_ca_quotidien(uuid, timestamptz, timestamptz) to authenticated;
