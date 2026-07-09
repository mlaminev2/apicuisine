import { api } from "../api.js";
import { showToast } from "../components/toast.js";

const INTERVAL_FR = { month: "mois", year: "an" };

function fmtAmount(amount, currency) {
  try {
    return amount.toLocaleString("fr-FR", { style: "currency", currency: currency || "EUR" });
  } catch {
    return `${amount} ${currency || "EUR"}`;
  }
}

const AVANTAGES = `
  <ul class="premium-benefits">
    <li>♾️ Imports de recettes <strong>illimités</strong> (lien et photo)</li>
    <li>🚫 <strong>Aucune publicité</strong> dans toute l'application</li>
    <li>❤️ Vous soutenez le développement de Menu en Famille</li>
  </ul>`;

/** Écran d'abonnement Premium. */
export async function renderPremium(root, params = {}) {
  root.innerHTML = `<div class="page-header"><h1>Premium</h1></div>
    <div id="premium-body" style="padding:0 0 24px"><div class="text-muted" style="padding:12px">Chargement…</div></div>`;
  const body = document.getElementById("premium-body");

  let access = null, config = null;
  try {
    [access, config] = await Promise.all([api.getAccess(), api.billingConfig()]);
  } catch (err) {
    body.innerHTML = `<div class="text-muted" style="padding:12px">${err.message}</div>`;
    return;
  }

  // Retour depuis Stripe : paiement réussi → on attend l'activation par le webhook
  if (params.paid) {
    body.innerHTML = `
      <div class="premium-card premium-active">
        <div class="premium-emoji">🎉</div>
        <h2>Merci pour votre abonnement !</h2>
        <p>Votre paiement a bien été reçu. L'activation de votre accès Premium se fait dans quelques secondes…</p>
        <div class="text-muted" id="premium-activating" style="margin-top:10px">Activation en cours…</div>
      </div>`;
    // Le webhook Stripe active le premium côté serveur : on rafraîchit jusqu'à confirmation
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const a = await api.getAccess();
        if (a.premium_active && a.is_premium) {
          showToast("Premium activé ✓");
          return renderPremium(root, {});
        }
      } catch {}
    }
    const note = document.getElementById("premium-activating");
    if (note) note.textContent = "L'activation prend un peu plus de temps que prévu. Rechargez la page dans un instant.";
    return;
  }

  if (params.canceled) {
    body.insertAdjacentHTML("afterbegin", `<div class="premium-note">Paiement annulé — aucun montant n'a été prélevé.</div>`);
  }

  // Déjà premium
  if (access.premium_active && access.is_premium) {
    const manage = access.can_manage_billing
      ? `<button class="btn btn-primary btn-full mt-8" id="premium-portal">Gérer mon abonnement</button>
         <p class="text-muted" style="font-size:12px;text-align:center;margin-top:8px">Résiliez ou modifiez votre paiement à tout moment.</p>`
      : `<p class="text-muted" style="font-size:13px;text-align:center;margin-top:8px">Accès Premium accordé sur votre compte. 💎</p>`;
    body.insertAdjacentHTML("beforeend", `
      <div class="premium-card premium-active">
        <div class="premium-emoji">💎</div>
        <h2>Vous êtes Premium</h2>
        <p>Profitez des imports illimités et d'une application sans publicité.</p>
      </div>
      ${AVANTAGES}
      ${manage}`);
    const portalBtn = document.getElementById("premium-portal");
    if (portalBtn) portalBtn.onclick = async () => {
      portalBtn.disabled = true;
      try {
        const { url } = await api.billingPortal();
        window.location.href = url;
      } catch (err) { showToast(err.message, "error"); portalBtn.disabled = false; }
    };
    return;
  }

  // Paiement pas encore disponible (Stripe non configuré côté serveur)
  if (!config.enabled) {
    body.insertAdjacentHTML("beforeend", `
      <div class="premium-card">
        <div class="premium-emoji">🔜</div>
        <h2>Bientôt disponible</h2>
        <p>L'abonnement Premium arrive très prochainement. Merci de votre patience !</p>
      </div>
      ${AVANTAGES}`);
    return;
  }

  // Offre d'abonnement : cartes tarifaires
  const offers = [];
  if (config.monthly) offers.push({ plan: "monthly", ...config.monthly });
  if (config.yearly) offers.push({ plan: "yearly", ...config.yearly });

  const cards = offers.map((o) => {
    const per = INTERVAL_FR[o.interval] || o.interval;
    const yearlyHint = o.plan === "yearly" ? `<span class="premium-badge">économie</span>` : "";
    return `
      <button class="premium-plan" data-plan="${o.plan}">
        <div class="premium-plan-head">
          <span class="premium-plan-name">${o.plan === "yearly" ? "Annuel" : "Mensuel"}</span>
          ${yearlyHint}
        </div>
        <div class="premium-plan-price">${fmtAmount(o.amount, o.currency)}<span> / ${per}</span></div>
      </button>`;
  }).join("");

  body.insertAdjacentHTML("beforeend", `
    <div class="premium-card">
      <div class="premium-emoji">💎</div>
      <h2>Passez à Premium</h2>
      <p>Débloquez les imports illimités et retirez toutes les publicités.</p>
    </div>
    ${AVANTAGES}
    <div class="premium-plans">${cards}</div>
    <p class="text-muted" style="font-size:12px;text-align:center;margin-top:14px">
      Paiement sécurisé par Stripe. Résiliable à tout moment.
    </p>`);

  body.querySelectorAll(".premium-plan").forEach((btn) => {
    btn.onclick = async () => {
      body.querySelectorAll(".premium-plan").forEach((b) => (b.disabled = true));
      try {
        const { url } = await api.billingCheckout(btn.dataset.plan);
        window.location.href = url;
      } catch (err) {
        showToast(err.message, "error");
        body.querySelectorAll(".premium-plan").forEach((b) => (b.disabled = false));
      }
    };
  });
}
