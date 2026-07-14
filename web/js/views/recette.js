import { api } from "../api.js";
import { showToast } from "../components/toast.js";
import { CAT_LABELS, CAT_CSS, isoWeekOf, mergeShoppingItems, escapeHtml, mealCategoryKeys } from "../utils.js";

let activeCategory = "pomme_de_terre";

function _safeUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url, location.href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
  } catch {
    return "";
  }
  return url;
}

function _videoIcon(url) {
  if (!url) return "🔗";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "▶️";
  if (url.includes("instagram.com")) return "📸";
  if (url.includes("tiktok.com")) return "🎵";
  return "🔗";
}

async function _addItemsToShopping(items, isoYear, isoWeek) {
  const list = await api.getShopping(isoYear, isoWeek);
  const existing = list.items || [];
  const newItems = items.map((t) => ({ text: t, checked: false }));
  await api.putShopping(isoYear, isoWeek, mergeShoppingItems(existing, newItems));
}

export async function renderRecette(root) {
  root.innerHTML = `
    <div class="page-header" style="background:var(--accent-dark)">
      <h1>📖 Recettes</h1>
    </div>
    <div class="cat-tabs" id="rec-cat-tabs"></div>
    <div id="rec-dish-list"></div>`;

  renderCatTabs();
  loadDishes();
}

function renderCatTabs() {
  const tabs = document.getElementById("rec-cat-tabs");
  if (!tabs) return;
  tabs.innerHTML = "";
  for (const cat of mealCategoryKeys()) {
    const btn = document.createElement("button");
    btn.className = `cat-tab ${CAT_CSS[cat]}` + (cat === activeCategory ? " active" : "");
    btn.textContent = CAT_LABELS[cat];
    btn.onclick = () => { activeCategory = cat; renderCatTabs(); loadDishes(); };
    tabs.appendChild(btn);
  }
}

async function loadDishes() {
  const container = document.getElementById("rec-dish-list");
  if (!container) return;
  container.innerHTML = `<div class="loader-wrap"><div class="spinner"></div><span>Chargement…</span></div>`;
  try {
    const dishes = await api.getDishes({ category: activeCategory, active: true });
    renderDishList(container, dishes);
  } catch (err) {
    container.innerHTML = `<div class="text-muted p-16">${escapeHtml(err.message)}</div>`;
  }
}

function renderDishList(container, dishes) {
  container.innerHTML = "";
  if (!dishes.length) {
    container.innerHTML = `<div class="text-muted p-16">Aucun plat dans cette catégorie.</div>`;
    return;
  }

  const withRecipe = dishes.filter((d) => d.ingredients.length || d.instructions.length);
  const withoutRecipe = dishes.filter((d) => !d.ingredients.length && !d.instructions.length);

  if (withRecipe.length) {
    const header = document.createElement("div");
    header.style.cssText = "padding:10px 16px 2px;font-size:10px;font-weight:700;color:#8A8271;text-transform:uppercase;letter-spacing:.6px";
    header.textContent = "Avec recette";
    container.appendChild(header);
    for (const dish of withRecipe) container.appendChild(makeDishRow(dish));
  }
  if (withoutRecipe.length) {
    const header = document.createElement("div");
    header.style.cssText = "padding:10px 16px 2px;font-size:10px;font-weight:700;color:#A79E8A;text-transform:uppercase;letter-spacing:.6px";
    header.textContent = "Sans recette";
    container.appendChild(header);
    for (const dish of withoutRecipe) container.appendChild(makeDishRow(dish));
  }
}

function _sourceMeta(dish) {
  if (!dish.source_url) return null;
  const url = dish.source_url;
  if (url.includes("youtube.com") || url.includes("youtu.be"))
    return { icon: "▶️", name: "YouTube", color: "#FF0000" };
  if (url.includes("instagram.com"))
    return { icon: "📸", name: "Instagram", color: "#C13584" };
  if (url.includes("tiktok.com"))
    return { icon: "🎵", name: "TikTok", color: "#010101" };
  return { icon: "🔗", name: "Source", color: "#6B6353" };
}

function makeDishRow(dish) {
  const card = document.createElement("div");
  card.style.cssText = `
    display:flex;align-items:stretch;background:white;border-radius:14px;
    margin:6px 12px;box-shadow:0 1px 6px rgba(0,0,0,.09);overflow:hidden;cursor:pointer;
    transition:box-shadow .15s`;
  card.onmouseenter = () => { card.style.boxShadow = "0 3px 14px rgba(0,0,0,.14)"; };
  card.onmouseleave = () => { card.style.boxShadow = "0 1px 6px rgba(0,0,0,.09)"; };

  // Thumbnail
  const thumb = document.createElement("div");
  thumb.style.cssText = "width:86px;flex-shrink:0;background:#E3DED0;position:relative;overflow:hidden";
  if (dish.thumbnail_url) {
    const img = document.createElement("img");
    img.src = dish.thumbnail_url;
    img.style.cssText = "width:100%;height:100%;object-fit:cover";
    img.onerror = () => { img.remove(); thumb.style.cssText += ";display:flex;align-items:center;justify-content:center;font-size:28px"; thumb.textContent = "🍽"; };
    thumb.appendChild(img);
  } else {
    thumb.style.cssText += ";display:flex;align-items:center;justify-content:center;font-size:28px";
    thumb.textContent = "🍽";
  }

  // Content
  const content = document.createElement("div");
  content.style.cssText = "flex:1;padding:10px 12px;display:flex;flex-direction:column;justify-content:center;gap:3px;min-width:0";

  const src = _sourceMeta(dish);
  if (src) {
    const srcRow = document.createElement("div");
    srcRow.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px";
    srcRow.innerHTML = `<span>${src.icon}</span><span style="font-weight:700;color:${src.color}">${src.name}</span>`;
    content.appendChild(srcRow);
  }

  const title = document.createElement("div");
  title.style.cssText = "font-size:14px;font-weight:700;color:#1a1a1a;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical";
  title.textContent = dish.name;
  content.appendChild(title);

  if (dish.author) {
    const author = document.createElement("div");
    author.style.cssText = "font-size:11px;color:#6B6353;margin-top:1px";
    author.textContent = "par " + dish.author;
    content.appendChild(author);
  }

  // Recipe indicator (top-right badge)
  const badge = document.createElement("div");
  const hasRecipe = dish.ingredients.length || dish.instructions.length;
  badge.style.cssText = `align-self:flex-start;margin:10px 10px 0 0;font-size:16px;flex-shrink:0`;
  badge.textContent = hasRecipe ? "📋" : "➕";
  badge.title = hasRecipe ? "Recette disponible" : "Ajouter une recette";

  card.append(thumb, content, badge);
  card.onclick = () => openRecipeModal(dish);
  return card;
}

export function openRecipeModal(dish) {
  const root = document.getElementById("modal-root");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const hasIngredients = dish.ingredients.length > 0;
  const hasRecipe = hasIngredients || dish.instructions.length > 0;

  const safeSourceUrl = _safeUrl(dish.source_url);
  const videoBtn = safeSourceUrl
    ? `<a href="${escapeHtml(safeSourceUrl)}" target="_blank" rel="noopener"
         class="btn btn-ghost flex-1" style="text-align:center;text-decoration:none">
         ${_videoIcon(safeSourceUrl)} Voir la vidéo
       </a>`
    : "";

  const shopBtn = hasIngredients
    ? `<button class="btn btn-primary flex-1" id="btn-add-to-shop">🛒 Ajouter aux courses</button>`
    : "";

  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h2>${escapeHtml(dish.name)}</h2>
        <button class="btn-close">✕</button>
      </div>
      <div class="modal-body" id="recipe-modal-body">
        ${renderRecipeView(dish)}
      </div>
      <div class="modal-footer" style="flex-wrap:wrap;gap:8px">
        ${shopBtn}
        ${videoBtn}
        <button class="btn btn-ghost flex-1" id="btn-edit-recipe">
          ${hasRecipe ? "✏️ Modifier" : "➕ Ajouter une recette"}
        </button>
        <button class="btn btn-danger" id="btn-delete-dish" style="padding:8px 12px;font-size:13px" title="Supprimer ce plat">🗑</button>
      </div>
    </div>`;

  root.appendChild(overlay);
  overlay.querySelector(".btn-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  overlay.querySelector("#btn-delete-dish").onclick = async () => {
    if (!confirm(`Supprimer "${dish.name}" de la base de plats ? Cette action est irréversible.`)) return;
    try {
      await api.deleteDish(dish.id);
      overlay.remove();
      showToast(`"${dish.name}" supprimé`);
      loadDishes();
    } catch (err) { showToast(err.message, "error"); }
  };

  // Check/uncheck all ingredients
  const checkAllBtn = overlay.querySelector("#btn-check-ingr-all");
  const uncheckAllBtn = overlay.querySelector("#btn-uncheck-ingr-all");
  if (checkAllBtn) {
    checkAllBtn.onclick = (e) => {
      e.stopPropagation();
      overlay.querySelectorAll(".recipe-ingr-cb").forEach((cb) => { cb.checked = true; });
    };
  }
  if (uncheckAllBtn) {
    uncheckAllBtn.onclick = (e) => {
      e.stopPropagation();
      overlay.querySelectorAll(".recipe-ingr-cb").forEach((cb) => { cb.checked = false; });
    };
  }

  // Add to shopping list
  const shopBtnEl = overlay.querySelector("#btn-add-to-shop");
  if (shopBtnEl) {
    shopBtnEl.onclick = async () => {
      const checked = [...overlay.querySelectorAll(".recipe-ingr-cb")]
        .filter((cb) => cb.checked)
        .map((cb) => cb.closest("label").querySelector(".ingr-text").textContent.trim());
      if (!checked.length) { showToast("Coche au moins un ingrédient", "error"); return; }
      const { year, week } = isoWeekOf(new Date());
      shopBtnEl.disabled = true;
      try {
        await _addItemsToShopping(checked, year, week);
        showToast(`🛒 ${checked.length} ingrédient(s) ajouté(s) — sem. ${week}`);
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        shopBtnEl.disabled = false;
      }
    };
  }

  // Edit recipe
  overlay.querySelector("#btn-edit-recipe").onclick = async () => {
    let suggestions = [];
    try { suggestions = (await api.getIngredientMap()).map((e) => e.ingredient_key); } catch {}

    const body = overlay.querySelector("#recipe-modal-body");
    body.innerHTML = renderRecipeEditShell(dish, suggestions);
    initIngrRows(body, dish.ingredients);

    overlay.querySelector(".modal-footer").innerHTML = `
      <button class="btn btn-ghost flex-1" id="btn-cancel-edit">Annuler</button>
      <button class="btn btn-primary flex-1" id="btn-save-recipe">Enregistrer</button>`;

    overlay.querySelector("#btn-cancel-edit").onclick = () => {
      overlay.remove();
      openRecipeModal(dish);
    };

    const saveBtn = overlay.querySelector("#btn-save-recipe");
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = "Enregistrement…";
      try {
        const fileInput = body.querySelector("#edit-thumb-input");
        if (fileInput?.files?.[0]) {
          const upResult = await api.uploadDishImage(dish.id, fileInput.files[0]);
          dish.thumbnail_url = upResult.thumbnail_url;
        }
        const ingredients = collectIngredients(body);
        const instrRaw = overlay.querySelector("#edit-instructions").value;
        const instructions = instrRaw.split("\n").map((l) => l.trim()).filter(Boolean);
        await api.updateDish(dish.id, { ingredients, instructions });
        dish.ingredients = ingredients;
        dish.instructions = instructions;
        showToast("Recette enregistrée");
        overlay.remove();
        loadDishes();
      } catch (err) {
        showToast(err.message, "error");
        saveBtn.disabled = false;
        saveBtn.textContent = "Enregistrer";
      }
    };
  };
}

function renderRecipeView(dish) {
  if (!dish.ingredients.length && !dish.instructions.length) {
    return `<div class="text-muted" style="text-align:center;padding:24px 0">
      Aucune recette enregistrée pour ce plat.<br>
      <span style="font-size:13px">Importe une vidéo ou ajoute-la manuellement.</span>
    </div>`;
  }

  const src = _sourceMeta(dish);
  let html = "";

  if (dish.thumbnail_url || dish.author || src) {
    html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #E3DED0">`;
    const safeThumb = _safeUrl(dish.thumbnail_url);
    if (safeThumb) {
      html += `<img src="${escapeHtml(safeThumb)}" style="width:72px;height:72px;object-fit:cover;border-radius:10px;flex-shrink:0" onerror="this.style.display='none'">`;
    }
    html += `<div style="min-width:0">`;
    if (src) html += `<div style="font-size:11px;font-weight:700;color:${src.color};margin-bottom:2px">${src.icon} ${src.name}</div>`;
    html += `<div style="font-size:13px;font-weight:700;color:#222;line-height:1.3">${escapeHtml(dish.name)}</div>`;
    if (dish.author) html += `<div style="font-size:11px;color:#6B6353;margin-top:2px">par ${escapeHtml(dish.author)}</div>`;
    html += `</div></div>`;
  }

  if (dish.ingredients.length) {
    html += `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-weight:700;color:var(--shopping-header);font-size:14px">📦 Ingrédients</div>
        <div style="display:flex;gap:4px">
          <button id="btn-check-ingr-all" class="btn btn-sm btn-ghost" style="font-size:11px;padding:3px 8px">Tout ✓</button>
          <button id="btn-uncheck-ingr-all" class="btn btn-sm btn-ghost" style="font-size:11px;padding:3px 8px">Tout ✗</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:16px;border:1px solid #E3DED0;border-radius:10px;padding:8px">
        ${dish.ingredients.map((ing) => `
          <label class="recipe-ingr-row" style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;border-radius:6px"
            onmouseenter="this.style.background='#EDE7DA'" onmouseleave="this.style.background=''">
            <input type="checkbox" checked class="recipe-ingr-cb"
              style="width:16px;height:16px;accent-color:var(--shopping-header);flex-shrink:0">
            <span class="ingr-text" style="font-size:13px;flex:1">${escapeHtml(ing)}</span>
          </label>
        `).join("")}
      </div>`;
  }

  if (dish.instructions.length) {
    html += `
      <div style="font-weight:700;color:var(--accent-dark);margin-bottom:6px;font-size:14px">📋 Instructions</div>
      <ol style="padding-left:18px;display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
        ${dish.instructions.map((s) => `<li style="font-size:13px;line-height:1.5;color:#333">${escapeHtml(s)}</li>`).join("")}
      </ol>`;
  }

  return html;
}

// ── Recipe edit helpers ───────────────────────────────────────────────────────

function parseIngredient(str) {
  const sep = str.indexOf(" — ");
  if (sep === -1) return { name: str.trim(), qty: "" };
  return { name: str.slice(0, sep).trim(), qty: str.slice(sep + 3).trim() };
}

function renderRecipeEditShell(dish, suggestions) {
  const datalistOpts = suggestions
    .map((s) => `<option value="${escapeHtml(s)}">`)
    .join("");
  const safeEditThumb = _safeUrl(dish.thumbnail_url);
  const thumbHtml = safeEditThumb
    ? `<img id="edit-thumb-preview" src="${escapeHtml(safeEditThumb)}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0">`
    : `<div id="edit-thumb-preview" style="width:70px;height:70px;border-radius:8px;background:#E3DED0;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">🍽</div>`;
  return `
    <datalist id="ingr-suggestions">${datalistOpts}</datalist>
    <div style="margin-bottom:14px">
      <label style="font-size:13px;font-weight:700;color:#555;margin-bottom:6px;display:block">📷 Photo</label>
      <div style="display:flex;align-items:center;gap:10px">
        ${thumbHtml}
        <div>
          <input type="file" id="edit-thumb-input" accept="image/*" style="display:none">
          <button type="button" id="edit-thumb-btn" class="btn btn-ghost btn-sm" style="font-size:12px">
            ${dish.thumbnail_url ? "🔄 Changer la photo" : "📷 Ajouter une photo"}
          </button>
          <div style="font-size:10px;color:#8A8271;margin-top:3px">JPG, PNG, WebP · max 5 Mo</div>
        </div>
      </div>
    </div>
    <div style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <label style="font-size:13px;font-weight:700;color:var(--shopping-header)">📦 Ingrédients</label>
        <button type="button" id="btn-add-ingr"
          style="font-size:12px;background:var(--shopping-header);color:white;padding:3px 10px;border-radius:8px">
          + Ajouter
        </button>
      </div>
      <div id="ingr-rows" style="display:flex;flex-direction:column;gap:5px"></div>
    </div>
    <div class="form-group">
      <label style="font-size:13px;font-weight:700;color:var(--accent-dark);margin-bottom:4px;display:block">
        📋 Instructions <span style="font-weight:400;color:#6B6353">(une étape par ligne)</span>
      </label>
      <textarea id="edit-instructions" rows="7"
        style="width:100%;border:1.5px solid #C9C2B4;border-radius:10px;padding:10px 12px;font-size:13px;resize:vertical;line-height:1.6"
        placeholder="Ex :&#10;Préchauffer le four à 180°C&#10;Mélanger la farine et les œufs&#10;Enfourner 25 minutes"
      >${escapeHtml(dish.instructions.join("\n"))}</textarea>
    </div>`;
}

function makeIngrRow(name = "", qty = "") {
  const row = document.createElement("div");
  row.className = "ingr-edit-row";
  row.style.cssText = "display:flex;align-items:center;gap:5px";

  const nameIn = document.createElement("input");
  nameIn.className = "ingr-name-input";
  nameIn.setAttribute("list", "ingr-suggestions");
  nameIn.value = name;
  nameIn.placeholder = "Ingrédient…";
  nameIn.style.cssText = "flex:2;border:1.5px solid #C9C2B4;border-radius:8px;padding:6px 8px;font-size:13px;min-width:0";

  const qtyIn = document.createElement("input");
  qtyIn.className = "ingr-qty-input";
  qtyIn.value = qty;
  qtyIn.placeholder = "Quantité…";
  qtyIn.style.cssText = "flex:1;border:1.5px solid #C9C2B4;border-radius:8px;padding:6px 8px;font-size:13px;min-width:0";

  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "✕";
  del.style.cssText = "color:#A79E8A;font-size:14px;flex-shrink:0;padding:0 4px";
  del.onmouseenter = () => { del.style.color = "#e74c3c"; };
  del.onmouseleave = () => { del.style.color = "#A79E8A"; };
  del.onclick = () => row.remove();

  row.append(nameIn, qtyIn, del);
  return row;
}

function initIngrRows(body, existingIngredients) {
  const rowsContainer = body.querySelector("#ingr-rows");
  for (const ingr of existingIngredients) {
    const { name, qty } = parseIngredient(ingr);
    rowsContainer.appendChild(makeIngrRow(name, qty));
  }
  if (!existingIngredients.length) rowsContainer.appendChild(makeIngrRow());

  body.querySelector("#btn-add-ingr").onclick = () => {
    rowsContainer.appendChild(makeIngrRow());
    rowsContainer.lastElementChild.querySelector(".ingr-name-input").focus();
  };

  const thumbBtn = body.querySelector("#edit-thumb-btn");
  const thumbInput = body.querySelector("#edit-thumb-input");
  if (thumbBtn && thumbInput) {
    thumbBtn.onclick = () => thumbInput.click();
    thumbInput.onchange = () => {
      const file = thumbInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const prev = body.querySelector("#edit-thumb-preview");
        if (prev.tagName === "IMG") {
          prev.src = e.target.result;
        } else {
          prev.insertAdjacentHTML("afterend", `<img id="edit-thumb-preview" src="${e.target.result}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0">`);
          prev.remove();
        }
        thumbBtn.textContent = "🔄 Changer la photo";
      };
      reader.readAsDataURL(file);
    };
  }
}

function collectIngredients(body) {
  return [...body.querySelectorAll(".ingr-edit-row")].map((row) => {
    const name = row.querySelector(".ingr-name-input").value.trim();
    const qty = row.querySelector(".ingr-qty-input").value.trim();
    if (!name) return null;
    return qty ? `${name} — ${qty}` : name;
  }).filter(Boolean);
}
