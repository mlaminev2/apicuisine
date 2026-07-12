import { state } from "../state.js";

// Icônes ligne (style de la maquette Bento)
const ICONS = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5L12 4l8 6.5V19a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19z"/><path d="M9.5 20.5v-6h5v6"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/></svg>`,
  plate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.3"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h2l2.2 10.5h9.2L20 8H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="17.5" cy="19" r="1.3"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v9m0 0l-3.2-3.2M12 13l3.2-3.2"/><path d="M5 15v3a1.6 1.6 0 0 0 1.6 1.6h10.8A1.6 1.6 0 0 0 19 18v-3"/></svg>`,
  sliders: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="15" cy="8" r="2.6" fill="currentColor" stroke="none"/><circle cx="9" cy="16" r="2.6" fill="currentColor" stroke="none"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20H6a1.6 1.6 0 0 1-1.6-1.6V5.6A1.6 1.6 0 0 1 6 4h3"/><path d="M15 16l4-4-4-4M19 12H9"/></svg>`,
};

// Navbar éditoriale à 5 onglets (comme la maquette). « Importer » reste
// accessible depuis l'accueil, « Se déconnecter » depuis les Réglages.
const TABS = [
  { hash: "#/accueil", icon: ICONS.home, label: "Accueil" },
  { hash: "#/calendrier", icon: ICONS.calendar, label: "Calendrier" },
  { hash: "#/base", icon: ICONS.plate, label: "Plats" },
  { hash: "#/courses", icon: ICONS.cart, label: "Courses" },
  { hash: "#/reglages", icon: ICONS.sliders, label: "Réglages" },
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

}
