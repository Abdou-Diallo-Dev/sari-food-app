-- Corrige dashboard_resume() : "structure of query does not match function
-- result type".
--
-- Cause : production_jour est déclarée numeric, mais son calcul fait
-- sum(lc.quantite), où lignes_commande.quantite est integer. sum(integer)
-- renvoie bigint, pas numeric. Pour une fonction plpgsql utilisant
-- "return query select ...", Postgres exige une correspondance de type
-- exacte entre chaque colonne du select et le type déclaré dans
-- returns table (...) — aucun cast implicite n'est appliqué, contrairement
-- à un "select ... into" ou à une fonction "language sql". D'où l'échec.
--
-- Les autres fonctions du même fichier (dashboard_produits_mois,
-- dashboard_production_employes_jour, rapport_produits, rapport_employes,
-- rapport_marge) font le même sum(quantite) mais sont "language sql" (cast
-- automatique appliqué) ou passent par "select ... into" (idem) : elles ne
-- sont pas concernées par ce bug.

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
    coalesce((select sum(lc.quantite)::numeric from lignes_commande lc join commandes c on c.id = lc.commande_id where c.restaurant_id = p_restaurant_id and lc.pret_at >= v_jour_debut and lc.pret_at < v_jour_fin), 0);
end;
$$;

grant execute on function dashboard_resume(uuid) to authenticated;
