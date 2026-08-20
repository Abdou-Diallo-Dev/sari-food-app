-- Une commande en ligne payée sans caisse ouverte (cf. commentaire de
-- materialiser_commande_en_ligne, 0036) est déjà comptée dans le CA
-- (dashboard_resume, dashboard_ca_quotidien, rapport_ca_quotidien, page
-- d'accueil filtrent uniquement sur commandes.statut = 'payee', jamais sur
-- session_id) : pas de "fausses données" de ce côté.
--
-- En revanche, faute de session, elle n'a jamais de ligne
-- transactions_caisse — donc son encaissement Wave/Orange Money n'entre
-- jamais dans la caisse globale (alimentée à la clôture de session à partir
-- de transactions_caisse). La notification "rattachement manuel requis"
-- existante ne menait vers aucune action réelle : rien dans l'app ne
-- permettait ce rattachement. Résultat : l'argent restait invisible en
-- caisse globale indéfiniment, un vrai décalage entre CA affiché et argent
-- suivi.
--
-- Fix : dès qu'une nouvelle session de caisse s'ouvre sur le restaurant, on
-- rattache automatiquement toutes les commandes en ligne payées orphelines
-- (session_id null) à cette session — création de la transactions_caisse
-- manquante + mise à jour de commandes.session_id — pour qu'elles entrent
-- dans la caisse globale à la prochaine clôture, sans dépendre d'une action
-- manuelle que personne n'avait de moyen de déclencher.

create or replace function rattacher_commandes_en_ligne_orphelines() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nb integer;
  v_total numeric;
begin
  if new.statut <> 'ouverte' then
    return new;
  end if;

  insert into transactions_caisse (session_id, type, montant, moyen_paiement, commande_id, utilisateur_id, libelle)
  select new.id, 'encaissement', c.total, cel.mode_paiement::moyen_paiement, c.id, null,
    'Commande en ligne n°' || c.numero || ' (rattachée à l''ouverture de caisse)'
  from commandes c
  join commandes_en_ligne cel on cel.commande_id = c.id
  where c.restaurant_id = new.restaurant_id
    and c.session_id is null
    and c.statut = 'payee'
    and c.canal = 'en_ligne';

  get diagnostics v_nb = row_count;

  if v_nb > 0 then
    select coalesce(sum(c.total), 0) into v_total
    from commandes c
    where c.restaurant_id = new.restaurant_id
      and c.session_id is null
      and c.statut = 'payee'
      and c.canal = 'en_ligne';

    update commandes c
    set session_id = new.id
    from commandes_en_ligne cel
    where cel.commande_id = c.id
      and c.restaurant_id = new.restaurant_id
      and c.session_id is null
      and c.statut = 'payee'
      and c.canal = 'en_ligne';

    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    select new.restaurant_id, u.id, 'commande_en_ligne',
      v_nb || ' commande(s) en ligne (' || v_total || ' F) rattachée(s) à cette ouverture de caisse.',
      '/admin/caisse'
    from utilisateurs u
    where (u.restaurant_id = new.restaurant_id or u.restaurant_id is null)
      and u.role in ('manager', 'admin', 'pdg')
      and u.actif;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rattacher_commandes_en_ligne_orphelines on sessions_caisse;
create trigger trg_rattacher_commandes_en_ligne_orphelines
  after insert on sessions_caisse
  for each row
  execute function rattacher_commandes_en_ligne_orphelines();

-- Le message de notification à la matérialisation parlait de "rattachement
-- manuel requis" : ce n'est plus vrai, le rattachement est désormais
-- automatique à la prochaine ouverture de caisse. Reprise complète de la
-- fonction (create or replace sur toute la fonction, comme en 0039) pour ne
-- changer que ce texte.
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
    -- quand même préparée et déjà comptée dans le CA (commandes.statut =
    -- 'payee'). L'encaissement sera rattaché automatiquement à la caisse
    -- globale dès qu'une session rouvrira sur ce restaurant (voir
    -- rattacher_commandes_en_ligne_orphelines ci-dessus).
    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    select v_cel.restaurant_id, u.id, 'commande_en_ligne',
      'Commande en ligne n°' || v_numero || ' payée sans caisse ouverte — sera rattachée automatiquement à la prochaine ouverture.',
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
