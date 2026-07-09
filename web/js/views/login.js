import { api } from "../api.js";
import { state } from "../state.js";

const OAUTH_ERRORS = {
  cancelled:       "Connexion annulée.",
  invalid_state:   "Erreur de sécurité, réessayez.",
  invite_required: "Un code d'invitation est requis pour rejoindre ce foyer.",
  invalid_invite:  "Code d'invitation invalide.",
  not_configured:  "La connexion Google n'est pas configurée sur ce serveur.",
  no_email:        "Votre compte Google n'a pas partagé d'adresse email.",
  google_error:    "Erreur de connexion Google. Réessayez.",
  no_household:    "Configuration serveur incorrecte.",
};

export async function renderLogin(root) {
  const params = Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || ""));
  const oauthError = params.oauth_error ? (OAUTH_ERRORS[params.oauth_error] || "Erreur de connexion.") : "";

  root.innerHTML = `
    <div class="login-wrap">
      <header class="landing-hero">
        <h1 class="landing-title">Menu en Famille</h1>
        <p class="landing-tagline">Le planificateur de repas de toute la famille</p>
        <p class="landing-desc">
          Organisez les <strong>repas de votre semaine</strong>, générez votre
          <strong>liste de courses</strong> automatiquement et gardez toutes vos
          <strong>recettes</strong> au même endroit — synchronisé sur tous vos appareils.
        </p>
        <ul class="landing-features">
          <li>📅 Un calendrier de repas par semaine ou par mois</li>
          <li>🛒 Liste de courses générée depuis vos plats</li>
          <li>🍽️ Vos recettes rangées et faciles à retrouver</li>
          <li>🔗 Importez une recette depuis un lien ou une photo</li>
          <li>✨ Remplissage automatique de la semaine</li>
        </ul>
      </header>
      <form class="login-form" id="login-form">
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="login-email" placeholder="vous@exemple.com" autocomplete="email" />
        </div>
        <div class="form-group">
          <label>Mot de passe</label>
          <input type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" />
        </div>
        <div class="error-msg" id="login-error">${oauthError}</div>
        <button class="btn btn-primary btn-full" type="submit">Se connecter</button>
        <p style="text-align:center;margin-top:10px;font-size:13px">
          <a href="#/motdepasse-oublie" style="color:var(--accent-header);font-weight:600">Mot de passe oublié ?</a>
        </p>
        <p class="login-hint" style="text-align:center;margin-top:12px">
          Pas encore de compte ?
          <a href="#/inscription" style="color:var(--accent-header);font-weight:600">Créer un compte</a>
        </p>
      </form>

      <div class="oauth-divider"><span>ou</span></div>

      <div class="oauth-buttons">
        <a href="/api/auth/google" class="btn-oauth btn-oauth-google">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continuer avec Google
        </a>
      </div>
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
      location.hash = "#/accueil";
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}
