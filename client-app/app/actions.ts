"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { creerCheckoutWave } from "@/lib/paiement/wave";
import { creerCheckoutOrangeMoney } from "@/lib/paiement/orangeMoney";
import type { PanierItem, ModePaiement } from "@/lib/types";

export async function creerCommandeEnLigne(params: {
  clientNom: string;
  clientTelephone: string;
  modePaiement: ModePaiement;
  panier: PanierItem[];
}): Promise<{ error?: string; url?: string }> {
  const restaurantId = process.env.NEXT_PUBLIC_RESTAURANT_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!restaurantId || !siteUrl) return { error: "Configuration du site incomplète." };

  const clientNom = params.clientNom.trim();
  const clientTelephone = params.clientTelephone.trim();
  if (!clientNom) return { error: "Le nom est obligatoire." };
  if (!clientTelephone) return { error: "Le numéro de téléphone est obligatoire." };
  if (params.panier.length === 0) return { error: "Le panier est vide." };
  if (params.modePaiement !== "wave" && params.modePaiement !== "orange_money") {
    return { error: "Moyen de paiement invalide." };
  }

  const supabase = createAdminClient();

  // On ne fait jamais confiance au panier envoyé par le navigateur pour le
  // prix : chaque article est revérifié (existe, actif, bon restaurant) et
  // son prix/pôle recalculés depuis produits/categories_produits.
  const produitIds = [...new Set(params.panier.map((i) => i.produit_id))];
  const { data: produits, error: produitsError } = await supabase
    .from("produits")
    .select("id, nom, prix, actif, restaurant_id, categories_produits(pole)")
    .in("id", produitIds);

  if (produitsError || !produits) return { error: "Impossible de vérifier le panier." };

  const panierValide: {
    produit_id: string;
    nom: string;
    pole: string;
    quantite: number;
    prix_unitaire: number;
  }[] = [];
  let total = 0;

  for (const item of params.panier) {
    const produit = produits.find((p) => p.id === item.produit_id);
    const pole = (produit?.categories_produits as unknown as { pole: string } | null)?.pole;

    if (
      !produit ||
      !produit.actif ||
      produit.restaurant_id !== restaurantId ||
      !pole ||
      !Number.isFinite(item.quantite) ||
      item.quantite <= 0
    ) {
      return { error: `Un article du panier n'est plus disponible (${produit?.nom ?? "inconnu"}).` };
    }

    const prixUnitaire = Number(produit.prix);
    panierValide.push({
      produit_id: produit.id,
      nom: produit.nom,
      pole,
      quantite: item.quantite,
      prix_unitaire: prixUnitaire,
    });
    total += prixUnitaire * item.quantite;
  }

  const { data: commandeEnLigne, error: insertError } = await supabase
    .from("commandes_en_ligne")
    .insert({
      restaurant_id: restaurantId,
      client_nom: clientNom,
      client_telephone: clientTelephone,
      panier: panierValide,
      total,
      mode_paiement: params.modePaiement,
    })
    .select("id")
    .single();

  if (insertError || !commandeEnLigne) return { error: "Impossible d'enregistrer la commande." };

  const successUrl = `${siteUrl}/commande/${commandeEnLigne.id}`;
  const errorUrl = `${siteUrl}/commande/${commandeEnLigne.id}?erreur=1`;

  try {
    let checkoutUrl: string;
    let reference: string;

    if (params.modePaiement === "wave") {
      const checkout = await creerCheckoutWave({
        montant: total,
        reference: commandeEnLigne.id,
        successUrl,
        errorUrl,
      });
      checkoutUrl = checkout.url;
      reference = checkout.sessionId;
    } else {
      const checkout = await creerCheckoutOrangeMoney({
        montant: total,
        reference: commandeEnLigne.id,
        successUrl,
        cancelUrl: errorUrl,
        notifUrl: `${siteUrl}/api/webhooks/orange-money`,
      });
      checkoutUrl = checkout.url;
      reference = checkout.token;
    }

    await supabase
      .from("commandes_en_ligne")
      .update({ reference_paiement: reference })
      .eq("id", commandeEnLigne.id);

    return { url: checkoutUrl };
  } catch {
    await supabase
      .from("commandes_en_ligne")
      .update({ statut: "echouee" })
      .eq("id", commandeEnLigne.id);
    return { error: "Impossible de démarrer le paiement. Réessayez." };
  }
}
