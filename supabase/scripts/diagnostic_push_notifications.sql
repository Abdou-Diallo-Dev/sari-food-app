-- Diagnostic : pourquoi les notifications système (push) n'arrivent pas.
-- Lecture seule, ne modifie rien. À coller dans l'éditeur SQL Supabase.

-- 1) Le secret partagé avec /api/push a-t-il été configuré au niveau de la
--    base (0022_push_notifications.sql, ligne 78-81) ? Si le résultat est
--    vide ou NULL, c'est la cause : le relais envoie un secret vide, l'API
--    répond 401, et comme le trigger avale les erreurs, la notification
--    apparaît quand même dans la cloche mais le push système n'est jamais
--    envoyé (aucune erreur visible nulle part).
select current_setting('app.settings.push_webhook_secret', true) as secret_configure;

-- 2) Ces comptes ont-ils un abonnement push enregistré (ont-ils cliqué
--    "Activer les notifications" et accepté la permission du navigateur) ?
--    Aucune ligne pour un rôle = ce compte ne recevra jamais de push, quel
--    que soit l'état du reste (rien à voir avec le code, juste pas encore
--    abonné sur cet appareil).
select u.nom, u.identifiant, u.role, count(p.id) as abonnements
from utilisateurs u
left join push_subscriptions p on p.utilisateur_id = u.id
where u.role in ('caissiere', 'manager', 'admin', 'pdg')
group by u.nom, u.identifiant, u.role
order by u.role, u.nom;

-- 3) Dernières notifications "commande_prete" réellement créées (confirme
--    que le trigger 0040 fonctionne côté in-app, indépendamment du push).
select destinataire_id, message, created_at
from notifications
where type = 'commande_prete'
order by created_at desc
limit 10;

-- 4) Réponses HTTP réelles des appels vers /api/push (pg_net exécute les
--    appels en asynchrone et journalise le résultat ici). status_code = 401
--    confirme le secret manquant/incorrect (point 1) ; une ligne absente ou
--    en erreur réseau indique un autre souci (extension pg_net, URL...).
select id, status_code, content::text, created
from net._http_response
order by created desc
limit 10;
