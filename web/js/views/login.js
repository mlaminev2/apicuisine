import { api } from "../api.js";
import { state } from "../state.js";

export async function renderLogin(root) {
  root.innerHTML = `
    <div class="login-wrap">
      <h1>🍴 Menus Famille</h1>
      <form class="login-form" id="login-form">
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="login-email" placeholder="vous@exemple.com" autocomplete="email" />
        </div>
        <div class="form-group">
          <label>Mot de passe</label>
          <input type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" />
        </div>
        <div class="error-msg" id="login-error"></div>
        <button class="btn btn-primary btn-full" type="submit">Se connecter</button>
        <p class="login-hint" style="text-align:center;margin-top:12px">
          Pas encore de compte ?
          <a href="#/inscription" style="color:var(--accent-header);font-weight:600">Créer un compte</a>
        </p>
      </form>
    </div>`;

  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      const res = await api.login(email, password);
      state.setAuth(res.token, res.household_id, res.member_id, res.member_name, res.is_owner);
      location.hash = "#/calendrier";
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}
