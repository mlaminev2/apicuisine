import { api } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../components/toast.js";
import { CAT_LABELS, DAYS_FR, toIsoDate, today, isoWeekOf, escapeHtml, renderPaywall } from "../utils.js";

const THEMES = ["pomme_de_terre", "riz", "pates", "autre", "africain"];

let mealCount = 7;
let avoidRepeats = true;
let selectedThemes = new Set(THEMES);
let proposals = [];   // { iso, dow, dish } | { iso, dow, dish: null }

export async function renderRemplir(root) {
  // Fonctionnalité premium quand le freemium est actif
  try {
    const access = await api.getAccess();
    if (!access.premium_active) { renderPaywall(root, "Remplir la semaine"); return; }
  } catch {}

  proposals = [];
  root.innerHTML = `
    <div class="page-header">
      <button id="fill-back" aria-label="Retour">‹</button>
      <h1>Remplir la semaine</h1>
    </div>
    <div class="ia-intro">Un menu est composé automatiquement à partir de tes thèmes et de tes plats les moins cuisinés. Ajuste, puis valide.</div>
    <div class="ia-options" id="ia-options"></div>
    <div id="ia-preview"></div>
    <div class="ia-cta-wrap">
      <button class="ia-cta" id="ia-generate">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9z"/></svg>
        Générer mon menu
      </button>
    </div>`;

  document.getElementById("fill-back").onclick = () => { location.hash = "#/accueil"; };
  document.getElementById("ia-generate").onclick = generate;
  renderOptions();
}

function renderOptions() {
  const box = document.getElementById("ia-options");
  if (!box) return;
  box.innerHTML = `
    <div class="ia-card">
      <div class="ia-row">
        <div><div class="ia-card-title">Nombre de repas</div><div class="ia-card-sub">Cette semaine</div></div>
        <div class="ia-stepper">
          <button class="ia-step-btn" id="ia-minus">−</button>
          <span class="ia-step-val" id="ia-count">${mealCount}</span>
          <button class="ia-step-btn plus" id="ia-plus">+</button>
        </div>
      </div>
    </div>
    <div class="ia-card">
      <div class="ia-row">
        <div class="ia-card-title">Éviter les répétitions</div>
        <label class="toggle">
          <input type="checkbox" id="ia-repeat" ${avoidRepeats ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
    <div class="ia-card">
      <div class="ia-card-title">Thèmes préférés</div>
      <div class="ia-chips" id="ia-themes"></div>
    </div>`;

  document.getElementById("ia-minus").onclick = () => { mealCount = Math.max(1, mealCount - 1); document.getElementById("ia-count").textContent = mealCount; };
  document.getElementById("ia-plus").onclick = () => { mealCount = Math.min(7, mealCount + 1); document.getElementById("ia-count").textContent = mealCount; };
  document.getElementById("ia-repeat").onchange = (e) => { avoidRepeats = e.target.checked; };

  const chipsBox = document.getElementById("ia-themes");
  for (const cat of THEMES) {
    const chip = document.createElement("button");
    chip.className = "quick-chip" + (selectedThemes.has(cat) ? " active" : "");
    chip.textContent = CAT_LABELS[cat] || cat;
    chip.onclick = () => {
      if (selectedThemes.has(cat)) {
        if (selectedThemes.size === 1) { showToast("Garde au moins un thème", "error"); return; }
        selectedThemes.delete(cat);
      } else {
        selectedThemes.add(cat);
      }
      chip.classList.toggle("active", selectedThemes.has(cat));
    };
    chipsBox.appendChild(chip);
  }
}

function _weekDays() {
  const now = new Date(today() + "T00:00:00");
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({ iso: toIsoDate(d.getFullYear(), d.getMonth(), d.getDate()), dow: i });
  }
  return days;
}

async function generate() {
  const btn = document.getElementById("ia-generate");
  btn.disabled = true;
  btn.textContent = "Génération…";
  try {
    const days = _weekDays();
    const from = days[0].iso;
    const to = days[6].iso;
    const [entries, tracking] = await Promise.all([
      api.getPlan(from, to),
      api.getTracking().catch(() => []),
    ]);
    const byDate = {};
    for (const e of entries) byDate[e.date] = e;

    // Pool global : plats des thèmes choisis, les moins cuisinés d'abord
    const pool = tracking
      .filter((t) => t.dish.active && selectedThemes.has(t.dish.category))
      .sort((a, b) => a.count - b.count);

    const used = new Set(
      entries.flatMap((e) => [e.main_dish?.id, ...(e.extra_dishes || []).map((x) => x.id)]).filter(Boolean)
    );

    const empty = days.filter(({ iso }) => {
      const e = byDate[iso];
      return !e || (!e.main_dish && !e.free_text);
    });
    if (!empty.length) {
      showToast("La semaine est déjà entièrement planifiée");
      return;
    }

    proposals = [];
    for (const day of empty.slice(0, mealCount)) {
      // 1) priorité du serveur (catégorie du jour, rotation), filtrée par thèmes
      let candidates = [];
      try {
        candidates = (await api.getPriority(day.iso))
          .filter((p) => selectedThemes.has(p.dish.category))
          .map((p) => p.dish);
      } catch {}
      // 2) sinon, pool global des thèmes choisis
      if (!candidates.length) candidates = pool.map((t) => t.dish);

      let pick = candidates.find((d) => !avoidRepeats || !used.has(d.id)) || candidates[0] || null;
      if (pick) used.add(pick.id);
      proposals.push({ ...day, dish: pick });
    }
    renderPreview();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9z"/></svg>Générer à nouveau`;
  }
}

function renderPreview() {
  const box = document.getElementById("ia-preview");
  if (!box) return;
  box.innerHTML = `<div class="shop-cat-title" style="padding-top:16px">Proposition</div>`;

  for (const p of proposals) {
    const row = document.createElement("div");
    row.className = "ia-preview-day";
    row.innerHTML = `
      <span class="ia-preview-dow">${DAYS_FR[p.dow]}</span>
      ${p.dish
        ? `<span class="ia-preview-name">${escapeHtml(p.dish.name)}</span><span class="badge badge-tag">${escapeHtml(CAT_LABELS[p.dish.category] || p.dish.category)}</span>`
        : `<span class="ia-preview-skip">aucun plat disponible</span>`}`;
    box.appendChild(row);
  }

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;padding:8px 16px 0";
  const validate = document.createElement("button");
  validate.className = "btn btn-primary flex-1";
  validate.textContent = "✓ Valider ce menu";
  validate.onclick = applyProposals;
  actions.appendChild(validate);
  box.appendChild(actions);
}

async function applyProposals() {
  const toApply = proposals.filter((p) => p.dish);
  if (!toApply.length) { showToast("Rien à appliquer", "error"); return; }
  try {
    for (const p of toApply) {
      await api.putPlan(p.iso, { main_dish_id: p.dish.id, planned_by: state.memberId });
    }
    showToast(`✨ ${toApply.length} repas planifié(s) ✓`);
    location.hash = "#/calendrier";
  } catch (err) {
    showToast(err.message, "error");
  }
}
