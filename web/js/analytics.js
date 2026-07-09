// Suivi d'audience (Google Analytics 4 + Pixel Meta) avec consentement RGPD.
// Aucun traceur n'est chargé tant que l'utilisateur n'a pas accepté, et rien
// ne se charge si les IDs ne sont pas configurés côté serveur.
import { api } from "./api.js";

const CONSENT_KEY = "cookie_consent";   // "granted" | "denied" | absent
let cfg = null;        // { ga_measurement_id, meta_pixel_id }
let loaded = false;

function consent() { return localStorage.getItem(CONSENT_KEY); }

// Pas de pub pour les comptes premium payés / super admin. Un visiteur non
// connecté voit les pubs (on ne peut pas savoir, et c'est le comportement voulu).
async function _adsHidden() {
  if (!localStorage.getItem("token")) return false;
  try { return !!(await api.getAccess()).hide_ads; } catch { return false; }
}

function _loadGA(id) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", id, { anonymize_ip: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
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

function _loadGTM(id) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtm.js?id=" + encodeURIComponent(id);
  document.head.appendChild(s);
}

function _activate() {
  if (loaded || !cfg) return;
  // Google Tag Manager gère GA4 + Pixel depuis son conteneur → prioritaire.
  if (cfg.gtm_container_id) {
    _loadGTM(cfg.gtm_container_id);
  } else {
    if (cfg.ga_measurement_id) _loadGA(cfg.ga_measurement_id);
    if (cfg.meta_pixel_id) _loadPixel(cfg.meta_pixel_id);
  }
  loaded = true;
}

/** Enregistre une vue de page (routeur SPA à base de hash). */
export function trackPageView(path) {
  if (!loaded) return;
  // GTM : on pousse un événement de navigation SPA dans le dataLayer
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

function _renderBanner() {
  if (document.getElementById("cookie-banner")) return;
  const el = document.createElement("div");
  el.id = "cookie-banner";
  el.className = "cookie-banner";
  el.innerHTML = `
    <div class="cookie-txt">
      🍪 Nous utilisons des cookies de mesure d'audience (Google Analytics) et
      publicitaires (Meta) pour améliorer l'application. Vous pouvez accepter ou refuser.
    </div>
    <div class="cookie-actions">
      <button class="cookie-btn cookie-refuse" id="cookie-refuse">Refuser</button>
      <button class="cookie-btn cookie-accept" id="cookie-accept">Accepter</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelector("#cookie-accept").onclick = () => {
    localStorage.setItem(CONSENT_KEY, "granted");
    el.remove();
    _activate();
    trackPageView(location.hash || "#/");
  };
  el.querySelector("#cookie-refuse").onclick = () => {
    localStorage.setItem(CONSENT_KEY, "denied");
    el.remove();
  };
}

/** À appeler au démarrage. Charge la config publique, puis soit active les
 * traceurs (consentement déjà donné), soit affiche la bannière. */
export async function initAnalytics() {
  try { cfg = await api.publicConfig(); } catch { return; }

  // AdSense est chargé statiquement dans le <head> (requis pour la validation
  // Google). Les comptes PREMIUM (payés) et le super admin ne voient aucune
  // pub : on masque les emplacements via la classe « no-ads ». Les visiteurs et
  // comptes gratuits voient les pubs → diffusion/validation OK.
  if (cfg.adsense_client_id && (await _adsHidden())) {
    document.documentElement.classList.add("no-ads");
  }

  // GA4 / Pixel / GTM : soumis à MA bannière de consentement.
  const hasTracker = cfg && (cfg.gtm_container_id || cfg.ga_measurement_id || cfg.meta_pixel_id);
  if (!hasTracker) return;
  if (consent() === "granted") { _activate(); trackPageView(location.hash || "#/"); }
  else if (consent() !== "denied") { _renderBanner(); }
}
