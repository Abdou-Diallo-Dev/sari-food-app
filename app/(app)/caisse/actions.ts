"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";

export async function ouvrirSession(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["caissiere", "manager", "admin"]);
  if (!profile.restaurant_id) return;

  const shift = String(formData.get("shift") ?? "");
  const fond_initial = Number(formData.get("fond_initial"));
  if (!["matin", "soir"].includes(shift) || !Number.isFinite(fond_initial) || fond_initial < 0) {
    return;
  }

  const supabase = await createClient();

  const { data: sessionOuverte } = await supabase
    .from("sessions_caisse")
    .select("id")
    .eq("caissiere_id", profile.id)
    .eq("statut", "ouverte")
    .maybeSingle();
  if (sessionOuverte) return;

  await supabase.from("sessions_caisse").insert({
    restaurant_id: profile.restaurant_id,
    caissiere_id: profile.id,
    shift,
    fond_initial,
  });

  revalidatePath("/caisse");
}

export async function encaisserCommande(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["caissiere", "manager", "admin"]);

  const commandeId = String(formData.get("commande_id") ?? "");
  const sessionId = String(formData.get("session_id") ?? "");
  const moyen_paiement = String(formData.get("moyen_paiement") ?? "");
  if (!commandeId || !sessionId || !moyen_paiement) return;

  const supabase = await createClient();

  const { data: commande } = await supabase
    .from("commandes")
    .select("id, total, statut")
    .eq("id", commandeId)
    .single();
  if (!commande || commande.statut === "payee" || commande.statut === "annulee") return;

  const { data: transaction, error } = await supabase
    .from("transactions_caisse")
    .insert({
      session_id: sessionId,
      type: "encaissement",
      montant: commande.total,
      moyen_paiement,
      commande_id: commandeId,
      utilisateur_id: profile.id,
    })
    .select("id")
    .single();
  if (error || !transaction) {
    throw new Error("Impossible d'enregistrer l'encaissement.");
  }

  const { data: mise_a_jour, error: updateError } = await supabase
    .from("commandes")
    .update({ statut: "payee", session_id: sessionId })
    .eq("id", commandeId)
    .select("id");

  if (updateError || !mise_a_jour || mise_a_jour.length === 0) {
    await supabase.from("transactions_caisse").delete().eq("id", transaction.id);
    throw new Error(
      "L'encaissement a échoué : la commande n'a pas pu être marquée comme payée.",
    );
  }

  revalidatePath("/caisse");
  revalidatePath("/dashboard");
  revalidatePath("/");
}

export async function enregistrerDepense(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["caissiere", "manager", "admin"]);

  const sessionId = String(formData.get("session_id") ?? "");
  const categorie_depense = String(formData.get("categorie_depense") ?? "");
  const libelle = String(formData.get("libelle") ?? "").trim();
  const montant = Number(formData.get("montant"));
  if (!sessionId || !categorie_depense || !Number.isFinite(montant) || montant <= 0) return;

  const ingredient_id = String(formData.get("ingredient_id") ?? "").trim();
  const quantite_stock = Number(formData.get("quantite_stock"));

  if (categorie_depense === "achat_stock") {
    if (!ingredient_id || !Number.isFinite(quantite_stock) || quantite_stock <= 0) {
      throw new Error(
        "Pour une dépense « Achat stock », choisissez l'ingrédient et la quantité achetée.",
      );
    }
  }

  const supabase = await createClient();
  await supabase.from("transactions_caisse").insert({
    session_id: sessionId,
    type: "depense",
    categorie_depense,
    libelle: libelle || null,
    montant,
    utilisateur_id: profile.id,
    ...(categorie_depense === "achat_stock" ? { ingredient_id, quantite_stock } : {}),
  });

  revalidatePath("/caisse");
  revalidatePath("/stock");
}

export async function cloturerSession(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["caissiere", "manager", "admin"]);

  const sessionId = String(formData.get("session_id") ?? "");
  const total_compte = Number(formData.get("total_compte"));
  if (!sessionId || !Number.isFinite(total_compte) || total_compte < 0) return;

  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions_caisse")
    .select("fond_initial")
    .eq("id", sessionId)
    .single();
  if (!session) return;

  const { data: transactions } = await supabase
    .from("transactions_caisse")
    .select("type, montant")
    .eq("session_id", sessionId);

  const totalEncaissements = (transactions ?? [])
    .filter((t) => t.type === "encaissement")
    .reduce((s, t) => s + Number(t.montant), 0);
  const totalDepenses = (transactions ?? [])
    .filter((t) => t.type === "depense")
    .reduce((s, t) => s + Number(t.montant), 0);

  const total_theorique = Number(session.fond_initial) + totalEncaissements - totalDepenses;
  const ecart = total_compte - total_theorique;

  await supabase
    .from("sessions_caisse")
    .update({
      total_theorique,
      total_compte,
      ecart,
      statut: "cloturee",
      cloturee_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  revalidatePath("/caisse");
}
