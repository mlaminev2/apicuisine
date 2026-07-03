import { api } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../components/toast.js";
import { CAT_LABELS, DAYS_FULL_FR, escapeHtml } from "../utils.js";

const CATEGORIES = ["pomme_de_terre", "riz", "pates", "entree", "autre", "sucree", "africain"];

// ── Section dépliante ─────────────────────────────────────────────────────────
// Retourne { sec, body } ; l'état ouvert/fermé est mémorisé par section.
function makeSection(title, key, { open = false, badge = "" } = {}) {
  const sec = document.createElement("div");
  sec.className = "settings-section collapsible";

  const head = document.createElement("button");
  head.type = "button";
  head.className = "collapse-head";
  head.innerHTML = `
    <span class="collapse-title">${title}</span>
    ${badge ? `<span class="collapse-badge">${escapeHtml(badge)}</span>` : ""}
    <span class="collapse-chevron" aria-hidden="true">▾</span>`;

  const wrap = document.createElement("div");
  wrap.className = "collapse-wrap";
  const clip = document.createElement("div");
  clip.className = "collapse-clip";
  const body = document.createElement("div");
  body.className = "collapse-body";
  clip.appendChild(body);
  wrap.appendChild(clip);
  sec.append(head, wrap);

  const storageKey = `settings_open_${key}`;
  const setOpen = (o, save = true) => {
    sec.classList.toggle("open", o);
    head.setAttribute("aria-expanded", o ? "true" : "false");
    if (save) localStorage.setItem(storageKey, o ? "1" : "0");
  };
  const saved = localStorage.getItem(storageKey);
  setOpen(saved === null ? open : saved === "1", false);
  head.onclick = () => setOpen(!sec.classList.contains("open"));

  return { sec, body };
}

export async function renderSettings(root) {
  root.innerHTML = `<div class="page-header"><h1>Réglages</h1></div><div id="settings-body" style="padding:12px"></div>`;
  const body = document.getElementById("settings-body");

  // Bouton déconnexion rendu immédiatement — toujours visible même si l'API échoue
  const secLogout = document.createElement("div");
  secLogout.className = "settings-section";
  const logoutBtn = document.createElement("button");
  logoutBtn.className = "btn btn-danger btn-full";
  logoutBtn.textContent = "Se déconnecter";
  logoutBtn.onclick = () => { state.clearAuth(); location.hash = "#/login"; };
  secLogout.appendChild(logoutBtn);
  body.appendChild(secLogout);

  let sett, members, invite = null;
  try {
    const promises = [api.getSettings(), api.getMembers()];
    if (state.isOwner) promises.push(api.getInvite());
    const results = await Promise.all(promises);
    [sett, members] = results;
    if (state.isOwner) invite = results[2];
  } catch (err) {
    body.insertAdjacentHTML("afterbegin", `<div class="text-muted" style="margin-bottom:16px">${err.message}</div>`);
    return;
  }

  // ── Section roulement ──
  const { sec: sec1, body: sec1Body } = makeSection("📅 Roulement de la semaine", "roulement", { open: true });
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
    sec1Body.appendChild(row);
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
  sec1Body.appendChild(dessertRow);

  // Menu du midi toggle
  const lunchRow = document.createElement("div");
  lunchRow.className = "settings-row";
  lunchRow.innerHTML = `
    <label>Menu du midi activé</label>
    <label class="toggle">
      <input type="checkbox" id="lunch-toggle" ${sett.lunch_enabled ? "checked" : ""} />
      <span class="toggle-slider"></span>
    </label>`;
  sec1Body.appendChild(lunchRow);

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn-primary btn-full mt-8";
  saveBtn.textContent = "Enregistrer les réglages";
  saveBtn.onclick = async () => {
    const map = {};
    sec1Body.querySelectorAll("select[data-dow]").forEach((s) => { map[s.dataset.dow] = s.value; });
    const dessertEnabled = document.getElementById("dessert-toggle").checked;
    const lunchEnabled = document.getElementById("lunch-toggle").checked;
    try {
      await api.putSettings({ weekday_category_map: map, dessert_enabled: dessertEnabled, lunch_enabled: lunchEnabled });
      showToast("Réglages enregistrés ✓");
    } catch (err) { showToast(err.message, "error"); }
  };
  sec1Body.appendChild(saveBtn);

  // ── Section membres ──
  const { sec: sec2, body: sec2Body } = makeSection("👥 Membres du foyer", "membres", { badge: String(members.length) });
  for (const m of members) {
    const row = document.createElement("div");
    row.className = "settings-row";
    row.innerHTML = `<span class="member-dot" style="background:${escapeHtml(m.color)}"></span><span style="flex:1">${escapeHtml(m.name)}</span>${m.is_owner ? '<span style="font-size:11px;color:#888">Propriétaire</span>' : ""}`;
    if (state.isOwner && !m.is_owner) {
      const delBtn = document.createElement("button");
      delBtn.textContent = "🗑";
      delBtn.title = "Retirer ce membre";
      delBtn.style.cssText = "font-size:15px;color:#ccc;padding:0 4px;margin-left:8px";
      delBtn.onmouseenter = () => { delBtn.style.color = "#e74c3c"; };
      delBtn.onmouseleave = () => { delBtn.style.color = "#ccc"; };
      delBtn.onclick = async () => {
        if (!confirm(`Retirer ${m.name} du foyer ?`)) return;
        try {
          await api.deleteMember(m.id);
          showToast(`${m.name} retiré`);
          renderSettings(root);
        } catch (err) { showToast(err.message, "error"); }
      };
      row.appendChild(delBtn);
    }
    sec2Body.appendChild(row);
  }

  // ── Section partage d'accès (propriétaire uniquement) ──
  let sec2b = null;
  if (state.isOwner) {
    const made = makeSection("🔗 Partager l'accès", "partage");
    sec2b = made.sec;
    const shareBody = made.body;

    const codeDisplay = document.createElement("div");
    codeDisplay.style.cssText = "padding:10px;background:#f4f6f8;border-radius:10px;margin-bottom:12px;word-break:break-all";
    const updateCodeDisplay = (inv) => {
      if (inv && inv.invite_code) {
        const link = `${location.origin}/#/inscription?code=${inv.invite_code}`;
        codeDisplay.innerHTML = `
          <div style="font-size:12px;color:#888;margin-bottom:4px">Code d'invitation actif (valable 7 jours)</div>
          <div style="font-size:16px;font-weight:700;letter-spacing:.08em;color:var(--accent-dark)">${escapeHtml(inv.invite_code)}</div>
          <div style="font-size:11px;color:#aaa;margin-top:6px">Lien : <a href="${escapeHtml(link)}" style="color:var(--accent-header)">${escapeHtml(link)}</a></div>`;
      } else {
        codeDisplay.innerHTML = `<div style="font-size:13px;color:#aaa">Aucun code actif. Générez-en un pour inviter un membre.</div>`;
      }
    };
    updateCodeDisplay(invite);
    shareBody.appendChild(codeDisplay);

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:8px";

    const genBtn = document.createElement("button");
    genBtn.className = "btn btn-primary btn-sm";
    genBtn.textContent = invite && invite.invite_code ? "Régénérer" : "Générer un code";
    genBtn.onclick = async () => {
      try {
        const newInvite = await api.createInvite();
        updateCodeDisplay(newInvite);
        genBtn.textContent = "Régénérer";
        revokeBtn.style.display = "";
        showToast("Code généré ✓");
      } catch (err) { showToast(err.message, "error"); }
    };

    const revokeBtn = document.createElement("button");
    revokeBtn.className = "btn btn-ghost btn-sm";
    revokeBtn.textContent = "Révoquer";
    revokeBtn.style.display = invite && invite.invite_code ? "" : "none";
    revokeBtn.onclick = async () => {
      if (!confirm("Révoquer le code ? Les nouvelles inscriptions seront bloquées jusqu'à génération d'un nouveau code.")) return;
      try {
        await api.deleteInvite();
        updateCodeDisplay(null);
        revokeBtn.style.display = "none";
        genBtn.textContent = "Générer un code";
        showToast("Code révoqué ✓");
      } catch (err) { showToast(err.message, "error"); }
    };

    btnRow.append(genBtn, revokeBtn);
    shareBody.appendChild(btnRow);
  }

  // ── Section changement de mot de passe ──
  const { sec: sec3, body: sec3Body } = makeSection("🔒 Changer le mot de passe", "motdepasse");
  const pwdFields = document.createElement("div");
  pwdFields.style.cssText = "display:flex;flex-direction:column;gap:8px";
  pwdFields.innerHTML = `
    <input type="password" id="pwd-current" placeholder="Mot de passe actuel" autocomplete="current-password"
      style="border:1.5px solid #ddd;border-radius:8px;padding:8px 10px;font-size:13px" />
    <input type="password" id="pwd-new" placeholder="Nouveau mot de passe (8 caractères min.)" autocomplete="new-password"
      style="border:1.5px solid #ddd;border-radius:8px;padding:8px 10px;font-size:13px" />
    <input type="password" id="pwd-confirm" placeholder="Confirmer le nouveau mot de passe" autocomplete="new-password"
      style="border:1.5px solid #ddd;border-radius:8px;padding:8px 10px;font-size:13px" />`;
  sec3Body.appendChild(pwdFields);
  const pwdBtn = document.createElement("button");
  pwdBtn.className = "btn btn-primary btn-full mt-8";
  pwdBtn.textContent = "Changer le mot de passe";
  pwdBtn.onclick = async () => {
    const current = sec3Body.querySelector("#pwd-current").value;
    const next = sec3Body.querySelector("#pwd-new").value;
    const confirm_ = sec3Body.querySelector("#pwd-confirm").value;
    if (next.length < 8) { showToast("8 caractères minimum", "error"); return; }
    if (next !== confirm_) { showToast("Les mots de passe ne correspondent pas", "error"); return; }
    try {
      const res = await api.changePassword(current, next);
      // Les anciens tokens sont révoqués côté serveur : on adopte le nouveau
      state.setAuth(res.token, res.household_id, res.member_id, res.member_name, res.is_owner);
      sec3Body.querySelectorAll("input").forEach((i) => { i.value = ""; });
      showToast("Mot de passe changé ✓ Les autres appareils devront se reconnecter.");
    } catch (err) { showToast(err.message, "error"); }
  };
  sec3Body.appendChild(pwdBtn);

  // ── Section sauvegarde ──
  const { sec: sec4, body: sec4Body } = makeSection("💾 Sauvegarde", "sauvegarde");
  sec4Body.innerHTML = `
    <div style="font-size:12px;color:#888;margin-bottom:10px">
      Téléchargez une copie complète de vos données (plats, recettes, planning,
      courses, réglages) au format JSON. Gardez-la en lieu sûr.
    </div>`;
  const exportBtn = document.createElement("button");
  exportBtn.className = "btn btn-primary btn-full";
  exportBtn.textContent = "⬇️ Exporter mes données";
  exportBtn.onclick = async () => {
    exportBtn.disabled = true;
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `menus-famille-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("Export téléchargé ✓");
    } catch (err) { showToast(err.message, "error"); }
    finally { exportBtn.disabled = false; }
  };
  sec4Body.appendChild(exportBtn);

  body.append(sec1, sec2, ...(sec2b ? [sec2b] : []), sec3, sec4);
  renderShopCategories(body);
}

// ── Catégories de courses ─────────────────────────────────────────────────────

async function renderShopCategories(body) {
  const catsEnabled = localStorage.getItem("shop_categories_enabled") !== "false";

  const { sec: catSec, body: catBody } = makeSection("🛒 Catégories de courses", "shopcats");
  catBody.innerHTML = `
    <div class="settings-row" style="border-bottom:1px solid #f0f0f0">
      <label for="shop-cats-toggle">Regrouper les courses par catégorie</label>
      <label class="toggle">
        <input type="checkbox" id="shop-cats-toggle" ${catsEnabled ? "checked" : ""} />
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div id="shop-cats-body" class="mt-8">
      <div id="shop-cats-list" style="display:flex;flex-direction:column;gap:8px"></div>
      <button class="btn btn-primary btn-sm mt-8" id="shop-cat-add">+ Nouvelle catégorie</button>
    </div>`;
  body.appendChild(catSec);

  const { sec: ingrSec, body: ingrBody } = makeSection("🥕 Ingrédients connus", "ingrmap");
  ingrBody.innerHTML = `
    <div style="font-size:12px;color:#888;margin-bottom:8px">Modifiez la catégorie attribuée à chaque ingrédient connu.</div>
    <div id="ingr-map-list" style="display:flex;flex-direction:column;gap:6px"></div>`;
  body.appendChild(ingrSec);

  const catListBody = catBody.querySelector("#shop-cats-body");
  const applyEnabled = (enabled) => {
    catListBody.style.display = enabled ? "" : "none";
    ingrSec.style.display = enabled ? "" : "none";
  };
  applyEnabled(catsEnabled);

  catBody.querySelector("#shop-cats-toggle").onchange = (e) => {
    const enabled = e.target.checked;
    localStorage.setItem("shop_categories_enabled", enabled ? "true" : "false");
    applyEnabled(enabled);
    showToast(enabled ? "Catégories activées ✓" : "Catégories désactivées ✓");
  };

  let cats = [], ingrMap = [];
  try { [cats, ingrMap] = await Promise.all([api.getShopCategories(), api.getIngredientMap()]); }
  catch (err) { catBody.querySelector("#shop-cats-list").innerHTML = `<div class="text-muted">${err.message}</div>`; return; }

  renderCatList(cats, catBody.querySelector("#shop-cats-list"));
  renderIngrMap(ingrMap, cats, ingrBody.querySelector("#ingr-map-list"));

  catBody.querySelector("#shop-cat-add").onclick = async () => {
    const name = prompt("Nom de la nouvelle catégorie :");
    if (!name?.trim()) return;
    try {
      await api.createShopCategory(name.trim(), "#888888");
      showToast("Catégorie ajoutée ✓");
      cats = await api.getShopCategories();
      renderCatList(cats, catBody.querySelector("#shop-cats-list"));
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
