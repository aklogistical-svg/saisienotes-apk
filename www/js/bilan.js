'use strict';

/* ============================================================
   BILAN — état de saisie
   ============================================================
   Répond à « qui a déjà des notes, qui n'en a pas » sur TOUT ce qui est
   chargé (pas juste la classe/matière actuellement affichée à l'écran).

   Convention reprise de l'app elle-même (voir input-factory.js, classe
   CSS "note-zero") : une note à 0 est traitée comme non saisie. Ce n'est
   pas une vérité absolue — un 0/20 réel est indiscernable d'une case
   jamais touchée — mais c'est déjà ce que le prof voit surligné en rose
   pendant la saisie, donc le bilan reste cohérent avec l'écran.

   Un devoir au-delà de Ndevoir (r.nbrenote) n'est pas "manquant" : il
   n'est simplement pas utilisé pour cette matière (voir validateAllNotes,
   ui-feedback.js, qui applique déjà cette même règle). Composition est
   toujours attendue, quel que soit Ndevoir.

   Un élève marqué "Exempté" (bloption) pour une matière à option n'est
   pas non plus compté incomplet : il n'est pas censé avoir de notes dans
   cette matière.
   ============================================================ */

function isFieldMissing(v) {
  const n = normalizeDecimal(v);
  return !validNoteValue(n) || Number(n) === 0;
}

function expectedFieldsFor(row) {
  const nbActive = Math.min(Math.max(Number(row.nbrenote) || 1, 1), CONFIG.noteFields.length);
  return [...CONFIG.noteFields.slice(0, nbActive), CONFIG.compoField];
}

// Un groupe par (classe, matière) — même logique que le PDF (dataset.js).
function computeBilan(rowNotes, rowMatieres) {
  return groupNotesByClasseMatiere(rowNotes, rowMatieres).map(g => {
    let expected = 0, filled = 0;
    const incomplets = [];
    let exemptes = 0;

    for (const r of g.rows) {
      if (r[CONFIG.optionField]) { exemptes++; continue; }

      const fields  = expectedFieldsFor(r);
      const missing = fields.filter(f => isFieldMissing(r[f]));
      expected += fields.length;
      filled   += fields.length - missing.length;

      if (missing.length) {
        incomplets.push({
          nom: r.nomel ?? '', prenom: r.prenomel ?? '', genre: r.genre ?? '',
          eleveId: r[CONFIG.idField],
          ndevoir: Number(r.nbrenote) || 1,
          manques: missing.map(f => ({ field: f, label: CONFIG.headerLabels?.[f] ?? f })),
        });
      }
    }

    const concernes = g.rows.length - exemptes;
    return {
      fkclasse: g.fkclasse, idmatiere: g.idmatiere,
      nomclasse: g.nomclasse, namemat: g.namemat,
      effectif: g.rows.length, exemptes, concernes,
      complets: concernes - incomplets.length,
      expected, filled,
      incomplets,
    };
  });
}

const BilanManager = (() => {
  let pageEl, contentEl;

  function ensureDom() {
    if (pageEl) return;
    pageEl = document.getElementById('bilanPage');
    contentEl = document.getElementById('bilanContent');
    pageEl.querySelector('.closeg').addEventListener('click', close);
    contentEl.addEventListener('click', onContentClick);
  }

  // Un clic sur un champ manquant ferme le Bilan et saute directement sur
  // la bonne cellule de saisie (même mécanisme que la correction d'erreur
  // de validation, voir highlightAndFocusCell dans ui-feedback.js) —
  // sinon le prof devait fermer le Bilan, retrouver la classe et la
  // matière à la main, puis chercher l'élève dans le tableau.
  function onContentClick(e) {
    const btn = e.target.closest('.bilan-champ-btn');
    if (!btn) return;
    const snapshot = {
      classe : btn.dataset.classe,
      matiere: btn.dataset.matiere,
      ndevoir: Number(btn.dataset.ndevoir) || 1,
      champ  : btn.dataset.champ,
      eleveId: btn.dataset.eleve,
    };
    close();
    // Laisse le modal se refermer avant de scroller/focaliser, sinon
    // l'animation de fermeture et le scroll se marchent dessus.
    setTimeout(() => highlightAndFocusCell(snapshot), 200);
  }

  function pct(filled, expected) {
    return expected ? Math.round((filled / expected) * 100) : 100;
  }

  function renderGroup(g) {
    const pourcentage = pct(g.filled, g.expected);
    const badgeClass  = pourcentage === 100 ? 'bilan-badge-ok' : pourcentage === 0 ? 'bilan-badge-empty' : 'bilan-badge-partial';

    const exempteTxt = g.exemptes ? ` · ${g.exemptes} exempté${g.exemptes > 1 ? 's' : ''}` : '';
    const summary = `
      <span class="bilan-titre">${escHtml(g.nomclasse)} — ${escHtml(g.namemat)}</span>
      <span class="bilan-summary-right">
        <span class="bilan-badge ${badgeClass}">${g.complets}/${g.concernes} élèves · ${pourcentage}%</span>
        <span class="bilan-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>
      </span>
    `;

    if (!g.incomplets.length) {
      return `
        <details class="bilan-group">
          <summary>${summary}</summary>
          <p class="bilan-ok-msg">✔ Toutes les notes attendues sont saisies${escHtml(exempteTxt)}.</p>
        </details>`;
    }

    const rows = g.incomplets.map(e => {
      const chips = e.manques.map(m => `
        <button type="button" class="bilan-champ-btn"
          data-classe="${escHtml(String(g.fkclasse))}" data-matiere="${escHtml(String(g.idmatiere))}"
          data-ndevoir="${escHtml(String(e.ndevoir))}" data-champ="${escHtml(m.field)}"
          data-eleve="${escHtml(String(e.eleveId))}">${escHtml(m.label)}</button>
      `).join('');
      return `
        <li>
          <span class="bilan-eleve">${escHtml(e.nom)} ${escHtml(e.prenom)}${e.genre ? ' | ' + escHtml(e.genre) : ''}</span>
          <span class="bilan-champs">${chips}</span>
        </li>`;
    }).join('');

    // Replié par défaut, même pour un groupe incomplet : seul l'en-tête
    // (classe, matière, badge) est visible tant qu'on n'a pas cliqué —
    // la liste d'élèves ne s'affiche qu'au clic, comme un select qu'on déplie.
    return `
      <details class="bilan-group">
        <summary>${summary}</summary>
        <p class="bilan-sub">Effectif : ${g.effectif}${escHtml(exempteTxt)} — touchez un champ pour y aller directement :</p>
        <ul class="bilan-list">${rows}</ul>
      </details>`;
  }

  function render() {
    const rowNotes    = state.get('rowNotes');
    const rowMatieres = state.get('rowMatieres');

    if (!Array.isArray(rowNotes) || !rowNotes.length) {
      contentEl.innerHTML = '<p class="empty-hint">Chargez un fichier de notes, ou connectez-vous au serveur, pour voir le bilan.</p>';
      return;
    }

    const groups = computeBilan(rowNotes, rowMatieres);
    const totalExpected = groups.reduce((s, g) => s + g.expected, 0);
    const totalFilled   = groups.reduce((s, g) => s + g.filled, 0);
    const totalPct      = pct(totalFilled, totalExpected);

    // Le plus incomplet en premier : c'est là qu'il faut regarder d'abord.
    // (Le PDF, lui, garde un tri alphabétique — prévisible pour l'archivage.)
    groups.sort((a, b) =>
      pct(a.filled, a.expected) - pct(b.filled, b.expected) ||
      a.nomclasse.localeCompare(b.nomclasse, 'fr') || a.namemat.localeCompare(b.namemat, 'fr')
    );

    const header = `
      <div class="bilan-total">
        <strong>${totalPct}%</strong> des notes attendues sont saisies,
        sur ${groups.length} classe${groups.length > 1 ? 's' : ''}/matière${groups.length > 1 ? 's' : ''} chargée${groups.length > 1 ? 's' : ''}.
      </div>`;

    contentEl.innerHTML = header + groups.map(renderGroup).join('');
  }

  function open() {
    ensureDom();
    render();
    pageEl.classList.add('show');
  }

  function close() {
    pageEl?.classList.remove('show');
  }

  return { open, close, render };
})();
