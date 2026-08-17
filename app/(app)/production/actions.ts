"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";

const ROLES_PRODUCTION = [
  "admin",
  "manager",
  "chef_patisserie",
  "chef_boulangerie",
  "chef_fastfood",
] as const;

export async function definirProduction(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, [...ROLES_PRODUCTION]);

  const produit_id = String(formData.get("produit_id") ?? "");
  const quantite_produite = Number(formData.get("quantite_produite"));

  if (!produit_id) throw new Error("Produit introuvable.");
  if (!Number.isInteger(quantite_produite) || quantite_produite < 0) {
    throw new Error("La quantité doit être un nombre entier positif ou nul.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_production_jour", {
    p_produit_id: produit_id,
    p_quantite: quantite_produite,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/production");
  revalidatePath("/pos");
}
