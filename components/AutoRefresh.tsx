"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Filet de sécurité en complément du refresh piloté par les notifications
// (NotificationSound) : celui-ci dépend qu'une notification soit bien
// générée pour l'évènement en question, ce qui s'est déjà révélé fragile
// (RLS, régressions de trigger...). Ici on revalide simplement les données
// de la page toutes les 3s tant que l'onglet est au premier plan, pour que
// l'écran affiche toujours l'état réel sans action de l'utilisateur, même si
// un évènement futur oublie de notifier.
const INTERVALLE_MS = 3000;

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function demarrer() {
      if (intervalId !== null) return;
      intervalId = setInterval(() => router.refresh(), INTERVALLE_MS);
    }

    function arreter() {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    }

    function gererVisibilite() {
      if (document.visibilityState === "visible") {
        demarrer();
      } else {
        arreter();
      }
    }

    gererVisibilite();
    document.addEventListener("visibilitychange", gererVisibilite);

    return () => {
      document.removeEventListener("visibilitychange", gererVisibilite);
      arreter();
    };
  }, [router]);

  return null;
}
