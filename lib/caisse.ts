import type { createClient } from "@/lib/supabase/server";

export const MOYENS_PAIEMENT_CAISSE = [
  { value: "especes", label: "Espèces" },
  { value: "orange_money", label: "Orange Money" },
  { value: "wave", label: "Wave" },
] as const;

export type MoyenPaiementCaisse = (typeof MOYENS_PAIEMENT_CAISSE)[number]["value"];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Encaisse une commande sur une session ouverte : enregistre la transaction
// puis marque la commande payée (ce qui déclenche la déduction de stock côté
// trigger). Utilisé à la fois par la prise de commande (paiement immédiat)
// et par le solde des sous-caisses.
export async function encaisserCommandeInterne(
  supabase: SupabaseServerClient,
  params: {
    commandeId: string;
    sessionId: string;
    moyenPaiement: MoyenPaiementCaisse;
    montant: number;
    utilisateurId: string;
  },
): Promise<{ error?: string }> {
  const { data: transaction, error } = await supabase
    .from("transactions_caisse")
    .insert({
      session_id: params.sessionId,
      type: "encaissement",
      montant: params.montant,
      moyen_paiement: params.moyenPaiement,
      commande_id: params.commandeId,
      utilisateur_id: params.utilisateurId,
    })
    .select("id")
    .single();

  if (error || !transaction) {
    return { error: "Impossible d'enregistrer l'encaissement." };
  }

  const { data: mise_a_jour, error: updateError } = await supabase
    .from("commandes")
    .update({ statut: "payee", session_id: params.sessionId })
    .eq("id", params.commandeId)
    .select("id");

  if (updateError || !mise_a_jour || mise_a_jour.length === 0) {
    await supabase.from("transactions_caisse").delete().eq("id", transaction.id);
    return { error: "L'encaissement a échoué : la commande n'a pas pu être marquée comme payée." };
  }

  return {};
}

export function totauxParMoyen(
  transactions: { type: string; montant: number | string; moyen_paiement: string | null }[],
  moyen: MoyenPaiementCaisse,
) {
  const encaisse = transactions
    .filter((t) => t.type === "encaissement" && t.moyen_paiement === moyen)
    .reduce((s, t) => s + Number(t.montant), 0);
  const depense = transactions
    .filter((t) => t.type === "depense" && t.moyen_paiement === moyen)
    .reduce((s, t) => s + Number(t.montant), 0);
  return { encaisse, depense };
}
