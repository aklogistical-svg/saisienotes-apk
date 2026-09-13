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
  };
  // Construit un titre de bulle avec la même icône que le bouton référencé
  const t = (ico, label) => ico ? `<span class="guide-ico">${ico}</span>${label}` : label;

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
      desc     : 'Connectez-vous au <strong>serveur central</strong> pour charger ou envoyer les données en ligne.<br><br>Le voyant rouge 🔴 indique que vous êtes hors connexion ; vert 🟢 = connecté.',
    },
    {
      targetId : 'toggleView',
      title    : t(ICO.view, "Changer l'affichage"),
      desc     : 'Basculez entre la <strong>vue tableau</strong> (desktop) et la <strong>vue cartes</strong> (mobile) selon votre préférence.<br><br>Sur mobile, la vue cartes est activée automatiquement.',
    },
    {
      targetId : 'expDownload',
      title    : t(ICO.download, 'Télécharger'),
      desc     : 'Copie le fichier <strong>CSV</strong> directement dans le dossier <strong>Téléchargements</strong> de l\'appareil, sans passer par le partage.<br><br>Pratique pour retrouver le fichier plus tard dans vos téléchargements.',
    },
    {
      targetId : null,
      title    : '🔷 Saisie des notes',
      desc     : `Avant de saisir les notes, configurez les trois sélecteurs de la barre d'outils :<br><br>
<strong>📌 Classe</strong> — Sélectionnez la classe concernée.<br>
<strong>📌 Matière</strong> — Choisissez la matière à noter.<br>
<strong>📌 Ndevoir</strong> — Nombre de devoirs à afficher : <strong>1, 2 ou 3</strong> (défaut : 1).<br><br>
<strong>Types et limites de notes autorisés :</strong><br>
• <strong>Devoirs (1 à 3)</strong> : note sur <strong>20</strong> — valeurs décimales acceptées (ex. 13.5)<br>
• <strong>Composition</strong> : note sur <strong>20</strong> — même règle<br>
• Valeur <strong>0</strong> autorisée (cellule surlignée en rouge pâle)<br>
• Valeur <strong>vide</strong> = note non encore saisie<br>
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

