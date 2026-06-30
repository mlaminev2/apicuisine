import { state } from "../state.js";

const TABS = [
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
  nav.innerHTML = "";
  const current = location.hash || "#/calendrier";
  for (const tab of TABS) {
    const btn = document.createElement("button");
    btn.className = "nav-tab" + (current.startsWith(tab.hash) ? " active" : "");
    btn.innerHTML = `<span class="icon">${tab.icon}</span><span>${tab.label}</span>`;
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
