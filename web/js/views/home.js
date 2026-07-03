import { api } from "../api.js";
import { state } from "../state.js";
import { DAYS_FR, toIsoDate, today, isoWeekOf, escapeHtml } from "../utils.js";

function _isoOf(d) {
  return toIsoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

function _mealLine(icon, label, name, muted = false) {
  return `<div class="home-meal-line${muted ? " muted" : ""}">
    <span class="home-meal-icon">${icon}</span>
    <span class="home-meal-label">${label}</span>
    <span class="home-meal-name">${escapeHtml(name)}</span>
  </div>`;
}

export async function renderHome(root) {
  const todayStr = today();
  const now = new Date(todayStr + "T00:00:00");
  const dateLabel = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  root.innerHTML = `
    <div class="page-header">
      <h1>Bonjour ${escapeHtml(state.memberName || "")} 👋</h1>
      <span class="home-date">${dateLabel}</span>
    </div>
    <div id="home-body" class="home-body">
      <div class="loader-wrap"><div class="spinner"></div></div>
    </div>`;

  // Semaine courante (lundi → dimanche) + le jour suivant pour « Demain »
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const rangeEnd = new Date(monday);
  rangeEnd.setDate(monday.getDate() + 7);
  const { year, week } = isoWeekOf(monday);

  let entries = [];
  let settings = { lunch_enabled: false, dessert_enabled: true };
  let shopping = { items: [] };
  try {
    [entries, settings, shopping] = await Promise.all([
      api.getPlan(_isoOf(monday), _isoOf(rangeEnd)),
      api.getSettings(),
      api.getShopping(year, week).catch(() => ({ items: [] })),
    ]);
  } catch {}

  const byDate = {};
  for (const e of entries) byDate[e.date] = e;

  const body = document.getElementById("home-body");
  if (!body) return;
  body.innerHTML = "";

  // ── Carte Aujourd'hui ──
  const entry = byDate[todayStr];
  const hasEvening = entry && (entry.main_dish || entry.free_text || entry.entree_dish || entry.dessert_dish || entry.extra_dishes?.length);
  const hasLunch = settings.lunch_enabled && entry && (entry.lunch_dish || entry.lunch_free_text);

  let todayHtml = "";
  if (hasLunch) {
    todayHtml += _mealLine("🌞", "Midi", entry.lunch_dish?.name || entry.lunch_free_text);
  }
  if (hasEvening) {
    if (entry.entree_dish) todayHtml += _mealLine("🥗", "Entrée", entry.entree_dish.name);
    if (entry.main_dish) todayHtml += _mealLine("🍽️", "Plat", entry.main_dish.name);
    else if (entry.free_text) todayHtml += _mealLine("🍽️", "Plat", entry.free_text);
    for (const extra of entry.extra_dishes || []) todayHtml += _mealLine("➕", "Aussi", extra.name);
    if (entry.dessert_dish) todayHtml += _mealLine("🍰", "Dessert", entry.dessert_dish.name);
    todayHtml += entry.cooked
      ? `<div class="home-cooked done">✅ Repas réalisé</div>`
      : `<div class="home-cooked">⬜ Pas encore cuisiné</div>`;
  }
  if (!todayHtml) {
    todayHtml = `<div class="home-empty">Rien de prévu aujourd'hui</div>`;
  }

  const todayCard = document.createElement("div");
  todayCard.className = "card home-card home-card-today";
  todayCard.innerHTML = `
    <div class="home-card-title">📅 Aujourd'hui</div>
    ${todayHtml}
    <button class="btn btn-primary btn-full" id="home-btn-today">
      ${hasEvening ? "Voir dans le calendrier" : "Choisir un repas"}
    </button>`;
  body.appendChild(todayCard);
  todayCard.querySelector("#home-btn-today").onclick = () => { location.hash = "#/calendrier"; };

  // ── Carte Demain ──
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tEntry = byDate[_isoOf(tomorrow)];
  const tName = tEntry?.main_dish?.name || tEntry?.free_text || null;
  const tomorrowCard = document.createElement("div");
  tomorrowCard.className = "card home-card";
  tomorrowCard.innerHTML = `
    <div class="home-card-title">🌙 Demain</div>
    ${tName ? _mealLine("🍽️", "Plat", tName) : `<div class="home-empty">Rien de prévu demain</div>`}`;
  body.appendChild(tomorrowCard);
  tomorrowCard.onclick = () => { location.hash = "#/calendrier"; };

  // ── Carte Cette semaine ──
  let planned = 0;
  let dotsHtml = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = _isoOf(d);
    const e = byDate[iso];
    const has = e && (e.main_dish || e.free_text);
    if (has) planned++;
    const cls = "home-dot" + (has ? " filled" : "") + (iso === todayStr ? " today" : "");
    dotsHtml += `<span class="${cls}" title="${DAYS_FR[i]}">${DAYS_FR[i][0]}</span>`;
  }
  const weekCard = document.createElement("div");
  weekCard.className = "card home-card";
  weekCard.innerHTML = `
    <div class="home-card-title">🗓️ Cette semaine <span class="home-badge">sem. ${week}</span></div>
    <div class="home-dots">${dotsHtml}</div>
    <div class="home-sub">${planned} jour${planned > 1 ? "s" : ""} planifié${planned > 1 ? "s" : ""} sur 7</div>`;
  body.appendChild(weekCard);
  weekCard.onclick = () => { location.hash = "#/calendrier"; };

  // ── Carte Courses ──
  const items = shopping.items || [];
  const checked = items.filter((i) => i.checked).length;
  const shopCard = document.createElement("div");
  shopCard.className = "card home-card";
  shopCard.innerHTML = `
    <div class="home-card-title">🛒 Courses <span class="home-badge">sem. ${week}</span></div>
    ${items.length
      ? `<div class="home-sub">${checked} / ${items.length} article${items.length > 1 ? "s" : ""} coché${checked > 1 ? "s" : ""}</div>
         <div class="home-progress"><div class="home-progress-fill" style="width:${Math.round((checked / items.length) * 100)}%"></div></div>`
      : `<div class="home-empty">Liste vide pour l'instant</div>`}`;
  body.appendChild(shopCard);
  shopCard.onclick = () => { location.hash = "#/courses"; };

  // ── Raccourcis ──
  const shortcuts = document.createElement("div");
  shortcuts.className = "home-shortcuts";
  for (const [icon, label, hash] of [
    ["🍽️", "Plats", "#/base"],
    ["🔗", "Importer", "#/importer"],
    ["📊", "Suivi", "#/suivi"],
    ["⚙️", "Réglages", "#/reglages"],
  ]) {
    const btn = document.createElement("button");
    btn.className = "card home-shortcut";
    btn.innerHTML = `<span class="home-shortcut-icon">${icon}</span><span>${label}</span>`;
    btn.onclick = () => { location.hash = hash; };
    shortcuts.appendChild(btn);
  }
  body.appendChild(shortcuts);
}
