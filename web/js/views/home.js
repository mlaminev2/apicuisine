import { api } from "../api.js";
import { state } from "../state.js";
import { openDishModal } from "./base.js";
import { CAT_LABELS, toIsoDate, today, isoWeekOf, escapeHtml } from "../utils.js";

const DAYS_ABBR = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];
const DEFAULT_CATS = ["pomme_de_terre", "riz", "pates", "pomme_de_terre", "riz", "autre", "africain"];

function _isoOf(d) {
  return toIsoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

// motif de remplacement quand un plat n'a pas de photo
const PH = [
  "repeating-linear-gradient(135deg,#E7D3C0 0 12px,#EAD9C8 12px 24px)",
  "repeating-linear-gradient(135deg,#EAD9C8 0 12px,#EEE1D2 12px 24px)",
  "repeating-linear-gradient(135deg,#EFDCCC 0 12px,#F1E7D8 12px 24px)",
];

export async function renderHome(root) {
  const todayStr = today();
  const now = new Date(todayStr + "T00:00:00");
  const dow = (now.getDay() + 6) % 7;
  const weekday = now.toLocaleDateString("fr-FR", { weekday: "long" });
  const dayMonth = now.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

  root.innerHTML = `
    <div class="home2">
      <div class="home2-header">
        <div>
          <div class="home2-kicker">Bonjour${state.memberName ? ", " + escapeHtml(state.memberName) : ""}</div>
          <div class="home2-date">${weekday}<br>${dayMonth}</div>
        </div>
        <button class="home2-settings" id="home2-settings" aria-label="Réglages">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="15" cy="8" r="2.6" fill="currentColor" stroke="none"/><circle cx="9" cy="16" r="2.6" fill="currentColor" stroke="none"/></svg>
        </button>
      </div>
      <div id="home2-body">
        <div class="loader-wrap"><div class="spinner"></div></div>
      </div>
    </div>`;
  document.getElementById("home2-settings").onclick = () => { location.hash = "#/reglages"; };

  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const { year, week } = isoWeekOf(monday);

  let entries = [], settings = { weekday_category_map: {}, lunch_enabled: false }, shopping = { items: [] }, dishes = [];
  try {
    [entries, settings, shopping, dishes] = await Promise.all([
      api.getPlan(_isoOf(monday), _isoOf(sunday)),
      api.getSettings(),
      api.getShopping(year, week).catch(() => ({ items: [] })),
      api.getDishes({ active: true }).catch(() => []),
    ]);
  } catch {}

  const byDate = {};
  for (const e of entries) byDate[e.date] = e;
  const catMap = settings.weekday_category_map || {};
  const catOf = (i) => catMap[String(i)] || DEFAULT_CATS[i];

  const body = document.getElementById("home2-body");
  if (!body) return;
  body.innerHTML = "";

  const entry = byDate[todayStr];
  const mainName = entry?.main_dish?.name || entry?.free_text || null;
  const thumb = entry?.main_dish?.thumbnail_url;
  const catLabel = CAT_LABELS[catOf(dow)] || "";

  // sous-titre : les composants du repas (midi, apéro, entrée, sauce, dessert)
  const parts = [];
  if (entry) {
    if (settings.lunch_enabled && (entry.lunch_dish || entry.lunch_free_text)) parts.push("🌞 Midi");
    if (entry.apero_dish) parts.push("🥂 Apéro");
    if (entry.entree_dish) parts.push("🥗 Entrée");
    if (entry.sauce_dish) parts.push("🥣 Sauce");
    if (entry.dessert_dish) parts.push("🍰 Dessert");
  }
  const heroMeta = entry?.cooked ? "✅ Repas réalisé" : (parts.length ? parts.join(" · ") : "Plat du jour");

  // ── Carte héro ──
  const hero = document.createElement("div");
  hero.className = "home2-hero";
  if (mainName) {
    hero.innerHTML = `
      <div class="home2-hero-photo" style="${thumb ? `background-image:url('${escapeHtml(thumb)}')` : `background:${PH[0]}`}">
        <div class="home2-hero-grad"></div>
        <div class="home2-hero-body">
          <span class="home2-hero-pill">${escapeHtml(DAYS_ABBR[dow])}${catLabel ? " · " + escapeHtml(catLabel) : ""}</span>
          <div class="home2-hero-title">${escapeHtml(mainName)}</div>
          <div class="home2-hero-meta">${escapeHtml(heroMeta)}</div>
        </div>
      </div>
      <div class="home2-hero-actions">
        <button class="home2-hero-cta" id="hero-view">Voir le plat</button>
        <button class="home2-hero-swap" id="hero-swap" aria-label="Changer le plat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h12l-3-3M20 16H8l3 3"/></svg>
        </button>
      </div>`;
  } else {
    hero.innerHTML = `
      <div class="home2-hero-photo empty" style="background:${PH[0]}">
        <div class="home2-hero-body">
          <span class="home2-hero-pill">${escapeHtml(DAYS_ABBR[dow])}${catLabel ? " · " + escapeHtml(catLabel) : ""}</span>
          <div class="home2-hero-title">Rien de prévu aujourd'hui</div>
        </div>
      </div>
      <div class="home2-hero-actions">
        <button class="home2-hero-cta" id="hero-view">Choisir un repas</button>
      </div>`;
  }
  body.appendChild(hero);
  hero.querySelector("#hero-view").onclick = () => {
    // Ouvre directement la recette du plat du soir ; sinon renvoie au calendrier
    if (entry?.main_dish) openDishModal(entry.main_dish);
    else location.hash = "#/calendrier";
  };
  const swap = hero.querySelector("#hero-swap");
  if (swap) swap.onclick = () => { location.hash = "#/calendrier"; };

  // ── Cette semaine (carrousel horizontal) ──
  const sec = document.createElement("div");
  sec.className = "home2-section-head";
  sec.innerHTML = `
    <div class="home2-section-title">Cette semaine</div>
    <button class="home2-section-link" id="week-link">Calendrier
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
    </button>`;
  body.appendChild(sec);
  sec.querySelector("#week-link").onclick = () => { location.hash = "#/calendrier"; };

  const scroll = document.createElement("div");
  scroll.className = "week-scroll";
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = _isoOf(d);
    const e = byDate[iso];
    const name = e?.main_dish?.name || e?.free_text || "—";
    const th = e?.main_dish?.thumbnail_url;
    const isToday = iso === todayStr;
    const card = document.createElement("button");
    card.className = "week-daycard" + (isToday ? " today" : "");
    card.innerHTML = `
      <div class="week-daycard-head">
        <span class="week-daycard-day">${DAYS_ABBR[i]}</span>
        ${isToday ? `<span class="week-daycard-auj">AUJ.</span>` : `<span class="week-daycard-date">${d.getDate()}</span>`}
      </div>
      <div class="week-daycard-cat">${escapeHtml(CAT_LABELS[catOf(i)] || "")}</div>
      <div class="week-daycard-thumb" style="${th ? `background-image:url('${escapeHtml(th)}')` : `background:${PH[i % 3]}`}"></div>
      <div class="week-daycard-name">${escapeHtml(name)}</div>`;
    card.onclick = () => { location.hash = "#/calendrier"; };
    scroll.appendChild(card);
  }
  body.appendChild(scroll);

  // ── Remplir la semaine ──
  const fill = document.createElement("button");
  fill.className = "home2-fill";
  fill.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9z"/></svg>
    <div class="home2-fill-txt"><div class="home2-fill-title">Remplir la semaine</div><div class="home2-fill-sub">Un menu équilibré généré automatiquement</div></div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>`;
  fill.onclick = () => { location.hash = "#/remplir"; };
  body.appendChild(fill);

  // ── Duo : Courses + Importer ──
  const items = shopping.items || [];
  const remaining = items.filter((i) => !i.checked).length;
  const duo = document.createElement("div");
  duo.className = "home2-duo";

  const shopTile = document.createElement("button");
  shopTile.className = "home2-tile";
  shopTile.innerHTML = `
    <div class="home2-tile-icon">
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h2l2.2 10.5h9.2L20 8H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="17.5" cy="19" r="1.3"/></svg>
      ${remaining ? `<span class="home2-tile-badge">${remaining}</span>` : ""}
    </div>
    <div class="home2-tile-name">Courses</div><div class="home2-tile-sub">${remaining ? "de la semaine" : "liste à jour"}</div>`;
  shopTile.onclick = () => { location.hash = "#/courses"; };

  const importTile = document.createElement("button");
  importTile.className = "home2-tile";
  importTile.innerHTML = `
    <div class="home2-tile-icon">
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v9m0 0l-3.2-3.2M12 13l3.2-3.2"/><path d="M5 15v3a1.6 1.6 0 0 0 1.6 1.6h10.8A1.6 1.6 0 0 0 19 18v-3"/></svg>
    </div>
    <div class="home2-tile-name">Importer</div><div class="home2-tile-sub">un plat</div>`;
  importTile.onclick = () => { location.hash = "#/importer"; };

  duo.append(shopTile, importTile);
  body.appendChild(duo);

  // ── Mes plats ──
  const thumbs = dishes.filter((d) => d.thumbnail_url).slice(0, 3);
  let stackHtml = "";
  for (let i = 0; i < 3; i++) {
    const t = thumbs[i];
    stackHtml += t
      ? `<div class="home2-stack-thumb" style="background-image:url('${escapeHtml(t.thumbnail_url)}')"></div>`
      : `<div class="home2-stack-thumb" style="background:${PH[i % 3]}"></div>`;
  }
  const plats = document.createElement("button");
  plats.className = "home2-plats";
  plats.innerHTML = `
    <div class="home2-stack">${stackHtml}</div>
    <div class="home2-plats-txt"><div class="home2-plats-title">Mes plats</div><div class="home2-plats-sub">${dishes.length} recette${dishes.length > 1 ? "s" : ""} enregistrée${dishes.length > 1 ? "s" : ""}</div></div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4b3a3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>`;
  plats.onclick = () => { location.hash = "#/base"; };
  body.appendChild(plats);
}
