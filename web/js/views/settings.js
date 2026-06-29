import { api } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../components/toast.js";
import { CAT_LABELS, DAYS_FULL_FR, escapeHtml } from "../utils.js";

const CATEGORIES = ["pomme_de_terre", "riz", "pates", "entree", "autre", "sucree", "africain"];

export async function renderSettings(root) {
  root.innerHTML = `<div class="page-header"><h1>Réglages</h1></div><div id="settings-body" style="padding:12px"></div>`;
  const body = document.getElementById("settings-body");

  let sett, members;
  try {
    [sett, members] = await Promise.all([api.getSettings(), api.getMembers()]);
  } catch (err) {
    body.innerHTML = `<div class="text-muted">${err.message}</div>`;
    return;
  }

  // Section roulement
  const sec1 = document.createElement("div");
  sec1.className = "settings-section";
  sec1.innerHTML = `<h2>Roulement jour → catégorie</h2>`;
  for (let i = 0; i < 7; i++) {
    const row = document.createElement("div");
    row.className = "settings-row";
    const lbl = document.createElement("label");
    lbl.textContent = DAYS_FULL_FR[i];
    const sel = document.createElement("select");
    sel.dataset.dow = i;
    for (const cat of CATEGORIES) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = CAT_LABELS[cat];
      if (sett.weekday_category_map[String(i)] === cat) opt.selected = true;
      sel.appendChild(opt);
    }
    row.append(lbl, sel);
    sec1.appendChild(row);
  }

  // Dessert toggle
  const dessertRow = document.createElement("div");
  dessertRow.className = "settings-row";
  dessertRow.innerHTML = `
    <label>Dessert activé</label>
    <label class="toggle">
      <input type="checkbox" id="dessert-toggle" ${sett.dessert_enabled ? "checked" : ""} />
      <span class="toggle-slider"></span>
    </label>`;
  sec1.appendChild(dessertRow);

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-primary btn-full mt-8";
  saveBtn.textContent = "Enregistrer les réglages";
  saveBtn.onclick = async () => {
    const map = {};
    sec1.querySelectorAll("select[data-dow]").forEach((s) => { map[s.dataset.dow] = s.value; });
    const dessertEnabled = document.getElementById("dessert-toggle").checked;
    try {
      await api.putSettings({ weekday_category_map: map, dessert_enabled: dessertEnabled });
      showToast("Réglages enregistrés ✓");
    } catch (err) { showToast(err.message, "error"); }
  };
  sec1.appendChild(saveBtn);

  // Section membres
  const sec2 = document.createElement("div");
  sec2.className = "settings-section mt-16";
  sec2.innerHTML = `<h2>Membres du foyer</h2>`;
  const memberList = document.createElement("div");
  for (const m of members) {
    const row = document.createElement("div");
    row.className = "settings-row";
    row.innerHTML = `<span class="member-dot" style="background:${escapeHtml(m.color)}"></span><span style="flex:1">${escapeHtml(m.name)}</span>`;
    memberList.appendChild(row);
  }
  sec2.appendChild(memberList);

  const addMemberRow = document.createElement("div");
  addMemberRow.className = "settings-row";
  addMemberRow.innerHTML = `
    <input id="new-member-name" placeholder="Prénom…" style="flex:1;border:1.5px solid #ddd;border-radius:8px;padding:6px 10px;font-size:13px" />
    <input type="color" id="new-member-color" value="#4B8FA6" style="width:36px;height:36px;border:none;cursor:pointer" />
    <button class="btn btn-primary btn-sm" id="add-member-btn">+ Ajouter</button>`;
  sec2.appendChild(addMemberRow);

  document.addEventListener("click", async (e) => {
    if (e.target.id === "add-member-btn") {
      const name = document.getElementById("new-member-name")?.value?.trim();
      const color = document.getElementById("new-member-color")?.value;
      if (!name) return;
      try {
        await api.createMember(name, color);
        showToast(`${name} ajouté`);
        renderSettings(root);
      } catch (err) { showToast(err.message, "error"); }
    }
  }, { once: true });

  // Déconnexion
  const sec3 = document.createElement("div");
  sec3.className = "settings-section mt-16";
  const logoutBtn = document.createElement("button");
  logoutBtn.className = "btn btn-danger btn-full";
  logoutBtn.textContent = "Se déconnecter";
  logoutBtn.onclick = () => {
    state.clearAuth();
    location.hash = "#/login";
  };
  sec3.appendChild(logoutBtn);

  body.append(sec1, sec2, sec3);
  renderShopCategories(body);
}

// ── Catégories de courses ─────────────────────────────────────────────────────

async function renderShopCategories(body) {
  // Build placeholder section immediately
  const sec = document.createElement("div");
  sec.className = "settings-section mt-16";
  sec.id = "sec-shop-cats";
  const catsEnabled = localStorage.getItem("shop_categories_enabled") !== "false";
  sec.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <h2 style="margin:0">Catégories de courses</h2>
      <label class="toggle" style="margin:0" title="Activer / désactiver le regroupement par catégorie dans les courses">
        <input type="checkbox" id="shop-cats-toggle" ${catsEnabled ? "checked" : ""} />
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div id="shop-cats-body">
      <div id="shop-cats-list" style="display:flex;flex-direction:column;gap:8px"></div>
      <button class="btn btn-primary btn-sm mt-8" id="shop-cat-add">+ Nouvelle catégorie</button>
      <h2 style="margin-top:24px">Associer un ingrédient</h2>
      <div style="font-size:12px;color:#888;margin-bottom:8px">Modifiez la catégorie attribuée à chaque ingrédient connu.</div>
      <div id="ingr-map-list" style="display:flex;flex-direction:column;gap:6px"></div>
    </div>`;
  body.appendChild(sec);

  const catBody = sec.querySelector("#shop-cats-body");
  catBody.style.display = catsEnabled ? "" : "none";

  sec.querySelector("#shop-cats-toggle").onchange = (e) => {
    const enabled = e.target.checked;
    localStorage.setItem("shop_categories_enabled", enabled ? "true" : "false");
    catBody.style.display = enabled ? "" : "none";
    showToast(enabled ? "Catégories activées ✓" : "Catégories désactivées ✓");
  };

  let cats = [], ingrMap = [];
  try { [cats, ingrMap] = await Promise.all([api.getShopCategories(), api.getIngredientMap()]); }
  catch (err) { sec.querySelector("#shop-cats-list").innerHTML = `<div class="text-muted">${err.message}</div>`; return; }

  renderCatList(cats, sec.querySelector("#shop-cats-list"));
  renderIngrMap(ingrMap, cats, sec.querySelector("#ingr-map-list"));

  document.getElementById("shop-cat-add").onclick = async () => {
    const name = prompt("Nom de la nouvelle catégorie :");
    if (!name?.trim()) return;
    try {
      await api.createShopCategory(name.trim(), "#888888");
      showToast("Catégorie ajoutée ✓");
      cats = await api.getShopCategories();
      renderCatList(cats, sec.querySelector("#shop-cats-list"));
    } catch (err) { showToast(err.message, "error"); }
  };
}

function renderCatList(cats, container) {
  container.innerHTML = "";
  for (const cat of [...cats].sort((a, b) => a.sort_order - b.sort_order)) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px;background:#f8f8f8;border-radius:10px";

    const colorIn = document.createElement("input");
    colorIn.type = "color";
    colorIn.value = cat.color;
    colorIn.style.cssText = "width:28px;height:28px;border:none;cursor:pointer;border-radius:6px;flex-shrink:0";

    const nameIn = document.createElement("input");
    nameIn.value = cat.name;
    nameIn.style.cssText = "flex:1;border:1.5px solid #ddd;border-radius:8px;padding:5px 8px;font-size:13px";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "✓";
    saveBtn.style.cssText = "color:green;font-size:16px;padding:0 6px";
    saveBtn.title = "Sauvegarder";
    saveBtn.onclick = async () => {
      try {
        await api.updateShopCategory(cat.id, { name: nameIn.value.trim(), color: colorIn.value });
        showToast("Catégorie mise à jour ✓");
        row.style.background = "#e8f5e9";
        setTimeout(() => { row.style.background = "#f8f8f8"; }, 1200);
      } catch (err) { showToast(err.message, "error"); }
    };

    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑";
    delBtn.style.cssText = "font-size:15px;color:#aaa;padding:0 4px";
    delBtn.title = "Supprimer";
    delBtn.onclick = async () => {
      if (!confirm(`Supprimer "${cat.name}" ? Les ingrédients associés seront déplacés vers "Autres".`)) return;
      try {
        await api.deleteShopCategory(cat.id);
        showToast("Supprimée ✓");
        row.remove();
      } catch (err) { showToast(err.message, "error"); }
    };

    row.append(colorIn, nameIn, saveBtn, delBtn);
    container.appendChild(row);
  }
}

function renderIngrMap(ingrMap, cats, container) {
  container.innerHTML = "";
  if (!ingrMap.length) {
    container.innerHTML = `<div class="text-muted" style="font-size:12px">Aucun ingrédient enregistré. Ajoutez des articles à vos listes de courses d'abord.</div>`;
    return;
  }
  for (const entry of ingrMap) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0f0f0";

    const label = document.createElement("span");
    label.textContent = entry.ingredient_key;
    label.style.cssText = "flex:1;font-size:13px;text-transform:capitalize";

    const sel = document.createElement("select");
    sel.style.cssText = "border:1.5px solid #ddd;border-radius:8px;padding:4px 6px;font-size:12px;max-width:200px";
    const noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "— Aucune —";
    if (!entry.category_id) noneOpt.selected = true;
    sel.appendChild(noneOpt);
    for (const cat of cats) {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      if (cat.id === entry.category_id) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.onchange = async () => {
      const newCatId = sel.value ? parseInt(sel.value) : null;
      try {
        await api.putIngredientMap(entry.ingredient_key, newCatId);
        entry.category_id = newCatId;
        row.style.background = "#e8f5e9";
        setTimeout(() => { row.style.background = ""; }, 1000);
      } catch (err) { showToast(err.message, "error"); }
    };

    const delBtn = document.createElement("button");
    delBtn.textContent = "✕";
    delBtn.title = "Supprimer cet ingrédient";
    delBtn.style.cssText = "color:#ccc;font-size:14px;padding:0 4px;flex-shrink:0";
    delBtn.onmouseenter = () => { delBtn.style.color = "#e74c3c"; };
    delBtn.onmouseleave = () => { delBtn.style.color = "#ccc"; };
    delBtn.onclick = async () => {
      try {
        await api.deleteIngredientMap(entry.ingredient_key);
        row.remove();
      } catch (err) { showToast(err.message, "error"); }
    };

    row.append(label, sel, delBtn);
    container.appendChild(row);
  }
}
