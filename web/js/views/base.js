import { api } from "../api.js";
import { showToast } from "../components/toast.js";
import { CAT_LABELS, CAT_CSS, escapeHtml } from "../utils.js";

const CATEGORIES = ["pomme_de_terre", "riz", "pates", "entree", "autre", "sucree", "africain"];
let activeCategory = "pomme_de_terre";
let trackingData = [];

export async function renderBase(root) {
  root.innerHTML = `
    <div class="page-header"><h1>Base de plats</h1>
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
  if (dishes.length === 0) {
    container.innerHTML = `<div class="text-muted p-16">Aucun plat dans cette catégorie.</div>`;
    return;
  }
  for (const dish of dishes) {
    const t = trackingData.find((x) => x.dish.id === dish.id);
    const count = t ? t.count : 0;
    const row = document.createElement("div");
    row.className = "dish-row" + (dish.active ? "" : " inactive");

    const nameEl = document.createElement("span");
    nameEl.className = "dish-name";
    nameEl.textContent = dish.name;
    if (dish.source_tag) {
      const tag = document.createElement("span");
      tag.className = "badge badge-tag";
      tag.textContent = dish.source_tag;
      nameEl.append(" ", tag);
    }

    const countEl = document.createElement("span");
    countEl.className = "count-badge";
    countEl.textContent = count > 0 ? `×${count}` : "⭐";

    const actionsEl = document.createElement("div");
    actionsEl.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-sm btn-ghost";
    editBtn.textContent = "✎";
    editBtn.onclick = () => showDishForm(dish);

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-sm btn-danger";
    delBtn.textContent = dish.active ? "🗑" : "↩";
    delBtn.title = dish.active ? "Désactiver" : "Réactiver";
    delBtn.onclick = async () => {
      try {
        if (dish.active) await api.deleteDish(dish.id);
        else await api.updateDish(dish.id, { active: true });
        loadDishes();
      } catch (err) { showToast(err.message, "error"); }
    };

    actionsEl.append(editBtn, delBtn);
    row.append(nameEl, countEl, actionsEl);
    container.appendChild(row);
  }
}

function showDishForm(dish) {
  const { openModal } = window;
  // inline modal via DOM
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
      <div class="form-group"><label>Nom</label><input id="dish-name-input" value="${dish ? escapeHtml(dish.name) : ""}" /></div>
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
