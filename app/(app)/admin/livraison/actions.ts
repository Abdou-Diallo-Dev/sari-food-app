"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";

export async function createZoneLivraison(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const nom = String(formData.get("nom") ?? "").trim();
  const frais = Number(formData.get("frais"));

  if (!nom || !Number.isFinite(frais) || frais < 0 || !profile.restaurant_id) return;

  const supabase = await createClient();
  await supabase
    .from("zones_livraison")
    .insert({ nom, frais, restaurant_id: profile.restaurant_id });

  revalidatePath("/admin/livraison");
}

export async function updateZoneLivraison(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const id = String(formData.get("id") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();
  const frais = Number(formData.get("frais"));
  if (!id || !nom || !Number.isFinite(frais) || frais < 0) return;

  const supabase = await createClient();
  await supabase.from("zones_livraison").update({ nom, frais }).eq("id", id);

  revalidatePath("/admin/livraison");
}

export async function toggleZoneLivraisonActif(id: string, actif: boolean) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const supabase = await createClient();
  await supabase.from("zones_livraison").update({ actif }).eq("id", id);

  revalidatePath("/admin/livraison");
}

export async function deleteZoneLivraison(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  // bloqué par la contrainte de clé étrangère si des commandes y référent déjà
  await supabase.from("zones_livraison").delete().eq("id", id);

  revalidatePath("/admin/livraison");
}
