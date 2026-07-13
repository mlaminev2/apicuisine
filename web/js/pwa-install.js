// Invitation à installer l'app sur l'écran d'accueil (PWA), adaptée au mobile.

let deferredPrompt = null; // événement Android/Chrome pour l'installation native

// Capté au chargement de l'app : permet un vrai bouton « Installer » sur Android/bureau.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
});
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  localStorage.setItem("pwa_installed", "1");
});

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}

function getPlatform() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  return { isIOS, isAndroid };
}

// Icône « Partager » iOS (carré + flèche vers le haut)
const IOS_SHARE = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 12v7a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19v-7"/></svg>`;

function stepsHtml() {
  const { isIOS, isAndroid } = getPlatform();
  if (isIOS) {
    return `
      <p class="pwa-lead">Installez « Menu en Famille » comme une vraie application, avec son icône sur votre écran d'accueil et les notifications.</p>
      <ol class="pwa-steps">
        <li>Touchez l'icône <strong>Partager</strong> ${IOS_SHARE} en bas de Safari.</li>
        <li>Faites défiler et choisissez <strong>« Sur l'écran d'accueil »</strong>.</li>
        <li>Touchez <strong>« Ajouter »</strong> en haut à droite.</li>
      </ol>
      <p class="pwa-note">Nécessaire sur iPhone pour recevoir les notifications de rappel.</p>`;
  }
  if (isAndroid) {
    return `
      <p class="pwa-lead">Installez « Menu en Famille » comme une vraie application, avec son icône sur l'écran d'accueil.</p>
      <ol class="pwa-steps">
        <li>Si un bouton <strong>« Installer l'application »</strong> apparaît (ci-dessous ou en bannière), touchez-le.</li>
        <li>Sinon, ouvrez le menu <strong>⋮</strong> en haut à droite de Chrome.</li>
        <li>Choisissez <strong>« Installer l'application »</strong> (ou « Ajouter à l'écran d'accueil »), puis confirmez.</li>
      </ol>`;
  }
  return `
    <p class="pwa-lead">Installez « Menu en Famille » pour l'ouvrir en un clic, comme une application.</p>
    <ol class="pwa-steps">
      <li>Cliquez sur l'icône d'installation <strong>⊕</strong> dans la barre d'adresse.</li>
      <li>Confirmez avec <strong>« Installer »</strong>.</li>
    </ol>`;
}

function buildSheet() {
  const overlay = document.createElement("div");
  overlay.className = "pwa-overlay";
  const sheet = document.createElement("div");
  sheet.className = "pwa-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Installer l'application");

  const canInstallNative = !!deferredPrompt;
  sheet.innerHTML = `
    <div class="pwa-icon">📲</div>
    <h2 class="pwa-title">Ajoutez l'app à votre écran d'accueil</h2>
    ${stepsHtml()}
    <div class="pwa-actions">
      ${canInstallNative ? `<button class="btn btn-primary btn-full" id="pwa-install-btn">Installer l'application</button>` : ""}
      <button class="btn btn-ghost btn-full" id="pwa-later-btn">Plus tard</button>
    </div>`;

  overlay.appendChild(sheet);
  const close = () => overlay.remove();

  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  sheet.querySelector("#pwa-later-btn").onclick = close;

  const installBtn = sheet.querySelector("#pwa-install-btn");
  if (installBtn) {
    installBtn.onclick = async () => {
      if (!deferredPrompt) { close(); return; }
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (_) { /* ignore */ }
      deferredPrompt = null;
      close();
    };
  }
  return overlay;
}

// Affiche l'invitation une seule fois (à la première connexion), sauf si l'app
// est déjà installée / lancée depuis l'écran d'accueil.
export function maybeShowInstallPrompt() {
  if (isStandalone()) return;
  if (localStorage.getItem("pwa_installed") === "1") return;
  if (localStorage.getItem("pwa_prompt_seen") === "1") return;
  // On ne marque « vu » qu'au moment de l'affichage : au tout premier
  // chargement, le service worker s'active et provoque un rechargement qui
  // annulerait ce différé — sinon le pop-up serait perdu pour toujours.
  setTimeout(() => {
    if (localStorage.getItem("pwa_prompt_seen") === "1" || isStandalone()) return;
    if (document.querySelector(".pwa-sheet")) return;
    localStorage.setItem("pwa_prompt_seen", "1");
    document.body.appendChild(buildSheet());
  }, 1500);
}

// Permet de relancer l'invitation manuellement (ex. depuis les réglages).
export function openInstallPrompt() {
  if (isStandalone()) return false;
  document.body.appendChild(buildSheet());
  return true;
}
