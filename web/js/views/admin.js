import { api } from "../api.js";
import { showToast } from "../components/toast.js";
import { escapeHtml } from "../utils.js";

function _tile(value, label) {
  return `<div class="card home-card" style="cursor:default;padding:14px 15px">
    <div style="font-family:var(--font-display);font-weight:800;font-size:24px">${value}</div>
    <div class="home-sub" style="margin-top:2px">${label}</div>
  </div>`;
}

function _fmtSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " Mo";
  return Math.max(1, Math.round(bytes / 1024)) + " Ko";
}

export async function renderAdmin(root) {
  root.innerHTML = `
    <div class="page-header">
      <button id="admin-back" aria-label="Retour">‹</button>
      <h1>Espace admin</h1>
    </div>
    <div id="admin-body" style="padding:0 16px 16px;display:flex;flex-direction:column;gap:12px;max-width:560px;margin:0 auto;width:100%">
      <div class="loader-wrap"><div class="spinner"></div></div>
    </div>`;
  root.querySelector("#admin-back").onclick = () => { location.hash = "#/reglages"; };

  let stats, backups;
  try {
    [stats, backups] = await Promise.all([api.adminStats(), api.adminBackups()]);
  } catch (err) {
    document.getElementById("admin-body").innerHTML =
      `<div class="empty-state"><span class="empty-icon">🔒</span>${escapeHtml(err.message)}<br>
       <span style="font-size:12px">Cet espace est réservé au propriétaire du foyer.</span></div>`;
    return;
  }

  const body = document.getElementById("admin-body");
  if (!body) return;
  const c = stats.counts;

  body.innerHTML = `
    <div class="shop-cat-title" style="padding:6px 4px 0">📊 Ce mois-ci</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${_tile(c.planned_this_month, "repas planifiés")}
      ${_tile(c.cooked_this_month, "repas cuisinés")}
    </div>
    <div class="shop-cat-title" style="padding:6px 4px 0">🏠 Le foyer</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${_tile(c.members, "membre" + (c.members > 1 ? "s" : ""))}
      ${_tile(c.dishes_active, "plats actifs")}
      ${_tile(c.dishes_with_recipe, "avec recette")}
      ${_tile(c.cooked_total, "repas cuisinés (total)")}
    </div>

    <div class="shop-cat-title" style="padding:6px 4px 0">💎 Freemium</div>
    <div class="card home-card" style="cursor:default">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-weight:700;font-size:14.5px">${stats.freemium.enabled ? "Actif" : "Désactivé"}</div>
          <div class="home-sub">${stats.freemium.enabled
            ? `imports gratuits : ${stats.freemium.import_limit}/mois par membre`
            : "tout le monde a tous les accès"}</div>
        </div>
        <button class="btn btn-ghost btn-sm" id="admin-goto-freemium">Gérer</button>
      </div>
    </div>

    <div class="shop-cat-title" style="padding:6px 4px 0">👥 Membres & autorisations</div>
    <div id="admin-members" style="display:flex;flex-direction:column;gap:8px"></div>

    <div class="shop-cat-title" style="padding:6px 4px 0">🗄️ Sauvegardes automatiques</div>
    <div class="card home-card" style="cursor:default" id="admin-backups"></div>

    <button class="btn btn-primary btn-full" id="admin-export">⬇️ Exporter toutes les données (JSON)</button>`;

  document.getElementById("admin-goto-freemium").onclick = () => { location.hash = "#/reglages"; };

  // ── Membres ──
  const membersBox = document.getElementById("admin-members");
  for (const m of stats.members) {
    const row = document.createElement("div");
    row.className = "card home-card";
    row.style.cssText = "cursor:default;padding:12px 14px";
    const quota = m.is_owner || m.is_premium
      ? "imports illimités"
      : `imports ce mois : ${m.imports_this_month}/${stats.freemium.import_limit}`;
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span class="member-dot" style="background:${escapeHtml(m.color)};width:14px;height:14px"></span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14.5px">${escapeHtml(m.name)}
            ${m.is_owner ? '<span class="badge badge-tag">propriétaire</span>' : ""}
            ${!m.is_owner && m.is_premium ? " 💎" : ""}
          </div>
          <div class="home-sub" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(m.email || "")} · ${quota}</div>
        </div>
      </div>`;
    if (!m.is_owner) {
      const btn = document.createElement("button");
      btn.className = "btn btn-sm " + (m.is_premium ? "btn-primary" : "btn-ghost");
      btn.style.cssText = "margin-top:10px;font-size:12px";
      btn.textContent = m.is_premium ? "💎 Premium — retirer" : "Accorder le premium";
      btn.onclick = async () => {
        try {
          await api.setMemberPremium(m.id, !m.is_premium);
          showToast(m.is_premium ? `Premium retiré à ${m.name}` : `💎 ${m.name} est premium`);
          renderAdmin(root);
        } catch (err) { showToast(err.message, "error"); }
      };
      row.appendChild(btn);
    }
    membersBox.appendChild(row);
  }

  // ── Sauvegardes ──
  const bBox = document.getElementById("admin-backups");
  if (!backups.supported) {
    bBox.innerHTML = `<div class="home-sub">Base MySQL — sauvegardes gérées côté hébergeur.</div>`;
  } else if (!backups.backups.length) {
    bBox.innerHTML = `<div class="home-sub">Aucune sauvegarde pour l'instant — la première se fera cette nuit à 3h30.</div>`;
  } else {
    bBox.innerHTML = backups.backups.slice(0, 7).map((b) => {
      const d = new Date(b.modified_at);
      return `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid var(--line)">
        <span style="font-weight:600">${escapeHtml(b.name)}</span>
        <span class="home-sub">${d.toLocaleDateString("fr-FR")} · ${_fmtSize(b.size)}</span>
      </div>`;
    }).join("") + (backups.backups.length > 7
      ? `<div class="home-sub" style="padding-top:6px">+ ${backups.backups.length - 7} plus anciennes (14 jours conservés)</div>` : "");
  }

  // ── Export JSON ──
  document.getElementById("admin-export").onclick = async () => {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `menus-famille-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("Export téléchargé ✓");
    } catch (err) { showToast(err.message, "error"); }
  };
}
