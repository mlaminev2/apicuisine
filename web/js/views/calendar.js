import { api } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../components/toast.js";
import { renderPicker, renderLunchPicker } from "./picker.js";
import { DAYS_FR, MONTHS_FR, CAT_LABELS, monthGrid, toIsoDate, today, isoWeekOf, mergeShoppingItems, escapeHtml } from "../utils.js";

const DEFAULT_CATS = ["pomme_de_terre","riz","pates","pomme_de_terre","riz","autre","africain"];

let currentYear, currentMonth;                              // vue mois
let currentMonday;                                          // vue semaine : ISO du lundi
let viewMode = localStorage.getItem("calViewMode") === "week" ? "week" : "month";

export async function renderCalendar(root) {
  const t = today();
  const now = new Date(t);
  if (!currentYear) { currentYear = now.getFullYear(); currentMonth = now.getMonth(); }
  if (!currentMonday) currentMonday = _isoOf(_weekBounds(t).monday);

  root.innerHTML = `
    <div class="page-header">
      <button id="cal-prev">‹</button>
      <h1 id="cal-title"></h1>
      <button id="cal-view-toggle" class="btn-view-toggle"></button>
      <button id="cal-today">Aujourd'hui</button>
      <button id="cal-next">›</button>
    </div>
    <div id="cal-body"></div>`;

  document.getElementById("cal-prev").onclick = () => { navigate(-1); };
  document.getElementById("cal-next").onclick = () => { navigate(1); };
  document.getElementById("cal-today").onclick = () => {
    const n = new Date(today());
    currentYear = n.getFullYear(); currentMonth = n.getMonth();
    currentMonday = _isoOf(_weekBounds(today()).monday);
    draw();
  };
  document.getElementById("cal-view-toggle").onclick = () => {
    if (viewMode === "month") {
      // Bascule vers la semaine d'aujourd'hui si le mois affiché la contient, sinon la 1re semaine du mois
      const n = new Date(today());
      const ref = (n.getFullYear() === currentYear && n.getMonth() === currentMonth)
        ? today() : toIsoDate(currentYear, currentMonth, 1);
      currentMonday = _isoOf(_weekBounds(ref).monday);
      viewMode = "week";
    } else {
      // Mois du jeudi de la semaine affichée (mois majoritaire, convention ISO)
      const m = new Date(currentMonday + "T00:00:00");
      m.setDate(m.getDate() + 3);
      currentYear = m.getFullYear(); currentMonth = m.getMonth();
      viewMode = "month";
    }
    localStorage.setItem("calViewMode", viewMode);
    updateToggleLabel();
    draw();
  };
  updateToggleLabel();
  attachSwipe(document.getElementById("cal-body"));
  draw();
}

// Navigation tactile : glisser vers la gauche → période suivante,
// vers la droite → période précédente. Ignore les gestes verticaux
// (défilement) et les simples taps.
function attachSwipe(body) {
  if (!body) return;
  let startX = 0, startY = 0, tracking = false, decided = null;
  const SWIPE_MIN = 55;      // distance horizontale minimale pour valider
  const SLOP = 12;           // au-delà, on décide de l'axe du geste

  body.addEventListener("touchstart", (e) => {
    // En vue mois, la grille coulisse horizontalement (défilement natif pour
    // voir le dimanche) : on n'intercepte pas le geste pour changer de mois.
    if (viewMode === "month") { tracking = false; return; }
    if (e.touches.length !== 1) { tracking = false; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
    decided = null;
  }, { passive: true });

  body.addEventListener("touchmove", (e) => {
    if (!tracking) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (decided === null && (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP)) {
      decided = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (decided === "h") {
      e.preventDefault();  // empêche le scroll pendant un swipe horizontal
      const grid = body.firstElementChild;
      if (grid) { grid.style.transition = "none"; grid.style.transform = `translateX(${dx * 0.35}px)`; }
    }
  }, { passive: false });

  const end = (e) => {
    if (!tracking) return;
    tracking = false;
    const grid = body.firstElementChild;
    const dx = (e.changedTouches ? e.changedTouches[0].clientX : startX) - startX;
    if (decided === "h" && dx <= -SWIPE_MIN) { navigate(1); return; }      // gauche → suivant
    if (decided === "h" && dx >= SWIPE_MIN) { navigate(-1); return; }      // droite → précédent
    // Geste insuffisant : retour élastique à la position d'origine
    if (grid) {
      grid.style.transition = "transform .18s var(--ease-out)";
      grid.style.transform = "";
    }
  };
  body.addEventListener("touchend", end);
  body.addEventListener("touchcancel", () => {
    tracking = false;
    const grid = body.firstElementChild;
    if (grid) grid.style.transform = "";
  });
}

function updateToggleLabel() {
  const btn = document.getElementById("cal-view-toggle");
  if (!btn) return;
  btn.textContent = viewMode === "month" ? "Semaine" : "Mois";
  btn.title = viewMode === "month" ? "Afficher la vue semaine" : "Afficher la vue mois";
}

function navigate(dir) {
  if (viewMode === "week") {
    const m = new Date(currentMonday + "T00:00:00");
    m.setDate(m.getDate() + dir * 7);
    currentMonday = _isoOf(m);
  } else {
    currentMonth += dir;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  }
  draw();
}

async function draw() {
  if (viewMode === "week") return drawWeek();
  return drawMonth();
}

async function _loadPlan(from, to) {
  let planEntries = [];
  let settings = { weekday_category_map: {}, dessert_enabled: true, lunch_enabled: false };
  try {
    [planEntries, settings] = await Promise.all([
      api.getPlan(from, to),
      api.getSettings(),
    ]);
  } catch {}
  const planMap = {};
  for (const e of planEntries) planMap[e.date] = e;
  return { planMap, settings };
}

function buildHeaderRow(grid, catMap) {
  for (let i = 0; i < 7; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-header-cell" + (i >= 5 ? " weekend" : "");
    const cat = catMap[String(i)] || DEFAULT_CATS[i];
    cell.innerHTML = `${DAYS_FR[i]}<span class="cat-label">${CAT_LABELS[cat] || cat}</span>`;
    grid.appendChild(cell);
  }
}

function _hasContent(entry) {
  return entry && (entry.main_dish || entry.free_text || entry.entree_dish || entry.apero_dish || entry.sauce_dish || entry.dessert_dish || entry.extra_dishes?.length);
}

// Ajoute les lignes de plats du jour (midi, apéro, entrée, plat, extras, sauce,
// dessert) puis la coche « fait » dans le conteneur fourni. Partagé entre la
// cellule du mois et la ligne de la vue semaine.
function appendDishLines(container, dateStr, entry, settings) {
  if (!entry) return;

  if (settings.lunch_enabled && (entry.lunch_dish || entry.lunch_free_text)) {
    const lunchEl = document.createElement("div");
    lunchEl.className = "day-dish lunch";
    lunchEl.textContent = "🌞 " + (entry.lunch_dish?.name || entry.lunch_free_text);
    container.appendChild(lunchEl);
  }
  if (entry.entree_dish) {
    const entEl = document.createElement("div");
    entEl.className = "day-dish entree";
    entEl.textContent = "🥗 " + entry.entree_dish.name;
    container.appendChild(entEl);
  }
  if (entry.apero_dish) {
    const apEl = document.createElement("div");
    apEl.className = "day-dish apero";
    apEl.textContent = "🥂 " + entry.apero_dish.name;
    container.appendChild(apEl);
  }
  if (entry.sauce_dish) {
    const saEl = document.createElement("div");
    saEl.className = "day-dish sauce";
    saEl.textContent = "🥣 " + entry.sauce_dish.name;
    container.appendChild(saEl);
  }

  const dishEl = document.createElement("div");
  if (entry.main_dish) {
    dishEl.className = "day-dish";
    dishEl.textContent = entry.main_dish.name;
  } else if (entry.free_text) {
    dishEl.className = "day-dish free-text";
    dishEl.textContent = entry.free_text;
  }
  if (dishEl.textContent) container.appendChild(dishEl);

  for (const extra of entry.extra_dishes || []) {
    const extraEl = document.createElement("div");
    extraEl.className = "day-dish extra";
    extraEl.textContent = "+ " + extra.name;
    container.appendChild(extraEl);
  }

  if (entry.dessert_dish) {
    const dessEl = document.createElement("div");
    dessEl.className = "day-dish dessert";
    dessEl.textContent = "🍰 " + entry.dessert_dish.name;
    container.appendChild(dessEl);
  }

  const cookedEl = document.createElement("div");
  cookedEl.className = "day-cooked";
  cookedEl.textContent = entry.cooked ? "✅" : (entry.main_dish || entry.free_text ? "⬜" : "");
  if (cookedEl.textContent) {
    cookedEl.title = entry.cooked ? "Marquer non fait" : "Marquer fait";
    cookedEl.onclick = async (e) => {
      e.stopPropagation();
      try {
        await api.patchPlan(dateStr, { cooked: !entry.cooked, cooked_by: state.memberId });
        draw();
      } catch (err) { showToast(err.message, "error"); }
    };
    container.appendChild(cookedEl);
  }
}

function _openDay(dateStr, entry, settings) {
  if (_hasContent(entry)) openDaySummary(dateStr, entry, settings, draw);
  else openDayPicker(dateStr, entry, settings, draw);
}

function buildDayCell(dateStr, dayNum, dow, planMap, todayStr, settings) {
  const entry = planMap[dateStr];
  const cell = document.createElement("div");
  const isWeekend = dow >= 5;
  const isToday = dateStr === todayStr;
  cell.className = "day-cell" + (isWeekend ? " weekend" : "") + (isToday ? " today" : "");
  cell.dataset.date = dateStr;

  const numEl = document.createElement("div");
  numEl.className = "day-num";
  numEl.textContent = dayNum;
  cell.appendChild(numEl);

  appendDishLines(cell, dateStr, entry, settings);

  cell.addEventListener("click", () => _openDay(dateStr, entry, settings));
  return cell;
}

// Ligne d'un jour dans la vue semaine (liste verticale) : en-tête à gauche
// (jour, date, catégorie), plats à droite.
function buildWeekDayRow(dateStr, date, dow, planMap, todayStr, settings) {
  const entry = planMap[dateStr];
  const isWeekend = dow >= 5;
  const isToday = dateStr === todayStr;

  const row = document.createElement("div");
  row.className = "week-day-row" + (isWeekend ? " weekend" : "") + (isToday ? " today" : "");
  row.dataset.date = dateStr;

  const catMap = settings.weekday_category_map || {};
  const cat = catMap[String(dow)] || DEFAULT_CATS[dow];

  const head = document.createElement("div");
  head.className = "week-day-head";
  head.innerHTML = `
    <span class="week-day-name">${DAYS_FR[dow]}</span>
    <span class="week-day-num">${date.getDate()}</span>
    <span class="week-day-cat">${CAT_LABELS[cat] || cat}</span>`;
  row.appendChild(head);

  const content = document.createElement("div");
  content.className = "week-day-content";
  appendDishLines(content, dateStr, entry, settings);
  if (!_hasContent(entry)) {
    const empty = document.createElement("div");
    empty.className = "week-day-empty";
    empty.textContent = "+ Ajouter un repas";
    content.appendChild(empty);
  }
  row.appendChild(content);

  row.addEventListener("click", () => _openDay(dateStr, entry, settings));
  return row;
}

function buildWeekActions(dateStr, hasMeals) {
  const { year, week: wk } = isoWeekOf(new Date(dateStr));
  const actionRow = document.createElement("div");
  actionRow.className = "week-row-actions";
  const fillBtn = document.createElement("button");
  if (hasMeals) {
    // Semaine déjà planifiée → le bouton vide tout
    fillBtn.className = "btn-week-shop btn-week-clear";
    fillBtn.textContent = "🗑 Vider";
    fillBtn.title = "Effacer tous les plats planifiés de la semaine";
    fillBtn.onclick = () => clearWeek(dateStr, fillBtn);
  } else {
    // Semaine vide → le bouton remplit automatiquement
    fillBtn.className = "btn-week-shop btn-week-fill";
    fillBtn.textContent = "✨ Remplir";
    fillBtn.title = "Proposer automatiquement un plat pour chaque jour vide de la semaine (roulement + plats les moins cuisinés)";
    fillBtn.onclick = () => fillWeek(dateStr, fillBtn);
  }
  actionRow.appendChild(fillBtn);
  const aggBtn = document.createElement("button");
  aggBtn.className = "btn-week-shop btn-week-ingr";
  aggBtn.textContent = "🧺 + Ingrédients";
  aggBtn.title = "Ajouter les ingrédients de tous les plats planifiés de la semaine à la liste de courses";
  aggBtn.onclick = () => addWeekIngredients(dateStr, aggBtn);
  const btn = document.createElement("button");
  btn.className = "btn-week-shop";
  btn.textContent = "🛒 Courses sem.";
  btn.onclick = () => { location.hash = `#/courses?year=${year}&week=${wk}`; };
  actionRow.append(aggBtn, btn);
  return actionRow;
}

async function drawMonth() {
  const title = document.getElementById("cal-title");
  if (!title) return;
  title.textContent = `${MONTHS_FR[currentMonth]} ${currentYear}`;

  const firstDay = toIsoDate(currentYear, currentMonth, 1);
  const lastDay = toIsoDate(currentYear, currentMonth, new Date(currentYear, currentMonth + 1, 0).getDate());
  const { planMap, settings } = await _loadPlan(firstDay, lastDay);

  const todayStr = today();
  const weeks = monthGrid(currentYear, currentMonth);

  const body = document.getElementById("cal-body");
  if (!body) return;
  body.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "calendar-grid";
  buildHeaderRow(grid, settings.weekday_category_map);

  for (const week of weeks) {
    for (let dow = 0; dow < 7; dow++) {
      const day = week[dow];
      if (!day) {
        const cell = document.createElement("div");
        cell.className = "day-cell empty";
        grid.appendChild(cell);
        continue;
      }
      const dateStr = toIsoDate(currentYear, currentMonth, day);
      grid.appendChild(buildDayCell(dateStr, day, dow, planMap, todayStr, settings));
    }

    // Week row action
    const nonZero = week.find((d) => d !== 0);
    if (nonZero) {
      const dateStr = toIsoDate(currentYear, currentMonth, nonZero);
      // La semaine a-t-elle au moins un plat planifié ?
      const hasMeals = week.some((d) => {
        if (!d) return false;
        const e = planMap[toIsoDate(currentYear, currentMonth, d)];
        return e && (e.main_dish || e.free_text);
      });
      grid.appendChild(buildWeekActions(dateStr, hasMeals));
    }
  }

  // Conteneur à défilement horizontal : les 7 jours restent lisibles, et le
  // dimanche est accessible en faisant coulisser sur les petits écrans.
  const scroller = document.createElement("div");
  scroller.className = "cal-scroll";
  scroller.appendChild(grid);
  body.appendChild(scroller);
}

async function drawWeek() {
  const title = document.getElementById("cal-title");
  if (!title) return;
  const monday = new Date(currentMonday + "T00:00:00");
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const { week } = isoWeekOf(monday);
  const fmt = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  title.textContent = `Sem. ${week} · ${fmt(monday)} – ${fmt(sunday)}`;

  const { planMap, settings } = await _loadPlan(currentMonday, _isoOf(sunday));
  const todayStr = today();

  const body = document.getElementById("cal-body");
  if (!body) return;
  body.innerHTML = "";

  const list = document.createElement("div");
  list.className = "week-list";

  let hasMeals = false;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = _isoOf(d);
    const e = planMap[dateStr];
    if (e && (e.main_dish || e.free_text)) hasMeals = true;
    list.appendChild(buildWeekDayRow(dateStr, d, i, planMap, todayStr, settings));
  }
  list.appendChild(buildWeekActions(currentMonday, hasMeals));

  body.appendChild(list);
}

function _weekBounds(anyDateOfWeek) {
  const d = new Date(anyDateOfWeek + "T00:00:00");
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function _isoOf(d) {
  return toIsoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Remplit les jours vides de la semaine avec le plat le moins cuisiné de la
 * catégorie du jour (roulement), sans jamais proposer deux fois le même plat
 * dans la semaine ni toucher aux jours déjà planifiés.
 */
async function fillWeek(anyDateOfWeek, btn) {
  const { monday, sunday } = _weekBounds(anyDateOfWeek);
  const from = _isoOf(monday);
  const to = _isoOf(sunday);
  const { week } = isoWeekOf(monday);

  btn.disabled = true;
  try {
    const entries = await api.getPlan(from, to);
    const byDate = {};
    for (const e of entries) byDate[e.date] = e;

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const iso = _isoOf(d);
      const entry = byDate[iso];
      if (!entry || (!entry.main_dish && !entry.free_text)) days.push({ iso, entry });
    }
    if (!days.length) {
      showToast("La semaine est déjà entièrement planifiée");
      return;
    }
    if (!confirm(`Proposer un plat pour ${days.length} jour(s) vide(s) de la semaine ${week} ? (les moins cuisinés en premier)`)) return;

    const used = new Set(
      entries.flatMap((e) => [e.main_dish?.id, ...(e.extra_dishes || []).map((x) => x.id)]).filter(Boolean)
    );
    let filled = 0;
    for (const { iso, entry } of days) {
      let prio = [];
      try { prio = await api.getPriority(iso); } catch { continue; }
      const pick = prio.find((p) => !used.has(p.dish.id)) || prio[0];
      if (!pick) continue;
      used.add(pick.dish.id);
      await api.putPlan(iso, {
        main_dish_id: pick.dish.id,
        dessert_dish_id: entry?.dessert_dish?.id ?? null,
        entree_dish_id: entry?.entree_dish?.id ?? null,
        free_text: null,
        planned_by: state.memberId,
      });
      filled++;
    }
    showToast(`✨ ${filled} jour(s) rempli(s) — ajustez ce qui ne convient pas ✓`);
    draw();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

/**
 * Efface tous les plats planifiés de la semaine (bascule du bouton Remplir
 * quand la semaine contient déjà des plats).
 */
async function clearWeek(anyDateOfWeek, btn) {
  const { monday, sunday } = _weekBounds(anyDateOfWeek);
  const from = _isoOf(monday);
  const to = _isoOf(sunday);
  const { week } = isoWeekOf(monday);

  btn.disabled = true;
  try {
    const entries = await api.getPlan(from, to);
    const planned = entries.filter((e) => e.main_dish || e.free_text || e.entree_dish || e.apero_dish || e.sauce_dish || e.dessert_dish || e.extra_dishes?.length);
    if (!planned.length) {
      showToast("La semaine est déjà vide");
      return;
    }
    if (!confirm(`Effacer les ${planned.length} plat(s) planifié(s) de la semaine ${week} ?`)) return;

    for (const e of planned) {
      await api.deletePlan(e.date);
    }
    showToast(`🗑 Semaine ${week} vidée ✓`);
    draw();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

/**
 * Agrège les ingrédients de tous les plats planifiés (entrée, plat, dessert)
 * de la semaine contenant anyDateOfWeek, puis les fusionne dans la liste de
 * courses de cette semaine (les doublons sont fusionnés, quantités sommées).
 */
async function addWeekIngredients(anyDateOfWeek, btn) {
  const d = new Date(anyDateOfWeek + "T00:00:00");
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const from = toIsoDate(monday.getFullYear(), monday.getMonth(), monday.getDate());
  const to = toIsoDate(sunday.getFullYear(), sunday.getMonth(), sunday.getDate());
  const { year, week } = isoWeekOf(monday);

  btn.disabled = true;
  try {
    const entries = await api.getPlan(from, to);
    const ingredients = [];
    let dishCount = 0;
    for (const e of entries) {
      for (const dish of [e.lunch_dish, e.apero_dish, e.entree_dish, e.main_dish, ...(e.extra_dishes || []), e.sauce_dish, e.dessert_dish]) {
        if (dish?.ingredients?.length) {
          dishCount++;
          ingredients.push(...dish.ingredients);
        }
      }
    }
    if (!ingredients.length) {
      showToast("Aucun plat de la semaine n'a d'ingrédients enregistrés", "error");
      return;
    }
    if (!confirm(`Ajouter les ingrédients de ${dishCount} plat(s) de la semaine ${week} à la liste de courses ?`)) return;

    let existing = [];
    try { existing = (await api.getShopping(year, week)).items || []; } catch {}
    const merged = mergeShoppingItems(existing, ingredients.map((t) => ({ text: t, checked: false })));
    await api.putShopping(year, week, merged);
    showToast(`🧺 Ingrédients de ${dishCount} plat(s) ajoutés — sem. ${week} ✓`);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function openDayPicker(dateStr, entry, settings, onSave) {
  const d = new Date(dateStr);
  const dow = (d.getDay() + 6) % 7;
  const catMap = settings.weekday_category_map;
  const category = catMap[String(dow)] || DEFAULT_CATS[dow];
  await renderPicker(dateStr, category, entry, settings.dessert_enabled, onSave, settings.lunch_enabled, settings.multi_dish_enabled);
}

function openDaySummary(dateStr, entry, settings, onSave) {
  const root = document.getElementById("modal-root");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const d = new Date(dateStr + "T00:00:00");
  const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  // Carte d'un plat : miniature (photo ou hachures) + label + nom + ingrédients.
  const dishCard = (label, dish) => {
    const thumb = dish.thumbnail_url
      ? `<div class="ddc-thumb" style="background-image:url('${escapeHtml(dish.thumbnail_url)}')"></div>`
      : `<div class="ddc-thumb ddc-thumb-empty"></div>`;
    const ingr = (dish.ingredients && dish.ingredients.length)
      ? `<ul class="ddc-ingr">${dish.ingredients.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
      : "";
    return `<div class="ddc">
      <div class="ddc-head">
        ${thumb}
        <div class="ddc-txt">
          <div class="ddc-label">${label}</div>
          <div class="ddc-name">${escapeHtml(dish.name)}</div>
        </div>
      </div>
      ${ingr}
    </div>`;
  };
  // Carte simple pour un texte libre (pas de plat associé, donc ni photo ni ingrédients).
  const freeCard = (label, text) => `<div class="ddc">
    <div class="ddc-head">
      <div class="ddc-thumb ddc-thumb-empty"></div>
      <div class="ddc-txt"><div class="ddc-label">${label}</div>
      <div class="ddc-name">${escapeHtml(text)}</div></div>
    </div></div>`;

  let menuHtml = "";
  if (settings.lunch_enabled && entry.lunch_dish) menuHtml += dishCard("🌞 Midi", entry.lunch_dish);
  else if (settings.lunch_enabled && entry.lunch_free_text) menuHtml += freeCard("🌞 Midi", entry.lunch_free_text);
  if (entry.apero_dish) menuHtml += dishCard("🥂 Apéro", entry.apero_dish);
  if (entry.entree_dish) menuHtml += dishCard("🥗 Entrée", entry.entree_dish);
  if (entry.main_dish) menuHtml += dishCard("🍽️ Plat principal", entry.main_dish);
  else if (entry.free_text) menuHtml += freeCard("🍽️ Plat", entry.free_text);
  for (const extra of entry.extra_dishes || []) menuHtml += dishCard("➕ Aussi", extra);
  if (entry.sauce_dish) menuHtml += dishCard("🥣 Sauce", entry.sauce_dish);
  if (entry.dessert_dish) menuHtml += dishCard("🍰 Dessert", entry.dessert_dish);

  const cookedStatus = entry.cooked
    ? `<div style="display:flex;align-items:center;gap:6px;margin-top:12px;padding:8px 12px;background:#d5ead8;border-radius:10px;font-size:13px;color:#2d6a4f;font-weight:600">
        ✅ Repas réalisé${entry.cooked_by ? " par " + escapeHtml(String(entry.cooked_by)) : ""}
      </div>`
    : "";

  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h2 style="font-size:15px;text-transform:capitalize">${label}</h2>
        <button class="btn-close">✕</button>
      </div>
      <div class="modal-body">
        ${menuHtml}
        ${cookedStatus}
      </div>
      <div class="modal-footer" style="gap:8px">
        <button class="btn btn-danger btn-sm" id="btn-day-delete" style="padding:8px 12px;font-size:13px">🗑 Effacer</button>
        ${settings.lunch_enabled ? '<button class="btn btn-ghost btn-sm" id="btn-day-lunch" style="padding:8px 12px;font-size:13px">🌞 Midi</button>' : ""}
        <button class="btn btn-primary flex-1" id="btn-day-modify">✏️ Modifier le repas</button>
      </div>
    </div>`;

  root.appendChild(overlay);
  overlay.querySelector(".btn-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  overlay.querySelector("#btn-day-modify").onclick = () => {
    overlay.remove();
    openDayPicker(dateStr, entry, settings, onSave);
  };

  const lunchBtn = overlay.querySelector("#btn-day-lunch");
  if (lunchBtn) {
    lunchBtn.onclick = () => {
      overlay.remove();
      renderLunchPicker(dateStr, entry, onSave);
    };
  }

  overlay.querySelector("#btn-day-delete").onclick = async () => {
    if (!confirm("Effacer le repas de ce jour ?")) return;
    try {
      await api.deletePlan(dateStr);
      overlay.remove();
      onSave();
    } catch (err) { showToast(err.message, "error"); }
  };
}
