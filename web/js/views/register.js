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

      <div class="oauth-divider"><span>ou continuer avec</span></div>

      <div class="oauth-buttons" id="oauth-btns">
        <a class="btn-oauth btn-oauth-google" id="google-oauth-btn">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Google
        </a>
        <a class="btn-oauth btn-oauth-apple" id="apple-oauth-btn">
          <svg width="18" height="18" viewBox="0 0 814 1000" aria-hidden="true" fill="currentColor">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 376.7 0 248.4 0 124.8 0 54.3 20.7 0 57.8 0c16.4 0 33.5 6.5 48 18.2 27.6 21.5 58.9 69.5 58.9 120.3 0 45.5-22.2 92.6-35.8 108.2 2.7 1.9 8.2 6.5 22.8 6.5 70.5 0 156.2-47.6 156.2-47.6z"/>
          </svg>
          Apple
        </a>
      </div>
    </div>`;

  const form = document.getElementById("register-form");
  const errorEl = document.getElementById("reg-error");

  // OAuth buttons read invite_code from the form at click time
  document.getElementById("google-oauth-btn").addEventListener("click", () => {
    const code = document.getElementById("reg-invite").value.trim();
    location.href = "/api/auth/google" + (code ? "?invite_code=" + encodeURIComponent(code) : "");
  });
  document.getElementById("apple-oauth-btn").addEventListener("click", () => {
    const code = document.getElementById("reg-invite").value.trim();
    location.href = "/api/auth/apple" + (code ? "?invite_code=" + encodeURIComponent(code) : "");
  });

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
