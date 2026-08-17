import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

type WebPushError = { statusCode?: number };

// Appelée par le trigger SQL trg_relayer_push_notification (0022) via
// pg_net à chaque insert dans `notifications`. Authentification par secret
// partagé (pas de session utilisateur ici : l'appelant est Postgres).
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-push-secret");
  if (!secret || secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "VAPID non configuré" }, { status: 500 });
  }
  webpush.setVapidDetails("mailto:contact@sari.com", vapidPublicKey, vapidPrivateKey);

  const { destinataire_id, message, lien, type } = await req.json();
  if (!destinataire_id || !message) {
    return NextResponse.json({ error: "payload invalide" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: abonnements, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("utilisateur_id", destinataire_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!abonnements || abonnements.length === 0) {
    return NextResponse.json({ ok: true, envoyes: 0 });
  }

  const payload = JSON.stringify({
    titre: "Sari Food",
    message,
    lien: lien ?? "/",
    type: type ?? null,
  });

  const resultats = await Promise.allSettled(
    abonnements.map((a) =>
      webpush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        payload,
      ),
    ),
  );

  // Un abonnement expiré/révoqué (l'utilisateur a désinstallé, changé de
  // navigateur, refusé les notifications) répond 404/410 : on le supprime
  // pour ne pas retenter indéfiniment un endpoint mort.
  const expiresIds = abonnements
    .filter((_, i) => {
      const r = resultats[i];
      if (r.status !== "rejected") return false;
      const statusCode = (r.reason as WebPushError)?.statusCode;
      return statusCode === 404 || statusCode === 410;
    })
    .map((a) => a.id);

  if (expiresIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", expiresIds);
  }

  return NextResponse.json({
    ok: true,
    envoyes: resultats.filter((r) => r.status === "fulfilled").length,
  });
}
