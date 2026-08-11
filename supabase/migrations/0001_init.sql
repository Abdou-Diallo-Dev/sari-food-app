-- ============================================================
-- 0. RESTAURANTS & UTILISATEURS
-- ============================================================

create table restaurants (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null,
  adresse       text,
  actif         boolean not null default true,
  created_at    timestamptz not null default now()
);

create type role_type as enum (
  'admin', 'pdg', 'manager', 'comptable',
  'chef_patisserie', 'chef_boulangerie', 'chef_fastfood',
  'equipier_patisserie', 'equipier_boulangerie', 'equipier_fastfood',
  'caissiere'
);

create type pole_type as enum ('patisserie', 'boulangerie', 'fastfood');

create table utilisateurs (
  id            uuid primary key references auth.users(id),
  restaurant_id uuid references restaurants(id),
  nom           text not null,
  role          role_type not null,
  pole          pole_type,
  actif         boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- 1. CATALOGUE PRODUITS
-- ============================================================

create table categories_produits (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  pole          pole_type not null,
  nom           text not null
);

create table produits (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  categorie_id  uuid not null references categories_produits(id),
  nom           text not null,
  prix          numeric(10,2) not null,
  image_url     text,
  actif         boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- 2. STOCK & RECETTES
-- ============================================================

create type categorie_ingredient as enum ('matiere_premiere', 'consommable_emballage');

create table ingredients (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  nom           text not null,
  categorie     categorie_ingredient not null,
  unite         text not null,
  stock_actuel  numeric(12,3) not null default 0,
  seuil_alerte  numeric(12,3) not null default 0,
  created_at    timestamptz not null default now()
);

create table recettes (
  produit_id        uuid not null references produits(id),
  ingredient_id     uuid not null references ingredients(id),
  quantite_utilisee numeric(12,3) not null,
  primary key (produit_id, ingredient_id)
);

-- ============================================================
-- 3. APPROVISIONNEMENT & URGENCES
-- ============================================================

create table fournisseurs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  nom           text not null,
  contact       text,
  actif         boolean not null default true
);

create type statut_demande as enum (
  'declenchee', 'validee', 'rejetee', 'decaissee', 'receptionnee'
);

create table demandes_approvisionnement (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants(id),
  ingredient_id     uuid not null references ingredients(id),
  fournisseur_id    uuid references fournisseurs(id),
  chef_id           uuid not null references utilisateurs(id),
  quantite_demandee numeric(12,3) not null,
  statut            statut_demande not null default 'declenchee',
  manager_id        uuid references utilisateurs(id),
  motif_rejet       text,
  montant_decaisse  numeric(10,2),
  comptable_id      uuid references utilisateurs(id),
  declenchee_at     timestamptz not null default now(),
  validee_at        timestamptz,
  decaissee_at      timestamptz,
  receptionnee_at   timestamptz
);

-- ============================================================
-- 4. CAISSE (sessions matin/soir)
-- ============================================================

create type shift_type as enum ('matin', 'soir');
create type statut_session as enum ('ouverte', 'cloturee');

create table sessions_caisse (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants(id),
  caissiere_id      uuid not null references utilisateurs(id),
  shift             shift_type not null,
  fond_initial      numeric(10,2) not null,
  total_theorique   numeric(10,2),
  total_compte      numeric(10,2),
  ecart             numeric(10,2),
  statut            statut_session not null default 'ouverte',
  ouverte_at        timestamptz not null default now(),
  cloturee_at       timestamptz
);

create type type_transaction as enum ('encaissement', 'depense');
create type categorie_depense as enum ('achat_stock', 'produit_entretien', 'charge_operationnelle', 'divers');
create type moyen_paiement as enum ('especes', 'orange_money', 'wave', 'carte');

-- ============================================================
-- 5. COMMANDES (référencées par mouvements_stock et transactions_caisse)
-- ============================================================

create type canal_commande as enum ('sur_place', 'emporter');
create type statut_commande as enum ('recue', 'en_preparation', 'prete', 'livree', 'payee', 'annulee');
create type statut_ligne as enum ('en_attente', 'en_preparation', 'pret', 'livre');

create table commandes (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants(id),
  numero            bigint generated always as identity,
  canal             canal_commande not null,
  statut            statut_commande not null default 'recue',
  motif_annulation  text,
  session_id        uuid references sessions_caisse(id),
  total             numeric(10,2) not null default 0,
  created_at        timestamptz not null default now()
);

create table lignes_commande (
  id                  uuid primary key default gen_random_uuid(),
  commande_id         uuid not null references commandes(id),
  produit_id          uuid not null references produits(id),
  pole                pole_type not null,
  quantite            integer not null default 1,
  prix_unitaire       numeric(10,2) not null,
  statut_preparation  statut_ligne not null default 'en_attente',
  responsable_id      uuid references utilisateurs(id),
  pris_en_charge_at   timestamptz,
  pret_at             timestamptz,
  livre_at            timestamptz
);

create table transactions_caisse (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references sessions_caisse(id),
  type              type_transaction not null,
  categorie_depense categorie_depense,
  libelle           text,
  montant           numeric(10,2) not null,
  moyen_paiement    moyen_paiement,
  commande_id       uuid references commandes(id),
  utilisateur_id    uuid not null references utilisateurs(id),
  created_at        timestamptz not null default now()
);

create table mouvements_stock (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references restaurants(id),
  ingredient_id     uuid not null references ingredients(id),
  type              text not null check (type in ('entree', 'sortie', 'ajustement')),
  quantite          numeric(12,3) not null,
  motif             text,
  commande_id       uuid references commandes(id),
  demande_id        uuid references demandes_approvisionnement(id),
  utilisateur_id    uuid not null references utilisateurs(id),
  created_at        timestamptz not null default now()
);

-- ============================================================
-- 6. NOTIFICATIONS & AUDIT
-- ============================================================

create table notifications (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id),
  destinataire_id uuid not null references utilisateurs(id),
  type            text not null,
  message         text not null,
  lien            text,
  lu              boolean not null default false,
  created_at      timestamptz not null default now()
);

create table journal_audit (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id),
  utilisateur_id uuid not null references utilisateurs(id),
  action         text not null,
  entite         text not null,
  entite_id      uuid not null,
  avant          jsonb,
  apres          jsonb,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 7. RLS — activation (policies détaillées à ajouter par rôle,
-- voir cahier des charges section "Traçabilité, audit & sécurité")
-- ============================================================

alter table restaurants enable row level security;
alter table utilisateurs enable row level security;
alter table categories_produits enable row level security;
alter table produits enable row level security;
alter table ingredients enable row level security;
alter table recettes enable row level security;
alter table fournisseurs enable row level security;
alter table demandes_approvisionnement enable row level security;
alter table sessions_caisse enable row level security;
alter table transactions_caisse enable row level security;
alter table commandes enable row level security;
alter table lignes_commande enable row level security;
alter table mouvements_stock enable row level security;
alter table notifications enable row level security;
alter table journal_audit enable row level security;

-- journal_audit : écriture seule, jamais de update/delete, même pour un admin
create policy "journal_audit_insert_only" on journal_audit
  for insert with check (true);
create policy "journal_audit_read_own_restaurant" on journal_audit
  for select using (
    restaurant_id in (select restaurant_id from utilisateurs where id = auth.uid())
  );
