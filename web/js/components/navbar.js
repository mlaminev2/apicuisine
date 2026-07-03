import { state } from "../state.js";

const TABS = [
  { hash: "#/accueil", icon: "🏠", label: "Accueil" },
  { hash: "#/calendrier", icon: "📅", label: "Calendrier" },
  { hash: "#/base", icon: "🍽️", label: "Plats" },
  { hash: "#/courses", icon: "🛒", label: "Courses" },
  { hash: "#/importer", icon: "🔗", label: "Importer" },
  { hash: "#/reglages", icon: "⚙️", label: "Réglages" },
];

export function renderNavbar() {
  const nav = document.getElementById("navbar");
  if (!state.isLoggedIn()) { nav.classList.add("hidden"); return; }
  nav.classList.remove("hidden");
  nav.setAttribute("role", "navigation");
  nav.setAttribute("aria-label", "Navigation principale");
  nav.innerHTML = "";
  const current = location.hash || "#/accueil";
  for (const tab of TABS) {
    const btn = document.createElement("button");
    const active = current.startsWith(tab.hash);
    btn.className = "nav-tab" + (active ? " active" : "");
    btn.setAttribute("aria-label", tab.label);
    if (active) btn.setAttribute("aria-current", "page");
    btn.innerHTML = `<span class="icon" aria-hidden="true">${tab.icon}</span><span>${tab.label}</span>`;
    btn.onclick = () => { location.hash = tab.hash; };
    nav.appendChild(btn);
  }

  const logoutBtn = document.createElement("button");
  logoutBtn.className = "nav-tab nav-logout";
  logoutBtn.title = "Se déconnecter";
  logoutBtn.innerHTML = `<span class="icon">🚪</span><span>Quitter</span>`;
  logoutBtn.onclick = () => { state.clearAuth(); location.hash = "#/login"; };
  nav.appendChild(logoutBtn);
}
