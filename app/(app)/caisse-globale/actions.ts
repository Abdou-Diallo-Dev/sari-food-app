"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";
import { journaliser } from "@/lib/audit";

const CATEGORIE_TYPE: Record<string, "entree" | "sortie"> = {
  depot: "entree",
  autre_entree: "entree",
  salaire: "sortie",
  autre_sortie: "sortie",
};
const SOUS_CAISSES = ["especes", "wave", "orange_money"];

export async function enregistrerMouvementCaisseGlobale(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "comptable"]);

  const categorie = String(formData.get("categorie") ?? "");
  const sous_caisse = String(formData.get("sous_caisse") ?? "");
  const montant = Number(formData.get("montant"));
  const libelle = String(formData.get("libelle") ?? "").trim();
  const restaurant_id = String(formData.get("restaurant_id") ?? "").trim();

  const type = CATEGORIE_TYPE[categorie];
  if (!type) {
    throw new Error("Catégorie invalide.");
  }
  if (!SOUS_CAISSES.includes(sous_caisse)) {
    throw new Error("Choisissez la sous-caisse concernée (Espèces, Wave ou Orange Money).");
  }
  if (!Number.isFinite(montant) || montant <= 0) {
    throw new Error("Le montant doit être supérieur à zéro.");
  }
  if (!libelle) {
    throw new Error("Un libellé est obligatoire pour un mouvement manuel.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mouvements_caisse_globale")
    .insert({
      type,
      categorie,
      sous_caisse,
      montant,
      libelle,
      restaurant_id: restaurant_id || null,
      utilisateur_id: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Enregistrement impossible.");
  }

  const restaurantIdAudit = restaurant_id || profile.restaurant_id;
  if (restaurantIdAudit) {
    await journaliser(supabase, {
      restaurantId: restaurantIdAudit,
      utilisateurId: profile.id,
      action: "mouvement_caisse_globale",
      entite: "mouvements_caisse_globale",
      entiteId: data.id,
      apres: { type, categorie, sous_caisse, montant },
    });
  }

  revalidatePath("/caisse-globale");
}
