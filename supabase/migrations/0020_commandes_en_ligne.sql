-- Commande en ligne (app client séparée) : ajoute le canal "en_ligne", les
-- coordonnées client sur commandes (pas de compte client, juste nom/téléphone
-- pour le staff), et la table de staging commandes_en_ligne.
--
-- IMPORTANT : ce fichier doit être exécuté seul, dans sa propre transaction,
-- AVANT 0021_commandes_en_ligne_fn.sql. `alter type ... add value` ne peut
-- pas être utilisé dans la même transaction qu'une instruction qui référence
-- la nouvelle valeur — or l'éditeur SQL Supabase exécute un script collé en
-- une seule transaction implicite.

alter type canal_commande add value 'en_ligne';

alter table commandes
  add column client_nom text,
  add column client_telephone text;

-- Staging : une ligne est créée dès que le client valide son panier (avant
-- tout paiement), et n'est matérialisée dans commandes/lignes_commande que
-- lorsque le paiement Wave/Orange Money est confirmé (cf. fonction
-- materialiser_commande_en_ligne dans 0021). Tant qu'elle reste 'en_attente',
-- 'echouee' ou 'expiree', aucune trace n'existe dans commandes : le KDS, le
-- dashboard et les rapports n'ont donc rien à filtrer, l'invariant existant
-- "une ligne commandes = déjà payée" reste vrai.
create table commandes_en_ligne (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references restaurants(id),
  client_nom          text not null,
  client_telephone    text not null,
  panier              jsonb not null,
  total               numeric(10,2) not null,
  mode_paiement       text not null check (mode_paiement in ('wave', 'orange_money')),
  statut              text not null default 'en_attente'
                         check (statut in ('en_attente', 'payee', 'echouee', 'expiree')),
  reference_paiement  text,
  commande_id         uuid references commandes(id),
  created_at          timestamptz not null default now()
);

-- Aucune policy : RLS activée mais deny-by-default pour anon/authenticated.
-- Seul le client service_role (utilisé côté serveur par la nouvelle app
-- client, cf. lib/supabase/admin.ts) contourne RLS et peut lire/écrire ici —
-- même principe que le reste du code pour les opérations service_role.
alter table commandes_en_ligne enable row level security;
