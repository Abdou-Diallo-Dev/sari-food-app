"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";

const ROLES_MOUVEMENT = [
  "admin",
  "manager",
  "chef_patisserie",
  "chef_boulangerie",
  "chef_fastfood",
] as const;

export async function createIngredient(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);
  if (!profile.restaurant_id) return;

  const nom = String(formData.get("nom") ?? "").trim();
  const categorie = String(formData.get("categorie") ?? "");
  const unite = String(formData.get("unite") ?? "").trim();
  const seuil_alerte = Number(formData.get("seuil_alerte"));

  if (
    !nom ||
    !["matiere_premiere", "consommable_emballage"].includes(categorie) ||
    !unite ||
    !Number.isFinite(seuil_alerte) ||
    seuil_alerte < 0
  ) {
    return;
  }

  const supabase = await createClient();
  await supabase.from("ingredients").insert({
    restaurant_id: profile.restaurant_id,
    nom,
    categorie,
    unite,
    seuil_alerte,
  });

  revalidatePath("/stock");
}

export async function enregistrerMouvement(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, [...ROLES_MOUVEMENT]);
  if (!profile.restaurant_id) return;

  const ingredientId = String(formData.get("ingredient_id") ?? "");
  const type = String(formData.get("type") ?? "");
  const quantite = Number(formData.get("quantite"));
  const motif = String(formData.get("motif") ?? "").trim();

  if (!ingredientId || !["entree", "sortie", "ajustement"].includes(type)) return;
  if (!Number.isFinite(quantite) || quantite < 0) return;

  const supabase = await createClient();

  const { data: ingredient } = await supabase
    .from("ingredients")
    .select("stock_actuel")
    .eq("id", ingredientId)
    .single();
  if (!ingredient) return;

  const { error } = await supabase.from("mouvements_stock").insert({
    restaurant_id: profile.restaurant_id,
    ingredient_id: ingredientId,
    type,
    quantite,
    motif: motif || null,
    utilisateur_id: profile.id,
  });
  if (error) return;

  const stockActuel = Number(ingredient.stock_actuel);
  const nouveauStock =
    type === "entree"
      ? stockActuel + quantite
      : type === "sortie"
        ? Math.max(0, stockActuel - quantite)
        : quantite;

  await supabase.from("ingredients").update({ stock_actuel: nouveauStock }).eq("id", ingredientId);

  revalidatePath("/stock");
}

const ROLES_CHEF = ["chef_patisserie", "chef_boulangerie", "chef_fastfood"] as const;

export async function declencherDemande(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, [...ROLES_CHEF, "manager", "admin"]);
  if (!profile.restaurant_id) return;

  const ingredient_id = String(formData.get("ingredient_id") ?? "");
  const quantite_demandee = Number(formData.get("quantite_demandee"));
  if (!ingredient_id) throw new Error("Ingrédient introuvable.");
  if (!Number.isFinite(quantite_demandee) || quantite_demandee <= 0) {
    throw new Error("La quantité demandée doit être supérieure à zéro.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("demandes_approvisionnement")
    .insert({
      restaurant_id: profile.restaurant_id,
      ingredient_id,
      chef_id: profile.id,
      quantite_demandee,
    })
    .select("id");

  if (error || !data || data.length === 0) {
    throw new Error("La demande de réapprovisionnement n'a pas pu être créée.");
  }

  revalidatePath("/stock");
  revalidatePath("/approvisionnement");
}
