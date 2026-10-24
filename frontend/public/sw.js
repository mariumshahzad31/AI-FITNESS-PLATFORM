const CACHE_NAME = "ai-fitness-shell-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/favicon.svg", "/manifest.webmanifest"];
const APP_ROUTES = [
  "/", "/login", "/register", "/onboarding", "/dashboard",
  "/dashboard/workout", "/dashboard/form-analyzer", "/dashboard/nutrition",
  "/dashboard/progress", "/dashboard/coach", "/dashboard/nearby", "/dashboard/profile",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(async (cache) => {
    await cache.addAll(PRECACHE_URLS);
    await Promise.all(APP_ROUTES.map(async (route) => {
      try {
        await cache.add(route);
      } catch {
        // A page can still be cached when visited if it is unavailable at install time.
      }
    }));
  }));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      }).catch(async () => (await caches.match(request)) || (await caches.match(OFFLINE_URL)))
    );
    return;
  }

  if (url.searchParams.has("_rsc")) {
    const cacheKey = new Request(`${url.origin}${url.pathname}?offline-rsc`);
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy)));
        }
        return response;
      }).catch(async () => (await caches.match(cacheKey)) || Response.error())
    );
    return;
  }

  const isAppAsset = url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/mediapipe/") ||
    ["script", "style", "font", "image", "worker"].includes(request.destination);
  if (!isAppAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      });
    })
  );
});
