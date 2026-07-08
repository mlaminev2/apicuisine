import { api } from "../api.js";
import { showToast } from "../components/toast.js";
import { openDishModal } from "./base.js";
import { CAT_LABELS, isoWeekOf, escapeHtml, renderPaywall } from "../utils.js";

const CATEGORIES = ["pomme_de_terre", "riz", "pates", "entree", "autre", "sucree", "africain", "apero", "sauce"];

// Capacités d'import mises en avant sur l'écran
const CAPS = [
  { icon: "🌐", label: "Sites de recettes" },
  { icon: "▶️", label: "YouTube" },
  { icon: "📸", label: "Instagram" },
  { icon: "🎵", label: "TikTok" },
  { icon: "✍️", label: "Texte collé" },
  { icon: "⌨️", label: "Saisie manuelle" },
];

function _timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return "à l'instant";
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;
  return "il y a longtemps";
}

function _sourceLabel(url) {
  if (!url) return "Saisi à la main";
  if (url.includes("youtube") || url.includes("youtu.be")) return "Depuis YouTube";
  if (url.includes("instagram")) return "Depuis Instagram";
  if (url.includes("tiktok")) return "Depuis TikTok";
  return "Depuis un lien";
}

export async function renderImport(root) {
  // Freemium : import limité par mois pour les membres gratuits, illimité en premium
  let access = { premium_active: true };
  try { access = await api.getAccess(); } catch {}
  if (!access.premium_active && (access.imports_remaining ?? 1) <= 0) {
    renderPaywall(root, "Importer des recettes",
      `Vous avez utilisé vos <strong>${access.import_limit} imports gratuits</strong> du mois.<br>
       L'accès premium (imports illimités) est accordé par compte,<br>
       par l'administrateur de la plateforme.`);
    return;
  }
  const quotaBanner = (!access.premium_active)
    ? `<div class="import2-quota">💎 ${access.imports_remaining} import${access.imports_remaining > 1 ? "s" : ""} gratuit${access.imports_remaining > 1 ? "s" : ""} restant${access.imports_remaining > 1 ? "s" : ""} ce mois — premium = illimité</div>`
    : "";

  const { year: isoYear, week: isoWeek } = isoWeekOf(new Date());

  root.innerHTML = `
    <div class="import2-header">
      <div class="import2-title">Importer un plat</div>
      <div class="import2-sub">Depuis un lien, un texte collé ou à la main</div>
    </div>
    ${quotaBanner}

    <div class="import2-body">
      <!-- Coller un lien -->
      <div class="import2-linkbox">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--terra)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.4 1.4"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.4-1.4"/></svg>
        <input id="import-url-input" type="url" placeholder="Coller un lien de recette…" />
        <button id="import-fetch-btn" class="import2-go" aria-label="Récupérer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>
      <div id="import-source-badge" style="padding:2px 4px 0;font-size:12px"></div>
      <div id="import-loading" style="display:none;font-size:13px;color:var(--muted);padding:4px">⏳ Récupération en cours…</div>

      <!-- Capacités -->
      <div class="import2-caps-label">Fonctionne avec</div>
      <div class="import2-caps">
        ${CAPS.map((c) => `<span class="import2-cap"><span>${c.icon}</span>${c.label}</span>`).join("")}
      </div>

      <div class="import2-divider"><span>ou</span></div>

      <!-- Autres méthodes -->
      <button class="import2-method" id="method-paste">
        <div class="import2-method-icon"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div>
        <div class="import2-method-txt"><div class="import2-method-name">Coller un texte</div><div class="import2-method-sub">Description Instagram/TikTok, recette copiée…</div></div>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c4b3a3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
      </button>
      <button class="import2-method" id="method-manual">
        <div class="import2-method-icon"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></div>
        <div class="import2-method-txt"><div class="import2-method-name">Saisir manuellement</div><div class="import2-method-sub">Nom, ingrédients, étapes</div></div>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c4b3a3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
      </button>

      <!-- ══ Formulaire d'import (révélé après lien / texte / manuel) ══ -->
      <div id="import-flow" style="display:none;flex-direction:column;gap:12px;margin-top:4px">
        <div class="card p-16" id="import-step2">
          <div style="font-weight:700;color:var(--ink);margin-bottom:10px;font-size:15px">Nom du plat &amp; catégorie</div>
          <input id="import-name" type="text" placeholder="Nom du plat…"
            style="width:100%;border:1.5px solid #ddd0bd;border-radius:12px;padding:11px 13px;font-size:14px;margin-bottom:10px" />
          <select id="import-category" style="width:100%;border:1.5px solid #ddd0bd;border-radius:12px;padding:11px 13px;font-size:14px">
            ${CATEGORIES.map((c) => `<option value="${c}">${CAT_LABELS[c]}</option>`).join("")}
          </select>
        </div>

        <div class="card p-16" id="import-step-paste" style="display:none">
          <div style="font-weight:700;font-size:15px;margin-bottom:4px">✍️ Texte de la recette</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.5">
            Instagram et TikTok limitent l'extraction automatique.<br>Copie la description depuis l'app et colle-la ici.
          </div>
          <textarea id="import-paste-textarea" rows="7"
            style="width:100%;border:1.5px solid #ddd0bd;border-radius:12px;padding:11px 13px;font-size:13px;resize:vertical;line-height:1.6"
            placeholder="Colle ici les ingrédients et les étapes…"></textarea>
          <button id="btn-analyze-paste" class="btn btn-primary" style="margin-top:8px;width:100%;font-size:14px">✨ Extraire ingrédients &amp; instructions</button>
        </div>

        <div class="card p-16" id="import-step3">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="font-weight:700;color:var(--ink);font-size:15px">Ingrédients</div>
            <span style="display:flex;gap:5px">
              <button id="btn-check-all" class="btn btn-sm btn-ghost" style="font-size:11px">Tout ✓</button>
              <button id="btn-uncheck-all" class="btn btn-sm btn-ghost" style="font-size:11px">Tout ✗</button>
              <button id="btn-add-ingr-import" class="btn btn-sm btn-primary" style="font-size:11px">+ Ajouter</button>
            </span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:8px" id="import-ingr-hint">
            Coche les ingrédients à ajouter aux courses — sem. ${isoWeek}. Chaque ligne est modifiable.
          </div>
          <div id="auto-ingr-list" style="display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto"></div>
        </div>

        <div class="card p-16" id="import-step-instructions">
          <div style="font-weight:700;color:var(--ink);margin-bottom:8px;font-size:15px">📋 Instructions
            <span style="font-weight:400;font-size:12px;color:var(--muted)"> (une étape par ligne)</span>
          </div>
          <textarea id="import-steps-textarea" rows="8"
            style="width:100%;border:1.5px solid #ddd0bd;border-radius:12px;padding:11px 13px;font-size:13px;resize:vertical;line-height:1.6"
            placeholder="Ex :&#10;Préchauffer le four à 180°C&#10;Mélanger les ingrédients&#10;Cuire 25 minutes"></textarea>
        </div>

        <div class="card p-16" id="import-step-raw" style="display:none">
          <details>
            <summary style="font-size:13px;font-weight:700;color:var(--muted);cursor:pointer">📄 Description brute récupérée</summary>
            <pre id="import-raw-desc" style="white-space:pre-wrap;font-size:12px;color:var(--ink-soft);margin-top:10px;background:#f7f1e7;border-radius:8px;padding:10px;max-height:200px;overflow-y:auto;line-height:1.5"></pre>
          </details>
        </div>

        <button id="import-save-btn" class="btn btn-primary btn-full" style="font-size:16px;padding:14px">✅ Ajouter le plat &amp; enregistrer les courses</button>
      </div>

      <!-- Résultat -->
      <div id="import-result" style="display:none" class="card p-16">
        <div style="color:var(--terra);font-weight:700;font-size:16px">✅ Importé avec succès !</div>
        <div id="import-result-detail" style="font-size:13px;color:var(--ink-soft);margin-top:8px;line-height:1.6"></div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button id="btn-go-courses" class="btn btn-primary flex-1">🛒 Voir les courses</button>
          <button id="import-again-btn" class="btn btn-ghost flex-1">Importer une autre</button>
        </div>
      </div>

      <!-- Importés récemment -->
      <div id="import-recent"></div>
    </div>`;

  let detectedSource = "unknown", fetchedUrl = "", fetchedThumbnail = null, fetchedAuthor = null, rawDescription = "";

  const flow = document.getElementById("import-flow");
  const showFlow = () => { flow.style.display = "flex"; };

  // ── Méthodes : coller un texte / saisir manuellement ──
  document.getElementById("method-paste").onclick = () => {
    showFlow();
    document.getElementById("import-step-paste").style.display = "block";
    document.getElementById("import-paste-textarea").focus();
    document.getElementById("import-step-paste").scrollIntoView({ behavior: "smooth", block: "center" });
  };
  document.getElementById("method-manual").onclick = () => {
    showFlow();
    document.getElementById("import-name").focus();
    document.getElementById("import-step2").scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // ── Étape 1 : fetch depuis un lien ──
  const fetchBtn = document.getElementById("import-fetch-btn");
  const loadingEl = document.getElementById("import-loading");

  async function doFetch() {
    const url = document.getElementById("import-url-input").value.trim();
    if (!url) { showToast("Colle d'abord un lien", "error"); return; }
    fetchBtn.disabled = true;
    loadingEl.style.display = "block";
    document.getElementById("import-source-badge").innerHTML = "";
    try {
      const result = await api.importUrl(url);
      detectedSource = result.source;
      fetchedUrl = url;
      fetchedThumbnail = result.thumbnail_url || null;
      fetchedAuthor = result.author || null;
      rawDescription = result.description || "";

      const srcColor = result.source === "youtube" ? "#FF0000"
                     : result.source === "instagram" ? "#C13584"
                     : result.source === "tiktok" ? "#010101"
                     : result.source === "site" ? "var(--terra)" : "#888";
      const srcLabel = result.source === "youtube" ? "▶️ YouTube"
                     : result.source === "instagram" ? "📸 Instagram"
                     : result.source === "tiktok" ? "🎵 TikTok"
                     : result.source === "site" ? "🌐 Site de recettes" : "🔗 Lien";
      document.getElementById("import-source-badge").innerHTML =
        `<span style="background:${srcColor};color:white;padding:2px 10px;border-radius:20px;font-size:11px">${srcLabel} détecté</span>`;

      if (result.title) document.getElementById("import-name").value = result.title;
      renderIngrRows(result.suggested_ingredients);
      document.getElementById("import-steps-textarea").value = (result.suggested_steps || []).join("\n");

      if (rawDescription) {
        document.getElementById("import-raw-desc").textContent = rawDescription;
        document.getElementById("import-step-raw").style.display = "block";
      }
      const isSocial = ["instagram", "tiktok"].includes(result.source);
      const nothingFound = !result.suggested_ingredients.length && !result.suggested_steps.length;
      if (isSocial || nothingFound) document.getElementById("import-step-paste").style.display = "block";
      if (nothingFound) {
        document.getElementById("import-ingr-hint").innerHTML =
          `<span style="color:#c0662f;font-weight:600">⚠️ Rien détecté automatiquement</span> — colle le texte de la recette ci-dessous.`;
      }
      showFlow();
      document.getElementById("import-name").focus();
    } catch {
      showToast("Impossible de récupérer — vérifie le lien ou ta connexion", "error");
      showFlow();
    } finally {
      fetchBtn.disabled = false;
      loadingEl.style.display = "none";
    }
  }
  fetchBtn.onclick = doFetch;
  document.getElementById("import-url-input").addEventListener("keydown", (e) => { if (e.key === "Enter") doFetch(); });

  // ── Ingrédients éditables ──
  function makeIngrRow(text = "", checked = true) {
    const row = document.createElement("div");
    row.className = "import-ingr-row";
    row.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 0";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = checked;
    cb.style.cssText = "width:16px;height:16px;accent-color:var(--terra);flex-shrink:0";
    const inp = document.createElement("input");
    inp.type = "text"; inp.value = text; inp.placeholder = "Ingrédient…";
    inp.style.cssText = "flex:1;border:1px solid #e5d9c6;border-radius:8px;padding:5px 8px;font-size:13px";
    const del = document.createElement("button");
    del.textContent = "✕";
    del.style.cssText = "color:#ccc;font-size:13px;flex-shrink:0;padding:0 4px";
    del.onclick = () => row.remove();
    row.append(cb, inp, del);
    return row;
  }
  function renderIngrRows(suggestions) {
    const list = document.getElementById("auto-ingr-list");
    list.innerHTML = "";
    for (const text of suggestions) list.appendChild(makeIngrRow(text, true));
  }
  document.getElementById("btn-check-all").onclick = () =>
    document.querySelectorAll(".import-ingr-row input[type=checkbox]").forEach((cb) => { cb.checked = true; });
  document.getElementById("btn-uncheck-all").onclick = () =>
    document.querySelectorAll(".import-ingr-row input[type=checkbox]").forEach((cb) => { cb.checked = false; });
  document.getElementById("btn-add-ingr-import").onclick = () => {
    const row = makeIngrRow("", true);
    document.getElementById("auto-ingr-list").appendChild(row);
    row.querySelector("input[type=text]").focus();
  };

  // ── Analyse du texte collé ──
  document.getElementById("btn-analyze-paste").onclick = async () => {
    const text = document.getElementById("import-paste-textarea").value.trim();
    if (!text) { showToast("Colle un texte d'abord", "error"); return; }
    const btn = document.getElementById("btn-analyze-paste");
    btn.disabled = true; btn.textContent = "Analyse en cours…";
    try {
      const result = await api.extractText(text);
      renderIngrRows(result.ingredients);
      document.getElementById("import-steps-textarea").value = (result.steps || []).join("\n");
      const total = result.ingredients.length + (result.steps || []).length;
      if (total > 0) showToast(`${result.ingredients.length} ingrédient(s) et ${(result.steps || []).length} étape(s) extraits ✓`);
      else showToast("Rien extrait — texte sans recette détectable", "error");
    } catch (err) {
      showToast("Erreur : " + err.message, "error");
    } finally {
      btn.disabled = false; btn.textContent = "✨ Extraire ingrédients & instructions";
    }
  };

  // ── Sauvegarde ──
  document.getElementById("import-save-btn").onclick = async () => {
    const name = document.getElementById("import-name").value.trim();
    const category = document.getElementById("import-category").value;
    if (!name) { showToast("Donne un nom au plat", "error"); return; }
    const rows = [...document.querySelectorAll(".import-ingr-row")];
    const allIngredients = rows.map((r) => r.querySelector("input[type=text]").value.trim()).filter(Boolean);
    const shoppingItems = rows.filter((r) => r.querySelector("input[type=checkbox]").checked)
      .map((r) => r.querySelector("input[type=text]").value.trim()).filter(Boolean);
    const instructions = document.getElementById("import-steps-textarea").value.split("\n").map((l) => l.trim()).filter(Boolean);
    const btn = document.getElementById("import-save-btn");
    btn.disabled = true; btn.textContent = "Enregistrement…";
    try {
      const result = await api.importSave({
        name, category, url: fetchedUrl,
        source_tag: ["youtube", "instagram", "tiktok"].includes(detectedSource) ? "insta" : null,
        shopping_items: shoppingItems, ingredients: allIngredients, instructions,
        iso_year: isoYear, iso_week: isoWeek, thumbnail_url: fetchedThumbnail, author: fetchedAuthor,
      });
      flow.style.display = "none";
      document.getElementById("import-url-input").value = "";
      document.getElementById("import-source-badge").innerHTML = "";
      document.getElementById("import-result-detail").innerHTML = `
        🍽️ <b>${escapeHtml(result.dish_name)}</b> ajouté à vos plats.<br>
        ${result.items_added > 0
          ? `🛒 <b>${result.items_added} ingrédient${result.items_added > 1 ? "s" : ""}</b> ajouté${result.items_added > 1 ? "s" : ""} aux courses — semaine ${isoWeek}.`
          : "Aucun ingrédient ajouté aux courses."}`;
      document.getElementById("import-result").style.display = "block";
      document.getElementById("import-result").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false; btn.textContent = "✅ Ajouter le plat & enregistrer les courses";
    }
  };
  document.getElementById("btn-go-courses").onclick = () => { location.hash = `#/courses?year=${isoYear}&week=${isoWeek}`; };
  document.getElementById("import-again-btn").onclick = () => renderImport(root);

  // ── Importés récemment ──
  try {
    const dishes = await api.getDishes({ active: true });
    const recent = dishes
      .filter((d) => d.created_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 4);
    const box = document.getElementById("import-recent");
    if (recent.length) {
      box.innerHTML = `<div class="import2-recent-title">Importés récemment</div>
        <div class="import2-recent-list">${recent.map((d) => {
          const thumb = d.thumbnail_url;
          return `<button class="import2-recent-item" data-id="${d.id}">
            <div class="import2-recent-thumb" style="${thumb ? `background-image:url('${escapeHtml(thumb)}')` : ""}"></div>
            <div class="import2-recent-txt">
              <div class="import2-recent-name">${escapeHtml(d.name)}</div>
              <div class="import2-recent-sub">${escapeHtml(_sourceLabel(d.source_url))} · ${_timeAgo(d.created_at)}</div>
            </div>
          </button>`;
        }).join("")}</div>`;
      box.querySelectorAll(".import2-recent-item").forEach((el) => {
        el.onclick = () => {
          const dish = recent.find((d) => String(d.id) === el.dataset.id);
          if (dish) openDishModal(dish);
        };
      });
    }
  } catch {}
}
