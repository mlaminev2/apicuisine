import { api } from "../api.js";
import { state } from "../state.js";
import { openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { CAT_LABELS, DAYS_FULL_FR, isoWeekOf, mergeShoppingItems, escapeHtml } from "../utils.js";

export async function renderPicker(dateStr, category, currentEntry, dessertEnabled, onSave) {
  const d = new Date(dateStr + "T00:00:00");
  const dayName = DAYS_FULL_FR[(d.getDay() + 6) % 7];
  const dateLabel = `${dayName} ${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  const catLabel = CAT_LABELS[category] || category;
  const title = `${dateLabel} — ${catLabel}`;

  let priorityList = [];
  let dessertList = [];
  let entreeList = [];
  try {
    priorityList = await api.getPriority(dateStr);
  } catch {}
  if (dessertEnabled) {
    try {
      const all = await api.getDishes({ category: "sucree", active: true });
      dessertList = all;
    } catch {}
  }
  try {
    entreeList = await api.getDishes({ category: "entree", active: true });
  } catch {}

  let selectedMainId = currentEntry?.main_dish_id || null;
  let selectedDessertId = currentEntry?.dessert_dish_id || null;
  let selectedEntreeId = currentEntry?.entree_dish_id || null;
  let freeText = currentEntry?.free_text || "";
  let query = "";

  const closeModal = openModal(title, (body, close) => {
    renderBody(body);
  }, (footer, close) => {
    const saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-primary flex-1";
    saveBtn.textContent = "Enregistrer";
    saveBtn.onclick = async () => {
      try {
        await api.putPlan(dateStr, {
          main_dish_id: selectedMainId || null,
          dessert_dish_id: selectedDessertId || null,
          entree_dish_id: selectedEntreeId || null,
          free_text: freeText || null,
          planned_by: state.memberId,
        });
        showToast("Menu enregistré ✓");
        close();
        onSave && onSave();
      } catch (err) { showToast(err.message, "error"); }
    };

    const doneBtn = document.createElement("button");
    doneBtn.className = "btn btn-ghost flex-1";
    doneBtn.textContent = currentEntry?.cooked ? "✅ Marqué fait" : "Marquer fait";
    doneBtn.onclick = async () => {
      try {
        if (!currentEntry) {
          showToast("Enregistrez d'abord le menu", "error"); return;
        }
        await api.patchPlan(dateStr, { cooked: !currentEntry.cooked, cooked_by: state.memberId });
        showToast(currentEntry.cooked ? "Marqué non fait" : "Marqué fait ✅");
        close();
        onSave && onSave();
      } catch (err) { showToast(err.message, "error"); }
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Vider le jour";
    deleteBtn.onclick = async () => {
      try {
        await api.deletePlan(dateStr);
        showToast("Jour vidé");
        close();
        onSave && onSave();
      } catch (err) { showToast(err.message, "error"); }
    };

    footer.append(saveBtn, doneBtn, deleteBtn);
  });

  function renderBody(body) {
    body.innerHTML = "";

    // Search
    const searchInput = document.createElement("input");
    searchInput.className = "picker-search";
    searchInput.placeholder = "Rechercher un plat…";
    searchInput.value = query;
    searchInput.oninput = (e) => {
      query = e.target.value.toLowerCase();
      renderList();
    };
    body.appendChild(searchInput);

    // Priority label
    const priLabel = document.createElement("div");
    priLabel.className = "priority-label";
    priLabel.textContent = "⬇ Moins cuisinés en premier";
    body.appendChild(priLabel);

    // Dish list container
    const listContainer = document.createElement("div");
    listContainer.className = "dish-list";
    listContainer.id = "picker-dish-list";
    body.appendChild(listContainer);

    // Ingredients section (shown when selected dish has a recipe)
    const ingrSection = document.createElement("div");
    ingrSection.id = "picker-ingr-section";
    body.appendChild(ingrSection);

    // Free text
    const freeLabel = document.createElement("div");
    freeLabel.className = "priority-label";
    freeLabel.textContent = "ou plat libre :";
    body.appendChild(freeLabel);
    const freeInput = document.createElement("input");
    freeInput.className = "picker-search";
    freeInput.placeholder = "Saisir un plat hors liste…";
    freeInput.value = freeText;
    freeInput.oninput = (e) => {
      freeText = e.target.value;
      if (freeText) selectedMainId = null;
      renderList();
    };
    body.appendChild(freeInput);

    // Entrée
    if (entreeList.length > 0) {
      const entLabel = document.createElement("div");
      entLabel.className = "priority-label";
      entLabel.style.cssText = "color:var(--cat-entree)";
      entLabel.textContent = "🥗 Entrée (optionnel) :";
      body.appendChild(entLabel);
      const entContainer = document.createElement("div");
      entContainer.className = "dish-list entree-list";
      entContainer.id = "picker-entree-list";
      body.appendChild(entContainer);
      renderEntree(entContainer);
    }

    // Dessert
    if (dessertEnabled && dessertList.length > 0) {
      const dessBox = document.createElement("div");
      dessBox.className = "opt-section";
      dessBox.style.setProperty("--opt-color", "var(--cat-sucree)");
      dessBox.style.setProperty("--opt-bg", "#F9EEF4");
      dessBox.innerHTML = `
        <div class="opt-head">
          <span>🍰 Dessert</span>
          <span class="opt-choice" id="picker-dessert-choice"></span>
        </div>
        <div class="dish-list opt-list" id="picker-dessert-list"></div>`;
      body.appendChild(dessBox);
      renderDessert(dessBox.querySelector("#picker-dessert-list"));
    }

    renderList();
  }

  function renderList() {
    const container = document.getElementById("picker-dish-list");
    if (!container) return;
    container.innerHTML = "";
    const filtered = query
      ? priorityList.filter((p) => p.dish.name.toLowerCase().includes(query))
      : priorityList;

    for (const p of filtered) {
      const item = document.createElement("div");
      item.className = "dish-item" + (selectedMainId === p.dish.id ? " selected" : "");
      const nameEl = document.createElement("span");
      nameEl.className = "dish-name";
      nameEl.textContent = p.dish.name;

      const badge = document.createElement("span");
      if (p.never_cooked) {
        badge.className = "badge badge-new";
        badge.textContent = "⭐";
      } else {
        badge.className = "badge badge-count";
        badge.textContent = `×${p.cook_count}`;
      }

      if (p.dish.source_tag) {
        const tagBadge = document.createElement("span");
        tagBadge.className = "badge badge-tag";
        tagBadge.textContent = p.dish.source_tag;
        item.append(nameEl, badge, tagBadge);
      } else {
        item.append(nameEl, badge);
      }

      item.onclick = () => {
        selectedMainId = selectedMainId === p.dish.id ? null : p.dish.id;
        freeText = "";
        renderList();
      };
      container.appendChild(item);
    }
    if (filtered.length === 0) {
      container.innerHTML = `<div class="text-muted" style="padding:8px">Aucun plat trouvé</div>`;
    }

    renderPickerIngredients();
  }

  function renderPickerIngredients() {
    const section = document.getElementById("picker-ingr-section");
    if (!section) return;

    const selected = priorityList.find((p) => p.dish.id === selectedMainId);
    if (!selected || !selected.dish.ingredients.length) {
      section.innerHTML = "";
      return;
    }

    const ingrs = selected.dish.ingredients;
    const { year, week } = isoWeekOf(new Date(dateStr + "T00:00:00"));

    section.innerHTML = `
      <div style="margin-top:14px;border:1.5px solid var(--shopping-header);border-radius:10px;overflow:hidden">
        <div style="background:var(--shopping-header);color:white;padding:8px 12px;display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;font-weight:700">🛒 Ingrédients — ${escapeHtml(selected.dish.name)}</span>
          <span style="display:flex;gap:4px">
            <button id="picker-check-all" style="font-size:10px;background:rgba(255,255,255,.25);color:white;border:none;border-radius:4px;padding:2px 7px;cursor:pointer">Tout ✓</button>
            <button id="picker-uncheck-all" style="font-size:10px;background:rgba(255,255,255,.25);color:white;border:none;border-radius:4px;padding:2px 7px;cursor:pointer">Tout ✗</button>
          </span>
        </div>
        <div style="padding:8px;display:flex;flex-direction:column;gap:2px;max-height:180px;overflow-y:auto">
          ${ingrs.map((ing) => `
            <label class="picker-ingr-row" style="display:flex;align-items:center;gap:8px;padding:4px 6px;cursor:pointer;border-radius:6px"
              onmouseenter="this.style.background='#f0f7f2'" onmouseleave="this.style.background=''">
              <input type="checkbox" checked class="picker-ingr-cb"
                style="width:15px;height:15px;accent-color:var(--shopping-header);flex-shrink:0">
              <span class="picker-ingr-text" style="font-size:13px;flex:1">${escapeHtml(ing)}</span>
            </label>
          `).join("")}
        </div>
        <div style="padding:8px;border-top:1px solid #e8f4ee">
          <button id="btn-picker-shop" class="btn btn-primary btn-full" style="font-size:13px;padding:9px">
            🛒 Ajouter aux courses — sem. ${week}
          </button>
        </div>
      </div>`;

    section.querySelector("#picker-check-all").onclick = () => {
      section.querySelectorAll(".picker-ingr-cb").forEach((cb) => { cb.checked = true; });
    };
    section.querySelector("#picker-uncheck-all").onclick = () => {
      section.querySelectorAll(".picker-ingr-cb").forEach((cb) => { cb.checked = false; });
    };

    section.querySelector("#btn-picker-shop").onclick = async () => {
      const checked = [...section.querySelectorAll(".picker-ingr-cb")]
        .filter((cb) => cb.checked)
        .map((cb) => cb.closest("label").querySelector(".picker-ingr-text").textContent.trim());
      if (!checked.length) { showToast("Coche au moins un ingrédient", "error"); return; }
      const btn = section.querySelector("#btn-picker-shop");
      btn.disabled = true;
      try {
        const list = await api.getShopping(year, week);
        const existing = list.items || [];
        await api.putShopping(year, week, mergeShoppingItems(existing, checked.map((t) => ({ text: t, checked: false }))));
        showToast(`🛒 ${checked.length} ingrédient(s) ajouté(s) — sem. ${week}`);
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        btn.disabled = false;
      }
    };
  }

  function _updateChoice(id, list, selectedId, emptyLabel) {
    const el = document.getElementById(id);
    if (!el) return;
    const sel = list.find((d) => d.id === selectedId);
    el.textContent = sel ? sel.name : emptyLabel;
    el.classList.toggle("chosen", !!sel);
  }

  function renderEntree(container) {
    container.innerHTML = "";
    for (const dish of entreeList) {
      const item = document.createElement("div");
      item.className = "dish-item" + (selectedEntreeId === dish.id ? " selected" : "");
      item.innerHTML = `<span class="dish-name">${escapeHtml(dish.name)}</span>`;
      item.onclick = () => {
        selectedEntreeId = selectedEntreeId === dish.id ? null : dish.id;
        renderEntree(container);
      };
      container.appendChild(item);
    }
    _updateChoice("picker-entree-choice", entreeList, selectedEntreeId, "aucune");
  }

  function renderDessert(container) {
    container.innerHTML = "";
    for (const dish of dessertList) {
      const item = document.createElement("div");
      item.className = "dish-item" + (selectedDessertId === dish.id ? " selected" : "");
      item.innerHTML = `<span class="dish-name">${escapeHtml(dish.name)}</span>`;
      item.onclick = () => {
        selectedDessertId = selectedDessertId === dish.id ? null : dish.id;
        renderDessert(container);
      };
      container.appendChild(item);
    }
    _updateChoice("picker-dessert-choice", dessertList, selectedDessertId, "aucun");
  }
}
