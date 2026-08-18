-- Caisse globale d'entreprise : le comptable (et manager/admin) décaisse de
-- l'argent (salaires, achats, dépôts...) mais rien n'enregistrait jusqu'ici
-- où va cet argent — decaisserDemande (0010) ne fait qu'un update de statut
-- sur la demande, sans aucune trace de mouvement d'argent. On introduit un
-- grand livre dédié, à 3 sous-caisses (espèces/Wave/Orange Money), alimenté
-- automatiquement à chaque clôture de session (cf. cloturerSession) et
-- manuellement par le comptable/manager/admin, avec le décaissement des
-- demandes d'approvisionnement fusionné dedans comme sortie.
--
-- Comme journal_audit, cette table est insert-only : aucune policy
-- update/delete n'est créée, donc personne (même admin) ne peut modifier ou
-- supprimer une ligne depuis l'application. Une correction se fait par une
-- écriture compensatoire, pas par une modification.

create type type_mouvement_caisse as enum ('entree', 'sortie');
create type sous_caisse_type as enum ('especes', 'wave', 'orange_money');
create type categorie_mouvement_caisse_globale as enum (
  'cloture_session', 'decaissement_appro', 'salaire', 'depot', 'autre_entree', 'autre_sortie'
);

create table if not exists mouvements_caisse_globale (
  id              uuid primary key default gen_random_uuid(),
  type            type_mouvement_caisse not null,
  sous_caisse     sous_caisse_type not null,
  categorie       categorie_mouvement_caisse_globale not null,
  montant         numeric(12,2) not null check (montant > 0),
  libelle         text,
  restaurant_id   uuid references restaurants(id),
  session_id      uuid references sessions_caisse(id),
  demande_id      uuid references demandes_approvisionnement(id),
  utilisateur_id  uuid not null references utilisateurs(id),
  created_at      timestamptz not null default now(),

  -- La catégorie fixe le sens du mouvement (empêche par ex. un "salaire" en
  -- entrée par erreur de formulaire).
  constraint mouvement_categorie_sens check (
    (categorie = 'cloture_session'    and type = 'entree') or
    (categorie = 'depot'              and type = 'entree') or
    (categorie = 'autre_entree'       and type = 'entree') or
    (categorie = 'decaissement_appro' and type = 'sortie') or
    (categorie = 'salaire'            and type = 'sortie') or
    (categorie = 'autre_sortie'       and type = 'sortie')
  ),

  -- La provenance doit être cohérente avec la catégorie : une entrée
  -- automatique de clôture référence toujours une session (jamais une
  -- demande), un décaissement d'appro référence toujours une demande
  -- (jamais une session).
  constraint mouvement_provenance_session check ((categorie = 'cloture_session') = (session_id is not null)),
  constraint mouvement_provenance_demande check ((categorie = 'decaissement_appro') = (demande_id is not null)),

  -- Les catégories manuelles doivent porter un libellé explicite.
  constraint mouvement_libelle_manuel check (
    categorie not in ('salaire', 'depot', 'autre_entree', 'autre_sortie')
    or (libelle is not null and length(trim(libelle)) > 0)
  ),

  -- Un décaissement d'appro ne doit produire qu'une seule sortie liée
  -- (défense en profondeur en plus de la machine à états de
  -- demandes_approvisionnement, qui n'autorise déjà qu'une transition
  -- validee -> decaissee).
  constraint mouvement_demande_unique unique (demande_id)
);

-- Une session ne peut alimenter chaque sous-caisse qu'une seule fois.
create unique index if not exists mouvements_caisse_globale_session_sous_caisse_key
  on mouvements_caisse_globale (session_id, sous_caisse)
  where session_id is not null;

create index if not exists mouvements_caisse_globale_sous_caisse_idx
  on mouvements_caisse_globale (sous_caisse);
create index if not exists mouvements_caisse_globale_categorie_idx
  on mouvements_caisse_globale (categorie);
create index if not exists mouvements_caisse_globale_created_at_idx
  on mouvements_caisse_globale (created_at);
create index if not exists mouvements_caisse_globale_restaurant_id_idx
  on mouvements_caisse_globale (restaurant_id) where restaurant_id is not null;

alter table mouvements_caisse_globale enable row level security;

create or replace function is_comptable_ou_gestion() returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() in ('comptable', 'manager', 'admin')
$$;

drop policy if exists "mouvements_caisse_globale_select" on mouvements_caisse_globale;
create policy "mouvements_caisse_globale_select" on mouvements_caisse_globale
  for select using (is_comptable_ou_gestion() or my_role() = 'pdg');

-- 1) Saisie manuelle (comptable/admin/manager) : jamais de provenance
--    automatique.
drop policy if exists "mouvements_caisse_globale_insert_manuel" on mouvements_caisse_globale;
create policy "mouvements_caisse_globale_insert_manuel" on mouvements_caisse_globale
  for insert with check (
    is_comptable_ou_gestion()
    and utilisateur_id = auth.uid()
    and session_id is null
    and demande_id is null
  );

-- 2) Entrée automatique à la clôture de session : la caissière (ou
--    manager/admin) qui clôture SA session déclenche l'entrée, mêmes rôles
--    que sessions_caisse_update.
drop policy if exists "mouvements_caisse_globale_insert_cloture" on mouvements_caisse_globale;
create policy "mouvements_caisse_globale_insert_cloture" on mouvements_caisse_globale
  for insert with check (
    utilisateur_id = auth.uid()
    and categorie = 'cloture_session'
    and demande_id is null
    and exists (
      select 1 from sessions_caisse s
      where s.id = session_id
        and (s.caissiere_id = auth.uid() or is_manager_or_admin())
    )
  );

-- 3) Sortie liée à un décaissement d'appro, mêmes rôles que decaisserDemande.
drop policy if exists "mouvements_caisse_globale_insert_decaissement" on mouvements_caisse_globale;
create policy "mouvements_caisse_globale_insert_decaissement" on mouvements_caisse_globale
  for insert with check (
    is_comptable_ou_gestion()
    and utilisateur_id = auth.uid()
    and categorie = 'decaissement_appro'
    and session_id is null
  );

-- ============================================================
-- Solde par sous-caisse : jamais stocké, toujours recalculé à la lecture
-- (comme total_theorique/total_compte de sessions_caisse), pour éviter tout
-- risque de dérive d'un compteur en cache.
-- ============================================================

create or replace function soldes_caisse_globale()
returns table(sous_caisse sous_caisse_type, solde numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (my_role() in ('comptable', 'manager', 'admin', 'pdg')) then
    raise exception 'Rôle non autorisé à consulter la caisse globale.';
  end if;

  return query
    select sc.val,
      coalesce(sum(
        case when m.type = 'entree' then m.montant
             when m.type = 'sortie' then -m.montant
        end
      ), 0)
    from unnest(enum_range(null::sous_caisse_type)) as sc(val)
    left join mouvements_caisse_globale m on m.sous_caisse = sc.val
    group by sc.val;
end;
$$;

grant execute on function soldes_caisse_globale() to authenticated;
