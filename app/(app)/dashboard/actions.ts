"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";
import { journaliser } from "@/lib/audit";

export async function annulerCommande(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const id = String(formData.get("id") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();
  if (!id) throw new Error("Commande introuvable.");
  if (!motif) throw new Error("Un motif d'annulation est requis.");

  const supabase = await createClient();

  const { data: avant } = await supabase
    .from("commandes")
    .select("statut, total, restaurant_id")
    .eq("id", id)
    .single();

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

  if (avant) {
    await journaliser(supabase, {
      restaurantId: avant.restaurant_id,
      utilisateurId: profile.id,
      action: "annulation_vente",
      entite: "commandes",
      entiteId: id,
      avant: { statut: avant.statut, total: avant.total },
      apres: { statut: "annulee", motif_annulation: motif },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/");
  revalidatePath("/kds");
  revalidatePath("/pos");
}
