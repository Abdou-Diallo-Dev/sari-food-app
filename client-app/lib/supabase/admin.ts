import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client "service_role" : contourne RLS. Réservé aux Server Actions et
// routes de webhook qui doivent écrire commandes_en_ligne / appeler
// materialiser_commande_en_ligne (aucun visiteur n'est authentifié dans
// cette app, donc aucune policy RLS ne peut l'autoriser). Ne jamais importer
// ce fichier depuis un composant client ni exposer cette clé au navigateur.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante dans les variables d'environnement.");
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
