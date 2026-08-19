-- La vérification "une caisse est ouverte" (creerCommandeEnLigne,
-- sari-foood-client/app/actions.ts) ne peut valoir qu'à l'instant où le
-- client clique Payer : le paiement Wave/Orange Money se confirme de façon
-- asynchrone (webhook, parfois plusieurs minutes plus tard), et rien ne
-- garantit que la session mémorisée sur
-- commandes_en_ligne.session_caisse_id soit encore ouverte à ce moment-là
-- — la caissière a pu clôturer entre-temps. Jusqu'ici, les 3 chemins de
-- confirmation (webhook Wave, webhook Orange Money, paiement-simule)
-- faisaient tous confiance à cette valeur figée sans la revérifier.
--
-- Comme le stock (0027) ou les points de fidélité (0031), cette règle doit
-- être vérifiée atomiquement au moment de la matérialisation, pas
-- seulement côté application au moment du checkout.
--
-- Décision (voir revue de code) : on ne bloque ni n'expire les paiements
-- en attente à la clôture d'une session — un panier abandonné bloquerait
-- sinon indéfiniment la caissière, et un paiement qui aboutit malgré tout
-- doit rester honoré (le client a payé, la cuisine doit préparer la
-- commande). À la place, la session à utiliser est résolue à l'instant de
-- la matérialisation, verrouillée pour empêcher une clôture concurrente de
-- s'intercaler entre la lecture et l'usage : la session mémorisée si elle
-- est toujours ouverte, sinon la session ouverte la plus ancienne du
-- restaurant, sinon aucune — la commande est quand même matérialisée, mais
-- sans rattachement de caisse, avec une notification au staff pour
-- rattachement manuel.
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
    where u.restaurant_id = v_cel.restaurant_id
      and u.role in ('manager', 'admin')
      and u.actif;
  end if;

  return v_commande_id;
end;
$$;

grant execute on function materialiser_commande_en_ligne(uuid, text) to service_role;
