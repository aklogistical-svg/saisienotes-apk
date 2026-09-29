'use strict';

/* ============================================================
   GUIDE MULTI-ÉTAPES — moteur spotlight
   ============================================================ */
const guide = (() => {
  const ICO = {
    open   : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5a1.5 1.5 0 0 1 1.5-1.5h4.379a1.5 1.5 0 0 1 1.06.44l1.122 1.12a1.5 1.5 0 0 0 1.06.44H19.5A1.5 1.5 0 0 1 21 9.5"/><path d="M3 7.5v9A1.5 1.5 0 0 0 4.5 18h13.44a1.5 1.5 0 0 0 1.45-1.11l1.88-6.9a1.2 1.2 0 0 0-1.16-1.5H6a1.5 1.5 0 0 0-1.45 1.11L3 15"/></svg>',
    view   : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>',
    save   : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a1.5 1.5 0 0 1-2-2V5a1.5 1.5 0 0 1 2-2h11l5 5v11a1.5 1.5 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
    export : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H6a1.5 1.5 0 0 0-2 2v12a1.5 1.5 0 0 0 2 2h12a1.5 1.5 0 0 0 2-2v-4"/><path d="M10 16c0-5 4-8 9-8"/><path d="M15 4l4 4-4 4"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7.5 11.5 12 16l4.5-4.5"/><path d="M4.5 16.5v2A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-2"/></svg>',
    server : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="6" rx="1.5"/><rect x="3.5" y="13.5" width="17" height="6" rx="1.5"/><circle cx="7" cy="7.5" r=".75" fill="currentColor" stroke="none"/><circle cx="7" cy="16.5" r=".75" fill="currentColor" stroke="none"/></svg>',
    more   : '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    pdf    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/></svg>',
    bilan  : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="1.8"/><path d="m8.5 12.5 2 2 4-4.2"/></svg>',
    account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };
  // Construit un titre de bulle avec la même icône que le bouton référencé
  const t = (ico, label) => ico ? `<span class="guide-ico">${ico}</span>${label}` : label;
  // Icône plus petite, pour un usage inline dans le texte descriptif (pas dans un titre).
  const ic = (ico) => `<span class="guide-ico" style="width:16px;height:16px;vertical-align:-3px">${ico}</span>`;
  // Même clé que AuthManager (sync.js) : évite de dupliquer la logique
  // "est-on connecté ?" dans un état séparé qui pourrait diverger.
  const isLoggedIn = () => !!state.get('user_id');

  const STEPS = [
    {
      targetId : null,
      title    : '✦ Bienvenue dans le Guide',
      desc     : 'Ce guide vous accompagne pas à pas pour maîtriser l\'application <strong>Saisie de Notes</strong>.<br><br>Utilisez <strong>Suivant / Précédent</strong> pour naviguer, ou cliquez <strong>✕</strong> pour fermer à tout moment.',
    },
    {
      targetId : 'openBtn',
      title    : t(ICO.open, 'Charger'),
      desc     : 'Si vous êtes <strong>connecté au serveur</strong> (voir Connexion), charge directement les données depuis la base centrale.<br><br>Sinon, ouvre un fichier <strong>JSON</strong> exporté au préalable, contenant élèves, matières et notes existantes.',
    },
    {
      targetId : 'saveBtn',
      title    : t(ICO.save, 'Enregistrer'),
      desc     : 'Sauvegarde les modifications directement dans le fichier de notes ouvert, sur l\'appareil.<br><br>Le fichier d\'origine est mis à jour, sans étape supplémentaire.',
    },
    {
      targetId : 'exportBtn',
      title    : t(ICO.export, 'Exporter'),
      desc     : 'Si vous êtes <strong>connecté au serveur</strong>, envoie directement les notes vers la base centrale.<br><br>Sinon, génère un fichier <strong>CSV</strong> et ouvre le partage natif (Drive, mail, WhatsApp...) pour l\'envoyer où vous voulez.',
    },
    {
      targetId : 'netToggle',
      title    : t(ICO.server, 'Connexion Serveur'),
      desc     : 'Connectez-vous au <strong>serveur central</strong> pour charger ou envoyer les données en ligne.<br><br>L\'app cherche automatiquement le serveur sur le réseau WiFi de l\'école ; le bouton ↻ relance la recherche, et « Diagnostic réseau » en bas de l\'écran de connexion aide à comprendre pourquoi il n\'est pas trouvé.<br><br>Le voyant rouge 🔴 indique que vous êtes hors connexion ; vert 🟢 = connecté.',
    },
    {
      targetId : 'accountBtn',
      title    : t(ICO.account, 'Mon compte'),
      desc     : 'Visible uniquement une fois <strong>connecté</strong> au serveur.<br><br>Permet de changer votre mot de passe en confirmant l\'ancien (au moins <strong>6 caractères</strong> pour le nouveau), et de vous déconnecter.',
    },
    {
      targetId : 'toggleView',
      title    : t(ICO.view, "Changer l'affichage"),
      desc     : 'Basculez entre la <strong>vue tableau</strong> (desktop) et la <strong>vue cartes</strong> (mobile) selon votre préférence.<br><br>Sur mobile, la vue cartes est activée automatiquement.',
    },
    {
      targetId : 'moreBtn',
      revealMenu: true,
      title    : t(ICO.more, 'Plus d\'actions'),
      desc     : `Trois actions moins fréquentes, regroupées ici :<br><br>
<strong>${ic(ICO.download)} Télécharger dans Downloads</strong> — copie un fichier <strong>CSV</strong> directement dans le dossier Téléchargements de l'appareil.<br><br>
<strong>${ic(ICO.pdf)} PDF des notes</strong> — génère un PDF avec un tableau par classe et par matière, et le dépose lui aussi dans le dossier <strong>Téléchargements</strong>, pour imprimer ou archiver.<br><br>
<strong>${ic(ICO.bilan)} Bilan de saisie</strong> — montre qui a déjà des notes et qui n'en a pas, classe par classe et matière par matière. Touchez un champ manquant dans le Bilan pour sauter directement dessus dans le tableau de saisie.`,
      highlightIds: ['moreBtn', 'expDownload', 'pdfBtn', 'bilanBtn'],
    },
    {
      targetId : null,
      title    : '🔷 Saisie des notes',
      desc     : `Avant de saisir les notes, configurez les trois sélecteurs de la barre d'outils :<br><br>
<strong>📌 Classe</strong> — Sélectionnez la classe concernée.<br>
<strong>📌 Matière</strong> — Choisissez la matière à noter.<br>
<strong>📌 Ndevoir</strong> — Nombre de devoirs à afficher : <strong>1, 2 ou 3</strong> (défaut : 1).<br><br>
Tant que la classe ou la matière n'est pas choisie, aucune donnée ne s'affiche — cela évite toute saisie accidentelle dans le mauvais tableau.<br><br>
<strong>Types et limites de notes autorisés :</strong><br>
• <strong>Devoirs (1 à 3)</strong> : note sur <strong>20</strong> — valeurs décimales acceptées (ex. 13.5)<br>
• <strong>Composition</strong> : note sur <strong>20</strong>, toujours attendue quel que soit Ndevoir<br>
• Valeur <strong>0</strong> autorisée, mais traitée comme <strong>non saisie</strong> (cellule surlignée en rose, et signalée dans le Bilan)<br>
• Valeur hors intervalle [0 – 20] signalée en <strong>orange</strong>`,
      highlightIds : ['fClasseSel', 'fMatiereSel', 'nbNotesSel'],
    },
    {
      targetId : null,
      title    : 'ℹ️ À propos',
      desc     : `<strong>Saisie de Notes</strong> — version <strong>v3</strong><br><br>
Éditeur : <strong>Aklogistical</strong><br>
Email : <a href="mailto:aklogistical@gmail.com">aklogistical@gmail.com</a><br>
Contact(s): 75958191/71267760`,
    },
  ];

  let current = 0;

  const overlay    = document.getElementById('guideOverlay');
  const mask       = document.getElementById('guideMask');
  const spot       = document.getElementById('guideSpot');
  const bubble     = document.getElementById('guideBubble');
  const stepLabel  = document.getElementById('guideStepLabel');
  const titleEl    = document.getElementById('guideTitle');
  const descEl     = document.getElementById('guideDesc');
  const fill       = document.getElementById('guideProgressFill');
  const dotsWrap   = document.getElementById('guideDots');
  const btnPrev    = document.getElementById('guidePrev');
  const btnNext    = document.getElementById('guideNext');
  const btnClose   = document.getElementById('guideCloseBtn');

  // Crée les points indicateurs
  function buildDots() {
    dotsWrap.innerHTML = '';
    STEPS.forEach((_, i) => {
      const d = document.createElement('span');
      d.className = 'guide-dot' + (i === current ? ' active' : '');
      d.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(d);
    });
  }

  // Positionne le spotlight et la bulle autour de l'élément cible
  function positionSpot(step) {
    const ids = step.highlightIds || (step.targetId ? [step.targetId] : []);

    if (!ids.length) {
      spot.className = 'guide-no-target';
      mask.className = 'guide-dim';
      bubble.className = 'arrow-none';
      // Centre la bulle
      bubble.style.top  = '50%';
      bubble.style.left = '50%';
      bubble.style.transform = 'translate(-50%,-50%)';
      return;
    }
    mask.className = '';

    // Calcule le rect englobant tous les éléments ciblés
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      minX = Math.min(minX, r.left);
      minY = Math.min(minY, r.top);
      maxX = Math.max(maxX, r.right);
      maxY = Math.max(maxY, r.bottom);
    });

    const PAD = 6;
    spot.className = '';
    spot.style.left   = (minX - PAD) + 'px';
    spot.style.top    = (minY - PAD) + 'px';
    spot.style.width  = (maxX - minX + PAD * 2) + 'px';
    spot.style.height = (maxY - minY + PAD * 2) + 'px';

    // Positionne la bulle
    const bW = 370;
    const spaceBelow = window.innerHeight - maxY - PAD;
    const spaceAbove = minY - PAD;
    const bubbleH    = 260; // estimation

    bubble.style.transform = '';
    bubble.style.width = Math.min(bW, window.innerWidth * 0.88) + 'px';

    let bubTop, arrowClass;
    if (spaceBelow >= bubbleH || spaceBelow >= spaceAbove) {
      // En-dessous
      bubTop = maxY + PAD + 14;
      arrowClass = 'arrow-top';
    } else {
      // Au-dessus
      bubTop = minY - PAD - bubbleH - 14;
      arrowClass = 'arrow-bottom';
    }

    let bubLeft = minX - PAD;
    const maxLeft = window.innerWidth - Math.min(bW, window.innerWidth * 0.88) - 8;
    bubLeft = Math.max(8, Math.min(bubLeft, maxLeft));

    bubble.style.top  = bubTop + 'px';
    bubble.style.left = bubLeft + 'px';
    bubble.className  = arrowClass;
  }

  function goTo(idx) {
    current = Math.max(0, Math.min(idx, STEPS.length - 1));
    const step = STEPS[current];

    // Certaines cibles vivent derrière un état normalement masqué :
    // - Télécharger/PDF/Bilan sont dans le menu ⋯ Plus, fermé par défaut ;
    // - Mon compte n'apparaît que si on est déjà connecté au serveur.
    // getBoundingClientRect sur un élément masqué renvoie un rectangle
    // vide (le spotlight ne pointerait nulle part), donc on force
    // l'affichage pour l'étape concernée et on restaure l'état réel
    // sinon (pour "Mon compte" : la vraie valeur dépend de la connexion,
    // pas juste "toujours caché" comme le menu Plus).
    if (dom.moreMenu)   dom.moreMenu.hidden   = !step.revealMenu;
    if (dom.accountBtn) dom.accountBtn.hidden = step.targetId === 'accountBtn' ? false : !isLoggedIn();

    // Textes
    stepLabel.textContent = `Étape ${current + 1} / ${STEPS.length}`;
    titleEl.innerHTML     = step.title;
    descEl.innerHTML      = step.desc;

    // Barre de progression
    fill.style.width = ((current + 1) / STEPS.length * 100) + '%';

    // Dots
    dotsWrap.querySelectorAll('.guide-dot').forEach((d, i) =>
      d.classList.toggle('active', i === current)
    );

    // Boutons
    btnPrev.disabled = current === 0;
    btnNext.textContent = current === STEPS.length - 1 ? 'Terminer ✓' : 'Suivant →';

    // Spotlight
    positionSpot(step);
  }

  function open() {
    current = 0;
    buildDots();
    overlay.classList.add('active');
    goTo(0);
  }

  function close() {
    overlay.classList.remove('active');
    spot.className = 'guide-no-target';
    // Restaure l'état réel : le menu Plus est toujours refermé hors
    // guide, "Mon compte" ne redevient visible que si on est connecté.
    if (dom.moreMenu)   dom.moreMenu.hidden   = true;
    if (dom.accountBtn) dom.accountBtn.hidden = !isLoggedIn();
  }

  btnNext.addEventListener('click', () => {
    if (current >= STEPS.length - 1) close();
    else goTo(current + 1);
  });
  btnPrev.addEventListener('click', () => goTo(current - 1));
  btnClose.addEventListener('click', close);
  mask.addEventListener('click', close);

  // Recalcule position si la fenêtre est redimensionnée
  window.addEventListener('resize', () => {
    if (overlay.classList.contains('active')) goTo(current);
  });

  return { open, close };
})();

dom.openGuide.addEventListener('click', () => guide.open());

