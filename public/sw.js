const CACHE_NAME = "sari-food-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL, "/icon.svg"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// Stratégie volontairement minimale : on ne met en cache QUE les fichiers
// statiques immuables (JS/CSS hashés par Next.js, icônes) pour accélérer les
// rechargements. Les pages (commandes, stock, caisse...) ne sont jamais mises
// en cache car elles reflètent l'état live de la base — les servir depuis le
// cache pourrait afficher un stock ou une commande périmés. En cas de perte
// réseau sur une navigation, on affiche une page hors-ligne plutôt que
// l'erreur par défaut du navigateur.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  const estAssetStatique =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon") ||
    url.pathname === "/sari-logo.png";

  if (estAssetStatique) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      }),
    );
  }
});

// Notifications push réelles (approvisionnement, commandes cuisine par pôle,
// commandes en ligne...) envoyées par /api/push, relayé par le trigger SQL
// trg_relayer_push_notification (0022_push_notifications.sql) à chaque ligne
// insérée dans `notifications`.
self.addEventListener("push", (event) => {
  let data = { titre: "Sari Food", message: "Nouvelle notification", lien: "/" };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.message = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.titre || "Sari Food", {
      body: data.message,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { lien: data.lien || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const lien = event.notification.data?.lien || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(lien) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(lien);
    }),
  );
});
