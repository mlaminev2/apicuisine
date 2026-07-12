// Pages légales (accessibles sans connexion) : mentions légales, CGV,
// politique de confidentialité. Contenu statique, mis à jour le 12/07/2026.

const EDITEUR = `Diaby Lamine, entrepreneur individuel (micro-entreprise)`;
const SIRET = `888 094 471 00016`;
const ADRESSE = `17 rue Georges Duhamel, 75015 Paris, France`;
const EMAIL = `contact@menuenfamille.fr`;
const MAJ = `12 juillet 2026`;

const MENTIONS = `
<p class="legal-date">Dernière mise à jour : ${MAJ}</p>

<h2>Éditeur du site</h2>
<p>Le site et l'application <strong>Menu en Famille</strong> (accessibles à l'adresse
<a href="https://menuenfamille.fr">menuenfamille.fr</a>) sont édités par :</p>
<ul>
  <li><strong>${EDITEUR}</strong></li>
  <li>SIRET : ${SIRET}</li>
  <li>Siège : ${ADRESSE}</li>
  <li>Adresse e-mail : <a href="mailto:${EMAIL}">${EMAIL}</a></li>
  <li>TVA : non applicable, article 293 B du Code général des impôts (franchise en base).</li>
</ul>

<h2>Directeur de la publication</h2>
<p>Diaby Lamine.</p>

<h2>Hébergement</h2>
<p>Le site est hébergé par :</p>
<ul>
  <li><strong>Hostinger International Ltd.</strong></li>
  <li>61 Lordou Vironos Street, 6023 Larnaca, Chypre</li>
  <li><a href="https://www.hostinger.fr">www.hostinger.fr</a></li>
</ul>

<h2>Propriété intellectuelle</h2>
<p>L'ensemble des éléments du site (structure, textes, logos, éléments graphiques,
logiciel) est la propriété de l'éditeur ou fait l'objet d'une autorisation
d'usage. Toute reproduction ou représentation, totale ou partielle, sans
autorisation écrite préalable est interdite. Les recettes et contenus ajoutés
par un utilisateur restent la responsabilité de cet utilisateur.</p>

<h2>Responsabilité</h2>
<p>L'éditeur s'efforce d'assurer l'exactitude des informations diffusées et la
disponibilité du service, sans pouvoir la garantir en toutes circonstances. Le
service est fourni « en l'état ».</p>

<h2>Contact</h2>
<p>Pour toute question : <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
`;

const CGV = `
<p class="legal-date">Dernière mise à jour : ${MAJ}</p>

<h2>Article 1 — Objet</h2>
<p>Les présentes conditions générales de vente (CGV) régissent la souscription à
l'abonnement <strong>Premium</strong> du service <strong>Menu en Famille</strong>,
proposé par ${EDITEUR}, SIRET ${SIRET}, ${ADRESSE} (ci-après « l'Éditeur »).</p>

<h2>Article 2 — Description du service</h2>
<p>Menu en Famille est une application de planification de repas (calendrier des
menus, liste de courses, gestion de recettes). L'accès de base est gratuit et
financé par la publicité. L'abonnement <strong>Premium</strong> débloque :</p>
<ul>
  <li>l'import illimité de recettes (lien et photo) ;</li>
  <li>la suppression des publicités.</li>
</ul>

<h2>Article 3 — Prix</h2>
<p>L'abonnement Premium est proposé au choix :</p>
<ul>
  <li><strong>2,99 € par mois</strong>, ou</li>
  <li><strong>24,99 € par an</strong>.</li>
</ul>
<p>Prix en euros. TVA non applicable, article 293 B du CGI. L'Éditeur se réserve
le droit de modifier ses prix ; le tarif applicable est celui affiché au moment
de la souscription, et tout changement est notifié avant reconduction.</p>

<h2>Article 4 — Paiement</h2>
<p>Le paiement s'effectue par carte bancaire via notre prestataire
<strong>Stripe</strong>, sur une page de paiement sécurisée. Aucune donnée
bancaire n'est stockée par l'Éditeur. Le paiement est débité à la souscription
puis à chaque reconduction.</p>

<h2>Article 5 — Durée et reconduction</h2>
<p>L'abonnement est conclu pour une durée d'un mois ou d'un an selon la formule
choisie, <strong>reconduit automatiquement</strong> pour une durée identique,
tant qu'il n'est pas résilié.</p>

<h2>Article 6 — Résiliation</h2>
<p>L'abonné peut résilier <strong>à tout moment</strong>, depuis l'espace de
gestion de l'abonnement accessible dans l'application (portail Stripe). La
résiliation prend effet à la fin de la période en cours déjà payée : l'accès
Premium reste actif jusqu'à cette date, sans reconduction ultérieure. Les
sommes déjà réglées pour la période en cours ne sont pas remboursées au prorata.</p>

<h2>Article 7 — Droit de rétractation</h2>
<p>Le service Premium est un contenu numérique fourni immédiatement après la
souscription. Conformément à l'article L.221-28 du Code de la consommation,
<strong>en souscrivant et en accédant immédiatement au service, l'abonné demande
expressément son exécution immédiate et renonce à son droit de rétractation</strong>
de 14 jours.</p>

<h2>Article 8 — Remboursement</h2>
<p>En dehors des cas prévus par la loi, les abonnements ne sont pas remboursables.
En cas de dysfonctionnement imputable au service, l'abonné peut contacter
l'Éditeur à <a href="mailto:${EMAIL}">${EMAIL}</a> pour rechercher une solution
amiable (correction, geste commercial).</p>

<h2>Article 9 — Responsabilité</h2>
<p>L'Éditeur est tenu d'une obligation de moyens. Le service est fourni « en
l'état » et peut connaître des interruptions (maintenance, incident technique).
L'Éditeur ne saurait être tenu responsable des dommages indirects.</p>

<h2>Article 10 — Données personnelles</h2>
<p>Le traitement des données personnelles est décrit dans notre
<a href="#/confidentialite">Politique de confidentialité</a>.</p>

<h2>Article 11 — Médiation de la consommation</h2>
<p>Conformément à l'article L.612-1 du Code de la consommation, le consommateur
peut recourir gratuitement à un médiateur de la consommation en vue de la
résolution amiable d'un litige. Médiateur compétent : <strong>[À COMPLÉTER —
nom et coordonnées du médiateur de la consommation auquel l'Éditeur adhère]</strong>.
Plateforme européenne de règlement en ligne des litiges :
<a href="https://ec.europa.eu/consumers/odr">ec.europa.eu/consumers/odr</a>.</p>

<h2>Article 12 — Droit applicable</h2>
<p>Les présentes CGV sont soumises au droit français. À défaut de résolution
amiable, tout litige relève des tribunaux français compétents.</p>
`;

const CONFIDENTIALITE = `
<p class="legal-date">Dernière mise à jour : ${MAJ}</p>

<h2>Responsable du traitement</h2>
<p>${EDITEUR}, ${ADRESSE}. Contact : <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>

<h2>Données que nous collectons</h2>
<ul>
  <li><strong>Compte</strong> : adresse e-mail, mot de passe (stocké chiffré / haché), nom d'affichage.</li>
  <li><strong>Contenu que vous créez</strong> : recettes, planning des repas, listes de courses, réglages.</li>
  <li><strong>Paiement</strong> : en cas d'abonnement, les données bancaires sont traitées directement par Stripe. Nous ne les stockons pas ; nous conservons seulement un identifiant client/abonnement.</li>
  <li><strong>Mesure d'audience et publicité</strong> : cookies et identifiants (Google Analytics, Google AdSense), déposés uniquement après votre consentement.</li>
</ul>

<h2>Finalités et bases légales</h2>
<ul>
  <li>Fournir le service (compte, planning, recettes) — exécution du contrat.</li>
  <li>Gérer l'abonnement et les paiements — exécution du contrat.</li>
  <li>Envoyer des e-mails liés au compte (réinitialisation de mot de passe) — exécution du contrat.</li>
  <li>Mesurer l'audience et afficher des publicités — votre consentement.</li>
</ul>

<h2>Destinataires et sous-traitants</h2>
<p>Nous faisons appel à des prestataires qui agissent pour notre compte :</p>
<ul>
  <li><strong>Hostinger</strong> — hébergement (Union européenne).</li>
  <li><strong>Stripe</strong> — paiement des abonnements.</li>
  <li><strong>Brevo</strong> — envoi des e-mails transactionnels (Union européenne).</li>
  <li><strong>Google</strong> — mesure d'audience (Analytics) et publicité (AdSense), soumis à votre consentement.</li>
</ul>

<h2>Durée de conservation</h2>
<p>Les données de compte sont conservées tant que le compte existe, puis
supprimées ou anonymisées après sa fermeture. Les données de facturation sont
conservées le temps requis par les obligations légales et comptables.</p>

<h2>Cookies</h2>
<p>Lors de votre première visite, un message de consentement vous permet
d'accepter ou de refuser les cookies de mesure d'audience et de publicité. Vous
pouvez modifier votre choix à tout moment. Les cookies strictement nécessaires
au fonctionnement (session) ne requièrent pas de consentement.</p>

<h2>Vos droits</h2>
<p>Conformément au RGPD, vous disposez d'un droit d'accès, de rectification,
d'effacement, de portabilité, de limitation et d'opposition. Vous pouvez exporter
vos données depuis les Réglages de l'application, et exercer vos droits en nous
écrivant à <a href="mailto:${EMAIL}">${EMAIL}</a>. Vous pouvez également introduire
une réclamation auprès de la CNIL (<a href="https://www.cnil.fr">cnil.fr</a>).</p>

<h2>Sécurité</h2>
<p>Nous mettons en œuvre des mesures techniques pour protéger vos données :
chiffrement des échanges (HTTPS), mots de passe hachés, sauvegardes chiffrées,
accès restreint.</p>
`;

const DOCS = {
  mentions: { title: "Mentions légales", html: MENTIONS },
  cgv: { title: "Conditions générales de vente", html: CGV },
  confidentialite: { title: "Politique de confidentialité", html: CONFIDENTIALITE },
};

export function renderLegal(root, which) {
  const doc = DOCS[which] || DOCS.mentions;
  root.innerHTML = `
    <div class="page-header">
      <button id="legal-back" aria-label="Retour">‹</button>
      <h1>${doc.title}</h1>
    </div>
    <article class="legal-doc">${doc.html}
      <nav class="legal-nav">
        <a href="#/mentions-legales">Mentions légales</a>
        <a href="#/cgv">CGV</a>
        <a href="#/confidentialite">Confidentialité</a>
      </nav>
    </article>`;
  document.getElementById("legal-back").onclick = () => {
    if (window.history.length > 1) window.history.back();
    else location.hash = "#/reglages";
  };
  root.scrollTop = 0;
}
