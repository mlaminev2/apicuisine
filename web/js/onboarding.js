// Mini-guide affiché une seule fois, à la première connexion, pour présenter l'app.

const STEPS = [
  { icon: "👋", title: "Bienvenue !", body: "Menu en Famille réunit les repas de toute la famille au même endroit — fini les « on mange quoi ce soir ? »." },
  { icon: "📅", title: "Planifiez la semaine", body: "Choisissez un plat pour chaque jour, en un tap. Vue par semaine ou par mois, comme vous préférez." },
  { icon: "🍲", title: "Vos recettes réunies", body: "Importez une recette depuis un lien ou une photo, ou ajoutez les vôtres à la main." },
  { icon: "🛒", title: "Courses & famille", body: "La liste de courses se crée toute seule à partir de vos plats. Et vous pouvez inviter votre famille depuis les Réglages." },
];

function buildOnboarding() {
  const overlay = document.createElement("div");
  overlay.className = "onb-overlay";
  const card = document.createElement("div");
  card.className = "onb-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Présentation de l'application");
  overlay.appendChild(card);

  let i = 0;
  const close = () => overlay.remove();

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

// Affiche le guide une seule fois. Retourne true tant qu'il n'a pas été vu (pour
// ne pas enchaîner avec l'invitation à installer l'app la même visite).
export function maybeShowOnboarding() {
  if (localStorage.getItem("onboarding_seen") === "1") return false;
  // On ne marque « vu » qu'à l'affichage réel : au 1er lancement, le service
  // worker s'active et recharge la page, ce qui annulerait ce différé — sinon
  // le guide serait perdu pour toujours.
  setTimeout(() => {
    if (localStorage.getItem("onboarding_seen") === "1") return;
    if (document.querySelector(".onb-card")) return;
    localStorage.setItem("onboarding_seen", "1");
    document.body.appendChild(buildOnboarding());
  }, 900);
  return true;
}
