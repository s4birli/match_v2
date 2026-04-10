/* Match Club service worker — handles offline fallback + web push.
 *
 * Versioned cache so future deploys can purge old assets cleanly.
 */
const CACHE_NAME = "match-club-v3";
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

// Push notifications: the server (web-push npm package) ships an
// encrypted JSON payload with `{ title, body, url, data }`. We render it
// directly. The url is a deep link the click handler navigates to.
//
// DEBUG: every received push is logged so we can see in the SW console
// (chrome://inspect/#service-workers → "inspect") whether the event
// actually fires when a push is sent from the server.
self.addEventListener("push", (event) => {
  console.log("[sw] push event received", {
    hasData: !!event.data,
    timestamp: new Date().toISOString(),
  });
  const data = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch (err) {
      console.warn("[sw] push payload parse failed", err);
      return {};
    }
  })();
  console.log("[sw] push payload", data);
  const title = data.title ?? "Match Club";
  const body = data.body ?? "You have a new notification.";
  const url = data.url ?? "/notifications";
  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: "/icons/icon-192.svg",
        badge: "/icons/icon-192.svg",
        data: { url, ...(data.data ?? {}) },
        tag: data.data?.kind ?? undefined,
        requireInteraction: false,
      })
      .then(() => console.log("[sw] showNotification resolved"))
      .catch((err) => console.error("[sw] showNotification failed", err)),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/notifications";
  event.waitUntil(
    (async () => {
      // If a tab is already open on the same URL, focus it; otherwise open new.
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
