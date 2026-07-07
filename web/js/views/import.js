import { api } from "../api.js";
import { showToast } from "../components/toast.js";
import { CAT_LABELS, isoWeekOf, escapeHtml, renderPaywall } from "../utils.js";

const CATEGORIES = ["pomme_de_terre", "riz", "pates", "entree", "autre", "sucree", "africain", "apero", "sauce"];

export async function renderImport(root) {
  // Freemium : import limité par mois pour les membres gratuits, illimité en premium
  let quotaBanner = "";
  try {
    const access = await api.getAccess();
    if (!access.premium_active) {
      if ((access.imports_remaining ?? 1) <= 0) {
        renderPaywall(root, "Importer des recettes",
          `Vous avez utilisé vos <strong>${access.import_limit} imports gratuits</strong> du mois.<br>
           L'accès premium (imports illimités) est accordé par compte,<br>
           par l'administrateur de la plateforme.`);
        return;
      }
      quotaBanner = `
        <div style="margin:0 16px;background:#fdf3df;border:1.5px dashed #e0c36b;border-radius:13px;padding:10px 13px;font-size:13px;font-weight:600;color:#a97b12">
          💎 ${access.imports_remaining} import${access.imports_remaining > 1 ? "s" : ""} gratuit${access.imports_remaining > 1 ? "s" : ""} restant${access.imports_remaining > 1 ? "s" : ""} ce mois-ci — premium = illimité
        </div>`;
    }
  } catch {}

  const { year: isoYear, week: isoWeek } = isoWeekOf(new Date());

  root.innerHTML = `
    <div class="page-header">
      <h1>Importer une recette</h1>
    </div>
    ${quotaBanner}

    <div style="padding:16px;display:flex;flex-direction:column;gap:14px" id="import-body">

      <!-- Étape 1 : URL -->
      <div class="card p-16">
        <div style="font-weight:700;color:var(--accent-dark);margin-bottom:10px;font-size:15px">
          1. Colle un lien : site de recettes, YouTube, Instagram ou TikTok
        </div>
        <div style="font-size:12px;color:#888;margin-bottom:8px">
          Marmiton, 750g, CuisineAZ, blogs… la recette est extraite automatiquement.
        </div>
        <div style="display:flex;gap:8px">
          <input id="import-url-input" type="url"
            placeholder="https://www.marmiton.org/…"
            style="flex:1;border:1.5px solid #ddd;border-radius:10px;padding:10px 12px;font-size:14px" />
          <button id="import-fetch-btn" class="btn btn-primary">Récupérer</button>
        </div>
        <div id="import-source-badge" style="margin-top:8px;font-size:12px"></div>
        <div id="import-loading" style="display:none;font-size:13px;color:#888;margin-top:6px">
          ⏳ Récupération en cours…
        </div>
      </div>

      <!-- Étape 2 : Nom + catégorie -->
      <div class="card p-16" id="import-step2" style="display:none">
        <div style="font-weight:700;color:var(--accent-dark);margin-bottom:10px;font-size:15px">
          2. Nom du plat &amp; catégorie
        </div>
        <input id="import-name" type="text" placeholder="Nom du plat…"
          style="width:100%;border:1.5px solid #ddd;border-radius:10px;padding:10px 12px;font-size:14px;margin-bottom:10px" />
        <select id="import-category"
          style="width:100%;border:1.5px solid #ddd;border-radius:10px;padding:10px 12px;font-size:14px">
          ${CATEGORIES.map((c) => `<option value="${c}">${CAT_LABELS[c]}</option>`).join("")}
        </select>
      </div>

      <!-- Étape 3 : Ingrédients -->
      <div class="card p-16" id="import-step3" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-weight:700;color:var(--accent-dark);font-size:15px">
            3. Ingrédients
          </div>
          <span style="display:flex;gap:5px">
            <button id="btn-check-all" class="btn btn-sm btn-ghost" style="font-size:11px">Tout ✓</button>
            <button id="btn-uncheck-all" class="btn btn-sm btn-ghost" style="font-size:11px">Tout ✗</button>
            <button id="btn-add-ingr-import" class="btn btn-sm btn-primary" style="font-size:11px">+ Ajouter</button>
          </span>
        </div>
        <div style="font-size:11px;color:#888;margin-bottom:8px" id="import-ingr-hint">
          Coche les ingrédients à ajouter à la liste de courses — sem. ${isoWeek} / ${isoYear}. Tu peux modifier chaque ligne.
        </div>
        <div id="auto-ingr-list" style="display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto"></div>
      </div>

      <!-- Étape 4 : Instructions -->
      <div class="card p-16" id="import-step-instructions" style="display:none">
        <div style="font-weight:700;color:var(--accent-dark);margin-bottom:8px;font-size:15px">
          📋 Instructions
          <span style="font-weight:400;font-size:12px;color:#888"> (une étape par ligne, modifiable)</span>
        </div>
        <textarea id="import-steps-textarea" rows="8"
          style="width:100%;border:1.5px solid #ddd;border-radius:10px;padding:10px 12px;font-size:13px;resize:vertical;line-height:1.6"
          placeholder="Ex :&#10;Préchauffer le four à 180°C&#10;Mélanger les ingrédients&#10;Cuire 25 minutes"></textarea>
      </div>

      <!-- Description brute (collapsible) -->
      <div class="card p-16" id="import-step-raw" style="display:none">
        <details>
          <summary style="font-size:13px;font-weight:700;color:#888;cursor:pointer">
            📄 Description brute récupérée (aide si l'auto-détection est incomplète)
          </summary>
          <pre id="import-raw-desc"
            style="white-space:pre-wrap;font-size:12px;color:#555;margin-top:10px;background:#f8f8f8;
                   border-radius:8px;padding:10px;max-height:200px;overflow-y:auto;line-height:1.5"></pre>
        </details>
      </div>

      <!-- Colle la recette manuellement -->
      <div class="card p-16" id="import-step-paste" style="display:none">
        <div style="font-weight:700;font-size:15px;margin-bottom:4px">✍️ Colle le texte de la recette</div>
        <div style="font-size:12px;color:#888;margin-bottom:10px;line-height:1.5">
          Instagram et TikTok limitent ce qu'on peut récupérer automatiquement.<br>
          Copie la description de la vidéo depuis l'application et colle-la ici.
        </div>
        <textarea id="import-paste-textarea" rows="7"
          style="width:100%;border:1.5px solid #ddd;border-radius:10px;padding:10px 12px;font-size:13px;resize:vertical;line-height:1.6"
          placeholder="Colle ici les ingrédients et les étapes de la recette…"></textarea>
        <button id="btn-analyze-paste" class="btn btn-primary" style="margin-top:8px;width:100%;font-size:14px">
          ✨ Extraire ingrédients &amp; instructions
        </button>
      </div>

      <!-- Bouton final -->
      <div id="import-step4" style="display:none">
        <button id="import-save-btn" class="btn btn-primary btn-full" style="font-size:16px;padding:14px">
          ✅ Ajouter le plat &amp; enregistrer les courses
        </button>
      </div>

      <!-- Résultat -->
      <div id="import-result" style="display:none" class="card p-16">
        <div style="color:var(--shopping-header);font-weight:700;font-size:16px">✅ Importé avec succès !</div>
        <div id="import-result-detail" style="font-size:13px;color:#555;margin-top:8px;line-height:1.6"></div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button id="btn-go-courses" class="btn btn-primary flex-1">🛒 Voir les courses</button>
          <button id="import-again-btn" class="btn btn-ghost flex-1">Importer une autre</button>
        </div>
      </div>

    </div>`;

  let detectedSource = "unknown";
  let fetchedUrl = "";
  let fetchedThumbnail = null;
  let fetchedAuthor = null;
  let rawDescription = "";

  // ── Étape 1 : fetch ───────────────────────────────────────────────────────
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

      // Badge source
      const srcColor = result.source === "youtube" ? "#FF0000"
                     : result.source === "instagram" ? "#C13584"
                     : result.source === "tiktok" ? "#010101"
                     : result.source === "site" ? "var(--shopping-header)" : "#888";
      const srcLabel = result.source === "youtube" ? "▶️ YouTube"
                     : result.source === "instagram" ? "📸 Instagram"
                     : result.source === "tiktok" ? "🎵 TikTok"
                     : result.source === "site" ? "🌐 Site de recettes" : "🔗 Lien";
      document.getElementById("import-source-badge").innerHTML =
        `<span style="background:${srcColor};color:white;padding:2px 10px;border-radius:20px;font-size:11px">${srcLabel} détecté</span>`;

      // Pré-remplir le nom
      if (result.title) document.getElementById("import-name").value = result.title;

      // Ingrédients : pré-remplis ET éditables
      renderIngrRows(result.suggested_ingredients);

      // Instructions : textarea pré-remplie
      const instrTA = document.getElementById("import-steps-textarea");
      instrTA.value = (result.suggested_steps || []).join("\n");
      document.getElementById("import-step-instructions").style.display = "block";

      // Description brute
      if (rawDescription) {
        document.getElementById("import-raw-desc").textContent = rawDescription;
        document.getElementById("import-step-raw").style.display = "block";
      }

      // Show paste section for social media sources (they truncate descriptions)
      const isSocial = ["instagram", "tiktok"].includes(result.source);
      const nothingFound = !result.suggested_ingredients.length && !result.suggested_steps.length;
      if (isSocial || nothingFound) {
        document.getElementById("import-step-paste").style.display = "block";
      }
      if (nothingFound) {
        document.getElementById("import-ingr-hint").innerHTML =
          `<span style="color:#e67e22;font-weight:600">⚠️ Rien détecté automatiquement</span> — colle le texte de la recette dans la section ci-dessous.`;
      }

      document.getElementById("import-step2").style.display = "block";
      document.getElementById("import-step3").style.display = "block";
      document.getElementById("import-step4").style.display = "block";
      document.getElementById("import-name").focus();

    } catch {
      showToast("Impossible de récupérer — vérifie le lien ou ta connexion", "error");
      document.getElementById("import-step2").style.display = "block";
      document.getElementById("import-step3").style.display = "block";
      document.getElementById("import-step-instructions").style.display = "block";
      document.getElementById("import-step4").style.display = "block";
    } finally {
      fetchBtn.disabled = false;
      loadingEl.style.display = "none";
    }
  }

  fetchBtn.onclick = doFetch;
  document.getElementById("import-url-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doFetch();
  });

  // ── Ingrédients éditables ─────────────────────────────────────────────────

  function makeIngrRow(text = "", checked = true) {
    const row = document.createElement("div");
    row.className = "import-ingr-row";
    row.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 0";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked;
    cb.style.cssText = "width:16px;height:16px;accent-color:var(--shopping-header);flex-shrink:0";

    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = text;
    inp.placeholder = "Ingrédient…";
    inp.style.cssText = "flex:1;border:1px solid #e0e0e0;border-radius:8px;padding:5px 8px;font-size:13px";

    const del = document.createElement("button");
    del.textContent = "✕";
    del.style.cssText = "color:#ccc;font-size:13px;flex-shrink:0;padding:0 4px";
    del.onmouseenter = () => { del.style.color = "#e74c3c"; };
    del.onmouseleave = () => { del.style.color = "#ccc"; };
    del.onclick = () => row.remove();

    row.append(cb, inp, del);
    return row;
  }

  function renderIngrRows(suggestions) {
    const list = document.getElementById("auto-ingr-list");
    list.innerHTML = "";
    for (const text of suggestions) list.appendChild(makeIngrRow(text, true));
  }

  document.getElementById("btn-check-all").onclick = () => {
    document.querySelectorAll(".import-ingr-row input[type=checkbox]")
      .forEach((cb) => { cb.checked = true; });
  };
  document.getElementById("btn-uncheck-all").onclick = () => {
    document.querySelectorAll(".import-ingr-row input[type=checkbox]")
      .forEach((cb) => { cb.checked = false; });
  };
  document.getElementById("btn-add-ingr-import").onclick = () => {
    const list = document.getElementById("auto-ingr-list");
    const row = makeIngrRow("", true);
    list.appendChild(row);
    row.querySelector("input[type=text]").focus();
  };

  // ── Analyse du texte collé ────────────────────────────────────────────────
  document.getElementById("btn-analyze-paste").onclick = async () => {
    const text = document.getElementById("import-paste-textarea").value.trim();
    if (!text) { showToast("Colle un texte d'abord", "error"); return; }

    const btn = document.getElementById("btn-analyze-paste");
    btn.disabled = true;
    btn.textContent = "Analyse en cours…";

    try {
      const result = await api.extractText(text);
      renderIngrRows(result.ingredients);
      document.getElementById("import-steps-textarea").value = (result.steps || []).join("\n");

      const total = result.ingredients.length + (result.steps || []).length;
      if (total > 0) {
        showToast(`${result.ingredients.length} ingrédient(s) et ${(result.steps || []).length} étape(s) extraits ✓`);
        document.getElementById("import-ingr-hint").innerHTML =
          `Coche les ingrédients à ajouter à la liste de courses. Tu peux modifier chaque ligne.`;
      } else {
        showToast("Rien extrait — le texte ne contient pas de recette détectable", "error");
      }
    } catch (err) {
      showToast("Erreur : " + err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "✨ Extraire ingrédients & instructions";
    }
  };

  // ── Sauvegarde ───────────────────────────────────────────────────────────
  document.getElementById("import-save-btn").onclick = async () => {
    const name = document.getElementById("import-name").value.trim();
    const category = document.getElementById("import-category").value;
    if (!name) { showToast("Donne un nom au plat", "error"); return; }

    // Collect ingredient rows
    const rows = [...document.querySelectorAll(".import-ingr-row")];
    const allIngredients = rows
      .map((r) => r.querySelector("input[type=text]").value.trim())
      .filter(Boolean);
    const shoppingItems = rows
      .filter((r) => r.querySelector("input[type=checkbox]").checked)
      .map((r) => r.querySelector("input[type=text]").value.trim())
      .filter(Boolean);

    // Collect instructions from textarea
    const instrRaw = document.getElementById("import-steps-textarea").value;
    const instructions = instrRaw.split("\n").map((l) => l.trim()).filter(Boolean);

    const btn = document.getElementById("import-save-btn");
    btn.disabled = true;
    btn.textContent = "Enregistrement…";

    try {
      const result = await api.importSave({
        name,
        category,
        url: fetchedUrl,
        source_tag: ["youtube", "instagram", "tiktok"].includes(detectedSource) ? "insta" : null,
        shopping_items: shoppingItems,
        ingredients: allIngredients,
        instructions,
        iso_year: isoYear,
        iso_week: isoWeek,
        thumbnail_url: fetchedThumbnail,
        author: fetchedAuthor,
      });

      document.getElementById("import-step2").style.display = "none";
      document.getElementById("import-step3").style.display = "none";
      document.getElementById("import-step-instructions").style.display = "none";
      document.getElementById("import-step-raw").style.display = "none";
      document.getElementById("import-step4").style.display = "none";
      document.getElementById("import-url-input").value = "";
      document.getElementById("import-source-badge").innerHTML = "";

      document.getElementById("import-result-detail").innerHTML = `
        🍽️ <b>${escapeHtml(result.dish_name)}</b> ajouté à la base de plats.<br>
        ${result.items_added > 0
          ? `🛒 <b>${result.items_added} ingrédient${result.items_added > 1 ? "s" : ""}</b> ajouté${result.items_added > 1 ? "s" : ""} à la liste de courses — semaine ${isoWeek}.`
          : "Aucun ingrédient ajouté aux courses."}
      `;
      document.getElementById("import-result").style.display = "block";

    } catch (err) {
      showToast(err.message, "error");
      btn.disabled = false;
      btn.textContent = "✅ Ajouter le plat & enregistrer les courses";
    }
  };

  document.getElementById("btn-go-courses").onclick = () => {
    location.hash = `#/courses?year=${isoYear}&week=${isoWeek}`;
  };
  document.getElementById("import-again-btn").onclick = () => renderImport(root);
}
