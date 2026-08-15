import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifierSignatureWave } from "@/lib/paiement/wave";

// Webhook Wave : "checkout.session.completed" (voir lib/paiement/wave.ts —
// nom d'évènement/champs à revérifier contre la doc Wave au moment de
// configurer l'URL du webhook dans le dashboard marchand).
export async function POST(request: Request) {
  const payloadBrut = await request.text();

  if (!verifierSignatureWave(payloadBrut, request.headers.get("Wave-Signature"))) {
    return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  }

  let event: {
    type?: string;
    data?: { id?: string; client_reference?: string; checkout_status?: string };
  };
  try {
    event = JSON.parse(payloadBrut);
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const commandeEnLigneId = event.data?.client_reference;
  const sessionId = event.data?.id;
  if (!commandeEnLigneId) {
    return NextResponse.json({ error: "client_reference manquant." }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (event.type === "checkout.session.completed" && event.data?.checkout_status === "complete") {
    await supabase.rpc("materialiser_commande_en_ligne", {
      p_id: commandeEnLigneId,
      p_reference: sessionId ?? commandeEnLigneId,
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
