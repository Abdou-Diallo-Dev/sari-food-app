"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function assurerAbonnement(utilisateurId: string) {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
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
}

// Safari/iOS n'affiche la demande d'autorisation de notifications que si
// Notification.requestPermission() est appelé en réaction directe à un
// geste utilisateur (clic/tap) -- un appel automatique au chargement de la
// page (comme le faisait la version précédente) est silencieusement ignoré
// sur iOS, alors que Chrome (desktop et Android) l'accepte encore sans
// interaction. On propose donc un petit bandeau avec un bouton explicite,
// qui fonctionne de façon identique sur les deux plateformes.
export function PushSubscribe({ utilisateurId }: { utilisateurId: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (
      !vapidKey ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return;
    }

    if (Notification.permission === "granted") {
      // Déjà autorisé (autre visite) : on ne redemande rien, on s'assure
      // juste que l'abonnement de cet appareil est bien enregistré côté serveur.
      assurerAbonnement(utilisateurId).catch(() => {});
      return;
    }
    if (Notification.permission === "denied") return;

    setVisible(true);
  }, [utilisateurId]);

  if (!visible) return null;

  async function activer() {
    setVisible(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      await assurerAbonnement(utilisateurId);
    } catch {
      // navigateur incompatible, permission refusée en cours de route, etc.
    }
  }

  return (
    <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-sm items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-[0_10px_30px_-10px_rgba(33,28,23,.35)]">
      <p className="m-0 flex-1 text-sm font-medium text-ink">
        Activer les notifications pour être alerté en temps réel ?
      </p>
      <button
        onClick={() => setVisible(false)}
        className="rounded-[8px] px-2 py-1.5 text-xs font-bold text-ink-soft"
      >
        Plus tard
      </button>
      <button
        onClick={activer}
        className="rounded-[8px] bg-orange px-3 py-1.5 text-xs font-bold text-white"
      >
        Activer
      </button>
    </div>
  );
}
