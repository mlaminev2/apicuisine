// Enregistre le service worker et recharge automatiquement l'app quand une
// nouvelle version prend le contrôle — évite de rester bloqué sur une ancienne
// version en cache (fréquent sur les PWA mobiles qu'on ne ferme jamais).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    // Vérifie s'il existe une mise à jour au démarrage, puis toutes les heures.
    reg.update().catch(() => {});
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});

  // Quand le nouveau service worker (skipWaiting + clients.claim) prend le
  // contrôle, on recharge une seule fois pour charger la dernière version.
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
}
