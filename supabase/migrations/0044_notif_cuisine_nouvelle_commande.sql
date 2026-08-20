-- Notifie le personnel de cuisine (chef + équipier du pôle concerné) qu'une
-- nouvelle commande vient d'arriver. Jusqu'ici seul le staff caisse
-- (caissière/manager/admin) était notifié des commandes en ligne
-- (0021_commandes_en_ligne_fn.sql) ; aucune notification n'existait pour la
-- cuisine, ni pour les commandes POS (sur_place/emporter/livraison) ni pour
-- les commandes en ligne — le KDS ne se mettait à jour qu'au rechargement
-- manuel de la page. NotificationSound (components/NotificationSound.tsx)
-- est déjà monté globalement pour tous les rôles (app/(app)/layout.tsx) :
-- il ne manquait que la notification elle-même côté cuisine.
--
-- Une seule notification par (commande, pôle), pas par ligne : une commande
-- de 3 articles du même pôle ne doit pas faire biper 3 fois. On détecte "je
-- suis la première ligne de ce pôle pour cette commande" en cherchant une
-- autre ligne déjà insérée (visible dans la même transaction) avant de
-- notifier.
create or replace function notifier_cuisine_nouvelle_ligne() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_restaurant_id uuid;
  v_numero bigint;
  v_canal canal_commande;
begin
  if exists (
    select 1 from lignes_commande
    where commande_id = new.commande_id and pole = new.pole and id <> new.id
  ) then
    return new;
  end if;

  select restaurant_id, numero, canal into v_restaurant_id, v_numero, v_canal
  from commandes where id = new.commande_id;

  insert into notifications (restaurant_id, destinataire_id, type, message, lien)
  select v_restaurant_id, u.id, 'commande_cuisine',
    'Nouvelle commande n°' || v_numero || ' à préparer'
      || (case when v_canal = 'en_ligne' then ' (en ligne)' else '' end),
    '/kds'
  from utilisateurs u
  where u.restaurant_id = v_restaurant_id
    and u.pole = new.pole
    and u.role in ('chef_patisserie', 'chef_boulangerie', 'chef_fastfood',
                    'equipier_patisserie', 'equipier_boulangerie', 'equipier_fastfood')
    and u.actif;

  return new;
end;
$$;

drop trigger if exists trg_notifier_cuisine_nouvelle_ligne on lignes_commande;
create trigger trg_notifier_cuisine_nouvelle_ligne
  after insert on lignes_commande
  for each row
  execute function notifier_cuisine_nouvelle_ligne();
