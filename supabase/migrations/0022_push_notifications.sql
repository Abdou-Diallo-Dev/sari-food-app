-- Notifications push (Web Push) : jusqu'ici une ligne `notifications` n'était
-- vue que si le staff ouvrait l'app et regardait la cloche (voir
-- NotificationBell / 0010_circuit_approvisionnement.sql / 0021). Ce fichier
-- ajoute la livraison push réelle (notification système, même app fermée /
-- écran éteint), en 2 parties :
--
--   1. une notification "commande cuisine" qui n'existait pas du tout jusqu'ici
--      (le KDS est purement "pull" : le staff regarde l'écran, personne n'est
--      averti quand une commande arrive pour son pôle) ;
--   2. un relais générique : TOUT insert dans `notifications`, quel que soit
--      le type (approvisionnement, commande_en_ligne, commande_cuisine...),
--      appelle via pg_net l'API de l'app, qui envoie le push aux abonnements
--      du destinataire. Un seul trigger générique plutôt qu'un trigger par
--      type de notification : toute catégorie actuelle ou future devient
--      pushable automatiquement, sans y retoucher.

create table push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references utilisateurs(id) on delete cascade,
  endpoint       text not null unique,
  p256dh         text not null,
  auth           text not null,
  created_at     timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

-- Chaque utilisateur gère ses propres abonnements (un par navigateur/appareil
-- sur lequel il a accepté les notifications) ; aucun accès aux abonnements
-- des autres, y compris pour un admin (il n'a pas besoin de les lire).
create policy "push_subscriptions_own" on push_subscriptions
  for all to authenticated
  using (utilisateur_id = auth.uid())
  with check (utilisateur_id = auth.uid());

-- Nouvelle notification : une ligne de commande vient d'être créée pour le
-- pôle X -> notifie les chefs/équipiers de ce pôle dans le restaurant.
-- Trigger STATEMENT (via la table de transition new_lignes), pas ROW : le
-- POS insère toutes les lignes d'une commande en un seul insert multi-lignes,
-- donc regrouper au niveau de l'instruction évite une notification par
-- article (une seule notification par pôle concerné, pour toute la commande).
create or replace function notifier_nouvelles_lignes_cuisine() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (restaurant_id, destinataire_id, type, message, lien)
  select distinct c.restaurant_id, u.id, 'commande_cuisine',
    'Nouvelle commande n°' || c.numero || ' pour votre pôle',
    '/kds'
  from new_lignes nl
  join commandes c on c.id = nl.commande_id
  join utilisateurs u
    on u.restaurant_id = c.restaurant_id
   and u.pole = nl.pole
   and u.actif
   and u.role in (
     'chef_patisserie', 'chef_boulangerie', 'chef_fastfood',
     'equipier_patisserie', 'equipier_boulangerie', 'equipier_fastfood'
   );

  return null;
end;
$$;

drop trigger if exists trg_notifier_nouvelles_lignes_cuisine on lignes_commande;
create trigger trg_notifier_nouvelles_lignes_cuisine
  after insert on lignes_commande
  referencing new table as new_lignes
  for each statement
  execute function notifier_nouvelles_lignes_cuisine();

-- Relais push générique. pg_net (extension fournie par Supabase) exécute
-- l'appel HTTP de façon asynchrone (file d'attente) : le trigger ne bloque
-- jamais l'insert de la notification, et un souci réseau/config côté push
-- n'empêche jamais la notification d'apparaître dans la cloche (l'exception
-- est avalée : la notification reste créée même si le push échoue).
--
-- Le secret partagé avec l'API /api/push est lu depuis un paramètre de base
-- (app.settings.push_webhook_secret) plutôt qu'écrit en dur ici, pour ne pas
-- committer de secret dans les migrations versionnées. À définir une seule
-- fois via : alter database postgres set app.settings.push_webhook_secret = '...';
-- (fourni séparément, pas dans ce fichier).
create extension if not exists pg_net with schema extensions;

create or replace function relayer_push_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://sari-food-app.vercel.app/api/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', coalesce(current_setting('app.settings.push_webhook_secret', true), '')
    ),
    body := jsonb_build_object(
      'destinataire_id', new.destinataire_id,
      'message', new.message,
      'lien', new.lien,
      'type', new.type
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_relayer_push_notification on notifications;
create trigger trg_relayer_push_notification
  after insert on notifications
  for each row
  execute function relayer_push_notification();
