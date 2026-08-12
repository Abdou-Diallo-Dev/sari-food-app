"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";

export async function deleteCommande(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Commande introuvable.");

  const supabase = await createClient();

  await supabase.from("lignes_commande").delete().eq("commande_id", id);

  const { data, error } = await supabase.from("commandes").delete().eq("id", id).select("id");
  if (error) {
    throw new Error(
      "Impossible de supprimer cette commande : elle a déjà été encaissée en caisse.",
    );
  }
  if (!data || data.length === 0) {
    throw new Error(
      "Suppression refusée par les règles de sécurité. Vérifiez que la migration 0005_commandes_delete_rls.sql a bien été exécutée dans Supabase.",
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/");
  revalidatePath("/kds");
}
