import { api } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../components/toast.js";

/** Demande de réinitialisation : saisie de l'email. */
export function renderForgot(root) {
  root.innerHTML = `
    <div class="login-wrap">
      <form class="login-form" id="forgot-form">
        <h1 style="font-size:22px;margin-bottom:4px">Mot de passe oublié</h1>
        <p style="font-size:13.5px;color:var(--ink-soft);line-height:1.5">
          Indiquez l'adresse email de votre compte : nous vous enverrons un lien
          pour choisir un nouveau mot de passe (valable 30 minutes).
        </p>
        <div class="form-group">
          <label>Email</label>
          <input type="email" id="forgot-email" placeholder="vous@exemple.com" autocomplete="email" required />
        </div>
        <div class="error-msg" id="forgot-error"></div>
        <button class="btn btn-primary btn-full" type="submit">Envoyer le lien</button>
        <p class="login-hint" style="text-align:center;margin-top:12px">
          <a href="#/login" style="color:var(--accent-header);font-weight:600">← Retour à la connexion</a>
        </p>
      </form>
    </div>`;

  document.getElementById("forgot-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("forgot-email").value.trim();
    if (!email) return;
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await api.forgotPassword(email);
      e.target.innerHTML = `
        <h1 style="font-size:22px;margin-bottom:8px">📬 C'est envoyé</h1>
        <p style="font-size:14px;color:var(--ink-soft);line-height:1.6">
          Si un compte existe pour <strong>${email.replace(/</g, "&lt;")}</strong>,
          un email de réinitialisation vient de lui être envoyé.<br><br>
          Pensez à vérifier le dossier spam.
        </p>
        <p class="login-hint" style="text-align:center;margin-top:16px">
          <a href="#/login" style="color:var(--accent-header);font-weight:600">← Retour à la connexion</a>
        </p>`;
    } catch (err) {
      document.getElementById("forgot-error").textContent = err.message;
      btn.disabled = false;
    }
  });
}

/** Réinitialisation : nouveau mot de passe (arrivée depuis le lien email). */
export function renderReset(root, params) {
  const token = params?.token || "";
  root.innerHTML = `
    <div class="login-wrap">
      <form class="login-form" id="reset-form">
        <h1 style="font-size:22px;margin-bottom:4px">Nouveau mot de passe</h1>
        <div class="form-group">
          <label>Nouveau mot de passe</label>
          <input type="password" id="reset-pw" placeholder="8 caractères minimum" autocomplete="new-password" minlength="8" required />
        </div>
        <div class="form-group">
          <label>Confirmez-le</label>
          <input type="password" id="reset-pw2" placeholder="••••••••" autocomplete="new-password" required />
        </div>
        <div class="error-msg" id="reset-error">${token ? "" : "Lien invalide — repassez par l'email reçu."}</div>
        <button class="btn btn-primary btn-full" type="submit" ${token ? "" : "disabled"}>Changer le mot de passe</button>
        <p class="login-hint" style="text-align:center;margin-top:12px">
          <a href="#/motdepasse-oublie" style="color:var(--accent-header);font-weight:600">Refaire une demande</a>
        </p>
      </form>
    </div>`;

  document.getElementById("reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("reset-error");
    const pw = document.getElementById("reset-pw").value;
    const pw2 = document.getElementById("reset-pw2").value;
    if (pw !== pw2) { errorEl.textContent = "Les deux mots de passe ne correspondent pas."; return; }
    if (pw.length < 8) { errorEl.textContent = "8 caractères minimum."; return; }
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const res = await api.resetPassword(token, pw);
      state.setAuth(res.token, res.household_id, res.member_id, res.member_name, res.is_owner);
      showToast("Mot de passe changé ✓");
      location.hash = "#/accueil";
    } catch (err) {
      errorEl.textContent = err.message;
      btn.disabled = false;
    }
  });
}
