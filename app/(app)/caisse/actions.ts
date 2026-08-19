"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";
import { MOYENS_PAIEMENT_CAISSE, totauxParMoyen } from "@/lib/caisse";
import { journaliser } from "@/lib/audit";

export async function ouvrirSession(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["caissiere", "manager", "admin"]);
  if (!profile.restaurant_id) return;

  const shift = String(formData.get("shift") ?? "");
  const fond_initial_wave = Number(formData.get("fond_initial_wave") || 0);
  const fond_initial_orange_money = Number(formData.get("fond_initial_orange_money") || 0);

  if (
    !["matin", "soir"].includes(shift) ||
    !Number.isFinite(fond_initial_wave) ||
    fond_initial_wave < 0 ||
    !Number.isFinite(fond_initial_orange_money) ||
    fond_initial_orange_money < 0
  ) {
    return;
  }

  const supabase = await createClient();

  // Le fonds espèces n'est plus une saisie libre : il reprend automatiquement
  // ce que le manager a gardé lors de la dernière session contrôlée de ce
  // restaurant (0 si aucune n'a encore été contrôlée).
  const { data: fondsDisponible } = await supabase.rpc("fonds_caisse_disponible", {
    p_restaurant_id: profile.restaurant_id,
  });
  const fond_initial_especes = Number(fondsDisponible ?? 0);

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
    .select("fond_initial_especes, fond_initial_wave, fond_initial_orange_money, restaurant_id, statut")
    .eq("id", sessionId)
    .single();
  if (!session) return;
  if (session.statut !== "ouverte") {
    throw new Error("Cette session de caisse est déjà clôturée.");
  }

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

  const { data: cloture, error } = await supabase
    .from("sessions_caisse")
    .update({
      total_theorique,
      total_compte,
      ecart: ecart_especes,
      total_compte_especes,
      ecart_especes,
      statut: "en_attente_controle",
    })
    .eq("id", sessionId)
    .eq("statut", "ouverte")
    .select("id");

  if (error || !cloture || cloture.length === 0) {
    throw new Error("Cette session de caisse est déjà clôturée.");
  }

  await journaliser(supabase, {
    restaurantId: session.restaurant_id,
    utilisateurId: profile.id,
    action: "cloture_caisse",
    entite: "sessions_caisse",
    entiteId: sessionId,
    avant: { statut: "ouverte" },
    apres: { statut: "en_attente_controle", total_theorique, total_compte, ecart: ecart_especes },
  });

  // Wave/Orange Money : pas de remise physique possible (déjà sur un compte
  // mobile money de l'entreprise), donc versés en caisse globale dès cette
  // étape, comme avant. Les espèces attendent le contrôle manager
  // (controlerCloture) pour ne pas compter deux fois le fonds recyclé vers
  // la session suivante.
  const entrees = [
    { sous_caisse: "wave" as const, montant: theoriqueWave },
    { sous_caisse: "orange_money" as const, montant: theoriqueOrangeMoney },
  ].filter((e) => e.montant > 0);
  if (entrees.length > 0) {
    try {
      await supabase.from("mouvements_caisse_globale").insert(
        entrees.map((e) => ({
          type: "entree" as const,
          categorie: "cloture_session" as const,
          sous_caisse: e.sous_caisse,
          montant: e.montant,
          session_id: sessionId,
          restaurant_id: session.restaurant_id,
          utilisateur_id: profile.id,
        })),
      );
    } catch {
      // remontée en caisse globale best-effort : ne jamais casser la clôture
    }
  }

  revalidatePath("/caisse");
  revalidatePath("/admin/caisse");
  revalidatePath("/caisse-globale");
}

export async function controlerCloture(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  requireRole(profile, ["manager", "admin"]);

  const sessionId = String(formData.get("session_id") ?? "");
  const montant_garde_fonds_caisse = Number(formData.get("montant_garde_fonds_caisse"));
  if (!sessionId || !Number.isFinite(montant_garde_fonds_caisse) || montant_garde_fonds_caisse < 0) {
    throw new Error("Montant de fonds de caisse invalide.");
  }

  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions_caisse")
    .select("total_compte_especes, restaurant_id, statut")
    .eq("id", sessionId)
    .single();
  if (!session) return;
  if (session.statut !== "en_attente_controle") {
    throw new Error("Cette session n'est pas en attente de contrôle.");
  }
  if (montant_garde_fonds_caisse > Number(session.total_compte_especes)) {
    throw new Error("Le fonds gardé ne peut pas dépasser le montant compté en espèces.");
  }

  const montant_transfere_comptable = Number(session.total_compte_especes) - montant_garde_fonds_caisse;

  const { data: controlee, error } = await supabase
    .from("sessions_caisse")
    .update({
      statut: "cloturee",
      montant_garde_fonds_caisse,
      cloturee_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("statut", "en_attente_controle")
    .select("id");

  if (error || !controlee || controlee.length === 0) {
    throw new Error("Cette session a déjà été contrôlée.");
  }

  await journaliser(supabase, {
    restaurantId: session.restaurant_id,
    utilisateurId: profile.id,
    action: "controle_cloture_caisse",
    entite: "sessions_caisse",
    entiteId: sessionId,
    avant: { statut: "en_attente_controle" },
    apres: { statut: "cloturee", montant_garde_fonds_caisse, montant_transfere_comptable },
  });

  if (montant_transfere_comptable > 0) {
    try {
      await supabase.from("mouvements_caisse_globale").insert({
        type: "entree",
        categorie: "cloture_session",
        sous_caisse: "especes",
        montant: montant_transfere_comptable,
        session_id: sessionId,
        restaurant_id: session.restaurant_id,
        utilisateur_id: profile.id,
      });
    } catch {
      // remontée en caisse globale best-effort : ne jamais casser le contrôle
    }
  }

  revalidatePath("/caisse");
  revalidatePath("/admin/caisse");
  revalidatePath("/caisse-globale");
}
