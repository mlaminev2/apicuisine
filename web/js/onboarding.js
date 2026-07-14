// Mini-tuto affiché à la première connexion : un écran par onglet, pour
// expliquer le contenu et ce qu'on peut y faire. Rejouable depuis les Réglages.
import { maybeShowInstallPrompt } from "./pwa-install.js";

const STEPS = [
  { icon: "👋", title: "Bienvenue !", body: "Voici un petit tour de l'app. En bas de l'écran, 5 onglets : passez de l'un à l'autre d'un simple tap." },
  { icon: "🏠", title: "Accueil", body: "Votre tableau de bord : le repas prévu aujourd'hui, un aperçu de la semaine, et le bouton « Remplir la semaine » qui propose un menu automatiquement. L'icône ⚙ en haut ouvre les Réglages." },
  { icon: "📅", title: "Calendrier", body: "Planifiez vos repas. Touchez un jour pour choisir un plat (vue semaine ou mois, glissez pour changer de période). Un plat pas encore dans votre base ? Il s'ajoute tout seul." },
  { icon: "🍽️", title: "Plats", body: "Votre base de recettes. Ajoutez vos plats, classez-les par catégorie, mettez-les en favori ★ et notez régimes/allergènes. Touchez un plat pour voir sa fiche et sa photo." },
  { icon: "📥", title: "Importer", body: "Ajoutez une recette en un instant : depuis un lien (YouTube, Instagram, sites), une photo (livre, magazine), ou à la main." },
  { icon: "🛒", title: "Courses", body: "Votre liste de courses se génère automatiquement à partir des plats planifiés. Cochez les articles au fur et à mesure, regroupés par rayon." },
  { icon: "⚙️", title: "Réglages", body: "Via l'icône ⚙ en haut de l'Accueil : roulement de la semaine, vos catégories, membres du foyer, allergies, notifications, et déconnexion." },
];

function buildOnboarding(onClose) {
  const overlay = document.createElement("div");
  overlay.className = "onb-overlay";
  const card = document.createElement("div");
  card.className = "onb-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Présentation de l'application");
  overlay.appendChild(card);

  let i = 0;
  const close = () => {
    overlay.remove();
    if (onClose) onClose();
  };

  const render = () => {
    const s = STEPS[i];
    const last = i === STEPS.length - 1;
    const dots = STEPS.map((_, k) => `<span class="onb-dot${k === i ? " on" : ""}"></span>`).join("");
    card.innerHTML = `
      <div class="onb-icon">${s.icon}</div>
      <h2 class="onb-title">${s.title}</h2>
      <p class="onb-body">${s.body}</p>
      <div class="onb-dots">${dots}</div>
      <div class="onb-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="onb-skip">${last ? "" : "Passer"}</button>
        <button type="button" class="btn btn-primary btn-sm" id="onb-next">${last ? "C'est parti !" : "Suivant"}</button>
      </div>`;
    const skip = card.querySelector("#onb-skip");
    if (skip) skip.onclick = close;
    card.querySelector("#onb-next").onclick = () => {
      if (last) { close(); return; }
      i += 1;
      render();
    };
  };
  render();
  return overlay;
}

// Affiche le tuto une seule fois (première connexion), puis enchaîne sur
// l'invitation à installer l'app. Retourne true tant qu'il n'a pas été vu.
export function maybeShowOnboarding() {
  if (localStorage.getItem("onboarding_seen") === "1") return false;
  // On ne marque « vu » qu'à l'affichage réel : au 1er lancement, le service
  // worker s'active et recharge la page, ce qui annulerait ce différé.
  setTimeout(() => {
    if (localStorage.getItem("onboarding_seen") === "1") return;
    if (document.querySelector(".onb-card")) return;
    localStorage.setItem("onboarding_seen", "1");
    document.body.appendChild(buildOnboarding(maybeShowInstallPrompt));
  }, 900);
  return true;
}

// Rejoue le tuto à la demande (bouton « Revoir le guide » des Réglages).
export function showOnboardingNow() {
  if (document.querySelector(".onb-card")) return;
  document.body.appendChild(buildOnboarding(null));
}
