"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Le SW met en cache-first les chunks /_next/static/ (voir public/sw.js)
    // — en dev, Next.js réutilise les mêmes chemins de chunks à chaque
    // rebuild (pas de hash de contenu), donc le SW sert indéfiniment un
    // bundle périmé après un redémarrage du serveur, provoquant des
    // erreurs d'hydratation qui n'ont rien à voir avec le code changé.
    // Inutile en dev de toute façon (pas de usage hors-ligne à tester) :
    // on désenregistre activement tout SW déjà actif d'une session
    // précédente plutôt que de se contenter de ne plus en enregistrer.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) reg.unregister();
      });
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
