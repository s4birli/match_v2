/* Match Club service worker — handles offline fallback + web push.
 *
 * Versioned cache so future deploys can purge old assets cleanly.
 */
const CACHE_NAME = "match-club-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.svg"]);
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      self.clients.claim();
    })(),
  );
});

// Offline fallback: serve the cached /offline page when a navigation request
// fails. Other requests pass through.
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(event.request);
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(OFFLINE_URL);
          return cached ?? new Response("Offline", { status: 503 });
        }
      })(),
    );
  }
});

// Push notifications: the server sends an empty body (we don't ship the full
// encrypted-payload protocol locally), so we show a generic banner. The SW
// could fetch /api/me/notifications to get the latest unread item.
self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();
  const title = data.title ?? "Match Club";
  const body = data.body ?? "You have a new notification.";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.svg",
      badge: "/icons/icon-192.svg",
      data: data.data ?? {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/notifications"));
});
