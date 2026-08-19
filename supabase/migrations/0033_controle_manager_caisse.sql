-- Cahier des charges (gouvernance caisse) : la clôture de caisse ne doit
-- plus être un aller simple caissière -> grand livre. La caissière déclare
-- son compté (ouverte -> en_attente_controle), puis un manager/admin
-- contrôle et décide ce qui est gardé comme fonds pour la session suivante
-- vs transféré au comptable (en_attente_controle -> cloturee). Comme pour
-- verifier_transition_demande (0010), la machine à états et le rôle
-- autorisé à chaque étape sont verrouillés dans un trigger plutôt que dans
-- les RLS (qui autorisent déjà l'update, cf. sessions_caisse_update en
-- 0002) : une policy "on possède la ligne" ne dit pas QUEL changement est
-- fait ni QUI a le droit de le faire.

alter table sessions_caisse
  add column if not exists montant_garde_fonds_caisse numeric(10, 2),
  add column if not exists montant_transfere_comptable numeric(10, 2),
  add column if not exists controle_manager_id uuid references utilisateurs(id),
  add column if not exists controlee_at timestamptz;

create or replace function verifier_transition_session_caisse() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = old.statut then
    return new;
  end if;

  if new.statut = 'en_attente_controle' then
    if old.statut <> 'ouverte' then
      raise exception 'Seule une session ouverte peut être remise pour contrôle.';
    end if;
    if not (new.caissiere_id = auth.uid() or is_manager_or_admin()) then
      raise exception 'Seule la caissière titulaire ou un manager peut clôturer cette session.';
    end if;
    if new.total_compte_especes is null then
      raise exception 'Le montant compté en espèces est requis.';
    end if;

    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    select new.restaurant_id, u.id, 'caisse',
      'Caisse à contrôler (' || (case when new.shift = 'matin' then 'matin' else 'soir' end) || ') — '
        || new.total_compte_especes || ' F comptés en espèces.',
      '/caisse'
    from utilisateurs u
    where u.restaurant_id = new.restaurant_id and u.role in ('manager', 'admin') and u.actif;

  elsif new.statut = 'cloturee' then
    if old.statut <> 'en_attente_controle' then
      raise exception 'Seule une session en attente de contrôle peut être clôturée.';
    end if;
    if not is_manager_or_admin() then
      raise exception 'Seul un manager peut contrôler et clôturer cette session.';
    end if;
    if new.montant_garde_fonds_caisse is null
       or new.montant_garde_fonds_caisse < 0
       or new.montant_garde_fonds_caisse > new.total_compte_especes then
      raise exception 'Le fonds de caisse gardé doit être compris entre 0 et le montant compté.';
    end if;
    new.montant_transfere_comptable := new.total_compte_especes - new.montant_garde_fonds_caisse;
    new.controle_manager_id := auth.uid();
    new.controlee_at := now();

    insert into notifications (restaurant_id, destinataire_id, type, message, lien)
    select new.restaurant_id, u.id, 'caisse',
      new.montant_transfere_comptable || ' F transférés au comptable (fonds gardé : '
        || new.montant_garde_fonds_caisse || ' F).',
      '/caisse-globale'
    from utilisateurs u
    where u.restaurant_id = new.restaurant_id and u.role = 'comptable' and u.actif;

  else
    raise exception 'Transition de statut non autorisée.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_verifier_transition_session_caisse on sessions_caisse;
create trigger trg_verifier_transition_session_caisse
  before update on sessions_caisse
  for each row
  execute function verifier_transition_session_caisse();

-- Solde initial espèces de la prochaine ouverture = ce que le manager a
-- gardé lors de la dernière session contrôlée de ce restaurant (peu importe
-- la caissière). Jamais stocké ailleurs : recalculé à chaque ouverture,
-- comme les autres soldes du système (total_theorique, soldes_caisse_globale).
create or replace function fonds_caisse_disponible(p_restaurant_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select montant_garde_fonds_caisse
     from sessions_caisse
     where restaurant_id = p_restaurant_id
       and statut = 'cloturee'
       and montant_garde_fonds_caisse is not null
     order by controlee_at desc
     limit 1),
    0
  )
$$;

grant execute on function fonds_caisse_disponible(uuid) to authenticated;
