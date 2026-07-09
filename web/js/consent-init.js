// Consent Mode v2 — niveau de consentement par défaut « refusé », posé AVANT le
// chargement d'AdSense et de Google Analytics. Le message de consentement de
// Google (CMP AdSense) met ensuite ces signaux à jour selon le choix du visiteur.
// Chargé en tout premier dans le <head> (script synchrone, servi depuis 'self').
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
window.gtag = gtag;
gtag("consent", "default", {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  wait_for_update: 500,
});
