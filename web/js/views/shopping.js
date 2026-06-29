import { api } from "../api.js";
import { showToast } from "../components/toast.js";
import { isoWeekOf, parseItemText, mergeShoppingItems, escapeHtml } from "../utils.js";

let currentYear, currentWeek;
let items = [];
let categories = [];
let viewAll = false;
let allWeeksData = [];

export async function renderShopping(root, params) {
  const now = new Date();
  const iso = isoWeekOf(now);
  currentYear = params?.year ? parseInt(params.year) : iso.year;
  currentWeek = params?.week ? parseInt(params.week) : iso.week;
  viewAll = false;

  root.innerHTML = `
    <div class="shopping-header">
      <button id="shop-prev" style="color:white;font-size:20px">‹</button>
      <div style="flex:1;text-align:center">
        <div id="shop-title" style="font-weight:700;font-size:16px">Semaine ${currentWeek}</div>
        <div id="shop-year" style="font-size:12px;opacity:.85">${currentYear}</div>
      </div>
      <button id="shop-next" style="color:white;font-size:20px">›</button>
      <button id="shop-toggle-all"
        style="font-size:11px;background:rgba(255,255,255,.2);color:white;padding:4px 8px;border-radius:8px;white-space:nowrap">
        🗂 Tout
      </button>
      <button id="shop-uncheck"
        style="font-size:11px;background:rgba(255,255,255,.2);color:white;padding:4px 8px;border-radius:8px;white-space:nowrap">
        ☐ Décocher
      </button>
    </div>
    <div id="shop-week-pills"
      style="display:none;gap:8px;padding:10px 16px;overflow-x:auto;background:white;border-bottom:1px solid #eee;-webkit-overflow-scrolling:touch;white-space:nowrap">
    </div>
    <div id="shopping-items"></div>
    <datalist id="shop-item-suggestions"></datalist>
    <div class="shopping-add" id="shop-add-row" style="flex-wrap:wrap;gap:6px">
      <input id="shop-new-item" list="shop-item-suggestions" placeholder="Article…" style="flex:2;min-width:120px" autocomplete="off" />
      <input id="shop-new-qty" placeholder="Qté…" style="flex:1;min-width:70px;max-width:90px" />
      <button class="btn btn-primary btn-sm" id="shop-add-btn">Ajouter</button>
    </div>`;

  document.getElementById("shop-prev").onclick = () => navigateWeek(-1);
  document.getElementById("shop-next").onclick = () => navigateWeek(1);
  document.getElementById("shop-uncheck").onclick = uncheckAll;
  document.getElementById("shop-add-btn").onclick = addItem;
  document.getElementById("shop-new-item").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("shop-new-qty").focus();
  });
  document.getElementById("shop-new-qty").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addItem();
  });
  document.getElementById("shop-toggle-all").onclick = () => {
    viewAll = !viewAll;
    syncViewMode();
  };

  try { categories = await api.getShopCategories(); } catch {}
  syncViewMode();
  loadItemSuggestions();
}

// ── View mode ─────────────────────────────────────────────────────────────────

function syncViewMode() {
  const toggleBtn = document.getElementById("shop-toggle-all");
  const addRow = document.getElementById("shop-add-row");
  const prevBtn = document.getElementById("shop-prev");
  const nextBtn = document.getElementById("shop-next");
  const uncheckBtn = document.getElementById("shop-uncheck");
  if (!toggleBtn) return;

  if (viewAll) {
    toggleBtn.style.cssText = "font-size:11px;background:rgba(255,255,255,.55);color:var(--shopping-header);padding:4px 8px;border-radius:8px;white-space:nowrap;font-weight:700";
    toggleBtn.textContent = "📅 Semaine";
    addRow.style.display = "none";
    prevBtn.style.visibility = "hidden";
    nextBtn.style.visibility = "hidden";
    uncheckBtn.style.display = "none";
    document.getElementById("shop-week-pills").style.display = "none";
    document.getElementById("shop-title").textContent = "Toutes les semaines";
    document.getElementById("shop-year").textContent = "";
    loadAll();
  } else {
    toggleBtn.style.cssText = "font-size:11px;background:rgba(255,255,255,.2);color:white;padding:4px 8px;border-radius:8px;white-space:nowrap";
    toggleBtn.textContent = "🗂 Tout";
    addRow.style.display = "";
    prevBtn.style.visibility = "";
    nextBtn.style.visibility = "";
    uncheckBtn.style.display = "";
    updateHeader();
    loadShopping();
    loadWeekPills();
  }
}

// ── Category helpers ──────────────────────────────────────────────────────────

function categoriesEnabled() {
  return localStorage.getItem("shop_categories_enabled") !== "false";
}

function catById(id) {
  return categories.find((c) => c.id === id) || null;
}

function catColor(id) {
  return catById(id)?.color || "#e0e0e0";
}

function catName(id) {
  return catById(id)?.name || "Autres";
}

async function loadItemSuggestions() {
  try {
    const map = await api.getIngredientMap();
    const dl = document.getElementById("shop-item-suggestions");
    if (!dl) return;
    dl.innerHTML = map
      .map((e) => `<option value="${escapeHtml(e.ingredient_key)}">`)
      .join("");
  } catch {}
}

// ── Category picker popup ─────────────────────────────────────────────────────

function openCatPicker(anchorEl, currentCatId, onSelect) {
  document.querySelectorAll(".cat-popup").forEach((p) => p.remove());

  const popup = document.createElement("div");
  popup.className = "cat-popup";
  popup.style.cssText = `
    position:fixed;z-index:500;background:white;border-radius:12px;
    box-shadow:0 4px 20px rgba(0,0,0,.2);padding:8px;
    display:flex;flex-direction:column;gap:4px;min-width:200px;max-height:300px;overflow-y:auto`;

  for (const cat of categories) {
    const btn = document.createElement("button");
    btn.style.cssText = `
      display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;
      font-size:13px;text-align:left;background:${cat.id === currentCatId ? "#f0f4f6" : "white"};
      font-weight:${cat.id === currentCatId ? "700" : "400"}`;
    const dot = document.createElement("span");
    dot.style.cssText = `width:12px;height:12px;border-radius:50%;background:${cat.color};flex-shrink:0`;
    btn.append(dot, document.createTextNode(cat.name));
    btn.onclick = (e) => { e.stopPropagation(); popup.remove(); onSelect(cat.id); };
    popup.appendChild(btn);
  }

  document.body.appendChild(popup);
  const rect = anchorEl.getBoundingClientRect();
  const top = Math.min(rect.bottom + 4, window.innerHeight - 320);
  popup.style.top = top + "px";
  popup.style.left = Math.max(4, rect.left - 100) + "px";

  const close = (e) => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener("click", close); } };
  setTimeout(() => document.addEventListener("click", close), 10);
}

// ── Render helpers ────────────────────────────────────────────────────────────

function makeItemRow(item, idx, onToggle, onDelete, onCategoryChange) {
  const row = document.createElement("div");
  row.className = "shopping-item" + (item.checked ? " checked" : "");

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = item.checked;
  cb.onchange = () => onToggle(idx);

  const catDot = document.createElement("button");
  catDot.title = catName(item.category_id);
  catDot.style.cssText = `
    width:12px;height:12px;border-radius:50%;
    background:${catColor(item.category_id)};
    flex-shrink:0;border:none;cursor:pointer;padding:0;
    display:${categoriesEnabled() ? "block" : "none"}`;
  catDot.onclick = (e) => {
    e.stopPropagation();
    openCatPicker(catDot, item.category_id, (newCatId) => onCategoryChange(idx, newCatId));
  };

  const { name, qty } = parseItemText(item.text);
  const label = document.createElement("span");
  label.className = "item-text";
  label.style.cssText = "flex:1;min-width:0;display:flex;align-items:baseline;gap:5px";
  const nameSpan = document.createElement("span");
  nameSpan.textContent = name;
  label.appendChild(nameSpan);
  if (qty) {
    const qtySpan = document.createElement("span");
    qtySpan.textContent = qty;
    qtySpan.style.cssText = "font-size:11px;color:#888;white-space:nowrap";
    label.appendChild(qtySpan);
  }

  const del = document.createElement("button");
  del.textContent = "✕";
  del.style.cssText = "color:#aaa;font-size:14px;";
  del.onclick = () => onDelete(idx);

  row.append(cb, catDot, label, del);
  return row;
}

function groupByCategory(itemList) {
  const groups = new Map();
  for (const cat of [...categories].sort((a, b) => a.sort_order - b.sort_order)) {
    groups.set(cat.id, { cat, items: [] });
  }
  groups.set(null, { cat: { id: null, name: "📦 Autres", color: "#888" }, items: [] });

  for (let i = 0; i < itemList.length; i++) {
    const item = itemList[i];
    const key = item.category_id !== undefined && item.category_id !== null ? item.category_id : null;
    const group = groups.get(key) || groups.get(null);
    group.items.push({ item, originalIdx: i });
  }
  return [...groups.values()].filter((g) => g.items.length > 0);
}

// ── Week view ─────────────────────────────────────────────────────────────────

async function loadShopping() {
  const container = document.getElementById("shopping-items");
  if (!container) return;
  try {
    const data = await api.getShopping(currentYear, currentWeek);
    items = data.items || [];
    renderItems();
  } catch (err) {
    container.innerHTML = `<div class="text-muted p-16">${err.message}</div>`;
  }
}

function renderItems() {
  const container = document.getElementById("shopping-items");
  if (!container) return;
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = `<div class="text-muted p-16">Liste vide. Ajoutez des articles ci-dessous.</div>`;
    return;
  }

  if (!categoriesEnabled()) {
    for (let i = 0; i < items.length; i++) {
      container.appendChild(makeItemRow(
        items[i], i,
        (idx) => toggleItem(idx),
        (idx) => removeItem(idx),
        (idx, newCatId) => changeCategoryItem(idx, newCatId),
      ));
    }
    return;
  }

  const groups = groupByCategory(items);

  for (const { cat, items: groupItems } of groups) {
    const header = document.createElement("div");
    header.style.cssText = `
      display:flex;align-items:center;gap:8px;padding:6px 16px;
      background:#f8f8f8;border-bottom:1px solid #eee;`;
    const dot = document.createElement("span");
    dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${cat.color};flex-shrink:0`;
    const name = document.createElement("span");
    name.style.cssText = "font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.4px";
    name.textContent = cat.name;
    const count = document.createElement("span");
    count.style.cssText = "font-size:10px;color:#aaa;margin-left:auto";
    const done = groupItems.filter((x) => x.item.checked).length;
    count.textContent = `${done}/${groupItems.length}`;
    header.append(dot, name, count);
    container.appendChild(header);

    for (const { item, originalIdx } of groupItems) {
      container.appendChild(makeItemRow(
        item, originalIdx,
        (i) => { toggleItem(i); },
        (i) => { removeItem(i); },
        (i, newCatId) => { changeCategoryItem(i, newCatId); },
      ));
    }
  }
}

async function saveItems() {
  try { await api.putShopping(currentYear, currentWeek, items); }
  catch (err) { showToast(err.message, "error"); }
}

function toggleItem(i) {
  items[i].checked = !items[i].checked;
  renderItems();
  saveItems();
}

function removeItem(i) {
  items.splice(i, 1);
  renderItems();
  saveItems();
  loadWeekPills();
}

async function changeCategoryItem(i, newCatId) {
  const { name } = parseItemText(items[i].text);
  items[i].category_id = newCatId;
  renderItems();
  await saveItems();
  try { await api.putIngredientMap(name, newCatId); } catch {}
}

async function addItem() {
  const nameInput = document.getElementById("shop-new-item");
  const qtyInput = document.getElementById("shop-new-qty");
  const name = nameInput?.value?.trim();
  const qty = qtyInput?.value?.trim();
  if (!name) return;
  const text = qty ? `${name} — ${qty}` : name;
  items = mergeShoppingItems(items, [{ text, checked: false, category_id: null }]);
  nameInput.value = "";
  if (qtyInput) qtyInput.value = "";
  nameInput.focus();
  renderItems();
  await saveItems();
  // Reload to get server-assigned category
  await loadShopping();
  loadWeekPills();
}

async function uncheckAll() {
  items = items.map((i) => ({ ...i, checked: false }));
  renderItems();
  await saveItems();
  loadWeekPills();
}

function navigateWeek(dir) {
  const d = new Date(currentYear, 0, 1 + (currentWeek - 1) * 7);
  d.setDate(d.getDate() + dir * 7);
  const iso = isoWeekOf(d);
  currentYear = iso.year;
  currentWeek = iso.week;
  updateHeader();
  loadShopping();
  loadWeekPills();
}

function updateHeader() {
  const title = document.getElementById("shop-title");
  const year = document.getElementById("shop-year");
  if (title) title.textContent = `Semaine ${currentWeek}`;
  if (year) year.textContent = currentYear;
}

async function loadWeekPills() {
  try { renderWeekPills(await api.getShoppingWeeks()); } catch {}
}

function renderWeekPills(weeks) {
  const strip = document.getElementById("shop-week-pills");
  if (!strip || viewAll) return;
  if (!weeks.length) { strip.style.display = "none"; return; }
  strip.style.display = "flex";
  strip.innerHTML = "";
  for (const w of weeks) {
    const isActive = w.iso_year === currentYear && w.iso_week === currentWeek;
    const remaining = w.item_count - w.checked_count;
    const pill = document.createElement("button");
    pill.style.cssText = `
      display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:20px;
      font-size:12px;font-weight:600;
      border:1.5px solid ${isActive ? "var(--shopping-header)" : "#ddd"};
      background:${isActive ? "var(--shopping-header)" : "white"};
      color:${isActive ? "white" : "#555"};cursor:pointer;white-space:nowrap;flex-shrink:0`;
    pill.innerHTML = `Sem.&nbsp;${w.iso_week}
      <span style="opacity:.75;font-weight:400">${w.iso_year !== currentYear ? " " + w.iso_year : ""}</span>
      <span style="background:${isActive ? "rgba(255,255,255,.3)" : "#f0f0f0"};color:${isActive ? "white" : "#777"};
        border-radius:10px;padding:1px 6px;font-size:10px">${remaining}/${w.item_count}</span>`;
    pill.onclick = () => { currentYear = w.iso_year; currentWeek = w.iso_week; updateHeader(); loadShopping(); loadWeekPills(); };
    strip.appendChild(pill);
  }
}

// ── All-weeks view ────────────────────────────────────────────────────────────

async function loadAll() {
  const container = document.getElementById("shopping-items");
  if (!container) return;
  container.innerHTML = `<div class="text-muted p-16">Chargement…</div>`;
  try {
    allWeeksData = await api.getShoppingAll();
    renderAllItems();
  } catch (err) {
    container.innerHTML = `<div class="text-muted p-16">${err.message}</div>`;
  }
}

function renderAllItems() {
  const container = document.getElementById("shopping-items");
  if (!container) return;
  container.innerHTML = "";

  if (!allWeeksData.length) {
    container.innerHTML = `<div class="text-muted p-16" style="text-align:center;padding:32px">Aucune liste.</div>`;
    return;
  }

  for (const week of allWeeksData) {
    const done = week.items.filter((i) => i.checked).length;
    const wh = document.createElement("div");
    wh.style.cssText = `background:var(--shopping-header);color:white;padding:8px 16px;font-weight:700;font-size:13px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:1`;
    wh.innerHTML = `<span>📅 Semaine ${week.iso_week} · ${week.iso_year}</span><span style="opacity:.8;font-size:12px;font-weight:400">${done}/${week.items.length}</span>`;
    container.appendChild(wh);

    if (!categoriesEnabled()) {
      for (let i = 0; i < week.items.length; i++) {
        container.appendChild(makeItemRow(
          week.items[i], i,
          (idx) => toggleAllItem(week.iso_year, week.iso_week, idx),
          (idx) => removeAllItem(week.iso_year, week.iso_week, idx),
          (idx, newCatId) => changeAllCategoryItem(week.iso_year, week.iso_week, idx, newCatId),
        ));
      }
    } else {
      const groups = groupByCategory(week.items);
      for (const { cat, items: groupItems } of groups) {
        const header = document.createElement("div");
        header.style.cssText = `display:flex;align-items:center;gap:8px;padding:5px 16px;background:#f8f8f8;border-bottom:1px solid #eee`;
        header.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${escapeHtml(cat.color)};flex-shrink:0;display:inline-block"></span><span style="font-size:10px;font-weight:700;color:#666;text-transform:uppercase">${escapeHtml(cat.name)}</span>`;
        container.appendChild(header);

        for (const { item, originalIdx } of groupItems) {
          container.appendChild(makeItemRow(
            item, originalIdx,
            (i) => toggleAllItem(week.iso_year, week.iso_week, i),
            (i) => removeAllItem(week.iso_year, week.iso_week, i),
            (i, newCatId) => changeAllCategoryItem(week.iso_year, week.iso_week, i, newCatId),
          ));
        }
      }
    }
  }
}

async function toggleAllItem(year, week, idx) {
  const wd = allWeeksData.find((w) => w.iso_year === year && w.iso_week === week);
  if (!wd) return;
  wd.items[idx].checked = !wd.items[idx].checked;
  renderAllItems();
  await api.putShopping(year, week, wd.items);
}

async function removeAllItem(year, week, idx) {
  const wd = allWeeksData.find((w) => w.iso_year === year && w.iso_week === week);
  if (!wd) return;
  wd.items.splice(idx, 1);
  if (!wd.items.length) allWeeksData = allWeeksData.filter((w) => !(w.iso_year === year && w.iso_week === week));
  renderAllItems();
  await api.putShopping(year, week, wd.items);
}

async function changeAllCategoryItem(year, week, idx, newCatId) {
  const wd = allWeeksData.find((w) => w.iso_year === year && w.iso_week === week);
  if (!wd) return;
  const { name } = parseItemText(wd.items[idx].text);
  wd.items[idx].category_id = newCatId;
  renderAllItems();
  await api.putShopping(year, week, wd.items);
  try { await api.putIngredientMap(name, newCatId); } catch {}
}
