// Minimal service worker — exists only to satisfy PWA installability checks.
// It intentionally caches nothing: this app is authenticated and per-user, so
// caching HTML/API responses risks leaking one account's data into another's
// view on a shared device. Every request just passes straight through.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
