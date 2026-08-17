"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Demande la permission de notification et enregistre l'abonnement push du
// navigateur pour l'utilisateur connecté. Silencieux en cas de refus/échec :
// l'app reste utilisable normalement, seule la notif push est indisponible
// (le staff garde la cloche en attendant — voir NotificationBell).
export function PushSubscribe({ utilisateurId }: { utilisateurId: string }) {
  useEffect(() => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

    async function abonner() {
      try {
        if (Notification.permission === "denied") return;
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey as string) as unknown as BufferSource,
          });
        }

        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

        const supabase = createClient();
        await supabase.from("push_subscriptions").upsert(
          {
            utilisateur_id: utilisateurId,
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
          { onConflict: "endpoint" },
        );
      } catch {
        // navigateur incompatible, permission refusée en cours de route, etc.
      }
    }

    abonner();
  }, [utilisateurId]);

  return null;
}
