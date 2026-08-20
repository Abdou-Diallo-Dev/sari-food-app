"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";
import { resolveRestaurantId } from "@/lib/restaurant-actif";

const POLES = ["patisserie", "boulangerie", "fastfood"] as const;

export async function definirObjectifsProduction(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const produitId = String(formData.get("produit_id") ?? "");
  const jour = String(formData.get("jour") ?? "");
  const restaurantId = await resolveRestaurantId(profile);
  if (!produitId || !jour || !restaurantId) return;

  const supabase = await createClient();

  for (const pole of POLES) {
    const brut = String(formData.get(`quantite_${pole}`) ?? "").trim();
    const quantite = brut ? Number(brut) : 0;
    if (!Number.isFinite(quantite) || quantite < 0) continue;

    if (quantite === 0) {
      await supabase
        .from("objectifs_production")
        .delete()
        .eq("produit_id", produitId)
        .eq("pole", pole)
        .eq("jour", jour);
      continue;
    }

    await supabase.from("objectifs_production").upsert(
      {
        produit_id: produitId,
        pole,
        jour,
        quantite_prevue: quantite,
        restaurant_id: restaurantId,
        cree_par: profile.id,
      },
      { onConflict: "produit_id,pole,jour" },
    );
  }

  revalidatePath("/admin/planning");
  revalidatePath("/production");
}
