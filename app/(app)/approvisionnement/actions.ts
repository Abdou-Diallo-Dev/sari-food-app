"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";

function chemin() {
  revalidatePath("/approvisionnement");
  revalidatePath("/stock");
}

export async function validerDemande(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Demande introuvable.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("demandes_approvisionnement")
    .update({ statut: "validee" })
    .eq("id", id)
    .select("id");

  if (error || !data || data.length === 0) {
    throw new Error(error?.message ?? "Validation impossible.");
  }
  chemin();
}

export async function rejeterDemande(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager"]);

  const id = String(formData.get("id") ?? "");
  const motif = String(formData.get("motif_rejet") ?? "").trim();
  if (!id) throw new Error("Demande introuvable.");
  if (!motif) throw new Error("Un motif est obligatoire pour rejeter une demande.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("demandes_approvisionnement")
    .update({ statut: "rejetee", motif_rejet: motif })
    .eq("id", id)
    .select("id");

  if (error || !data || data.length === 0) {
    throw new Error(error?.message ?? "Rejet impossible.");
  }
  chemin();
}

export async function decaisserDemande(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "comptable"]);

  const id = String(formData.get("id") ?? "");
  const montant_decaisse = Number(formData.get("montant_decaisse"));
  const fournisseur_id = String(formData.get("fournisseur_id") ?? "").trim();
  if (!id) throw new Error("Demande introuvable.");
  if (!Number.isFinite(montant_decaisse) || montant_decaisse <= 0) {
    throw new Error("Le montant décaissé doit être supérieur à zéro.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("demandes_approvisionnement")
    .update({
      statut: "decaissee",
      montant_decaisse,
      ...(fournisseur_id ? { fournisseur_id } : {}),
    })
    .eq("id", id)
    .select("id");

  if (error || !data || data.length === 0) {
    throw new Error(error?.message ?? "Décaissement impossible.");
  }
  chemin();
}

const ROLES_CHEF = [
  "chef_patisserie",
  "chef_boulangerie",
  "chef_fastfood",
] as const;

export async function modifierDemande(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, [...ROLES_CHEF]);

  const id = String(formData.get("id") ?? "");
  const quantite_demandee = Number(formData.get("quantite_demandee"));
  if (!id) throw new Error("Demande introuvable.");
  if (!Number.isFinite(quantite_demandee) || quantite_demandee <= 0) {
    throw new Error("La quantité demandée doit être supérieure à zéro.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("demandes_approvisionnement")
    .update({ quantite_demandee })
    .eq("id", id)
    .eq("chef_id", profile.id)
    .eq("statut", "declenchee")
    .select("id");

  if (error || !data || data.length === 0) {
    throw new Error(error?.message ?? "Modification impossible : la demande a déjà été traitée par le manager.");
  }
  chemin();
}

export async function supprimerDemande(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, [...ROLES_CHEF]);

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Demande introuvable.");

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("demandes_approvisionnement")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("chef_id", profile.id)
    .eq("statut", "declenchee");

  if (error || !count) {
    throw new Error(error?.message ?? "Suppression impossible : la demande a déjà été traitée par le manager.");
  }
  chemin();
}

export async function receptionnerDemande(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, [
    "admin",
    "manager",
    "chef_patisserie",
    "chef_boulangerie",
    "chef_fastfood",
  ]);

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Demande introuvable.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("demandes_approvisionnement")
    .update({ statut: "receptionnee" })
    .eq("id", id)
    .select("id");

  if (error || !data || data.length === 0) {
    throw new Error(error?.message ?? "Réception impossible.");
  }
  chemin();
}
