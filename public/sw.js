/* Karagkounis CRM — PWA: precache shell; API = network; document navigation = network → offline */
const CACHE = "kk-crm-v1";
const PRECACHE = ["/offline.html", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch((err) => console.error("[sw] precache", err))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) {
          await caches.delete(key);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "Content-Type": "application/json" } }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((r) => r)
        .catch(() =>
          caches
            .match("/offline.html")
            .then(
              (c) => c || new Response("<!DOCTYPE html><html><head><meta charset='utf-8'/><title>Offline</title></head><body>Offline</body></html>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }),
            ),
        ),
    );
  }
});
