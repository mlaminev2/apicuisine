import { state } from "../state.js";

// Icônes ligne (style de la maquette Bento)
const ICONS = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5L12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><text x="12" y="17" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="6" font-weight="bold" fill="currentColor" stroke="none">31</text></svg>`,
  plate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4c0 1-1 1-1 2s1 1 1 2"/><path d="M12 3c0 1-1 1-1 2s1 1 1 2"/><path d="M16 4c0 1-1 1-1 2s1 1 1 2"/><ellipse cx="12" cy="16" rx="8" ry="3"/></svg>`,
  cart: `<svg viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="185" y="55" width="142" height="55" rx="25" stroke-width="40"/><path d="M185 90 L125 220 M327 90 L387 220" stroke-width="40"/><rect x="65" y="205" width="382" height="70" rx="25" stroke-width="40"/><path d="M95 275 L135 420 Q145 455 180 455 H332 Q367 455 377 420 L417 275" stroke-width="40"/><path d="M170 320 V395 M225 320 V395 M280 320 V395 M335 320 V395" stroke-width="34"/><circle cx="125" cy="240" r="18" fill="none" stroke-width="26"/><circle cx="387" cy="240" r="18" fill="none" stroke-width="26"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4"/><path d="M12 3v11"/><path d="M7 9l5 5 5-5"/></svg>`,
};

// Navbar éditoriale à 5 onglets. « Réglages » (avec la déconnexion) est
// accessible via l'icône ⚙ en haut de l'écran d'accueil.
const TABS = [
  { hash: "#/accueil", icon: ICONS.home, label: "Accueil" },
  { hash: "#/calendrier", icon: ICONS.calendar, label: "Calendrier" },
  { hash: "#/base", icon: ICONS.plate, label: "Plats" },
  { hash: "#/importer", icon: ICONS.download, label: "Importer" },
  { hash: "#/courses", icon: ICONS.cart, label: "Courses" },
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
