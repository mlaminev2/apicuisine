const CACHE = "menus-v23";
const SHELL = ["/", "/css/styles.css", "/js/api.js", "/js/state.js", "/js/utils.js", "/js/router.js",
  "/js/sw-register.js",
  "/js/components/navbar.js", "/js/components/toast.js", "/js/components/modal.js",
  "/js/views/login.js", "/js/views/calendar.js", "/js/views/picker.js",
  "/js/views/base.js", "/js/views/shopping.js", "/js/views/tracking.js", "/js/views/settings.js",
  "/js/views/import.js", "/js/views/recette.js",
  "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, clone));
      return res;
    }))
  );
});
