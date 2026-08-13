-- ============================================================
-- 1. STOCK : édition/suppression des ingrédients (soft-delete,
-- même logique que produits) + quantité de référence pour la
-- barre de consommation.
-- ============================================================

alter table ingredients
  add column actif boolean not null default true,
  add column stock_max numeric(12,3);

-- Alerte automatique dès que le stock atteint/passe sous le seuil,
-- pour permettre d'anticiper une nouvelle commande (cf. §3 du point
-- consommation). On ne notifie que sur un franchissement réel du
-- seuil (et pas à chaque mouvement) pour éviter le bruit.
create or replace function notifier_seuil_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stock_actuel <= new.seuil_alerte
     and (old.stock_actuel > old.seuil_alerte) then
    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    select new.restaurant_id, u.id, 'stock',
      'Stock bas : ' || new.nom || ' (' || new.stock_actuel || ' ' || new.unite ||
      ' restant, seuil ' || new.seuil_alerte || ')',
      '/stock'
    from utilisateurs u
    where u.restaurant_id = new.restaurant_id and u.role in ('manager', 'admin') and u.actif;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notifier_seuil_stock on ingredients;
create trigger trg_notifier_seuil_stock
  after update of stock_actuel on ingredients
  for each row
  when (new.stock_actuel is distinct from old.stock_actuel)
  execute function notifier_seuil_stock();

-- ============================================================
-- 2. CAISSE : un solde initial et un solde par moyen de paiement
-- (espèces / Wave / Orange Money) en plus du total consolidé.
-- L'écart de clôture ne concerne que les espèces (rien à compter
-- physiquement pour le mobile money).
-- ============================================================

alter table sessions_caisse
  add column fond_initial_especes numeric(10,2) not null default 0,
  add column fond_initial_wave numeric(10,2) not null default 0,
  add column fond_initial_orange_money numeric(10,2) not null default 0,
  add column total_compte_especes numeric(10,2),
  add column ecart_especes numeric(10,2);
