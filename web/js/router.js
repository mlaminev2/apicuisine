import { state } from "./state.js";
import { api } from "./api.js";
import { renderNavbar } from "./components/navbar.js";
import { renderLogin } from "./views/login.js";
import { renderRegister } from "./views/register.js";
import { renderHome } from "./views/home.js";
import { renderRemplir } from "./views/remplir.js";
import { renderAdmin } from "./views/admin.js";
import { renderForgot, renderReset } from "./views/password.js";
import { initAnalytics, trackPageView } from "./analytics.js";
import { renderCalendar } from "./views/calendar.js";
import { renderBase } from "./views/base.js";
import { renderShopping } from "./views/shopping.js";
import { renderTracking } from "./views/tracking.js";
import { renderSettings } from "./views/settings.js";
import { renderImport } from "./views/import.js";
import { renderPremium } from "./views/premium.js";

const root = document.getElementById("view-root");

let lastPath = null;

function animateViewEntry(path) {
  // Relance l'animation d'entrée uniquement quand on change de vue
  if (path === lastPath) return;
  lastPath = path;
  try { trackPageView("#" + path); } catch {}
  root.scrollTop = 0;
  root.classList.remove("view-enter");
  void root.offsetWidth; // force un reflow pour redémarrer l'animation
  root.classList.add("view-enter");
}

async function route() {
  const hash = location.hash || (state.isLoggedIn() ? "#/accueil" : "#/login");
  renderNavbar();

  if (!state.isLoggedIn() && !hash.startsWith("#/login") && !hash.startsWith("#/inscription") && !hash.startsWith("#/oauth-callback") && !hash.startsWith("#/motdepasse-oublie") && !hash.startsWith("#/reinitialisation")) {
    location.hash = "#/login";
    return;
  }

  const [path, queryStr] = hash.slice(1).split("?");
  const params = Object.fromEntries(new URLSearchParams(queryStr || ""));
  animateViewEntry(path);

  if (hash.startsWith("#/login")) { await renderLogin(root); return; }
  if (hash.startsWith("#/inscription")) { await renderRegister(root); return; }
  if (hash.startsWith("#/motdepasse-oublie")) { renderForgot(root); return; }
  if (hash.startsWith("#/reinitialisation")) { renderReset(root, params); return; }
  if (hash.startsWith("#/oauth-callback")) {
    if (params.code) {
      try {
        const res = await api.oauthExchange(params.code);
        state.setAuth(res.token, res.household_id, res.member_id, res.member_name, res.is_owner);
        // replace() : l'URL contenant le code ne reste pas dans l'historique
        location.replace("#/accueil");
      } catch {
        location.replace("#/login?oauth_error=exchange_failed");
      }
    } else {
      location.replace("#/login" + (params.oauth_error ? "?oauth_error=" + params.oauth_error : ""));
    }
    return;
  }
  if (hash.startsWith("#/accueil")) { await renderHome(root); return; }
  if (hash.startsWith("#/remplir")) { await renderRemplir(root); return; }
  if (hash.startsWith("#/admin")) { await renderAdmin(root); return; }
  if (hash.startsWith("#/calendrier")) { await renderCalendar(root); return; }
  if (hash.startsWith("#/base")) { await renderBase(root); return; }
  if (hash.startsWith("#/courses")) { await renderShopping(root, params); return; }
  if (hash.startsWith("#/suivi")) { await renderTracking(root); return; }
  if (hash.startsWith("#/recette")) { location.hash = "#/base"; return; }
  if (hash.startsWith("#/importer")) { await renderImport(root); return; }
  if (hash.startsWith("#/premium")) { await renderPremium(root, params); return; }
  if (hash.startsWith("#/reglages")) { await renderSettings(root); return; }

  location.hash = "#/accueil";
}

window.addEventListener("hashchange", route);
window.addEventListener("load", route);
window.addEventListener("load", () => { initAnalytics(); });

// Offline banner
const banner = document.createElement("div");
banner.id = "offline-banner";
banner.textContent = "⚠ Hors ligne — lecture seule";
document.body.prepend(banner);
window.addEventListener("online", () => banner.classList.remove("show"));
window.addEventListener("offline", () => banner.classList.add("show"));
