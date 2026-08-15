import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client anonyme : lecture publique du menu uniquement (produits/catégories
// actifs). Pas de session, pas de compte client — cf. les policies
// "..._select_public" (supabase/migrations/0021_commandes_en_ligne_fn.sql).
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
