import { api } from "../api.js";
import { showToast } from "../components/toast.js";
import { escapeHtml } from "../utils.js";

function _tile(value, label) {
  return `<div class="card home-card" style="cursor:default;padding:13px 14px">
    <div style="font-family:var(--font-display);font-weight:800;font-size:22px">${value}</div>
    <div class="home-sub" style="margin-top:2px;font-size:12px">${label}</div>
  </div>`;
}

function _fmtSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " Mo";
  return Math.max(1, Math.round(bytes / 1024)) + " Ko";
}

function _fmtDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export async function renderAdmin(root) {
  root.innerHTML = `
    <div class="page-header">
      <button id="admin-back" aria-label="Retour">‹</button>
      <h1>Administration</h1>
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
       <span style="font-size:12px">Cet espace est réservé au super administrateur.</span></div>`;
    return;
  }

  const body = document.getElementById("admin-body");
  if (!body) return;
  const p = stats.platform;
  const freemiumOn = stats.households.some((h) => h.freemium_enabled);

  body.innerHTML = `
    <div class="shop-cat-title" style="padding:6px 4px 0">🌍 Plateforme</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      ${_tile(p.households, "foyer" + (p.households > 1 ? "s" : ""))}
      ${_tile(p.members, "utilisateur" + (p.members > 1 ? "s" : ""))}
      ${_tile("+" + p.new_members_this_month, "inscrits ce mois")}
      ${_tile(p.dishes_total, "plats créés")}
      ${_tile(p.planned_this_month, "repas planifiés/mois")}
      ${_tile(p.imports_this_month, "imports ce mois")}
    </div>

    <div class="shop-cat-title" style="padding:6px 4px 0">💎 Freemium plateforme</div>
    <div class="card home-card" style="cursor:default">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div>
          <div style="font-weight:700;font-size:14.5px">${freemiumOn ? "Actif sur la plateforme" : "Désactivé"}</div>
          <div class="home-sub">${freemiumOn
            ? `imports gratuits : ${p.import_limit}/mois — premium accordé par vous uniquement`
            : "tous les utilisateurs ont tous les accès"}</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="admin-freemium" ${freemiumOn ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="shop-cat-title" style="padding:6px 4px 0">🏠 Foyers (${stats.households.length})</div>
    <div id="admin-households" style="display:flex;flex-direction:column;gap:8px"></div>

    <div class="shop-cat-title" style="padding:6px 4px 0">👥 Utilisateurs (${stats.members.length})</div>
    <div id="admin-members" style="display:flex;flex-direction:column;gap:8px"></div>

    <div class="shop-cat-title" style="padding:6px 4px 0">🗄️ Sauvegardes automatiques</div>
    <div class="card home-card" style="cursor:default" id="admin-backups"></div>

    <button class="btn btn-primary btn-full" id="admin-export">⬇️ Exporter les données de mon foyer (JSON)</button>`;

  // ── Freemium plateforme ──
  document.getElementById("admin-freemium").onchange = async (e) => {
    const on = e.target.checked;
    if (!confirm(on
      ? "Activer le freemium sur TOUTE la plateforme ?\nLes utilisateurs non premium seront limités (imports, IA)."
      : "Désactiver le freemium partout ?\nTous les utilisateurs retrouveront tous les accès.")) {
      e.target.checked = !on;
      return;
    }
    try {
      const r = await api.adminSetFreemium(on);
      showToast(`💎 Freemium ${on ? "activé" : "désactivé"} sur ${r.households_updated} foyer(s)`);
      renderAdmin(root);
    } catch (err) {
      e.target.checked = !on;
      showToast(err.message, "error");
    }
  };

  // ── Foyers ──
  const hhBox = document.getElementById("admin-households");
  for (const h of stats.households) {
    const row = document.createElement("div");
    row.className = "card home-card";
    row.style.cssText = "cursor:default;padding:12px 14px";
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14.5px">${escapeHtml(h.name)}
            ${h.is_admin_household ? '<span class="badge badge-tag">votre foyer</span>' : ""}
          </div>
          <div class="home-sub" style="font-size:12px">
            ${h.members} membre${h.members > 1 ? "s" : ""} · ${h.dishes} plat${h.dishes > 1 ? "s" : ""} ·
            ${h.planned_this_month} repas ce mois · créé le ${_fmtDate(h.created_at)}
          </div>
        </div>
        ${h.is_admin_household ? "" : `<button class="btn btn-danger btn-sm" data-del-hh="${h.id}" style="font-size:11px;padding:5px 9px">🗑</button>`}
      </div>`;
    const delBtn = row.querySelector("[data-del-hh]");
    if (delBtn) {
      delBtn.onclick = async () => {
        if (!confirm(`Supprimer le foyer « ${h.name} » et TOUTES ses données ?\n(${h.members} membre(s), ${h.dishes} plat(s))\n\nCette action est irréversible.`)) return;
        try {
          await api.adminDeleteHousehold(h.id);
          showToast(`Foyer « ${h.name} » supprimé`);
          renderAdmin(root);
        } catch (err) { showToast(err.message, "error"); }
      };
    }
    hhBox.appendChild(row);
  }

  // ── Utilisateurs ──
  const membersBox = document.getElementById("admin-members");
  for (const m of stats.members) {
    const row = document.createElement("div");
    row.className = "card home-card";
    row.style.cssText = "cursor:default;padding:12px 14px";
    const quota = m.premium_active
      ? "imports illimités"
      : `imports : ${m.imports_this_month}/${p.import_limit}`;
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span class="member-dot" style="background:${escapeHtml(m.color)};width:14px;height:14px;flex-shrink:0"></span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px">${escapeHtml(m.name)}
            ${m.is_self ? '<span class="badge badge-tag">vous</span>' : ""}
            ${m.is_owner ? '<span class="badge badge-tag">propriétaire</span>' : ""}
            ${m.is_premium ? " 💎" : ""}
          </div>
          <div class="home-sub" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${escapeHtml(m.email || "")} · ${escapeHtml(m.household_name)} · ${quota}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:9px">
        <button class="btn btn-sm ${m.is_premium ? "btn-primary" : "btn-ghost"} flex-1" data-prem style="font-size:11.5px">
          ${m.is_premium ? "💎 Premium — retirer" : "Accorder le premium"}
        </button>
        ${m.is_self ? "" : `<button class="btn btn-danger btn-sm" data-del style="font-size:11px;padding:5px 10px">🗑</button>`}
      </div>`;
    row.querySelector("[data-prem]").onclick = async () => {
      try {
        await api.adminSetPremium(m.id, !m.is_premium);
        showToast(m.is_premium ? `Premium retiré à ${m.name}` : `💎 ${m.name} est premium`);
        renderAdmin(root);
      } catch (err) { showToast(err.message, "error"); }
    };
    const delBtn = row.querySelector("[data-del]");
    if (delBtn) {
      delBtn.onclick = async () => {
        if (!confirm(`Supprimer le compte de ${m.name} (${m.email}) ?`)) return;
        try {
          await api.adminDeleteMember(m.id);
          showToast(`Compte de ${m.name} supprimé`);
          renderAdmin(root);
        } catch (err) { showToast(err.message, "error"); }
      };
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
      return `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid var(--line)">
        <span style="font-weight:600">${escapeHtml(b.name)}</span>
        <span class="home-sub">${_fmtDate(b.modified_at)} · ${_fmtSize(b.size)}</span>
      </div>`;
    }).join("") + (backups.backups.length > 7
      ? `<div class="home-sub" style="padding-top:6px">+ ${backups.backups.length - 7} plus anciennes (14 jours conservés)</div>` : "");
  }

  // ── Export JSON (foyer de l'admin) ──
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
