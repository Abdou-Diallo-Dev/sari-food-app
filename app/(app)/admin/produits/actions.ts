"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, requireRole } from "@/lib/auth";
import { journaliser } from "@/lib/audit";

const BUCKET_PRODUITS = "produits";

function cheminDepuisUrlPublique(url: string): string | null {
  const marqueur = `/storage/v1/object/public/${BUCKET_PRODUITS}/`;
  const index = url.indexOf(marqueur);
  return index === -1 ? null : url.slice(index + marqueur.length);
}

async function televerserPhoto(photo: File, restaurantId: string): Promise<string | null> {
  if (!photo || photo.size === 0) return null;

  const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
  const chemin = `${restaurantId}/${randomUUID()}.${extension}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET_PRODUITS)
    .upload(chemin, photo, { contentType: photo.type, upsert: false });

  if (error) return null;

  const { data } = admin.storage.from(BUCKET_PRODUITS).getPublicUrl(chemin);
  return data.publicUrl;
}

async function supprimerPhoto(imageUrl: string | null | undefined) {
  const chemin = imageUrl ? cheminDepuisUrlPublique(imageUrl) : null;
  if (!chemin) return;

  const admin = createAdminClient();
  await admin.storage.from(BUCKET_PRODUITS).remove([chemin]);
}

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
  const photo = formData.get("photo") as File | null;

  if (!nom || !categorie_id || !Number.isFinite(prix) || prix <= 0 || !profile.restaurant_id) {
    return;
  }

  const image_url = photo ? await televerserPhoto(photo, profile.restaurant_id) : null;

  const supabase = await createClient();
  await supabase
    .from("produits")
    .insert({ nom, prix, categorie_id, image_url, restaurant_id: profile.restaurant_id });

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
  const photo = formData.get("photo") as File | null;
  if (!id || !nom || !Number.isFinite(prix) || prix <= 0) return;

  const supabase = await createClient();
  const { data: avant } = await supabase
    .from("produits")
    .select("nom, prix, image_url, restaurant_id")
    .eq("id", id)
    .single();

  const nouvelleImageUrl =
    photo && photo.size > 0 && avant?.restaurant_id
      ? await televerserPhoto(photo, avant.restaurant_id)
      : null;

  await supabase
    .from("produits")
    .update({ nom, prix, ...(nouvelleImageUrl ? { image_url: nouvelleImageUrl } : {}) })
    .eq("id", id);

  if (nouvelleImageUrl && avant?.image_url) {
    await supprimerPhoto(avant.image_url);
  }

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
    .select("nom, prix, image_url, restaurant_id")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("produits").delete().eq("id", id);

  let action = "suppression_produit";
  if (error) {
    // déjà utilisé dans des commandes passées : on le désactive plutôt que de casser l'historique
    await supabase.from("produits").update({ actif: false }).eq("id", id);
    action = "desactivation_produit";
  } else if (avant?.image_url) {
    await supprimerPhoto(avant.image_url);
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
