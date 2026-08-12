"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";

const ROLES_CUISINE = [
  "admin",
  "manager",
  "chef_patisserie",
  "chef_boulangerie",
  "chef_fastfood",
  "equipier_patisserie",
  "equipier_boulangerie",
  "equipier_fastfood",
] as const;

async function verifierEtRafraichirCommande(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ligneId: string,
) {
  const { data: ligne } = await supabase
    .from("lignes_commande")
    .select("commande_id")
    .eq("id", ligneId)
    .single();

  if (!ligne) return;

  const { data: lignesRestantes } = await supabase
    .from("lignes_commande")
    .select("statut_preparation")
    .eq("commande_id", ligne.commande_id);

  const toutesPretes = (lignesRestantes ?? []).every(
    (l) => l.statut_preparation === "pret" || l.statut_preparation === "livre",
  );

  if (toutesPretes) {
    await supabase.from("commandes").update({ statut: "prete" }).eq("id", ligne.commande_id);
  }

  revalidatePath("/kds");
}

export async function demarrerLigne(ligneId: string) {
  const profile = await requireProfile();
  requireRole(profile, [...ROLES_CUISINE]);

  const supabase = await createClient();
  await supabase
    .from("lignes_commande")
    .update({
      statut_preparation: "en_preparation",
      responsable_id: profile.id,
      pris_en_charge_at: new Date().toISOString(),
    })
    .eq("id", ligneId);

  revalidatePath("/kds");
}

export async function terminerLigne(ligneId: string) {
  const profile = await requireProfile();
  requireRole(profile, [...ROLES_CUISINE]);

  const supabase = await createClient();
  await supabase
    .from("lignes_commande")
    .update({ statut_preparation: "pret", pret_at: new Date().toISOString() })
    .eq("id", ligneId);

  await verifierEtRafraichirCommande(supabase, ligneId);
}
