"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireRole } from "@/lib/auth";

export type PanierItem = {
  produit_id: string;
  pole: "patisserie" | "boulangerie" | "fastfood";
  prix_unitaire: number;
  quantite: number;
};

export async function createCommande(
  canal: "sur_place" | "emporter",
  items: PanierItem[],
): Promise<{ error?: string; success?: true; numero?: number; id?: string }> {
  const profile = await requireProfile();
  requireRole(profile, ["admin", "manager", "caissiere"]);

  if (!profile.restaurant_id) return { error: "Aucun restaurant associé à ce compte" };
  if (items.length === 0) return { error: "Le panier est vide" };

  const supabase = await createClient();
  const total = items.reduce((sum, i) => sum + i.prix_unitaire * i.quantite, 0);

  const debutJournee = new Date();
  debutJournee.setHours(0, 0, 0, 0);

  const { data: derniereCommande } = await supabase
    .from("commandes")
    .select("numero")
    .eq("restaurant_id", profile.restaurant_id)
    .gte("created_at", debutJournee.toISOString())
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  const numero = (derniereCommande?.numero ?? 0) + 1;

  const { data: commande, error } = await supabase
    .from("commandes")
    .insert({ restaurant_id: profile.restaurant_id, canal, total, numero })
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
    return { error: "Commande créée mais erreur sur les articles" };
  }

  revalidatePath("/kds");
  return { success: true, numero: commande.numero, id: commande.id };
}
