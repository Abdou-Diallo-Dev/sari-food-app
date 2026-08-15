import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Webhook/notif Orange Money : le format exact (POST JSON vs formulaire,
// noms de champs, éventuel jeton de vérification) dépend du contrat obtenu
// auprès d'Orange — à ajuster une fois la doc réelle disponible (voir
// lib/paiement/orangeMoney.ts). En attendant, on vérifie que le jeton renvoyé
// correspond bien à celui stocké lors de la création du paiement, en plus du
// order_id, comme garde-fou minimal contre un appel non légitime.
export async function POST(request: Request) {
  let payload: { order_id?: string; status?: string; pay_token?: string; txnid?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const commandeEnLigneId = payload.order_id;
  if (!commandeEnLigneId) {
    return NextResponse.json({ error: "order_id manquant." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: commandeEnLigne } = await supabase
    .from("commandes_en_ligne")
    .select("id, statut, reference_paiement")
    .eq("id", commandeEnLigneId)
    .maybeSingle();

  if (!commandeEnLigne || commandeEnLigne.statut !== "en_attente") {
    return NextResponse.json({ ok: true });
  }

  if (payload.pay_token && payload.pay_token !== commandeEnLigne.reference_paiement) {
    return NextResponse.json({ error: "Jeton de paiement invalide." }, { status: 401 });
  }

  if (payload.status === "SUCCESS") {
    await supabase.rpc("materialiser_commande_en_ligne", {
      p_id: commandeEnLigneId,
      p_reference: payload.txnid ?? commandeEnLigne.reference_paiement,
    });
  } else {
    await supabase
      .from("commandes_en_ligne")
      .update({ statut: "echouee" })
      .eq("id", commandeEnLigneId)
      .eq("statut", "en_attente");
  }

  return NextResponse.json({ ok: true });
}
