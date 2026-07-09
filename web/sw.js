const CACHE = "menus-v67";
const SHELL = ["/", "/css/styles.css", "/js/api.js", "/js/state.js", "/js/utils.js", "/js/router.js",
  "/js/sw-register.js", "/js/analytics.js", "/js/consent-init.js",
  "/js/components/navbar.js", "/js/components/toast.js", "/js/components/modal.js",
  "/js/views/login.js", "/js/views/register.js", "/js/views/password.js", "/js/views/home.js", "/js/views/remplir.js", "/js/views/admin.js", "/js/views/calendar.js", "/js/views/picker.js",
  "/js/views/base.js", "/js/views/shopping.js", "/js/views/tracking.js", "/js/views/settings.js",
  "/js/views/import.js", "/js/views/recette.js", "/js/views/premium.js",
  "/fonts/bricolage-grotesque-latin.woff2", "/fonts/hanken-grotesk-latin.woff2",
  "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  // Cache résilient : un fichier manquant n'empêche pas l'installation.
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Le code de l'app (HTML, JS, CSS) est servi RÉSEAU D'ABORD : on récupère
// toujours la dernière version en ligne, et le cache ne sert que de repli
// hors-ligne. Ça évite les mélanges de versions de modules (écran blanc).
// Les assets immuables (polices, icônes, images) restent en cache d'abord.
function isAppShell(req, url) {
  if (req.mode === "navigate") return true;
  return /\.(?:js|css)$/.test(url.pathname);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // pas d'interception cross-origin
  if (url.pathname.startsWith("/api/")) return;       // jamais l'API

  if (isAppShell(req, url)) {
    // réseau d'abord → repli cache (offline). La navigation retombe sur "/".
    e.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("/")))
    );
    return;
  }

  // Assets : cache d'abord, complété par le réseau au besoin.
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(req, clone));
      return res;
    }))
  );
});
