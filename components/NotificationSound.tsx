"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Bip long joué en direct (Web Audio, pas de fichier son) quand une
// notification arrive pendant que l'app est ouverte — ex: nouvelle commande
// en ligne (0021_commandes_en_ligne_fn.sql). Complète le push système
// (sw.js), qui ne joue rien de personnalisé et ne se déclenche pas toujours
// si l'onglet est déjà au premier plan.
function jouerBipLong() {
  try {
    const AudioContextCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();
    const oscillateur = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillateur.type = "sine";
    oscillateur.frequency.value = 880;

    const debut = ctx.currentTime;
    const duree = 1.4;
    gain.gain.setValueAtTime(0.0001, debut);
    gain.gain.exponentialRampToValueAtTime(0.35, debut + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);

    oscillateur.connect(gain).connect(ctx.destination);
    oscillateur.start(debut);
    oscillateur.stop(debut + duree);
    oscillateur.onended = () => ctx.close();
  } catch {
    // audio indisponible (permissions navigateur, contexte non déverrouillé...) : silencieux
  }
}

export function NotificationSound({ utilisateurId }: { utilisateurId: string }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${utilisateurId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `destinataire_id=eq.${utilisateurId}`,
        },
        () => {
          jouerBipLong();
          routerRef.current.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [utilisateurId]);

  return null;
}
