import { api } from "../api.js";
import { state } from "../state.js";
import { escapeHtml } from "../utils.js";

export async function renderRegister(root) {
  const params = Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || ""));

  root.innerHTML = `
    <div class="login-wrap">
      <h1>🍴 Menus Famille</h1>
      <form class="login-form" id="register-form">
        <div class="form-group">
          <label>Prénom</label>
          <input type="text" id="reg-name" placeholder="Alice" autocomplete="name" />
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="reg-email" placeholder="vous@exemple.com" autocomplete="email" />
        </div>
        <div class="form-group">
          <label>Mot de passe <span style="color:#aaa;font-weight:400;font-size:11px">(8 caractères min.)</span></label>
          <input type="password" id="reg-password" placeholder="••••••••" autocomplete="new-password" />
        </div>
        <div class="form-group">
          <label>Couleur de profil</label>
          <input type="color" id="reg-color" value="#4B8FA6" style="width:48px;height:36px;border:none;cursor:pointer;border-radius:8px" />
        </div>
        <div class="form-group">
          <label>Code d'invitation <span style="color:#aaa;font-weight:400;font-size:11px">(laisser vide si vous créez le premier compte)</span></label>
          <input type="text" id="reg-invite" placeholder="Code reçu du propriétaire…" value="${escapeHtml(params.code || "")}" autocomplete="off" />
        </div>
        <div class="error-msg" id="reg-error"></div>
        <button class="btn btn-primary btn-full" type="submit">Créer mon compte</button>
        <p class="login-hint" style="text-align:center;margin-top:12px">
          Déjà un compte ?
          <a href="#/login" style="color:var(--accent-header);font-weight:600">Se connecter</a>
        </p>
      </form>
    </div>`;

  const form = document.getElementById("register-form");
  const errorEl = document.getElementById("reg-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    const name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const color = document.getElementById("reg-color").value;
    const invite_code = document.getElementById("reg-invite").value.trim() || null;

    if (!name) { errorEl.textContent = "Le prénom est requis."; return; }
    try {
      const res = await api.register(name, email, password, color, invite_code);
      state.setAuth(res.token, res.household_id, res.member_id, res.member_name, res.is_owner);
      location.hash = "#/calendrier";
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}
