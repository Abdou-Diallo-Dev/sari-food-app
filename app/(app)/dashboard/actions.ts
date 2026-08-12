"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";

export async function annulerCommande(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const id = String(formData.get("id") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();
  if (!id) throw new Error("Commande introuvable.");
  if (!motif) throw new Error("Un motif d'annulation est requis.");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("commandes")
    .update({ statut: "annulee", motif_annulation: motif })
    .eq("id", id)
    .not("statut", "in", "(payee,annulee)")
    .select("id");

  if (error || !data || data.length === 0) {
    throw new Error(
      "Annulation impossible : la commande a déjà été encaissée ou annulée.",
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/");
  revalidatePath("/kds");
  revalidatePath("/pos");
}
