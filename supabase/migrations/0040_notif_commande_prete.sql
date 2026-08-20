-- Notifie caissière, manager, admin et PDG dès qu'une commande passe au
-- statut "prête" (toutes les lignes en cuisine sont terminées — cf.
-- verifierEtRafraichirCommande dans app/(app)/kds/actions.ts), pour qu'elle
-- puisse être remise/servie sans que quelqu'un ait à surveiller le KDS en
-- permanence. Même principe que les autres notifications : trigger SQL sur
-- la table, jamais de code applicatif pour créer une notification (cf.
-- 0021_commandes_en_ligne_fn.sql), et scope restaurant élargi aux comptes
-- multi-site (restaurant_id null), comme dans 0039.
--
-- Lien vers /pos plutôt que /kds : la caissière n'a pas accès à /kds
-- (app/(app)/kds/page.tsx ne liste pas 'caissiere' dans les rôles admis),
-- alors que /pos est déjà accessible à caissiere/manager/admin/pdg.

create or replace function notifier_commande_prete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (restaurant_id, destinataire_id, type, message, lien)
  select new.restaurant_id, u.id, 'commande_prete',
    'Commande n°' || new.numero || ' prête (' ||
      (case new.canal
        when 'sur_place' then 'sur place'
        when 'emporter' then 'à emporter'
        when 'livraison' then 'livraison'
        when 'en_ligne' then 'en ligne'
        else new.canal::text
      end) || ').',
    '/pos'
  from utilisateurs u
  where (u.restaurant_id = new.restaurant_id or u.restaurant_id is null)
    and u.role in ('caissiere', 'manager', 'admin', 'pdg')
    and u.actif;

  return new;
end;
$$;

drop trigger if exists trg_notifier_commande_prete on commandes;
create trigger trg_notifier_commande_prete
  after update of statut on commandes
  for each row
  when (new.statut = 'prete' and old.statut is distinct from 'prete')
  execute function notifier_commande_prete();
