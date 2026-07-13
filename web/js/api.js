import { state } from "./state.js";

const BASE = "";

function getToken() { return localStorage.getItem("token") || ""; }

async function request(method, path, body = null) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body !== null) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(BASE + path, opts);
  } catch (e) {
    throw new Error("Hors ligne");
  }

  // Token expiré ou révoqué → logout automatique
  const noAutoLogout = ["/api/login", "/api/register", "/api/password", "/api/password/forgot", "/api/password/reset", "/api/auth/exchange"];
  if (res.status === 401 && !noAutoLogout.includes(path)) {
    state.clearAuth();
    location.hash = "#/login";
    throw new Error("Session expirée");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erreur serveur" }));
    const detail = Array.isArray(err.detail)
      ? err.detail.map((e) => e.msg || JSON.stringify(e)).join(", ")
      : (err.detail || `Erreur ${res.status}`);
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  login: (email, password) => request("POST", "/api/login", { email, password }),
  register: (name, email, password, color, invite_code) =>
    request("POST", "/api/register", { name, email, password, color, invite_code: invite_code || null }),
  oauthExchange: (code) => request("POST", "/api/auth/exchange", { code }),
  publicConfig: () => request("GET", "/api/public-config"),
  changePassword: (current_password, new_password) =>
    request("POST", "/api/password", { current_password, new_password }),
  forgotPassword: (email) => request("POST", "/api/password/forgot", { email }),
  resetPassword: (token, new_password) => request("POST", "/api/password/reset", { token, new_password }),
  getMembers: () => request("GET", "/api/members"),
  deleteMember: (id) => request("DELETE", `/api/members/${id}`),
  getAccess: () => request("GET", "/api/access"),
  setMemberPremium: (id, is_premium) => request("PUT", `/api/members/${id}/premium`, { is_premium }),
  adminStats: () => request("GET", "/api/admin/stats"),
  adminBackups: () => request("GET", "/api/admin/backups"),
  adminCreateBackup: () => request("POST", "/api/admin/backups"),
  adminDownloadBackup: async (name) => {
    const headers = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`/api/admin/backups/download?name=${encodeURIComponent(name)}`, { headers });
    if (!res.ok) throw new Error("Téléchargement impossible");
    return res.blob();
  },
  adminSetFreemium: (enabled) => request("PUT", "/api/admin/freemium", { enabled }),
  adminSetPremium: (id, is_premium) => request("PUT", `/api/admin/members/${id}/premium`, { is_premium }),
  adminDeleteMember: (id) => request("DELETE", `/api/admin/members/${id}`),
  adminDeleteHousehold: (id) => request("DELETE", `/api/admin/households/${id}`),
  billingConfig: () => request("GET", "/api/billing/config"),
  billingCheckout: (plan) => request("POST", "/api/billing/checkout", { plan }),
  billingPortal: () => request("POST", "/api/billing/portal"),
  pushConfig: () => request("GET", "/api/push/config"),
  pushSubscribe: (sub) => request("POST", "/api/push/subscribe", sub),
  pushUnsubscribe: () => request("POST", "/api/push/unsubscribe"),
  pushTest: () => request("POST", "/api/push/test"),
  getInvite: () => request("GET", "/api/invite"),
  createInvite: () => request("POST", "/api/invite"),
  deleteInvite: () => request("DELETE", "/api/invite"),

  getDishes: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request("GET", `/api/dishes${q ? "?" + q : ""}`);
  },
  createDish: (name, category) => request("POST", "/api/dishes", { name, category }),
  updateDish: (id, data) => request("PUT", `/api/dishes/${id}`, data),
  deleteDish: (id) => request("DELETE", `/api/dishes/${id}`),

  getPriority: (date) => request("GET", `/api/priority?date=${date}`),

  getPlan: (from, to) => request("GET", `/api/plan?from=${from}&to=${to}`),
  putPlan: (date, data) => request("PUT", `/api/plan/${date}`, data),
  patchPlan: (date, data) => request("PATCH", `/api/plan/${date}`, data),
  deletePlan: (date) => request("DELETE", `/api/plan/${date}`),

  getShoppingWeeks: () => request("GET", "/api/shopping"),
  getShoppingAll: () => request("GET", "/api/shopping/all"),
  getShopping: (year, week) => request("GET", `/api/shopping/${year}/${week}`),
  putShopping: (year, week, items) => request("PUT", `/api/shopping/${year}/${week}`, { items }),

  getTracking: (from, to) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const q = params.toString();
    return request("GET", `/api/tracking${q ? "?" + q : ""}`);
  },

  getSettings: () => request("GET", "/api/settings"),
  putSettings: (data) => request("PUT", "/api/settings", data),
  exportData: () => request("GET", "/api/export"),

  importUrl: (url) => request("POST", "/api/import-url", { url }),
  importSave: (data) => request("POST", "/api/import-save", data),
  extractText: (text) => request("POST", "/api/extract-text", { text }),
  importPhoto: async (files) => {
    const fd = new FormData();
    for (const f of (Array.isArray(files) ? files : [files])) fd.append("files", f);
    const headers = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch("/api/import-photo", { method: "POST", headers, body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Lecture de la photo impossible");
    }
    return res.json();
  },

  uploadDishImage: async (id, file) => {
    const formData = new FormData();
    formData.append("file", file);
    const headers = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`/api/dishes/${id}/image`, { method: "POST", headers, body: formData });
    if (!res.ok) throw new Error("Erreur upload image");
    return res.json();
  },

  getShopCategories: () => request("GET", "/api/shopping-categories"),
  createShopCategory: (name, color) => request("POST", "/api/shopping-categories", { name, color }),
  updateShopCategory: (id, data) => request("PUT", `/api/shopping-categories/${id}`, data),
  deleteShopCategory: (id) => request("DELETE", `/api/shopping-categories/${id}`),
  getIngredientMap: () => request("GET", "/api/ingredient-map"),
  putIngredientMap: (ingredient_key, category_id) => request("PUT", "/api/ingredient-map", { ingredient_key, category_id }),
  deleteIngredientMap: (key) => request("DELETE", `/api/ingredient-map?key=${encodeURIComponent(key)}`),
};

window._api = api;
