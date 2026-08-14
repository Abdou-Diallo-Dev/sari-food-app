-- Commande en ligne (suite) : à exécuter APRÈS 0020_commandes_en_ligne.sql
-- (celui-ci ajoute 'en_ligne' à canal_commande, une valeur que ce fichier
-- utilise comme littéral — ne peut donc pas partager sa transaction).

-- Lecture publique du menu pour l'app client (clé anon, aucune session).
-- Les policies existantes (0002_rls_policies.sql) exigent my_restaurant_id(),
-- qui vaut null pour un visiteur anonyme : elles ne couvrent donc pas ce cas,
-- d'où ces policies dédiées. Un menu (nom produit + prix) n'est pas une
-- donnée sensible, donc pas de restriction par restaurant ici : le filtrage
-- par restaurant se fait côté requête de l'app client.
create policy "produits_select_public" on produits
  for select to anon using (actif = true);

create policy "categories_produits_select_public" on categories_produits
  for select to anon using (true);

-- La déduction de stock automatique (0008_deduction_stock_auto.sql) attribue
-- chaque mouvement à auth.uid(). Une commande en ligne est matérialisée par
-- la fonction ci-dessous, appelée depuis le webhook de paiement via le client
-- service_role : il n'y a pas d'utilisateur authentifié, donc auth.uid() est
-- null. La colonne doit accepter null pour représenter un mouvement
-- automatique (aucune autre table ni page ne suppose utilisateur_id non-null
-- sur mouvements_stock).
alter table mouvements_stock alter column utilisateur_id drop not null;

-- Matérialise une commande en ligne payée : transforme la ligne de staging
-- commandes_en_ligne en une vraie commande/lignes_commande, exactement comme
-- encaisserCommandeInterne() le fait pour le POS (lib/caisse.ts), à ceci
-- près qu'il n'y a pas de session de caisse (session_id reste null : une
-- commande en ligne ne passe pas par la caisse physique).
--
-- Insert puis update séparé de statut vers 'payee' : c'est cette transition
-- qui déclenche trg_deduire_stock_commande (0008), défini comme
-- "after update of statut", pas "after insert" — un insert direct avec
-- statut='payee' pré-rempli ne le déclencherait pas.
--
-- Idempotent (select ... for update + condition statut='en_attente') : un
-- webhook de paiement livré deux fois ne matérialise pas deux fois.
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
begin
  select * into v_cel
  from commandes_en_ligne
  where id = p_id and statut = 'en_attente'
  for update;

  if not found then
    return null;
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero
  from commandes
  where restaurant_id = v_cel.restaurant_id
    and created_at >= v_debut_journee;

  insert into commandes (restaurant_id, canal, total, numero, client_nom, client_telephone)
  values (v_cel.restaurant_id, 'en_ligne', v_cel.total, v_numero, v_cel.client_nom, v_cel.client_telephone)
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

  return v_commande_id;
end;
$$;

grant execute on function materialiser_commande_en_ligne(uuid, text) to service_role;

-- Notifie le staff (caissières, managers, admin) qu'une nouvelle commande en
-- ligne payée est arrivée — même mécanisme que les notifications
-- d'approvisionnement (0010_circuit_approvisionnement.sql) : trigger SQL,
-- jamais de code applicatif pour créer une notification.
create or replace function notifier_commande_en_ligne_payee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (restaurant_id, destinataire_id, type, message, lien)
  select new.restaurant_id, u.id, 'commande_en_ligne',
    'Nouvelle commande en ligne n°' || new.numero || ' (' || coalesce(new.client_nom, 'client') || ')',
    '/kds'
  from utilisateurs u
  where u.restaurant_id = new.restaurant_id
    and u.role in ('caissiere', 'manager', 'admin')
    and u.actif;

  return new;
end;
$$;

drop trigger if exists trg_notifier_commande_en_ligne_payee on commandes;
create trigger trg_notifier_commande_en_ligne_payee
  after update of statut on commandes
  for each row
  when (new.canal = 'en_ligne' and new.statut = 'payee' and old.statut is distinct from 'payee')
  execute function notifier_commande_en_ligne_payee();
