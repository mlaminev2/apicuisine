import { state } from "./state.js";
import { renderNavbar } from "./components/navbar.js";
import { renderLogin } from "./views/login.js";
import { renderRegister } from "./views/register.js";
import { renderCalendar } from "./views/calendar.js";
import { renderBase } from "./views/base.js";
import { renderShopping } from "./views/shopping.js";
import { renderTracking } from "./views/tracking.js";
import { renderSettings } from "./views/settings.js";
import { renderImport } from "./views/import.js";
import { renderRecette } from "./views/recette.js";

const root = document.getElementById("view-root");

async function route() {
  const hash = location.hash || "#/calendrier";
  renderNavbar();

  if (!state.isLoggedIn() && !hash.startsWith("#/login") && !hash.startsWith("#/inscription")) {
    location.hash = "#/login";
    return;
  }

  const [path, queryStr] = hash.slice(1).split("?");
  const params = Object.fromEntries(new URLSearchParams(queryStr || ""));

  if (hash.startsWith("#/login")) { await renderLogin(root); return; }
  if (hash.startsWith("#/inscription")) { await renderRegister(root); return; }
  if (hash.startsWith("#/calendrier")) { await renderCalendar(root); return; }
  if (hash.startsWith("#/base")) { await renderBase(root); return; }
  if (hash.startsWith("#/courses")) { await renderShopping(root, params); return; }
  if (hash.startsWith("#/suivi")) { await renderTracking(root); return; }
  if (hash.startsWith("#/recette")) { await renderRecette(root); return; }
  if (hash.startsWith("#/importer")) { await renderImport(root); return; }
  if (hash.startsWith("#/reglages")) { await renderSettings(root); return; }

  location.hash = "#/calendrier";
}

window.addEventListener("hashchange", route);
window.addEventListener("load", route);

// Offline banner
const banner = document.createElement("div");
banner.id = "offline-banner";
banner.textContent = "⚠ Hors ligne — lecture seule";
document.body.prepend(banner);
window.addEventListener("online", () => banner.classList.remove("show"));
window.addEventListener("offline", () => banner.classList.add("show"));
