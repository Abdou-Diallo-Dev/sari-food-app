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
  const remiseId = String(formData.get("remise_id") ?? "").trim();
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

  // Le fonds espèces vient soit d'une remise déjà vérifiée par le manager
  // (transfert réel, verrouillé, cf. verifierRemise), soit d'une saisie
  // manuelle en l'absence de remise disponible (toute première session, ou
  // aucun transfert encore vérifié).
  let fond_initial_especes = Number(formData.get("fond_initial_especes") || 0);
  let remise: { id: string; fond_nouvelle_session: number } | null = null;

  if (remiseId) {
    const { data } = await supabase
      .from("remises_caisse")
      .select("id, fond_nouvelle_session, restaurant_id, statut, session_suivante_id")
      .eq("id", remiseId)
      .maybeSingle();

    if (
      !data ||
      data.statut !== "verifiee" ||
      data.session_suivante_id !== null ||
      data.restaurant_id !== profile.restaurant_id
    ) {
      throw new Error("Ce fonds de caisse n'est plus disponible. Rechargez la page.");
    }

    remise = { id: data.id, fond_nouvelle_session: Number(data.fond_nouvelle_session) };
    fond_initial_especes = remise.fond_nouvelle_session;
  }

  if (!Number.isFinite(fond_initial_especes) || fond_initial_especes < 0) return;

  const { data: sessionOuverte } = await supabase
    .from("sessions_caisse")
    .select("id")
    .eq("caissiere_id", profile.id)
    .eq("statut", "ouverte")
    .maybeSingle();
  if (sessionOuverte) return;

  const { data: nouvelleSession, error } = await supabase
    .from("sessions_caisse")
    .insert({
      restaurant_id: profile.restaurant_id,
      caissiere_id: profile.id,
      shift,
      fond_initial: fond_initial_especes + fond_initial_wave + fond_initial_orange_money,
      fond_initial_especes,
      fond_initial_wave,
      fond_initial_orange_money,
    })
    .select("id")
    .single();

  if (!error && nouvelleSession && remise) {
    await supabase
      .from("remises_caisse")
      .update({ session_suivante_id: nouvelleSession.id })
      .eq("id", remise.id)
      .is("session_suivante_id", null);
  }

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
  const total_compte_wave = Number(formData.get("total_compte_wave"));
  const total_compte_orange_money = Number(formData.get("total_compte_orange_money"));
  if (
    !sessionId ||
    !Number.isFinite(total_compte_especes) ||
    total_compte_especes < 0 ||
    !Number.isFinite(total_compte_wave) ||
    total_compte_wave < 0 ||
    !Number.isFinite(total_compte_orange_money) ||
    total_compte_orange_money < 0
  ) {
    return;
  }

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
  const ecart_wave = total_compte_wave - theoriqueWave;
  const ecart_orange_money = total_compte_orange_money - theoriqueOrangeMoney;
  const total_compte = total_compte_especes + total_compte_wave + total_compte_orange_money;

  const { data: cloture, error } = await supabase
    .from("sessions_caisse")
    .update({
      total_theorique,
      total_compte,
      ecart: ecart_especes,
      total_compte_especes,
      ecart_especes,
      total_compte_wave,
      ecart_wave,
      total_compte_orange_money,
      ecart_orange_money,
      statut: "cloturee",
      cloturee_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("statut", "ouverte")
    .select("id");

  if (error || !cloture || cloture.length === 0) {
    throw new Error("Cette session de caisse est déjà clôturée.");
  }

  // Chaîne de transfert espèces (caissière -> manager -> comptable) :
  // amorcée ici par une remise "en_attente", vérifiée ensuite par le
  // manager (verifierRemise). Wave/Orange Money n'ont pas de remise
  // physique à modéliser (soldes numériques déjà chez le comptable).
  await supabase.from("remises_caisse").insert({
    restaurant_id: session.restaurant_id,
    session_cloturee_id: sessionId,
    caissiere_id: profile.id,
    montant_remis: total_compte_especes,
  });

  await journaliser(supabase, {
    restaurantId: session.restaurant_id,
    utilisateurId: profile.id,
    action: "cloture_caisse",
    entite: "sessions_caisse",
    entiteId: sessionId,
    avant: { statut: "ouverte" },
    apres: {
      statut: "cloturee",
      total_theorique,
      total_compte,
      ecart_especes,
      ecart_wave,
      ecart_orange_money,
    },
  });

  // Wave/Orange Money : soldes numériques, crédités en caisse globale dès la
  // clôture comme avant. Espèces : PAS crédité ici — l'argent physique n'est
  // réellement "entré" dans la caisse globale qu'une fois le manager passé
  // (verifierRemise ci-dessous), qui crédite le montant réellement
  // transféré au comptable, pas le total brut compté par la caissière (une
  // partie reste en fonds de caisse pour la session suivante).
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

export async function verifierRemise(formData: FormData) {
  const profile = await requireProfile();
  requireRole(profile, ["manager", "admin"]);
  if (!profile.restaurant_id) return;

  const remiseId = String(formData.get("remise_id") ?? "");
  const fondNouvelleSession = Number(formData.get("fond_nouvelle_session"));
  if (!remiseId || !Number.isFinite(fondNouvelleSession) || fondNouvelleSession < 0) return;

  const supabase = await createClient();

  const { data: remise } = await supabase
    .from("remises_caisse")
    .select("montant_remis, restaurant_id, statut, session_cloturee_id")
    .eq("id", remiseId)
    .single();

  if (!remise || remise.statut !== "en_attente") return;
  if (fondNouvelleSession > Number(remise.montant_remis)) {
    throw new Error("Le fonds pour la nouvelle session ne peut pas dépasser le montant remis.");
  }

  const montant_transfere_comptable = Number(remise.montant_remis) - fondNouvelleSession;

  await supabase
    .from("remises_caisse")
    .update({
      statut: "verifiee",
      manager_id: profile.id,
      fond_nouvelle_session: fondNouvelleSession,
      montant_transfere_comptable,
      verifiee_at: new Date().toISOString(),
    })
    .eq("id", remiseId)
    .eq("statut", "en_attente");

  await journaliser(supabase, {
    restaurantId: remise.restaurant_id,
    utilisateurId: profile.id,
    action: "verification_remise",
    entite: "remises_caisse",
    entiteId: remiseId,
    avant: { statut: "en_attente", montant_remis: remise.montant_remis },
    apres: { statut: "verifiee", fond_nouvelle_session: fondNouvelleSession, montant_transfere_comptable },
  });

  // C'est ici, et seulement ici, que l'espèces entre réellement dans la
  // caisse globale — le montant que le manager a choisi de transférer au
  // comptable, jamais le total brut compté par la caissière (une partie
  // reste en fonds pour la session suivante, cf. cloturerSession).
  if (montant_transfere_comptable > 0) {
    try {
      await supabase.from("mouvements_caisse_globale").insert({
        type: "entree",
        categorie: "cloture_session",
        sous_caisse: "especes",
        montant: montant_transfere_comptable,
        session_id: remise.session_cloturee_id,
        restaurant_id: remise.restaurant_id,
        utilisateur_id: profile.id,
      });
    } catch {
      // remontée en caisse globale best-effort : ne jamais casser la vérification
    }
  }

  revalidatePath("/admin/caisse");
  revalidatePath("/caisse-globale");
}
