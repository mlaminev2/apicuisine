// Suivi d'audience (GA4 / GTM / Pixel) et publicités AdSense.
//
// Le consentement RGPD est géré par le message de Google (le CMP d'AdSense),
// couplé au « Consent Mode » : le niveau par défaut « refusé » est posé très tôt
// dans consent-init.js, puis mis à jour par le choix du visiteur dans le CMP.
// Il n'y a donc plus de bannière maison — une seule bannière (celle de Google)
// s'affiche. AdSense se charge via le tag statique du <head>.
import { api } from "./api.js";

let cfg = null;
let loaded = false;

// Pas de pub pour les comptes premium payés / super admin. Un visiteur non
// connecté voit les pubs (comportement voulu).
async function _adsHidden() {
  if (!localStorage.getItem("token")) return false;
  try { return !!(await api.getAccess()).hide_ads; } catch { return false; }
}

function _loadGA(id) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  // Le Consent Mode (default denied) est déjà initialisé dans consent-init.js.
  window.gtag("config", id, { anonymize_ip: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
  document.head.appendChild(s);
}

function _loadGTM(id) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtm.js?id=" + encodeURIComponent(id);
  document.head.appendChild(s);
}

function _loadPixel(id) {
  /* eslint-disable */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  window.fbq("init", id);
  window.fbq("track", "PageView");
}

/** Enregistre une vue de page (routeur SPA à base de hash). */
export function trackPageView(path) {
  if (!loaded || !cfg) return;
  if (cfg.gtm_container_id && window.dataLayer) {
    window.dataLayer.push({ event: "spa_page_view", page_path: path, page_location: location.href });
  }
  if (window.gtag && cfg.ga_measurement_id) {
    window.gtag("event", "page_view", { page_path: path, page_location: location.href });
  }
  if (window.fbq && cfg.meta_pixel_id) {
    window.fbq("track", "PageView");
  }
}

/** À appeler au démarrage. Charge les traceurs ; le consentement est piloté par
 *  le CMP de Google (Consent Mode). Rien ne se charge si aucun ID n'est configuré. */
export async function initAnalytics() {
  try { cfg = await api.publicConfig(); } catch { return; }

  // Pas de pub pour les comptes PREMIUM (payés) et le super admin : on masque
  // les emplacements via la classe « no-ads ».
  if (cfg.adsense_client_id && (await _adsHidden())) {
    document.documentElement.classList.add("no-ads");
  }

  // Traceurs : GTM prioritaire (gère GA4 + Pixel depuis son conteneur), sinon
  // GA4 et/ou Pixel en direct. Tous chargés en Consent Mode (default denied).
  if (cfg.gtm_container_id) {
    _loadGTM(cfg.gtm_container_id);
  } else {
    if (cfg.ga_measurement_id) _loadGA(cfg.ga_measurement_id);
    if (cfg.meta_pixel_id) _loadPixel(cfg.meta_pixel_id);
  }

  const hasTracker = cfg.gtm_container_id || cfg.ga_measurement_id || cfg.meta_pixel_id;
  if (hasTracker) {
    loaded = true;
    trackPageView(location.hash || "#/");
  }
}
