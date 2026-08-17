-- Suivi de production journalière : chaque chef renseigne combien il
-- produit d'un article donné pour la journée ; ce compteur diminue à
-- chaque commande qui inclut cet article, et le produit passe "en rupture"
-- quand il atteint 0. Comme pour la déduction de stock (0008) et le
-- verrouillage du circuit d'approvisionnement (0010), la logique critique
-- (impossible de vendre plus que ce qui a été produit) est posée en trigger
-- SQL plutôt que côté application, pour rester valable même si une
-- commande est créée en dehors du POS (ex: futur flux de commande en
-- ligne, cf. commandes_en_ligne).

create table if not exists production_jour (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  produit_id uuid not null references produits(id),
  chef_id uuid not null references utilisateurs(id),
  jour date not null default current_date,
  quantite_produite integer not null check (quantite_produite >= 0),
  quantite_restante integer not null check (quantite_restante >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (produit_id, jour)
);

alter table production_jour enable row level security;

drop policy if exists "production_jour_select" on production_jour;
create policy "production_jour_select" on production_jour
  for select using (is_multi_site() or restaurant_id = my_restaurant_id());

-- ============================================================
-- Fonction d'écriture (upsert) : appelée en RPC depuis le Server Action.
-- security definer pour pouvoir écrire même si le chef n'a pas de droit
-- d'écriture RLS direct ; les vérifications de rôle/pôle/restaurant sont
-- faites explicitement à l'intérieur, comme le fait déjà
-- verifier_transition_demande pour l'approvisionnement.
-- ============================================================

create or replace function definir_production_jour(p_produit_id uuid, p_quantite integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_restaurant_id uuid;
  v_pole pole_type;
begin
  if p_quantite is null or p_quantite < 0 then
    raise exception 'La quantité produite doit être un nombre positif ou nul.';
  end if;
  if not (is_chef() or is_manager_or_admin()) then
    raise exception 'Rôle non autorisé à renseigner la production.';
  end if;

  select p.restaurant_id, c.pole into v_restaurant_id, v_pole
  from produits p
  join categories_produits c on c.id = p.categorie_id
  where p.id = p_produit_id;

  if v_restaurant_id is null then
    raise exception 'Produit introuvable.';
  end if;
  if not is_admin() and v_restaurant_id <> my_restaurant_id() then
    raise exception 'Ce produit n''appartient pas à votre restaurant.';
  end if;
  if is_chef() and v_pole <> my_pole() then
    raise exception 'Ce produit n''appartient pas à votre pôle.';
  end if;

  insert into production_jour
    (restaurant_id, produit_id, chef_id, jour, quantite_produite, quantite_restante)
  values
    (v_restaurant_id, p_produit_id, auth.uid(), current_date, p_quantite, p_quantite)
  on conflict (produit_id, jour) do update
    set quantite_restante = production_jour.quantite_restante + (p_quantite - production_jour.quantite_produite),
        quantite_produite = p_quantite,
        chef_id = auth.uid(),
        updated_at = now()
    where production_jour.quantite_restante + (p_quantite - production_jour.quantite_produite) >= 0;

  if not found then
    raise exception 'Cette quantité est inférieure à ce qui a déjà été vendu aujourd''hui.';
  end if;
end;
$$;

grant execute on function definir_production_jour(uuid, integer) to authenticated;

-- ============================================================
-- Décrément à la commande + blocage si rupture. En BEFORE INSERT sur
-- lignes_commande (et non lié au passage à 'payee' comme 0008) car
-- l'invariant de l'appli est déjà "une ligne n'existe que si la commande
-- est sur le point d'être payée" (cf. flux POS) : bloquer ici empêche
-- purement et simplement l'ajout de la ligne, sans laisser la commande se
-- créer partiellement.
-- ============================================================

create or replace function verifier_et_decrementer_production() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_restante integer;
begin
  select quantite_restante into v_restante
  from production_jour
  where produit_id = new.produit_id and jour = current_date
  for update;

  if found then
    if v_restante < new.quantite then
      raise exception 'Rupture de stock pour ce produit aujourd''hui (reste % sur la production du jour).', v_restante;
    end if;

    update production_jour
    set quantite_restante = quantite_restante - new.quantite, updated_at = now()
    where produit_id = new.produit_id and jour = current_date;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_verifier_production on lignes_commande;
create trigger trg_verifier_production
  before insert on lignes_commande
  for each row
  execute function verifier_et_decrementer_production();

-- ============================================================
-- Notification de rupture : chaque pôle voit ce qui le concerne (chefs et
-- équipiers du pôle du produit), manager/admin/caissière ont la vue
-- totale (tous pôles).
-- ============================================================

create or replace function notifier_rupture_production() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_produit_nom text;
  v_pole pole_type;
begin
  select nom into v_produit_nom from produits where id = new.produit_id;
  select c.pole into v_pole
  from produits p join categories_produits c on c.id = p.categorie_id
  where p.id = new.produit_id;

  insert into notifications (restaurant_id, destinataire_id, type, message, lien)
  select new.restaurant_id, u.id, 'production',
    'Rupture du jour : ' || coalesce(v_produit_nom, '') || ' — production épuisée.',
    '/production'
  from utilisateurs u
  where u.restaurant_id = new.restaurant_id and u.actif
    and (u.role in ('manager', 'admin', 'caissiere') or u.pole = v_pole);

  return new;
end;
$$;

drop trigger if exists trg_notifier_rupture_production on production_jour;
create trigger trg_notifier_rupture_production
  after update of quantite_restante on production_jour
  for each row
  when (new.quantite_restante = 0 and old.quantite_restante > 0)
  execute function notifier_rupture_production();
