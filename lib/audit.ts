import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Écrit une ligne dans journal_audit (écriture seule, jamais de update/delete
// — voir supabase/migrations/0001_init.sql). Ne doit jamais faire échouer
// l'opération métier qu'elle documente : une erreur d'écriture du journal
// est avalée silencieusement plutôt que de bloquer l'action de l'utilisateur.
export async function journaliser(
  supabase: SupabaseServerClient,
  params: {
    restaurantId: string;
    utilisateurId: string;
    action: string;
    entite: string;
    entiteId: string;
    avant?: Record<string, unknown> | null;
    apres?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await supabase.from("journal_audit").insert({
      restaurant_id: params.restaurantId,
      utilisateur_id: params.utilisateurId,
      action: params.action,
      entite: params.entite,
      entite_id: params.entiteId,
      avant: params.avant ?? null,
      apres: params.apres ?? null,
    });
  } catch {
    // journalisation best-effort : ne jamais casser l'opération métier
  }
}
