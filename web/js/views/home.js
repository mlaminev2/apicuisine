import { api } from "../api.js";
import { state } from "../state.js";
import { toIsoDate, today, isoWeekOf, escapeHtml } from "../utils.js";

const DAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
const DAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function _isoOf(d) {
  return toIsoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

export async function renderHome(root) {
  const todayStr = today();
  const now = new Date(todayStr + "T00:00:00");
  const dateLabel = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const dow = (now.getDay() + 6) % 7;

  root.innerHTML = `
    <div class="bento-head">
      <div>
        <div class="bento-kicker">Bonjour${state.memberName ? ", " + escapeHtml(state.memberName) : ""}</div>
        <div class="bento-title">${dateLabel}</div>
      </div>
      <button class="bento-settings" id="bento-settings" aria-label="Réglages">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="15" cy="8" r="2.6" fill="currentColor" stroke="none"/><circle cx="9" cy="16" r="2.6" fill="currentColor" stroke="none"/></svg>
      </button>
    </div>
    <div id="bento-grid" class="bento-grid">
      <div class="loader-wrap" style="grid-column:span 2"><div class="spinner"></div></div>
    </div>`;

  document.getElementById("bento-settings").onclick = () => { location.hash = "#/reglages"; };

  // Semaine courante (lundi → dimanche)
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const { year, week } = isoWeekOf(monday);

  let entries = [];
  let settings = { lunch_enabled: false };
  let shopping = { items: [] };
  let dishes = [];
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

  const grid = document.getElementById("bento-grid");
  if (!grid) return;
  grid.innerHTML = "";

  // ── Héro : le repas d'aujourd'hui ──
  const entry = byDate[todayStr];
  const mainName = entry?.main_dish?.name || entry?.free_text || null;
  const hero = document.createElement("div");
  if (mainName) {
    const thumb = entry?.main_dish?.thumbnail_url;
    const subParts = [];
    if (settings.lunch_enabled && (entry.lunch_dish || entry.lunch_free_text)) {
      subParts.push("🌞 " + (entry.lunch_dish?.name || entry.lunch_free_text));
    }
    if (entry.apero_dish) subParts.push("🥂 " + entry.apero_dish.name);
    if (entry.entree_dish) subParts.push("🥗 " + entry.entree_dish.name);
    if (entry.sauce_dish) subParts.push("🥣 " + entry.sauce_dish.name);
    for (const x of entry.extra_dishes || []) subParts.push("+ " + x.name);
    if (entry.dessert_dish) subParts.push("🍰 " + entry.dessert_dish.name);
    if (entry.cooked) subParts.push("✅ réalisé");
    hero.className = "bento-hero";
    hero.innerHTML = `
      ${thumb ? `<img class="bento-hero-img" src="${escapeHtml(thumb)}" alt="">` : ""}
      <div class="bento-hero-grad"></div>
      <div class="bento-hero-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></div>
      <div class="bento-hero-body">
        <span class="bento-pill">Aujourd'hui · ${DAY_SHORT[dow]}</span>
        <div class="bento-hero-title">${escapeHtml(mainName)}</div>
        ${subParts.length ? `<div class="bento-hero-sub">${escapeHtml(subParts.join(" · "))}</div>` : ""}
      </div>`;
  } else {
    hero.className = "bento-hero empty";
    hero.innerHTML = `
      <div class="bento-hero-empty-body">
        <span class="bento-pill">Aujourd'hui · ${DAY_SHORT[dow]}</span>
        <div style="font-weight:700;font-size:15px;">Rien de prévu aujourd'hui</div>
        <span class="bento-hero-cta">Choisir un repas</span>
      </div>`;
  }
  hero.onclick = () => { location.hash = "#/calendrier"; };
  grid.appendChild(hero);

  // ── Courses ──
  const items = shopping.items || [];
  const remaining = items.filter((i) => !i.checked).length;
  const shopCard = document.createElement("button");
  shopCard.className = "bento-card tinted";
  shopCard.innerHTML = `
    <div class="bento-card-top">
      <div class="bento-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h2l2.2 10.5h9.2L20 8H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="17.5" cy="19" r="1.3"/></svg></div>
      ${remaining ? `<span class="bento-count">${remaining}</span>` : ""}
    </div>
    <div><div class="bento-card-name">Courses</div><div class="bento-card-sub">${remaining ? "articles à acheter" : "liste à jour"}</div></div>`;
  shopCard.onclick = () => { location.hash = "#/courses"; };
  grid.appendChild(shopCard);

  // ── Remplir la semaine (IA) ──
  const fillCard = document.createElement("button");
  fillCard.className = "bento-card solid";
  fillCard.innerHTML = `
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9z"/></svg>
    <div><div class="bento-card-name">Remplir</div><div class="bento-card-sub">la semaine · auto</div></div>`;
  fillCard.onclick = () => { location.hash = "#/remplir"; };
  grid.appendChild(fillCard);

  // ── Cette semaine ──
  const weekCard = document.createElement("div");
  weekCard.className = "bento-card span2";
  let daysHtml = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = _isoOf(d);
    const e = byDate[iso];
    const planned = e && (e.main_dish || e.free_text);
    const cls = iso === todayStr ? "today" : planned ? "filled" : (iso > todayStr ? "future" : "");
    daysHtml += `<div class="bento-day ${cls}"><span class="bento-day-label">${DAY_LETTERS[i]}</span><div class="bento-day-num">${d.getDate()}</div></div>`;
  }
  weekCard.innerHTML = `
    <div class="bento-week-head">
      <span class="bento-week-label">Cette semaine</span>
      <span class="bento-week-link">Calendrier ›</span>
    </div>
    <div class="bento-days">${daysHtml}</div>`;
  weekCard.style.cursor = "pointer";
  weekCard.onclick = () => { location.hash = "#/calendrier"; };
  grid.appendChild(weekCard);

  // ── Mes plats ──
  const thumbs = dishes.filter((d) => d.thumbnail_url).slice(0, 3);
  let stackHtml = "";
  for (let i = 0; i < 3; i++) {
    const t = thumbs[i];
    stackHtml += t
      ? `<img class="stack-thumb" src="${escapeHtml(t.thumbnail_url)}" alt="">`
      : `<div class="stack-thumb"></div>`;
  }
  const platsCard = document.createElement("button");
  platsCard.className = "bento-card";
  platsCard.innerHTML = `
    <div class="bento-stack">${stackHtml}</div>
    <div><div class="bento-card-name">Mes plats</div><div class="bento-card-sub">${dishes.length} recette${dishes.length > 1 ? "s" : ""}</div></div>`;
  platsCard.onclick = () => { location.hash = "#/base"; };
  grid.appendChild(platsCard);

  // ── Importer ──
  const importCard = document.createElement("button");
  importCard.className = "bento-card";
  importCard.innerHTML = `
    <div class="bento-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v9m0 0l-3.2-3.2M12 13l3.2-3.2"/><path d="M5 15v3a1.6 1.6 0 0 0 1.6 1.6h10.8A1.6 1.6 0 0 0 19 18v-3"/></svg></div>
    <div><div class="bento-card-name">Importer</div><div class="bento-card-sub">un plat</div></div>`;
  importCard.onclick = () => { location.hash = "#/importer"; };
  grid.appendChild(importCard);
}
