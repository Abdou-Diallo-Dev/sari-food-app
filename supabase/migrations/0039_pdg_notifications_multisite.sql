-- Le PDG doit recevoir les mêmes notifications que manager/admin (nouvelle
-- commande en ligne, demande de réapprovisionnement, stock bas, rupture de
-- production, caisse à contrôler / rattachement manuel) : on ajoute 'pdg'
-- aux mêmes listes de rôles destinataires que 'manager'/'admin' dans chacun
-- des triggers de notification concernés.
--
-- Bug connexe découvert au passage : toutes ces requêtes filtrent les
-- destinataires par `u.restaurant_id = new.restaurant_id`. Un compte
-- multi-site (restaurant_id null — admin aujourd'hui, PDG et manager
-- général demain) ne matche jamais cette égalité (null = x est toujours
-- inconnu en SQL), donc un tel compte n'aurait reçu AUCUNE de ces
-- notifications malgré sa présence dans la liste de rôles — même bug de
-- fond que le filtrage RLS silencieux corrigé en 0038. On élargit donc la
-- condition à `(u.restaurant_id = new.restaurant_id or u.restaurant_id is
-- null)`, cohérent avec le pattern de scope déjà utilisé partout ailleurs
-- dans l'app (restaurant_id null = tous les restaurants).

-- 1. Stock bas (0012_stock_edition_et_caisse_multi_moyens.sql)
create or replace function notifier_seuil_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stock_actuel <= new.seuil_alerte
     and (old.stock_actuel > old.seuil_alerte) then
    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    select new.restaurant_id, u.id, 'stock',
      'Stock bas : ' || new.nom || ' (' || new.stock_actuel || ' ' || new.unite ||
      ' restant, seuil ' || new.seuil_alerte || ')',
      '/stock'
    from utilisateurs u
    where (u.restaurant_id = new.restaurant_id or u.restaurant_id is null)
      and u.role in ('manager', 'admin', 'pdg') and u.actif;
  end if;
  return new;
end;
$$;

-- 2. Nouvelle demande de réapprovisionnement (dernière version : 0025_notif_quantite_precise.sql)
create or replace function notifier_declenchement_demande() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ingredient_nom text;
  v_ingredient_unite text;
  v_quantite text;
begin
  select nom, unite into v_ingredient_nom, v_ingredient_unite
  from ingredients where id = new.ingredient_id;

  v_quantite := regexp_replace(new.quantite_demandee::text, '\.?0+$', '');

  insert into notifications (restaurant_id, destinataire_id, type, message, lien)
  select new.restaurant_id, u.id, 'approvisionnement',
    'Nouvelle demande de réapprovisionnement : ' || coalesce(v_ingredient_nom, '') ||
      ' (' || v_quantite || ' ' || coalesce(v_ingredient_unite, '') || ')',
    '/approvisionnement'
  from utilisateurs u
  where (u.restaurant_id = new.restaurant_id or u.restaurant_id is null) and u.actif
    and u.role in ('manager', 'admin', 'pdg');

  return new;
end;
$$;

-- 3. Caisse à contrôler (0033_controle_manager_caisse.sql) — seul le premier
-- insert (manager/admin) concerne le PDG ; le transfert au comptable reste
-- réservé au rôle comptable.
create or replace function verifier_transition_session_caisse() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = old.statut then
    return new;
  end if;

  if new.statut = 'en_attente_controle' then
    if old.statut <> 'ouverte' then
      raise exception 'Seule une session ouverte peut être remise pour contrôle.';
    end if;
    if not (new.caissiere_id = auth.uid() or is_manager_or_admin()) then
      raise exception 'Seule la caissière titulaire ou un manager peut clôturer cette session.';
    end if;
    if new.total_compte_especes is null then
      raise exception 'Le montant compté en espèces est requis.';
    end if;

    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    select new.restaurant_id, u.id, 'caisse',
      'Caisse à contrôler (' || (case when new.shift = 'matin' then 'matin' else 'soir' end) || ') — '
        || new.total_compte_especes || ' F comptés en espèces.',
      '/caisse'
    from utilisateurs u
    where (u.restaurant_id = new.restaurant_id or u.restaurant_id is null)
      and u.role in ('manager', 'admin', 'pdg') and u.actif;

  elsif new.statut = 'cloturee' then
    if old.statut <> 'en_attente_controle' then
      raise exception 'Seule une session en attente de contrôle peut être clôturée.';
    end if;
    if not is_manager_or_admin() then
      raise exception 'Seul un manager peut contrôler et clôturer cette session.';
    end if;
    if new.montant_garde_fonds_caisse is null
       or new.montant_garde_fonds_caisse < 0
       or new.montant_garde_fonds_caisse > new.total_compte_especes then
      raise exception 'Le fonds de caisse gardé doit être compris entre 0 et le montant compté.';
    end if;
    new.montant_transfere_comptable := new.total_compte_especes - new.montant_garde_fonds_caisse;
    new.controle_manager_id := auth.uid();
    new.controlee_at := now();

    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    select new.restaurant_id, u.id, 'caisse',
      new.montant_transfere_comptable || ' F transférés au comptable (fonds gardé : '
        || new.montant_garde_fonds_caisse || ' F).',
      '/caisse-globale'
    from utilisateurs u
    where (u.restaurant_id = new.restaurant_id or u.restaurant_id is null)
      and u.role = 'comptable' and u.actif;

  else
    raise exception 'Transition de statut non autorisée.';
  end if;

  return new;
end;
$$;

-- 4. Rupture de production (0027_production_journaliere.sql)
create or replace function notifier_rupture_production() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_produit_nom text;
  v_pole pole_type;
begin
  select nom into v_produit_nom from produits where id = new.produit_id;
  select c.pole into v_pole
  from produits p join categories_produits c on c.id = p.categorie_id
  where p.id = new.produit_id;

  insert into notifications (restaurant_id, destinataire_id, type, message, lien)
  select new.restaurant_id, u.id, 'production',
    'Rupture du jour : ' || coalesce(v_produit_nom, '') || ' — production épuisée.',
    '/production'
  from utilisateurs u
  where (u.restaurant_id = new.restaurant_id or u.restaurant_id is null) and u.actif
    and (u.role in ('manager', 'admin', 'pdg', 'caissiere') or u.pole = v_pole);

  return new;
end;
$$;

-- 5. Nouvelle commande en ligne payée (0021_commandes_en_ligne_fn.sql)
create or replace function notifier_commande_en_ligne_payee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (restaurant_id, destinataire_id, type, message, lien)
  select new.restaurant_id, u.id, 'commande_en_ligne',
    'Nouvelle commande en ligne n°' || new.numero || ' (' || coalesce(new.client_nom, 'client') || ')',
    '/kds'
  from utilisateurs u
  where (u.restaurant_id = new.restaurant_id or u.restaurant_id is null)
    and u.role in ('caissiere', 'manager', 'admin', 'pdg')
    and u.actif;

  return new;
end;
$$;

-- 6. Commande en ligne payée sans caisse ouverte (dernière version :
-- 0036_materialisation_session_atomique.sql) — reprise complète de la
-- fonction (pas seulement le bloc notification) car c'est un create or
-- replace sur toute la fonction.
create or replace function materialiser_commande_en_ligne(p_id uuid, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cel commandes_en_ligne%rowtype;
  v_numero bigint;
  v_commande_id uuid;
  v_debut_journee timestamptz := date_trunc('day', now());
  v_item jsonb;
  v_session_id uuid;
begin
  select * into v_cel
  from commandes_en_ligne
  where id = p_id and statut = 'en_attente'
  for update;

  if not found then
    return null;
  end if;

  select id into v_session_id
  from sessions_caisse
  where id = v_cel.session_caisse_id and statut = 'ouverte'
  for update;

  if v_session_id is null then
    select id into v_session_id
    from sessions_caisse
    where restaurant_id = v_cel.restaurant_id and statut = 'ouverte'
    order by ouverte_at asc
    limit 1
    for update;
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero
  from commandes
  where restaurant_id = v_cel.restaurant_id
    and created_at >= v_debut_journee;

  insert into commandes (
    restaurant_id, canal, total, numero, client_nom, client_telephone,
    adresse_livraison, zone_livraison_id, frais_livraison, points_utilises,
    session_id
  )
  values (
    v_cel.restaurant_id, 'en_ligne', v_cel.total, v_numero,
    v_cel.client_nom, v_cel.client_telephone,
    v_cel.adresse_livraison, v_cel.zone_livraison_id, v_cel.frais_livraison,
    v_cel.points_utilises, v_session_id
  )
  returning id into v_commande_id;

  for v_item in select * from jsonb_array_elements(v_cel.panier)
  loop
    insert into lignes_commande (commande_id, produit_id, pole, quantite, prix_unitaire)
    values (
      v_commande_id,
      (v_item ->> 'produit_id')::uuid,
      (v_item ->> 'pole')::pole_type,
      (v_item ->> 'quantite')::integer,
      (v_item ->> 'prix_unitaire')::numeric
    );
  end loop;

  update commandes set statut = 'payee' where id = v_commande_id;

  update commandes_en_ligne
  set statut = 'payee', commande_id = v_commande_id, reference_paiement = p_reference
  where id = p_id;

  if v_cel.points_utilises > 0 then
    insert into points_fidelite_mouvements
      (restaurant_id, client_telephone, delta, motif, commande_id)
    values
      (v_cel.restaurant_id, v_cel.client_telephone, -v_cel.points_utilises,
       'Échange commande n°' || v_numero, v_commande_id);
  end if;

  if v_session_id is not null then
    insert into transactions_caisse
      (session_id, type, montant, moyen_paiement, commande_id, utilisateur_id, libelle)
    values
      (v_session_id, 'encaissement', v_cel.total, v_cel.mode_paiement::moyen_paiement,
       v_commande_id, null, 'Commande en ligne n°' || v_numero);
  else
    -- Aucune caisse ouverte au moment de la confirmation : la commande est
    -- quand même préparée, mais l'encaissement doit être rattaché à la
    -- main dès qu'une session rouvre.
    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    select v_cel.restaurant_id, u.id, 'commande_en_ligne',
      'Commande en ligne n°' || v_numero || ' payée sans caisse ouverte — rattachement manuel requis.',
      '/admin/caisse'
    from utilisateurs u
    where (u.restaurant_id = v_cel.restaurant_id or u.restaurant_id is null)
      and u.role in ('manager', 'admin', 'pdg')
      and u.actif;
  end if;

  return v_commande_id;
end;
$$;

grant execute on function materialiser_commande_en_ligne(uuid, text) to service_role;
