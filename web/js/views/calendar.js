import { api } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../components/toast.js";
import { renderPicker } from "./picker.js";
import { DAYS_FR, MONTHS_FR, CAT_LABELS, monthGrid, toIsoDate, today, isoWeekOf } from "../utils.js";

let currentYear, currentMonth;

export async function renderCalendar(root) {
  const t = today();
  const now = new Date(t);
  if (!currentYear) { currentYear = now.getFullYear(); currentMonth = now.getMonth(); }

  root.innerHTML = `
    <div class="page-header">
      <button id="cal-prev">‹</button>
      <h1 id="cal-title"></h1>
      <button id="cal-today">Aujourd'hui</button>
      <button id="cal-next">›</button>
    </div>
    <div id="cal-body"></div>`;

  document.getElementById("cal-prev").onclick = () => { navigate(-1); };
  document.getElementById("cal-next").onclick = () => { navigate(1); };
  document.getElementById("cal-today").onclick = () => {
    const n = new Date(today());
    currentYear = n.getFullYear(); currentMonth = n.getMonth();
    draw();
  };
  draw();
}

async function navigate(dir) {
  currentMonth += dir;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  draw();
}

async function draw() {
  const title = document.getElementById("cal-title");
  if (!title) return;
  title.textContent = `${MONTHS_FR[currentMonth]} ${currentYear}`;

  const firstDay = toIsoDate(currentYear, currentMonth, 1);
  const lastDay = toIsoDate(currentYear, currentMonth, new Date(currentYear, currentMonth + 1, 0).getDate());

  let planEntries = [];
  let settings = { weekday_category_map: {}, dessert_enabled: true };
  try {
    [planEntries, settings] = await Promise.all([
      api.getPlan(firstDay, lastDay),
      api.getSettings(),
    ]);
  } catch {}

  const planMap = {};
  for (const e of planEntries) planMap[e.date] = e;

  const todayStr = today();
  const weeks = monthGrid(currentYear, currentMonth);
  const catMap = settings.weekday_category_map;

  const body = document.getElementById("cal-body");
  if (!body) return;
  body.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  // Header row
  for (let i = 0; i < 7; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-header-cell" + (i >= 5 ? " weekend" : "");
    const weekdayStr = String(i);
    const cat = catMap[weekdayStr] || ["pomme_de_terre","riz","pates","pomme_de_terre","riz","autre","africain"][i];
    cell.innerHTML = `${DAYS_FR[i]}<span class="cat-label">${CAT_LABELS[cat] || cat}</span>`;
    grid.appendChild(cell);
  }

  for (const week of weeks) {
    for (let dow = 0; dow < 7; dow++) {
      const day = week[dow];
      const cell = document.createElement("div");
      if (!day) {
        cell.className = "day-cell empty";
        grid.appendChild(cell);
        continue;
      }
      const dateStr = toIsoDate(currentYear, currentMonth, day);
      const entry = planMap[dateStr];
      const isWeekend = dow >= 5;
      const isToday = dateStr === todayStr;
      cell.className = "day-cell" + (isWeekend ? " weekend" : "") + (isToday ? " today" : "");
      cell.dataset.date = dateStr;

      const numEl = document.createElement("div");
      numEl.className = "day-num";
      numEl.textContent = day;
      cell.appendChild(numEl);

      if (entry) {
        if (entry.entree_dish) {
          const entEl = document.createElement("div");
          entEl.className = "day-dish";
          entEl.style.cssText = "font-size:9px;color:var(--cat-entree);margin-top:1px";
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
          dessEl.className = "day-dish";
          dessEl.style.cssText = "font-size:9px;color:var(--cat-sucree);margin-top:1px";
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

      cell.addEventListener("click", () => openDayPicker(dateStr, entry, settings, draw));
      grid.appendChild(cell);
    }

    // Week row action
    const nonZero = week.find((d) => d !== 0);
    if (nonZero) {
      const dateStr = toIsoDate(currentYear, currentMonth, nonZero);
      const { year, week: wk } = isoWeekOf(new Date(dateStr));
      const actionRow = document.createElement("div");
      actionRow.className = "week-row-actions";
      const btn = document.createElement("button");
      btn.className = "btn-week-shop";
      btn.textContent = "🛒 Courses sem.";
      btn.onclick = () => { location.hash = `#/courses?year=${year}&week=${wk}`; };
      actionRow.appendChild(btn);
      grid.appendChild(actionRow);
    }
  }

  body.appendChild(grid);
}

async function openDayPicker(dateStr, entry, settings, onSave) {
  const d = new Date(dateStr);
  const dow = (d.getDay() + 6) % 7;
  const catMap = settings.weekday_category_map;
  const category = catMap[String(dow)] || ["pomme_de_terre","riz","pates","pomme_de_terre","riz","autre","africain"][dow];
  await renderPicker(dateStr, category, entry, settings.dessert_enabled, onSave);
}
