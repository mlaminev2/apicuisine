import { api } from "../api.js";
import { showToast } from "../components/toast.js";
import { CAT_LABELS, CAT_CSS, isoWeekOf, mergeShoppingItems, escapeHtml } from "../utils.js";

const CATEGORIES = ["pomme_de_terre", "riz", "pates", "entree", "autre", "sucree", "africain", "apero", "sauce"];
let activeCategory = "tous";
let searchQuery = "";
let allDishes = [];
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
  return { icon: "🔗", name: "Source", color: "#6B6353" };
}

export async function renderBase(root) {
  root.innerHTML = `
    <div class="page-header"><h1>Mes plats</h1>
      <button id="btn-add-dish" style="background:var(--terra);color:#fff;border-radius:999px" aria-label="Ajouter un plat">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>
      </button>
    </div>
    <div class="plats-search">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.2-3.2"/></svg>
      <input id="dish-search" placeholder="Rechercher un plat…" autocomplete="off" />
    </div>
    <div class="cat-tabs" id="cat-tabs"></div>
    <div id="dish-list-container"></div>`;

  document.getElementById("btn-add-dish").onclick = () => showDishForm(null);
  document.getElementById("dish-search").oninput = (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderDishList(document.getElementById("dish-list-container"));
  };
  renderCatTabs();
  loadDishes();
}

function renderCatTabs() {
  const tabs = document.getElementById("cat-tabs");
  if (!tabs) return;
  tabs.innerHTML = "";
  const allBtn = document.createElement("button");
  const total = allDishes.filter((d) => d.active).length;
  allBtn.className = "cat-tab" + (activeCategory === "tous" ? " active" : "");
  allBtn.textContent = total ? `Tous · ${total}` : "Tous";
  allBtn.onclick = () => { activeCategory = "tous"; renderCatTabs(); renderDishList(document.getElementById("dish-list-container")); };
  tabs.appendChild(allBtn);
  // Onglet Favoris
  const favCount = allDishes.filter((d) => d.active && d.is_favorite).length;
  const favBtn = document.createElement("button");
  favBtn.className = "cat-tab cat-fav" + (activeCategory === "favoris" ? " active" : "");
  favBtn.textContent = favCount ? `★ Favoris · ${favCount}` : "★ Favoris";
  favBtn.onclick = () => { activeCategory = "favoris"; renderCatTabs(); renderDishList(document.getElementById("dish-list-container")); };
  tabs.appendChild(favBtn);
  for (const cat of CATEGORIES) {
    const btn = document.createElement("button");
    btn.className = `cat-tab ${CAT_CSS[cat]}` + (cat === activeCategory ? " active" : "");
    btn.textContent = CAT_LABELS[cat];
    btn.onclick = () => { activeCategory = cat; renderCatTabs(); renderDishList(document.getElementById("dish-list-container")); };
    tabs.appendChild(btn);
  }
}

async function loadDishes() {
  const container = document.getElementById("dish-list-container");
  if (!container) return;
  container.innerHTML = `<div class="loader-wrap"><div class="spinner"></div><span>Chargement…</span></div>`;
  try {
    const [dishes, tracking] = await Promise.all([
      api.getDishes({}),
      api.getTracking(),
    ]);
    allDishes = dishes;
    trackingData = tracking;
    renderCatTabs();
    renderDishList(container);
  } catch (err) {
    container.innerHTML = `<div class="text-muted p-16">${err.message}</div>`;
  }
}

function renderDishList(container) {
  if (!container) return;
  container.innerHTML = "";
  let dishes = allDishes.filter((d) => d.active);
  if (activeCategory === "favoris") dishes = dishes.filter((d) => d.is_favorite);
  else if (activeCategory !== "tous") dishes = dishes.filter((d) => d.category === activeCategory);
  if (searchQuery) dishes = dishes.filter((d) => d.name.toLowerCase().includes(searchQuery));

  if (!dishes.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">🍽️</span>Aucun plat trouvé.</div>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "plats-grid stagger-in";
  dishes.forEach((dish, i) => grid.appendChild(makePlatCard(dish, i)));
  container.appendChild(grid);
}

function makePlatCard(dish, index) {
  const t = trackingData.find((x) => x.dish.id === dish.id);
  const count = t ? t.count : 0;

  const card = document.createElement("button");
  card.className = "plat-card" + (dish.active ? "" : " inactive");

  const safeThumb = _safeUrl(dish.thumbnail_url);
  const phClass = index % 3 === 1 ? " ph-2" : index % 3 === 2 ? " ph-3" : "";
  const thumbHtml = safeThumb
    ? `<img class="plat-thumb" src="${escapeHtml(safeThumb)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'plat-thumb${phClass}'}))">`
    : `<div class="plat-thumb${phClass}"></div>`;

  const meta = [CAT_LABELS[dish.category] || dish.category];
  meta.push(count > 0 ? `×${count}` : "jamais cuisiné ⭐");

  card.innerHTML = `
    ${thumbHtml}
    <span class="plat-star${dish.is_favorite ? " on" : ""}" role="button" aria-label="Favori" title="Favori">${dish.is_favorite ? "★" : "☆"}</span>
    <div class="plat-body">
      <div class="plat-name">${escapeHtml(dish.name)}</div>
      <div class="plat-meta">${escapeHtml(meta.join(" · "))}</div>
    </div>`;
  card.onclick = () => openDishModal(dish);
  const star = card.querySelector(".plat-star");
  star.onclick = async (e) => {
    e.stopPropagation();
    const nv = !dish.is_favorite;
    star.classList.toggle("on", nv);
    star.textContent = nv ? "★" : "☆";
    dish.is_favorite = nv;
    try {
      await api.updateDish(dish.id, { is_favorite: nv });
      renderCatTabs();
      if (activeCategory === "favoris" && !nv) renderDishList(document.getElementById("dish-list-container"));
    } catch (err) {
      dish.is_favorite = !nv;
      star.classList.toggle("on", !nv);
      star.textContent = !nv ? "★" : "☆";
      showToast(err.message, "error");
    }
  };
  return card;
}

// ── Modal plat ────────────────────────────────────────────────────────────────

export function openDishModal(dish) {
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
      <div class="modal-header" style="border-bottom:none;padding:8px 16px 0">
        <h2 style="font-size:14px;color:var(--muted)">${escapeHtml(CAT_LABELS[dish.category] || "Recette")}</h2>
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
      .map((cb) => {
        const label = cb.closest("label");
        return (label.dataset.ingr || label.querySelector(".ingr-text").textContent).trim();
      });
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
        const dietTags = body.querySelector("#edit-diet-tags").value.trim();
        await api.updateDish(dish.id, { name, category, ingredients, instructions, diet_tags: dietTags });
        dish.name = name; dish.category = category;
        dish.ingredients = ingredients; dish.instructions = instructions;
        dish.diet_tags = dietTags || null;
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
  const safeThumb = _safeUrl(dish.thumbnail_url);
  const t = trackingData.find((x) => x.dish.id === dish.id);
  const count = t ? t.count : 0;
  let html = "";

  // Héro : photo (ou motif) + catégorie + titre
  html += `
    <div class="recette-hero">
      ${safeThumb ? `<img src="${escapeHtml(safeThumb)}" alt="" onerror="this.remove()">` : ""}
      <div class="recette-hero-grad"></div>
      <div class="recette-hero-body">
        <span class="bento-pill">${escapeHtml(CAT_LABELS[dish.category] || dish.category)}</span>
        <div class="recette-hero-title">${escapeHtml(dish.name)}</div>
        ${dish.author ? `<div style="font-size:12px;opacity:.9;margin-top:2px">par ${escapeHtml(dish.author)}${src ? " · " + src.name : ""}</div>` : (src ? `<div style="font-size:12px;opacity:.9;margin-top:2px">${src.icon} ${src.name}</div>` : "")}
      </div>
    </div>`;

  // Rangée méta
  html += `
    <div class="recette-meta" style="margin-top:14px">
      <div class="recette-meta-card"><div class="v">${count > 0 ? "×" + count : "⭐"}</div><div class="l">${count > 0 ? "Cuisiné" : "Jamais cuisiné"}</div></div>
      <div class="recette-meta-card"><div class="v">${dish.ingredients.length}</div><div class="l">Ingrédient${dish.ingredients.length > 1 ? "s" : ""}</div></div>
      <div class="recette-meta-card"><div class="v">${dish.instructions.length}</div><div class="l">Étape${dish.instructions.length > 1 ? "s" : ""}</div></div>
    </div>`;

  if (dish.diet_tags) {
    const tags = dish.diet_tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (tags.length) {
      html += `<div class="diet-tags">${tags.map((t) => `<span class="diet-tag">🥗 ${escapeHtml(t)}</span>`).join("")}</div>`;
    }
  }

  if (dish.ingredients.length) {
    html += `
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="recette-section-title">Ingrédients</div>
        <div style="display:flex;gap:4px">
          <button id="btn-check-ingr-all" class="btn btn-sm btn-ghost" style="font-size:11px;padding:3px 8px">Tout ✓</button>
          <button id="btn-uncheck-ingr-all" class="btn btn-sm btn-ghost" style="font-size:11px;padding:3px 8px">Tout ✗</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column">
        ${dish.ingredients.map((ing) => {
          const sep = ing.indexOf(" — ");
          const name = sep === -1 ? ing : ing.slice(0, sep);
          const qty = sep === -1 ? "" : ing.slice(sep + 3);
          return `
          <label class="recipe-ingr-row recette-ingr-row" data-ingr="${escapeHtml(ing)}" style="cursor:pointer;align-items:center;gap:10px;display:flex">
            <input type="checkbox" checked class="recipe-ingr-cb"
              style="width:17px;height:17px;accent-color:var(--terra);flex-shrink:0">
            <span class="ingr-text" style="flex:1">${escapeHtml(name)}</span>
            ${qty ? `<span class="q">${escapeHtml(qty)}</span>` : ""}
          </label>`;
        }).join("")}
      </div>`;
  }

  if (dish.instructions.length) {
    html += `
      <div class="recette-section-title">Préparation</div>
      <ol style="padding-left:18px;display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
        ${dish.instructions.map((s) => `<li style="font-size:13.5px;line-height:1.5;color:var(--ink-soft)">${escapeHtml(s)}</li>`).join("")}
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
    : `<div id="edit-thumb-preview" style="width:70px;height:70px;border-radius:8px;background:#E3DED0;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">🍽</div>`;
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
          <div style="font-size:10px;color:#8A8271;margin-top:3px">JPG, PNG, WebP · max 5 Mo</div>
        </div>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:14px">
      <label style="font-size:13px;font-weight:700;color:#555;margin-bottom:4px;display:block">🥗 Régime / allergènes <span style="font-weight:400;color:#6B6353">(séparés par des virgules)</span></label>
      <input id="edit-diet-tags" value="${dish.diet_tags ? escapeHtml(dish.diet_tags) : ""}" placeholder="Ex : Végétarien, Sans porc, Contient gluten"
        style="width:100%;border:1.5px solid #C9C2B4;border-radius:10px;padding:9px 12px;font-size:13px" />
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
  nameIn.style.cssText = "flex:2;border:1.5px solid #C9C2B4;border-radius:8px;padding:6px 8px;font-size:13px;min-width:0";

  const qtyIn = document.createElement("input");
  qtyIn.className = "ingr-qty-input";
  qtyIn.value = qty; qtyIn.placeholder = "Quantité…";
  qtyIn.style.cssText = "flex:1;border:1.5px solid #C9C2B4;border-radius:8px;padding:6px 8px;font-size:13px;min-width:0";

  const del = document.createElement("button");
  del.type = "button"; del.textContent = "✕";
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
