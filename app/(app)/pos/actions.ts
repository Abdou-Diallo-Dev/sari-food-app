"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";
import { resolveRestaurantId } from "@/lib/restaurant-actif";
import { encaisserCommandeInterne, MOYENS_PAIEMENT_CAISSE, type MoyenPaiementCaisse } from "@/lib/caisse";

export type PanierItem = {
  produit_id: string;
  pole: "patisserie" | "boulangerie" | "fastfood";
  prix_unitaire: number;
  quantite: number;
};

export async function createCommande(
  canal: "sur_place" | "emporter" | "livraison",
  items: PanierItem[],
  moyenPaiement: MoyenPaiementCaisse,
): Promise<{ error?: string; success?: true; numero?: number; id?: string }> {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "caissiere"]);

  const restaurantId = await resolveRestaurantId(profile);
  if (!restaurantId) return { error: "Choisissez un restaurant avant de prendre une commande" };
  if (items.length === 0) return { error: "Le panier est vide" };
  if (!MOYENS_PAIEMENT_CAISSE.some((m) => m.value === moyenPaiement)) {
    return { error: "Moyen de paiement invalide" };
  }

  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions_caisse")
    .select("id")
    .eq("caissiere_id", profile.id)
    .eq("restaurant_id", restaurantId)
    .eq("statut", "ouverte")
    .maybeSingle();

  if (!session) {
    return { error: "Ouvrez la caisse avant de prendre des commandes." };
  }

  const total = items.reduce((sum, i) => sum + i.prix_unitaire * i.quantite, 0);

  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);

  const { data: derniereCommande } = await supabase
    .from("commandes")
    .select("numero")
    .eq("restaurant_id", restaurantId)
    .gte("created_at", debutJournee.toISOString())
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  const numero = (derniereCommande?.numero ?? 0) + 1;

  const { data: commande, error } = await supabase
    .from("commandes")
    .insert({ restaurant_id: restaurantId, canal, total, numero })
    .select("id, numero")
    .single();

  if (error || !commande) {
    return { error: "Impossible de créer la commande" };
  }

  const { error: lignesError } = await supabase.from("lignes_commande").insert(
    items.map((i) => ({
      commande_id: commande.id,
      produit_id: i.produit_id,
      pole: i.pole,
      quantite: i.quantite,
      prix_unitaire: i.prix_unitaire,
    })),
  );

  if (lignesError) {
    return {
      error: lignesError.message.includes("Rupture")
        ? lignesError.message
        : "Commande créée mais erreur sur les articles",
    };
  }

  const encaissement = await encaisserCommandeInterne(supabase, {
    commandeId: commande.id,
    sessionId: session.id,
    moyenPaiement,
    montant: total,
    utilisateurId: profile.id,
  });

  if (encaissement.error) {
    return { error: `Commande créée mais paiement échoué : ${encaissement.error}` };
  }

  revalidatePath("/kds");
  revalidatePath("/caisse");
  revalidatePath("/dashboard");
  revalidatePath("/");
  return { success: true, numero: commande.numero, id: commande.id };
}

// Une commande en ligne est matérialisée "payee" et part en cuisine dès le
// paiement confirmé (le client ne voit pas le stock réel en commandant) :
// ce point de contrôle permet à la caissière de la refuser après coup si un
// article s'avère en rupture, ou de la valider explicitement sinon.
export async function validerCommandeEnLigne(commandeId: string): Promise<{ error?: string }> {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "caissiere"]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("commandes")
    .update({ confirmation_caisse: "validee" })
    .eq("id", commandeId)
    .eq("canal", "en_ligne")
    .is("confirmation_caisse", null);

  if (error) return { error: "Impossible de valider la commande." };

  revalidatePath("/pos");
  return {};
}

export async function refuserCommandeEnLigne(commandeId: string): Promise<{ error?: string }> {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "caissiere"]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("commandes")
    .update({ confirmation_caisse: "refusee", statut: "annulee" })
    .eq("id", commandeId)
    .eq("canal", "en_ligne")
    .is("confirmation_caisse", null);

  if (error) return { error: "Impossible de refuser la commande." };

  revalidatePath("/pos");
  revalidatePath("/kds");
  return {};
}
