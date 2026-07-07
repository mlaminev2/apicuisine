export const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const DAYS_FULL_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
export const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

export const CAT_LABELS = {
  pomme_de_terre: "Pomme de terre",
  riz: "Riz",
  pates: "Pâtes",
  entree: "Entrée",
  autre: "Autre",
  sucree: "Sucrée",
  africain: "Africain",
};

export const CAT_CSS = {
  pomme_de_terre: "cat-pdt",
  riz: "cat-riz",
  pates: "cat-pates",
  entree: "cat-entree",
  autre: "cat-autre",
  sucree: "cat-sucree",
  africain: "cat-africain",
};

export function isoWeekOf(d) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return { year: tmp.getUTCFullYear(), week };
}

export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(0);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(0);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function toIsoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function today() {
  const d = new Date();
  return toIsoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    e.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

// ── Shopping item helpers ─────────────────────────────────────────────────────

export function parseItemText(text) {
  const sep = text.indexOf(" — ");
  if (sep === -1) return { name: text.trim(), qty: "" };
  return { name: text.slice(0, sep).trim(), qty: text.slice(sep + 3).trim() };
}

function _parseQtyStr(s) {
  const m = s.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return null;
  return { num: parseFloat(m[1].replace(",", ".")), unit: m[2].trim() };
}

function _mergeQty(q1, q2) {
  if (!q1 && !q2) return "";
  if (!q1) return q2;
  if (!q2) return q1;
  const p1 = _parseQtyStr(q1);
  const p2 = _parseQtyStr(q2);
  if (p1 && p2 && p1.unit.toLowerCase() === p2.unit.toLowerCase()) {
    const sum = Math.round((p1.num + p2.num) * 10) / 10;
    return (Number.isInteger(sum) ? String(sum) : String(sum)) + (p1.unit ? " " + p1.unit : "");
  }
  return q1 + " + " + q2;
}

/**
 * Merge newItems into existing, summing quantities when the same ingredient name
 * already appears. Returns a new array without mutating existing.
 * Items can be strings ("poulet — 500g") or objects { text, checked, ... }.
 */
export function mergeShoppingItems(existing, newItems) {
  const result = existing.map((i) => ({ ...i }));
  for (const raw of newItems) {
    const obj = typeof raw === "string" ? { text: raw, checked: false } : { ...raw };
    const { name: newName, qty: newQty } = parseItemText(obj.text);
    const normNew = newName.toLowerCase();
    const idx = result.findIndex((item) => parseItemText(item.text).name.toLowerCase() === normNew);
    if (idx !== -1) {
      const { name, qty } = parseItemText(result[idx].text);
      const merged = _mergeQty(qty, newQty);
      result[idx] = { ...result[idx], text: merged ? `${name} — ${merged}` : name };
    } else {
      result.push(obj);
    }
  }
  return result;
}

/**
 * Écran « fonctionnalité premium » affiché quand le freemium est actif
 * et que le membre n'a pas reçu d'autorisation premium du propriétaire.
 */
export function renderPaywall(root, featureLabel, message = null) {
  const defaultMsg = `Cette fonctionnalité est réservée aux membres <strong>premium</strong>.<br>
        Demandez au propriétaire du foyer de vous accorder l'accès<br>
        (Réglages → Membres du foyer → « Passer premium »).`;
  root.innerHTML = `
    <div class="page-header">
      <button id="paywall-back" aria-label="Retour">‹</button>
      <h1>Fonctionnalité premium</h1>
    </div>
    <div style="max-width:420px;margin:24px auto;padding:0 16px;text-align:center">
      <div style="font-size:52px;margin-bottom:12px">💎</div>
      <div style="font-family:var(--font-display);font-weight:800;font-size:20px;margin-bottom:8px">${featureLabel}</div>
      <div style="font-size:14px;color:var(--muted-2);line-height:1.55">${message || defaultMsg}</div>
      <button class="btn btn-primary btn-full" id="paywall-home" style="margin-top:20px;max-width:240px;margin-left:auto;margin-right:auto">Retour à l'accueil</button>
    </div>`;
  root.querySelector("#paywall-back").onclick = () => { history.back(); };
  root.querySelector("#paywall-home").onclick = () => { location.hash = "#/accueil"; };
}

window._utils = { isoWeekOf, monthGrid, toIsoDate, today, el, mergeShoppingItems };
