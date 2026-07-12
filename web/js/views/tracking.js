import { api } from "../api.js";
import { CAT_LABELS, escapeHtml } from "../utils.js";

let sortKey = "count";
let sortAsc = true;
let filterCat = "";
let data = [];

const CATEGORIES = ["", "pomme_de_terre", "riz", "pates", "entree", "autre", "sucree", "africain", "apero", "sauce"];

export async function renderTracking(root) {
  root.innerHTML = `
    <div class="page-header"><h1>Suivi de rotation</h1></div>
    <div style="padding:10px 16px;background:white;border-bottom:1px solid #E3DED0;display:flex;gap:8px;align-items:center">
      <label style="font-size:13px;font-weight:600">Catégorie :</label>
      <select id="tracking-cat-filter" style="border:1.5px solid #C9C2B4;border-radius:8px;padding:4px 8px;font-size:13px">
        ${CATEGORIES.map((c) => `<option value="${c}">${c ? CAT_LABELS[c] : "Toutes"}</option>`).join("")}
      </select>
    </div>
    <div style="overflow-x:auto">
      <table class="tracking-table" id="tracking-table">
        <thead>
          <tr>
            <th data-key="category">Catégorie</th>
            <th data-key="name">Plat</th>
            <th data-key="count">Réalisé ↕</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody id="tracking-body"></tbody>
      </table>
    </div>`;

  document.getElementById("tracking-cat-filter").onchange = (e) => {
    filterCat = e.target.value;
    renderRows();
  };
  document.querySelectorAll(".tracking-table th[data-key]").forEach((th) => {
    th.onclick = () => {
      if (sortKey === th.dataset.key) sortAsc = !sortAsc;
      else { sortKey = th.dataset.key; sortAsc = true; }
      renderRows();
    };
  });

  try {
    data = await api.getTracking();
    renderRows();
  } catch (err) {
    document.getElementById("tracking-body").innerHTML =
      `<tr><td colspan="4" class="text-muted" style="padding:16px">${err.message}</td></tr>`;
  }
}

function renderRows() {
  const body = document.getElementById("tracking-body");
  if (!body) return;

  let rows = filterCat ? data.filter((r) => r.category === filterCat) : [...data];
  rows.sort((a, b) => {
    let va, vb;
    if (sortKey === "count") { va = a.count; vb = b.count; }
    else if (sortKey === "name") { va = a.dish.name.toLowerCase(); vb = b.dish.name.toLowerCase(); }
    else { va = a.category; vb = b.category; }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  body.innerHTML = rows.map((r) => `
    <tr class="${r.count === 0 ? "priority-row" : ""}">
      <td>${CAT_LABELS[r.category] || r.category}</td>
      <td>${escapeHtml(r.dish.name)}${r.dish.source_tag ? ` <span class="badge badge-tag">${escapeHtml(r.dish.source_tag)}</span>` : ""}</td>
      <td>${r.count === 0 ? "⭐ 0" : r.count}</td>
      <td>${r.status}</td>
    </tr>`).join("");
}
