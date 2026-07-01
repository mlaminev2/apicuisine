import { api } from "../api.js";
import { showToast } from "../components/toast.js";
import { CAT_LABELS, CAT_CSS, isoWeekOf, mergeShoppingItems, escapeHtml } from "../utils.js";

const CATEGORIES = ["pomme_de_terre", "riz", "pates", "entree", "autre", "sucree", "africain"];
let activeCategory = "pomme_de_terre";
let trackingData = [];

function _safeUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url, location.href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
  } catch { return ""; }
  return url;
}

function _sourceMeta(dish) {
  if (!dish.source_url) return null;
  const url = dish.source_url;
  if (url.includes("youtube.com") || url.includes("youtu.be")) return { icon: "▶️", name: "YouTube", color: "#FF0000" };
  if (url.includes("instagram.com")) return { icon: "📸", name: "Instagram", color: "#C13584" };
  if (url.includes("tiktok.com")) return { icon: "🎵", name: "TikTok", color: "#010101" };
  return { icon: "🔗", name: "Source", color: "#888" };
}

export async function renderBase(root) {
  root.innerHTML = `
    <div class="page-header"><h1>🍽️ Plats</h1>
      <button id="btn-add-dish" class="btn btn-sm" style="background:white;color:var(--accent-dark)">+ Ajouter</button>
    </div>
    <div class="cat-tabs" id="cat-tabs"></div>
    <div id="dish-list-container"></div>`;

  document.getElementById("btn-add-dish").onclick = () => showDishForm(null);
  renderCatTabs();
  loadDishes();
}

function renderCatTabs() {
  const tabs = document.getElementById("cat-tabs");
  if (!tabs) return;
  tabs.innerHTML = "";
  for (const cat of CATEGORIES) {
    const btn = document.createElement("button");
    btn.className = `cat-tab ${CAT_CSS[cat]}` + (cat === activeCategory ? " active" : "");
    btn.textContent = CAT_LABELS[cat];
    btn.onclick = () => { activeCategory = cat; renderCatTabs(); loadDishes(); };
    tabs.appendChild(btn);
  }
}

async function loadDishes() {
  const container = document.getElementById("dish-list-container");
  if (!container) return;
  container.innerHTML = `<div class="text-muted p-16">Chargement…</div>`;
  try {
    const [dishes, tracking] = await Promise.all([
      api.getDishes({ category: activeCategory }),
      api.getTracking(),
    ]);
    trackingData = tracking;
    renderDishList(container, dishes);
  } catch (err) {
    container.innerHTML = `<div class="text-muted p-16">${err.message}</div>`;
  }
}

function renderDishList(container, dishes) {
  container.innerHTML = "";
  if (!dishes.length) {
    container.innerHTML = `<div class="text-muted p-16">Aucun plat dans cette catégorie.</div>`;
    return;
  }

  const active = dishes.filter((d) => d.active);
  const inactive = dishes.filter((d) => !d.active);

  for (const dish of active) container.appendChild(makeDishCard(dish));

  if (inactive.length) {
    const sep = document.createElement("div");
    sep.style.cssText = "padding:10px 16px 2px;font-size:10px;font-weight:700;color:#ccc;text-transform:uppercase;letter-spacing:.6px";
    sep.textContent = "Désactivés";
    container.appendChild(sep);
    for (const dish of inactive) container.appendChild(makeDishCard(dish));
  }
}

function makeDishCard(dish) {
  const t = trackingData.find((x) => x.dish.id === dish.id);
  const count = t ? t.count : 0;

  const card = document.createElement("div");
  card.style.cssText = `
    display:flex;align-items:stretch;background:white;border-radius:14px;
    margin:6px 12px;box-shadow:0 1px 6px rgba(0,0,0,.09);overflow:hidden;cursor:pointer;
    transition:box-shadow .15s;${!dish.active ? "opacity:.5;" : ""}`;
  card.onmouseenter = () => { card.style.boxShadow = "0 3px 14px rgba(0,0,0,.14)"; };
  card.onmouseleave = () => { card.style.boxShadow = "0 1px 6px rgba(0,0,0,.09)"; };

  // Thumbnail
  const thumb = document.createElement("div");
  thumb.style.cssText = "width:86px;flex-shrink:0;background:#f0f0f0;position:relative;overflow:hidden";
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
  if (dish.source_tag) {
    const tag = document.createElement("span");
    tag.className = "badge badge-tag";
    tag.textContent = dish.source_tag;
    tag.style.cssText = "margin-left:4px;font-size:10px;vertical-align:middle";
    title.appendChild(tag);
  }
  content.appendChild(title);

  if (dish.author) {
    const author = document.createElement("div");
    author.style.cssText = "font-size:11px;color:#999;margin-top:1px";
    author.textContent = "par " + dish.author;
    content.appendChild(author);
  }

  // Count badge (top-right)
  const badge = document.createElement("div");
  badge.style.cssText = "align-self:flex-start;margin:10px 10px 0 0;font-size:13px;font-weight:700;flex-shrink:0;min-width:28px;text-align:center";
  badge.textContent = count > 0 ? `×${count}` : "⭐";
  badge.title = count > 0 ? `Cuisiné ${count} fois` : "Jamais cuisiné — à prioriser";

  card.append(thumb, content, badge);
  card.onclick = () => openDishModal(dish);
  return card;
}

// ── Modal plat ────────────────────────────────────────────────────────────────

function openDishModal(dish) {
  const root = document.getElementById("modal-root");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const hasIngredients = dish.ingredients.length > 0;
  const hasRecipe = hasIngredients || dish.instructions.length > 0;
  const safeSourceUrl = _safeUrl(dish.source_url);

  const videoBtn = safeSourceUrl
    ? `<a href="${escapeHtml(safeSourceUrl)}" target="_blank" rel="noopener"
         class="btn btn-ghost flex-1" style="text-align:center;text-decoration:none">
         🎬 Voir la vidéo
       </a>`
    : "";

  const shopBtn = hasIngredients
    ? `<button class="btn btn-primary flex-1" id="btn-add-to-shop">🛒 Courses</button>`
    : "";

  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h2>${escapeHtml(dish.name)}</h2>
        <button class="btn-close">✕</button>
      </div>
      <div class="modal-body" id="dish-modal-body">
        ${renderRecipeView(dish)}
      </div>
      <div class="modal-footer" style="flex-wrap:wrap;gap:8px">
        ${shopBtn}
        ${videoBtn}
        <button class="btn btn-ghost flex-1" id="btn-edit-dish">✏️ ${hasRecipe ? "Modifier" : "Ajouter recette"}</button>
        <button class="btn btn-danger" id="btn-delete-dish" style="padding:8px 12px;font-size:13px">🗑 Supprimer</button>
      </div>
    </div>`;

  root.appendChild(overlay);
  overlay.querySelector(".btn-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  // Check/uncheck all
  overlay.querySelector("#btn-check-ingr-all")?.addEventListener("click", (e) => {
    e.stopPropagation();
    overlay.querySelectorAll(".recipe-ingr-cb").forEach((cb) => { cb.checked = true; });
  });
  overlay.querySelector("#btn-uncheck-ingr-all")?.addEventListener("click", (e) => {
    e.stopPropagation();
    overlay.querySelectorAll(".recipe-ingr-cb").forEach((cb) => { cb.checked = false; });
  });

  // Add to shopping
  overlay.querySelector("#btn-add-to-shop")?.addEventListener("click", async () => {
    const checked = [...overlay.querySelectorAll(".recipe-ingr-cb")]
      .filter((cb) => cb.checked)
      .map((cb) => cb.closest("label").querySelector(".ingr-text").textContent.trim());
    if (!checked.length) { showToast("Coche au moins un ingrédient", "error"); return; }
    const { year, week } = isoWeekOf(new Date());
    const btn = overlay.querySelector("#btn-add-to-shop");
    btn.disabled = true;
    try {
      const list = await api.getShopping(year, week);
      const newItems = checked.map((t) => ({ text: t, checked: false }));
      await api.putShopping(year, week, mergeShoppingItems(list.items || [], newItems));
      showToast(`🛒 ${checked.length} ingrédient(s) ajouté(s) — sem. ${week}`);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  // Supprimer
  overlay.querySelector("#btn-delete-dish").onclick = async () => {
    const label = dish.active ? "Supprimer" : "Supprimer définitivement";
    if (!confirm(`${label} "${dish.name}" ?\nCette action est irréversible.`)) return;
    try {
      await api.deleteDish(dish.id);
      overlay.remove();
      showToast(`"${dish.name}" supprimé`);
      loadDishes();
    } catch (err) { showToast(err.message, "error"); }
  };

  // Edit recipe + name/category
  overlay.querySelector("#btn-edit-dish").onclick = async () => {
    let suggestions = [];
    try { suggestions = (await api.getIngredientMap()).map((e) => e.ingredient_key); } catch {}

    const body = overlay.querySelector("#dish-modal-body");
    body.innerHTML = renderEditShell(dish, suggestions);
    initIngrRows(body, dish.ingredients);

    overlay.querySelector(".modal-footer").innerHTML = `
      <button class="btn btn-ghost flex-1" id="btn-cancel-edit">Annuler</button>
      <button class="btn btn-primary flex-1" id="btn-save-dish">Enregistrer</button>`;

    overlay.querySelector("#btn-cancel-edit").onclick = () => { overlay.remove(); openDishModal(dish); };

    overlay.querySelector("#btn-save-dish").onclick = async () => {
      const saveBtn = overlay.querySelector("#btn-save-dish");
      saveBtn.disabled = true; saveBtn.textContent = "Enregistrement…";
      try {
        const fileInput = body.querySelector("#edit-thumb-input");
        if (fileInput?.files?.[0]) {
          const up = await api.uploadDishImage(dish.id, fileInput.files[0]);
          dish.thumbnail_url = up.thumbnail_url;
        }
        const name = body.querySelector("#edit-dish-name").value.trim();
        const category = body.querySelector("#edit-dish-cat").value;
        const ingredients = collectIngredients(body);
        const instructions = body.querySelector("#edit-instructions").value
          .split("\n").map((l) => l.trim()).filter(Boolean);
        await api.updateDish(dish.id, { name, category, ingredients, instructions });
        dish.name = name; dish.category = category;
        dish.ingredients = ingredients; dish.instructions = instructions;
        showToast("Plat enregistré");
        overlay.remove();
        loadDishes();
      } catch (err) {
        showToast(err.message, "error");
        saveBtn.disabled = false; saveBtn.textContent = "Enregistrer";
      }
    };
  };
}

// ── Affichage recette ─────────────────────────────────────────────────────────

function renderRecipeView(dish) {
  const src = _sourceMeta(dish);
  let html = "";

  if (dish.thumbnail_url || dish.author || src) {
    const safeThumb = _safeUrl(dish.thumbnail_url);
    html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #f0f0f0">`;
    if (safeThumb) html += `<img src="${escapeHtml(safeThumb)}" style="width:72px;height:72px;object-fit:cover;border-radius:10px;flex-shrink:0" onerror="this.style.display='none'">`;
    html += `<div style="min-width:0">`;
    if (src) html += `<div style="font-size:11px;font-weight:700;color:${src.color};margin-bottom:2px">${src.icon} ${src.name}</div>`;
    html += `<div style="font-size:13px;font-weight:700;color:#222;line-height:1.3">${escapeHtml(dish.name)}</div>`;
    if (dish.author) html += `<div style="font-size:11px;color:#999;margin-top:2px">par ${escapeHtml(dish.author)}</div>`;
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
      <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:16px;border:1px solid #eee;border-radius:10px;padding:8px">
        ${dish.ingredients.map((ing) => `
          <label class="recipe-ingr-row" style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;border-radius:6px"
            onmouseenter="this.style.background='#f5f5f5'" onmouseleave="this.style.background=''">
            <input type="checkbox" checked class="recipe-ingr-cb"
              style="width:16px;height:16px;accent-color:var(--shopping-header);flex-shrink:0">
            <span class="ingr-text" style="font-size:13px;flex:1">${escapeHtml(ing)}</span>
          </label>`).join("")}
      </div>`;
  }

  if (dish.instructions.length) {
    html += `
      <div style="font-weight:700;color:var(--accent-dark);margin-bottom:6px;font-size:14px">📋 Instructions</div>
      <ol style="padding-left:18px;display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
        ${dish.instructions.map((s) => `<li style="font-size:13px;line-height:1.5;color:#333">${escapeHtml(s)}</li>`).join("")}
      </ol>`;
  }

  if (!dish.ingredients.length && !dish.instructions.length) {
    html += `<div class="text-muted" style="text-align:center;padding:24px 0">
      Aucune recette enregistrée pour ce plat.<br>
      <span style="font-size:13px">Importe une vidéo ou ajoute-la manuellement.</span>
    </div>`;
  }

  return html;
}

// ── Formulaire ajout plat simple ──────────────────────────────────────────────

function showDishForm(dish) {
  const root = document.getElementById("modal-root");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const box = document.createElement("div");
  box.className = "modal-box";
  box.innerHTML = `
    <div class="modal-header">
      <h2>${dish ? "Modifier le plat" : "Ajouter un plat"}</h2>
      <button class="btn-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label>Nom</label>
        <input id="dish-name-input" value="${dish ? escapeHtml(dish.name) : ""}" />
      </div>
      <div class="form-group"><label>Catégorie</label>
        <select id="dish-cat-select">
          ${CATEGORIES.map((c) => `<option value="${c}"${(dish ? dish.category : activeCategory) === c ? " selected" : ""}>${CAT_LABELS[c]}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary flex-1" id="dish-save-btn">${dish ? "Enregistrer" : "Ajouter"}</button>
    </div>`;

  overlay.appendChild(box);
  root.appendChild(overlay);
  box.querySelector(".btn-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  box.querySelector("#dish-save-btn").onclick = async () => {
    const name = box.querySelector("#dish-name-input").value.trim();
    const category = box.querySelector("#dish-cat-select").value;
    if (!name) return;
    try {
      if (dish) await api.updateDish(dish.id, { name, category });
      else await api.createDish(name, category);
      overlay.remove();
      loadDishes();
      showToast(dish ? "Plat modifié" : "Plat ajouté");
    } catch (err) { showToast(err.message, "error"); }
  };
}

// ── Edition recette ───────────────────────────────────────────────────────────

function renderEditShell(dish, suggestions) {
  const datalistOpts = suggestions.map((s) => `<option value="${escapeHtml(s)}">`).join("");
  const safeThumb = _safeUrl(dish.thumbnail_url);
  const thumbHtml = safeThumb
    ? `<img id="edit-thumb-preview" src="${escapeHtml(safeThumb)}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0">`
    : `<div id="edit-thumb-preview" style="width:70px;height:70px;border-radius:8px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">🍽</div>`;
  return `
    <datalist id="ingr-suggestions">${datalistOpts}</datalist>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <div class="form-group" style="flex:1;margin:0">
        <label style="font-size:12px;font-weight:700;color:#555">Nom</label>
        <input id="edit-dish-name" value="${escapeHtml(dish.name)}" style="font-size:14px" />
      </div>
      <div class="form-group" style="flex:1;margin:0">
        <label style="font-size:12px;font-weight:700;color:#555">Catégorie</label>
        <select id="edit-dish-cat">
          ${CATEGORIES.map((c) => `<option value="${c}"${dish.category === c ? " selected" : ""}>${CAT_LABELS[c]}</option>`).join("")}
        </select>
      </div>
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:13px;font-weight:700;color:#555;margin-bottom:6px;display:block">📷 Photo</label>
      <div style="display:flex;align-items:center;gap:10px">
        ${thumbHtml}
        <div>
          <input type="file" id="edit-thumb-input" accept="image/*" style="display:none">
          <button type="button" id="edit-thumb-btn" class="btn btn-ghost btn-sm" style="font-size:12px">
            ${dish.thumbnail_url ? "🔄 Changer" : "📷 Ajouter photo"}
          </button>
          <div style="font-size:10px;color:#aaa;margin-top:3px">JPG, PNG, WebP · max 5 Mo</div>
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
        📋 Instructions <span style="font-weight:400;color:#888">(une étape par ligne)</span>
      </label>
      <textarea id="edit-instructions" rows="7"
        style="width:100%;border:1.5px solid #ddd;border-radius:10px;padding:10px 12px;font-size:13px;resize:vertical;line-height:1.6"
        placeholder="Ex :&#10;Préchauffer le four à 180°C&#10;Mélanger la farine et les œufs&#10;Enfourner 25 minutes"
      >${dish.instructions.join("\n")}</textarea>
    </div>`;
}

function makeIngrRow(name = "", qty = "") {
  const row = document.createElement("div");
  row.className = "ingr-edit-row";
  row.style.cssText = "display:flex;align-items:center;gap:5px";

  const nameIn = document.createElement("input");
  nameIn.className = "ingr-name-input";
  nameIn.setAttribute("list", "ingr-suggestions");
  nameIn.value = name; nameIn.placeholder = "Ingrédient…";
  nameIn.style.cssText = "flex:2;border:1.5px solid #ddd;border-radius:8px;padding:6px 8px;font-size:13px;min-width:0";

  const qtyIn = document.createElement("input");
  qtyIn.className = "ingr-qty-input";
  qtyIn.value = qty; qtyIn.placeholder = "Quantité…";
  qtyIn.style.cssText = "flex:1;border:1.5px solid #ddd;border-radius:8px;padding:6px 8px;font-size:13px;min-width:0";

  const del = document.createElement("button");
  del.type = "button"; del.textContent = "✕";
  del.style.cssText = "color:#ccc;font-size:14px;flex-shrink:0;padding:0 4px";
  del.onmouseenter = () => { del.style.color = "#e74c3c"; };
  del.onmouseleave = () => { del.style.color = "#ccc"; };
  del.onclick = () => row.remove();

  row.append(nameIn, qtyIn, del);
  return row;
}

function initIngrRows(body, existingIngredients) {
  const rowsContainer = body.querySelector("#ingr-rows");
  for (const ingr of existingIngredients) {
    const sep = ingr.indexOf(" — ");
    const name = sep === -1 ? ingr.trim() : ingr.slice(0, sep).trim();
    const qty = sep === -1 ? "" : ingr.slice(sep + 3).trim();
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
        if (prev.tagName === "IMG") { prev.src = e.target.result; }
        else {
          prev.insertAdjacentHTML("afterend", `<img id="edit-thumb-preview" src="${e.target.result}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0">`);
          prev.remove();
        }
        thumbBtn.textContent = "🔄 Changer";
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
