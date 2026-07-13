import { api } from "./api.js";

// Conversion de la clé publique VAPID (base64url) en Uint8Array pour l'API PushManager.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Le push web nécessite : un service worker, l'API PushManager et l'API Notification.
export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// Active les notifications : demande la permission, s'abonne, envoie au serveur.
// Renvoie { ok:true } ou lève une erreur avec un message lisible.
export async function enablePush() {
  if (!pushSupported()) {
    throw new Error("Votre navigateur ne gère pas les notifications. Sur iPhone, ajoutez d'abord l'app à l'écran d'accueil.");
  }
  const cfg = await api.pushConfig();
  if (!cfg.enabled || !cfg.public_key) throw new Error("Notifications indisponibles pour le moment.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Autorisation refusée. Activez les notifications dans les réglages de votre navigateur.");
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.public_key),
    });
  }
  await api.pushSubscribe(sub.toJSON());
  return { ok: true };
}

// Désactive les notifications : désabonne le navigateur et prévient le serveur.
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch (_) { /* on désactive quand même côté serveur */ }
  await api.pushUnsubscribe();
}
