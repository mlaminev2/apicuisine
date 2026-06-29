import { api } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../components/toast.js";

export async function renderLogin(root) {
  root.innerHTML = `
    <div class="login-wrap">
      <h1>🍴 Menus Famille</h1>
      <form class="login-form" id="login-form">
        <div class="form-group">
          <label>Code du foyer</label>
          <input type="password" id="passcode" placeholder="Code…" autocomplete="current-password" />
        </div>
        <div class="form-group">
          <label>Profil</label>
          <select id="member-select"><option value="">Chargement…</option></select>
        </div>
        <div class="error-msg" id="login-error"></div>
        <button class="btn btn-primary btn-full" type="submit">Se connecter</button>
        <p class="login-hint">Entrez le code partagé de votre famille.</p>
      </form>
    </div>`;

  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  const memberSelect = document.getElementById("member-select");

  // Try to load members (public endpoint when no token)
  try {
    // We need to try login without member to discover household,
    // but members require auth. Show empty option for now.
    memberSelect.innerHTML = `<option value="">— Aucun profil —</option>`;
  } catch {}

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    const passcode = document.getElementById("passcode").value;
    const memberId = memberSelect.value ? parseInt(memberSelect.value) : null;
    try {
      const res = await api.login(passcode, memberId);
      state.setAuth(res.token, res.household_id, res.member_id, null);
      // Load member name
      try {
        const members = await api.getMembers();
        const member = members.find((m) => m.id === res.member_id);
        if (member) {
          state.setAuth(res.token, res.household_id, res.member_id, member.name);
          memberSelect.innerHTML = members.map(
            (m) => `<option value="${m.id}">${m.name}</option>`
          ).join("") + `<option value="">— Aucun profil —</option>`;
        }
      } catch {}
      location.hash = "#/calendrier";
    } catch (err) {
      errorEl.textContent = err.message === "Code incorrect" ? "Code incorrect" : err.message;
    }
  });

  // After initial auth attempt with empty passcode to list members — not possible
  // We show "no profile" and let user log in first
}
