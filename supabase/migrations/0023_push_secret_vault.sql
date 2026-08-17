-- Correctif : `alter database postgres set app.settings.push_webhook_secret = '...'`
-- échoue sur Supabase (ERROR 42501 permission denied to set parameter) —
-- le rôle `postgres` fourni par Supabase n'a pas le privilège superuser
-- nécessaire pour modifier un paramètre custom au niveau de la base. Le
-- mécanisme prévu par Supabase pour ce cas exact (lire un secret depuis une
-- fonction SQL appelée par un trigger) est Supabase Vault : on y stocke le
-- secret une seule fois (statement à part, fourni séparément, jamais commité
-- ici), et la fonction le relit à chaque appel via vault.decrypted_secrets.

create extension if not exists supabase_vault;

create or replace function relayer_push_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret'
  limit 1;

  perform net.http_post(
    url := 'https://sari-food-app.vercel.app/api/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object(
      'destinataire_id', new.destinataire_id,
      'message', new.message,
      'lien', new.lien,
      'type', new.type
    )
  );
  return new;
exception when others then
  return new;
end;
$$;
