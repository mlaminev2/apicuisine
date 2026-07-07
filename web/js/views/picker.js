import { api } from "../api.js";
import { state } from "../state.js";
import { openModal } from "../components/modal.js";
import { showToast } from "../components/toast.js";
import { CAT_LABELS, DAYS_FULL_FR, isoWeekOf, mergeShoppingItems, escapeHtml } from "../utils.js";

export async function renderPicker(dateStr, category, currentEntry, dessertEnabled, onSave, lunchEnabled = false, multiEnabled = false) {
  const d = new Date(dateStr + "T00:00:00");
  const dayName = DAYS_FULL_FR[(d.getDay() + 6) % 7];
  const dateLabel = `${dayName} ${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  const catLabel = CAT_LABELS[category] || category;
  const title = `${dateLabel} — ${catLabel}`;

  let priorityList = [];
  let dessertList = [];
  let entreeList = [];
  let aperoList = [];
  let sauceList = [];
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
    [entreeList, aperoList, sauceList] = await Promise.all([
      api.getDishes({ category: "entree", active: true }),
      api.getDishes({ category: "apero", active: true }),
      api.getDishes({ category: "sauce", active: true }),
    ]);
  } catch {}

  let selectedMainId = currentEntry?.main_dish_id || null;
  let selectedDessertId = currentEntry?.dessert_dish_id || null;
  let selectedEntreeId = currentEntry?.entree_dish_id || null;
  let selectedAperoId = currentEntry?.apero_dish_id || null;
  let selectedSauceId = currentEntry?.sauce_dish_id || null;
  let selectedExtraIds = new Set(multiEnabled ? (currentEntry?.extra_dish_ids || []) : []);
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
        const payload = {
          main_dish_id: selectedMainId || null,
          dessert_dish_id: selectedDessertId || null,
          entree_dish_id: selectedEntreeId || null,
          apero_dish_id: selectedAperoId || null,
          sauce_dish_id: selectedSauceId || null,
          free_text: freeText || null,
          planned_by: state.memberId,
        };
        // N'envoyer les plats supplémentaires que si l'option est active,
        // pour ne pas effacer des données existantes quand elle est coupée.
        if (multiEnabled) payload.extra_dish_ids = [...selectedExtraIds];
        await api.putPlan(dateStr, payload);
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

    // Accès au menu du midi (option activée dans les réglages)
    if (lunchEnabled) {
      const lunchBtn = document.createElement("button");
      lunchBtn.type = "button";
      lunchBtn.className = "btn-lunch-link";
      const lunchName = currentEntry?.lunch_dish?.name || currentEntry?.lunch_free_text;
      lunchBtn.textContent = lunchName ? `🌞 Midi : ${lunchName}` : "🌞 Ajouter un menu du midi…";
      lunchBtn.onclick = () => {
        closeModal();
        renderLunchPicker(dateStr, currentEntry, onSave);
      };
      body.appendChild(lunchBtn);
    }

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
    priLabel.textContent = multiEnabled
      ? "⬇ Moins cuisinés en premier — touchez plusieurs plats pour les cumuler"
      : "⬇ Moins cuisinés en premier";
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
      if (freeText) { selectedMainId = null; selectedExtraIds.clear(); }
      renderList();
    };
    body.appendChild(freeInput);

    // Raccourcis fréquents (jour restes, repas à l'extérieur…)
    const quickRow = document.createElement("div");
    quickRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
    for (const label of ["🍲 Restes", "🍽️ Resto / extérieur"]) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip" + (freeText === label ? " active" : "");
      chip.textContent = label;
      chip.onclick = () => {
        freeText = freeText === label ? "" : label;
        if (freeText) { selectedMainId = null; selectedExtraIds.clear(); }
        freeInput.value = freeText;
        quickRow.querySelectorAll(".quick-chip").forEach((c) => {
          c.classList.toggle("active", c.textContent === freeText);
        });
        renderList();
      };
      quickRow.appendChild(chip);
    }
    body.appendChild(quickRow);

    // Entrée / Apéro / Sauce : listes déroulantes optionnelles
    const optDefs = [
      { icon: "🥗", label: "Entrée", cssVar: "--cat-entree", list: entreeList,
        get: () => selectedEntreeId, set: (v) => { selectedEntreeId = v; } },
      { icon: "🥂", label: "Apéro", cssVar: "--cat-apero", list: aperoList,
        get: () => selectedAperoId, set: (v) => { selectedAperoId = v; } },
      { icon: "🥣", label: "Sauce", cssVar: "--cat-sauce", list: sauceList,
        get: () => selectedSauceId, set: (v) => { selectedSauceId = v; } },
    ].filter((d) => d.list.length > 0);
    if (optDefs.length) {
      const optLabel = document.createElement("div");
      optLabel.className = "priority-label";
      optLabel.textContent = "En plus du plat (optionnel) :";
      body.appendChild(optLabel);
      for (const def of optDefs) {
        const row = document.createElement("div");
        row.className = "picker-opt-row";
        const lab = document.createElement("span");
        lab.className = "picker-opt-label";
        lab.style.color = `var(${def.cssVar})`;
        lab.textContent = `${def.icon} ${def.label}`;
        const sel = document.createElement("select");
        sel.className = "picker-select";
        const none = document.createElement("option");
        none.value = "";
        none.textContent = "— Aucun —";
        sel.appendChild(none);
        for (const dish of def.list) {
          const opt = document.createElement("option");
          opt.value = String(dish.id);
          opt.textContent = dish.name;
          if (def.get() === dish.id) opt.selected = true;
          sel.appendChild(opt);
        }
        sel.onchange = () => { def.set(sel.value ? parseInt(sel.value) : null); };
        row.append(lab, sel);
        body.appendChild(row);
      }
    }

    // Dessert
    if (dessertEnabled && dessertList.length > 0) {
      const dessLabel = document.createElement("div");
      dessLabel.className = "priority-label";
      dessLabel.style.cssText = "color:var(--cat-sucree)";
      dessLabel.textContent = "🍰 Dessert (optionnel) :";
      body.appendChild(dessLabel);
      const dessContainer = document.createElement("div");
      dessContainer.className = "dish-list dessert-list";
      dessContainer.id = "picker-dessert-list";
      body.appendChild(dessContainer);
      renderDessert(dessContainer);
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
      const isMain = selectedMainId === p.dish.id;
      const isExtra = selectedExtraIds.has(p.dish.id);
      item.className = "dish-item" + (isMain || isExtra ? " selected" : "");
      const nameEl = document.createElement("span");
      nameEl.className = "dish-name";
      nameEl.textContent = p.dish.name;

      if (multiEnabled && (isMain || isExtra) && (selectedExtraIds.size > 0)) {
        const orderBadge = document.createElement("span");
        orderBadge.className = "badge badge-tag";
        orderBadge.textContent = isMain ? "principal" : "+";
        item.appendChild(orderBadge);
      }

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
        if (multiEnabled) {
          // Multi-sélection : 1er plat = principal, les suivants s'ajoutent
          if (selectedMainId === p.dish.id) {
            selectedMainId = null;
            // Le premier plat supplémentaire devient principal
            const [next] = selectedExtraIds;
            if (next !== undefined) { selectedMainId = next; selectedExtraIds.delete(next); }
          } else if (selectedExtraIds.has(p.dish.id)) {
            selectedExtraIds.delete(p.dish.id);
          } else if (!selectedMainId) {
            selectedMainId = p.dish.id;
          } else {
            selectedExtraIds.add(p.dish.id);
          }
        } else {
          selectedMainId = selectedMainId === p.dish.id ? null : p.dish.id;
        }
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
  }
}

/**
 * Sélecteur du menu du midi (option « Menu du midi » des réglages).
 * Plus simple que celui du soir : un plat de la base (toutes catégories)
 * ou un plat libre. N'affecte jamais le menu du soir du même jour.
 */
export async function renderLunchPicker(dateStr, currentEntry, onSave) {
  const d = new Date(dateStr + "T00:00:00");
  const dayName = DAYS_FULL_FR[(d.getDay() + 6) % 7];
  const dateLabel = `${dayName} ${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  const title = `🌞 Midi — ${dateLabel}`;

  let dishes = [];
  try {
    dishes = await api.getDishes({ active: true });
    dishes.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  } catch {}

  let selectedLunchId = currentEntry?.lunch_dish_id || null;
  let lunchText = currentEntry?.lunch_free_text || "";
  let query = "";

  openModal(title, (body, close) => {
    const searchInput = document.createElement("input");
    searchInput.className = "picker-search";
    searchInput.placeholder = "Rechercher un plat…";
    searchInput.oninput = (e) => {
      query = e.target.value.toLowerCase();
      renderList();
    };
    body.appendChild(searchInput);

    const listContainer = document.createElement("div");
    listContainer.className = "dish-list";
    body.appendChild(listContainer);

    const freeLabel = document.createElement("div");
    freeLabel.className = "priority-label";
    freeLabel.textContent = "ou plat libre :";
    body.appendChild(freeLabel);
    const freeInput = document.createElement("input");
    freeInput.className = "picker-search";
    freeInput.placeholder = "Saisir un plat hors liste…";
    freeInput.value = lunchText;
    freeInput.oninput = (e) => {
      lunchText = e.target.value;
      if (lunchText) selectedLunchId = null;
      renderList();
    };
    body.appendChild(freeInput);

    const quickRow = document.createElement("div");
    quickRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
    for (const label of ["🍲 Restes", "🍽️ Resto / extérieur", "🥪 Sandwich"]) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip" + (lunchText === label ? " active" : "");
      chip.textContent = label;
      chip.onclick = () => {
        lunchText = lunchText === label ? "" : label;
        if (lunchText) selectedLunchId = null;
        freeInput.value = lunchText;
        quickRow.querySelectorAll(".quick-chip").forEach((c) => {
          c.classList.toggle("active", c.textContent === lunchText);
        });
        renderList();
      };
      quickRow.appendChild(chip);
    }
    body.appendChild(quickRow);

    function renderList() {
      listContainer.innerHTML = "";
      const filtered = query
        ? dishes.filter((dish) => dish.name.toLowerCase().includes(query))
        : dishes;
      for (const dish of filtered) {
        const item = document.createElement("div");
        item.className = "dish-item" + (selectedLunchId === dish.id ? " selected" : "");
        item.innerHTML = `<span class="dish-name">${escapeHtml(dish.name)}</span>`;
        item.onclick = () => {
          selectedLunchId = selectedLunchId === dish.id ? null : dish.id;
          lunchText = "";
          freeInput.value = "";
          renderList();
        };
        listContainer.appendChild(item);
      }
      if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="text-muted" style="padding:8px">Aucun plat trouvé</div>`;
      }
    }
    renderList();
  }, (footer, close) => {
    const saveBtn = document.createElement("button");
    saveBtn.className = "btn btn-primary flex-1";
    saveBtn.textContent = "Enregistrer";
    saveBtn.onclick = async () => {
      try {
        await api.putPlan(dateStr, {
          lunch_dish_id: selectedLunchId || null,
          lunch_free_text: lunchText || null,
          planned_by: state.memberId,
        });
        showToast("Menu du midi enregistré ✓");
        close();
        onSave && onSave();
      } catch (err) { showToast(err.message, "error"); }
    };

    const clearBtn = document.createElement("button");
    clearBtn.className = "btn btn-danger";
    clearBtn.textContent = "Vider le midi";
    clearBtn.onclick = async () => {
      try {
        await api.putPlan(dateStr, { lunch_dish_id: null, lunch_free_text: null });
        showToast("Menu du midi vidé");
        close();
        onSave && onSave();
      } catch (err) { showToast(err.message, "error"); }
    };

    footer.append(saveBtn, clearBtn);
  });
}
