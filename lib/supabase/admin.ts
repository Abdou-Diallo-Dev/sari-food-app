import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client "service_role" : contourne RLS, réservé aux actions serveur qui
// gèrent les comptes (création d'utilisateurs via Supabase Auth). Ne jamais
// importer ce fichier depuis un composant client ni exposer cette clé au navigateur.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY manquante : ajoute-la dans les variables d'environnement pour pouvoir créer des utilisateurs.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
