"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";
import { journaliser } from "@/lib/audit";

export async function createCategorie(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const pole = String(formData.get("pole") ?? "");

  if (!nom || !pole || !profile.restaurant_id) return;

  const supabase = await createClient();
  await supabase
    .from("categories_produits")
    .insert({ nom, pole, restaurant_id: profile.restaurant_id });

  revalidatePath("/admin/produits");
}

export async function createProduit(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const prix = Number(formData.get("prix"));
  const categorie_id = String(formData.get("categorie_id") ?? "");

  if (!nom || !categorie_id || !Number.isFinite(prix) || prix <= 0 || !profile.restaurant_id) {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("produits")
    .insert({ nom, prix, categorie_id, restaurant_id: profile.restaurant_id });

  revalidatePath("/admin/produits");
}

export async function toggleProduitActif(produitId: string, actif: boolean) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const supabase = await createClient();
  const { data: avant } = await supabase
    .from("produits")
    .select("actif, restaurant_id")
    .eq("id", produitId)
    .single();

  await supabase.from("produits").update({ actif }).eq("id", produitId);

  if (avant) {
    await journaliser(supabase, {
      restaurantId: avant.restaurant_id,
      utilisateurId: profile.id,
      action: actif ? "activation_produit" : "desactivation_produit",
      entite: "produits",
      entiteId: produitId,
      avant: { actif: avant.actif },
      apres: { actif },
    });
  }

  revalidatePath("/admin/produits");
}

export async function updateCategorie(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const id = String(formData.get("id") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();
  if (!id || !nom) return;

  const supabase = await createClient();
  await supabase.from("categories_produits").update({ nom }).eq("id", id);

  revalidatePath("/admin/produits");
}

export async function deleteCategorie(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // bloqué par la contrainte de clé étrangère si des produits y sont encore rattachés
  await supabase.from("categories_produits").delete().eq("id", id);

  revalidatePath("/admin/produits");
}

export async function updateProduit(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const id = String(formData.get("id") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();
  const prix = Number(formData.get("prix"));
  if (!id || !nom || !Number.isFinite(prix) || prix <= 0) return;

  const supabase = await createClient();
  const { data: avant } = await supabase
    .from("produits")
    .select("nom, prix, restaurant_id")
    .eq("id", id)
    .single();

  await supabase.from("produits").update({ nom, prix }).eq("id", id);

  if (avant) {
    await journaliser(supabase, {
      restaurantId: avant.restaurant_id,
      utilisateurId: profile.id,
      action: "modification_produit",
      entite: "produits",
      entiteId: id,
      avant: { nom: avant.nom, prix: avant.prix },
      apres: { nom, prix },
    });
  }

  revalidatePath("/admin/produits");
}

export async function deleteProduit(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data: avant } = await supabase
    .from("produits")
    .select("nom, prix, restaurant_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("produits").delete().eq("id", id);

  let action = "suppression_produit";
  if (error) {
    // déjà utilisé dans des commandes passées : on le désactive plutôt que de casser l'historique
    await supabase.from("produits").update({ actif: false }).eq("id", id);
    action = "desactivation_produit";
  }

  if (avant) {
    await journaliser(supabase, {
      restaurantId: avant.restaurant_id,
      utilisateurId: profile.id,
      action,
      entite: "produits",
      entiteId: id,
      avant: { nom: avant.nom, prix: avant.prix },
      apres: null,
    });
  }

  revalidatePath("/admin/produits");
}

export async function upsertRecetteIngredient(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const produit_id = String(formData.get("produit_id") ?? "");
  const ingredient_id = String(formData.get("ingredient_id") ?? "");
  const quantite_utilisee = Number(formData.get("quantite_utilisee"));

  if (!produit_id || !ingredient_id || !Number.isFinite(quantite_utilisee) || quantite_utilisee <= 0) {
    return;
  }

  const supabase = await createClient();
  await supabase
    .from("recettes")
    .upsert(
      { produit_id, ingredient_id, quantite_utilisee },
      { onConflict: "produit_id,ingredient_id" },
    );

  revalidatePath("/admin/produits");
}

export async function deleteRecetteIngredient(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const produit_id = String(formData.get("produit_id") ?? "");
  const ingredient_id = String(formData.get("ingredient_id") ?? "");
  if (!produit_id || !ingredient_id) return;

  const supabase = await createClient();
  await supabase
    .from("recettes")
    .delete()
    .eq("produit_id", produit_id)
    .eq("ingredient_id", ingredient_id);

  revalidatePath("/admin/produits");
}
