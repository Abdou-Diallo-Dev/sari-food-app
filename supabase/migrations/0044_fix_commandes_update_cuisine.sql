-- Bug racine du "commande prête" qui ne notifie jamais personne (signalé
-- plusieurs fois par l'utilisateur) : la policy commandes_update (0002)
-- n'autorisait que 'caissiere' et manager/admin à modifier la table
-- commandes. Or c'est verifierEtRafraichirCommande (app/(app)/kds/actions.ts),
-- appelée par terminerLigne quand un chef/équipier clique "Prêt" sur la
-- dernière ligne d'une commande, qui fait le UPDATE commandes SET statut =
-- 'prete'. Pour un chef/équipier, ce rôle n'était couvert par aucune policy
-- d'écriture sur commandes : l'update était silencieusement rejeté par RLS
-- (0 ligne affectée, aucune erreur remontée puisque le code n'appelle pas
-- .select() pour vérifier), la commande restait bloquée en 'recue' ou
-- 'en_preparation' en base, et le trigger trg_notifier_commande_prete
-- (0040, actif et fonctionnel) ne se déclenchait donc jamais faute de
-- transition réelle vers 'prete'. Confirmé par une recherche en base :
-- zéro ligne de type 'commande_prete' dans `notifications`, malgré des
-- commandes marquées "prêtes" côté cuisine au quotidien.
--
-- lignes_commande_update (0003) autorisait déjà is_chef_or_equipier() sur
-- lignes_commande — seule la table commandes (statut global de la
-- commande) manquait ce cas. Même garde-fou que 0003 : restreint à son
-- propre restaurant (restaurant_id = my_restaurant_id()), le chef/équipier
-- ne peut agir que sur les commandes de son site.

drop policy if exists "commandes_update" on commandes;
create policy "commandes_update" on commandes
  for update
  using (
    my_role() = 'caissiere'
    or is_manager_or_admin()
    or (is_chef_or_equipier() and restaurant_id = my_restaurant_id())
  )
  with check (
    my_role() = 'caissiere'
    or is_manager_or_admin()
    or (is_chef_or_equipier() and restaurant_id = my_restaurant_id())
  );
