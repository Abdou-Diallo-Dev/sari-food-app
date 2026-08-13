"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";
import { MOYENS_PAIEMENT_CAISSE, totauxParMoyen } from "@/lib/caisse";

export async function ouvrirSession(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["caissiere", "manager", "admin"]);
  if (!profile.restaurant_id) return;

  const shift = String(formData.get("shift") ?? "");
  const fond_initial_especes = Number(formData.get("fond_initial_especes") || 0);
  const fond_initial_wave = Number(formData.get("fond_initial_wave") || 0);
  const fond_initial_orange_money = Number(formData.get("fond_initial_orange_money") || 0);

  if (
    !["matin", "soir"].includes(shift) ||
    !Number.isFinite(fond_initial_especes) ||
    fond_initial_especes < 0 ||
    !Number.isFinite(fond_initial_wave) ||
    fond_initial_wave < 0 ||
    !Number.isFinite(fond_initial_orange_money) ||
    fond_initial_orange_money < 0
  ) {
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
    fond_initial: fond_initial_especes + fond_initial_wave + fond_initial_orange_money,
    fond_initial_especes,
    fond_initial_wave,
    fond_initial_orange_money,
  });

  revalidatePath("/caisse");
}

export async function enregistrerDepense(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["caissiere", "manager", "admin"]);

  const sessionId = String(formData.get("session_id") ?? "");
  const categorie_depense = String(formData.get("categorie_depense") ?? "");
  const moyen_paiement = String(formData.get("moyen_paiement") ?? "");
  const libelle = String(formData.get("libelle") ?? "").trim();
  const montant = Number(formData.get("montant"));
  if (!sessionId || !categorie_depense || !Number.isFinite(montant) || montant <= 0) return;

  if (!MOYENS_PAIEMENT_CAISSE.some((m) => m.value === moyen_paiement)) {
    throw new Error("Choisissez la caisse (espèces, Wave ou Orange Money) concernée par la dépense.");
  }

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
    moyen_paiement,
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
  const total_compte_especes = Number(formData.get("total_compte_especes"));
  if (!sessionId || !Number.isFinite(total_compte_especes) || total_compte_especes < 0) return;

  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions_caisse")
    .select("fond_initial_especes, fond_initial_wave, fond_initial_orange_money")
    .eq("id", sessionId)
    .single();
  if (!session) return;

  const { data: transactions } = await supabase
    .from("transactions_caisse")
    .select("type, montant, moyen_paiement")
    .eq("session_id", sessionId);

  const especes = totauxParMoyen(transactions ?? [], "especes");
  const wave = totauxParMoyen(transactions ?? [], "wave");
  const orangeMoney = totauxParMoyen(transactions ?? [], "orange_money");

  const theoriqueEspeces = Number(session.fond_initial_especes) + especes.encaisse - especes.depense;
  const theoriqueWave = Number(session.fond_initial_wave) + wave.encaisse - wave.depense;
  const theoriqueOrangeMoney =
    Number(session.fond_initial_orange_money) + orangeMoney.encaisse - orangeMoney.depense;

  const total_theorique = theoriqueEspeces + theoriqueWave + theoriqueOrangeMoney;
  const ecart_especes = total_compte_especes - theoriqueEspeces;
  // Wave/Orange Money : pas de comptage physique possible, on retient le théorique.
  const total_compte = total_compte_especes + theoriqueWave + theoriqueOrangeMoney;

  await supabase
    .from("sessions_caisse")
    .update({
      total_theorique,
      total_compte,
      ecart: ecart_especes,
      total_compte_especes,
      ecart_especes,
      statut: "cloturee",
      cloturee_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  revalidatePath("/caisse");
  revalidatePath("/admin/caisse");
}
