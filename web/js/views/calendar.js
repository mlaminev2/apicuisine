import { api } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../components/toast.js";
import { renderPicker } from "./picker.js";
import { DAYS_FR, MONTHS_FR, CAT_LABELS, monthGrid, toIsoDate, today, isoWeekOf, mergeShoppingItems } from "../utils.js";

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
  draw();
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
  let settings = { weekday_category_map: {}, dessert_enabled: true };
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

  if (entry) {
    if (entry.entree_dish) {
      const entEl = document.createElement("div");
      entEl.className = "day-dish entree";
      entEl.textContent = "🥗 " + entry.entree_dish.name;
      cell.appendChild(entEl);
    }

    const dishEl = document.createElement("div");
    if (entry.main_dish) {
      dishEl.className = "day-dish";
      dishEl.textContent = entry.main_dish.name;
    } else if (entry.free_text) {
      dishEl.className = "day-dish free-text";
      dishEl.textContent = entry.free_text;
    }
    if (dishEl.textContent) cell.appendChild(dishEl);

    if (entry.dessert_dish) {
      const dessEl = document.createElement("div");
      dessEl.className = "day-dish dessert";
      dessEl.textContent = "🍰 " + entry.dessert_dish.name;
      cell.appendChild(dessEl);
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
      cell.appendChild(cookedEl);
    }
  }

  cell.addEventListener("click", () => {
    if (entry && (entry.main_dish || entry.free_text || entry.entree_dish || entry.dessert_dish)) {
      openDaySummary(dateStr, entry, settings, draw);
    } else {
      openDayPicker(dateStr, entry, settings, draw);
    }
  });
  return cell;
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

  body.appendChild(grid);
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

  const grid = document.createElement("div");
  grid.className = "calendar-grid week-view";
  buildHeaderRow(grid, settings.weekday_category_map);

  let hasMeals = false;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = _isoOf(d);
    const e = planMap[dateStr];
    if (e && (e.main_dish || e.free_text)) hasMeals = true;
    grid.appendChild(buildDayCell(dateStr, d.getDate(), i, planMap, todayStr, settings));
  }
  grid.appendChild(buildWeekActions(currentMonday, hasMeals));

  body.appendChild(grid);
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

    const used = new Set(entries.filter((e) => e.main_dish).map((e) => e.main_dish.id));
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
    const planned = entries.filter((e) => e.main_dish || e.free_text || e.entree_dish || e.dessert_dish);
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
      for (const dish of [e.entree_dish, e.main_dish, e.dessert_dish]) {
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
  await renderPicker(dateStr, category, entry, settings.dessert_enabled, onSave);
}

function openDaySummary(dateStr, entry, settings, onSave) {
  const root = document.getElementById("modal-root");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const d = new Date(dateStr + "T00:00:00");
  const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  let menuHtml = "";
  if (entry.entree_dish) {
    menuHtml += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f5f5f5">
      <span style="font-size:18px">🥗</span>
      <div>
        <div style="font-size:10px;font-weight:700;color:#aaa;text-transform:uppercase">Entrée</div>
        <div style="font-size:14px;font-weight:600">${entry.entree_dish.name}</div>
      </div>
    </div>`;
  }
  if (entry.main_dish) {
    menuHtml += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f5f5f5">
      <span style="font-size:18px">🍽️</span>
      <div>
        <div style="font-size:10px;font-weight:700;color:#aaa;text-transform:uppercase">Plat principal</div>
        <div style="font-size:14px;font-weight:600">${entry.main_dish.name}</div>
      </div>
    </div>`;
  } else if (entry.free_text) {
    menuHtml += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f5f5f5">
      <span style="font-size:18px">🍽️</span>
      <div>
        <div style="font-size:10px;font-weight:700;color:#aaa;text-transform:uppercase">Plat</div>
        <div style="font-size:14px;font-weight:600">${entry.free_text}</div>
      </div>
    </div>`;
  }
  if (entry.dessert_dish) {
    menuHtml += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0">
      <span style="font-size:18px">🍰</span>
      <div>
        <div style="font-size:10px;font-weight:700;color:#aaa;text-transform:uppercase">Dessert</div>
        <div style="font-size:14px;font-weight:600">${entry.dessert_dish.name}</div>
      </div>
    </div>`;
  }

  const cookedStatus = entry.cooked
    ? `<div style="display:flex;align-items:center;gap:6px;margin-top:12px;padding:8px 12px;background:#d5ead8;border-radius:10px;font-size:13px;color:#2d6a4f;font-weight:600">
        ✅ Repas réalisé${entry.cooked_by ? " par " + entry.cooked_by : ""}
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

  overlay.querySelector("#btn-day-delete").onclick = async () => {
    if (!confirm("Effacer le repas de ce jour ?")) return;
    try {
      await api.deletePlan(dateStr);
      overlay.remove();
      onSave();
    } catch (err) { showToast(err.message, "error"); }
  };
}
