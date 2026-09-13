'use strict';

/* ============================================================
   UTILITAIRES UI
   ============================================================ */
/* ============================================================
   TOAST SYSTEM — simple (info/success/warn) + actionnable (error)
   ============================================================ */

/**
 * showToast(msg, type, ttl)
 * Pour les toasts simples : success | warn | (error simple sans actions)
 */
function showToast(msg, type = 'success', ttl = 3000) {
  const t = document.createElement('div');
  t.className   = `toast ${type}`;
  t.textContent = msg;
  dom.toastWrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ttl);
}

/**
 * showErrorToast({ title, detail, actions })
 * actions : [{ label, style:'primary'|'secondary'|'fix', onClick }]
 * Persistant — fermé par l'utilisateur ou via action.
 */
function showErrorToast({ title, detail = '', actions = [] }) {
  // Ne pas empiler un toast d'erreur identique déjà visible (même titre)
  const already = [...dom.toastWrap.querySelectorAll('.toast.error .toast-err-title')]
    .some(el => el.textContent === title);
  if (already) return null;

  return showActionToast({ variant: 'error', icon: '🔴', title, detail, actions });
}

/**
 * Toast persistant générique avec actions, variante error ou success.
 */
function showActionToast({ variant = 'error', icon = '🔴', title, detail = '', actions = [] }) {
  const t = document.createElement('div');
  t.className = `toast ${variant}${actions.length ? ' actionable' : ''}`;

  // Construire le HTML interne
  const actionsHTML = actions.map((a, i) =>
    `<button class="toast-action-btn tab-${a.style ?? 'primary'}" data-idx="${i}">${a.label}</button>`
  ).join('');

  t.innerHTML = `
    <div class="toast-err-top">
      <span class="toast-err-icon">${icon}</span>
      <div class="toast-err-body">
        <div class="toast-err-title">${title}</div>
        ${detail ? `<div class="toast-err-detail">${detail}</div>` : ''}
      </div>
      <button class="toast-err-close" title="Fermer">✕</button>
    </div>
    ${actions.length ? `<div class="toast-err-sep"></div><div class="toast-err-actions">${actionsHTML}</div>` : ''}
  `;

  dom.toastWrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));

  const dismiss = () => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  };

  // Fermer
  t.querySelector('.toast-err-close').addEventListener('click', dismiss);

  // Actions
  actions.forEach((a, i) => {
    t.querySelector(`[data-idx="${i}"]`)?.addEventListener('click', () => {
      dismiss();
      a.onClick?.();
    });
  });

  return { dismiss };
}

/* ── Highlight d'une cellule fautive avec restauration de contexte ── */
async function highlightAndFocusCell(snapshot) {
  // 1. Si nécessaire, restaurer classe / matière / Ndevoir
  const needsRestore =
    dom.fClasseSel.value  !== snapshot.classe  ||
    dom.fMatiereSel.value !== snapshot.matiere ||
    dom.nbNotesSel.value  !== String(snapshot.ndevoir);

  if (needsRestore) {
    // Changer la classe
    if (dom.fClasseSel.value !== snapshot.classe) {
      dom.fClasseSel.value = snapshot.classe;
      dom.fClasseSel.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 80)); // laisser populateMatieres()
    }
    // Changer la matière
    if (dom.fMatiereSel.value !== snapshot.matiere) {
      dom.fMatiereSel.value = snapshot.matiere;
      dom.fMatiereSel.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 60));
    }
    // Changer Ndevoir
    if (dom.nbNotesSel.value !== String(snapshot.ndevoir)) {
      dom.nbNotesSel.value = String(snapshot.ndevoir);
      dom.nbNotesSel.dispatchEvent(new Event('change'));
      await new Promise(r => requestAnimationFrame(r));
    }
    // Attendre le re-render du tableau
    await new Promise(r => setTimeout(r, 120));
  }

  // 2. Trouver la cellule : l'input porte directement data-field ET data-id
  //    (voir InputFactory.noteInput) — on cherche dans le tableau ET les cartes,
  //    peu importe la vue actuellement active.
  const allInputs = [...document.querySelectorAll(
    `#tbodytab input[data-field="${snapshot.champ}"], #cardstab input[data-field="${snapshot.champ}"]`
  )];
  const input = allInputs.find(inp => inp.dataset.id === String(snapshot.eleveId)) || allInputs[0];

  if (!input) return;

  // 3. Scroll + focus + highlight
  input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise(r => setTimeout(r, 180));
  input.classList.add('cell-fix-highlight');
  input.focus();

  // 4. Retirer l'anneau dès que l'utilisateur corrige
  const cleanup = () => {
    input.classList.remove('cell-fix-highlight');
    input.removeEventListener('input',  cleanup);
    input.removeEventListener('change', cleanup);
    input.removeEventListener('blur',   cleanup);
    showToast('Correction en cours…', 'warn', 2000);
  };
  input.addEventListener('input',  cleanup, { once: true });
  input.addEventListener('change', cleanup, { once: true });
}

function confirmBox(title, message) {
  return new Promise(resolve => {
    dom.confirmTitle.textContent   = title;
    dom.confirmMessage.textContent = message;
    dom.confirmModal.hidden        = false;
    dom.btnOk.focus();

    // ✅ #13 — addEventListener + cleanup pour éviter les fuites
    const clean = result => {
      dom.confirmModal.hidden = true;
      dom.btnOk.removeEventListener('click', onOk);
      dom.btnCancel.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk     = () => clean(true);
    const onCancel = () => clean(false);
    dom.btnOk.addEventListener('click',     onOk);
    dom.btnCancel.addEventListener('click', onCancel);
  });
}

function showOverlay(text = 'Enregistrement en cours…') {
  dom.overlayWrap.hidden = false;
  dom.overlayWrap.querySelector('span').textContent = text;
}
function hideOverlay() { dom.overlayWrap.hidden = true; }

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
}

/* ── Échappement HTML pour les valeurs provenant du JSON ── */
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function normalizeDecimal(s) {
  return String(s ?? '').trim().replace(',', '.');
}

function validNoteValue(v) {
  if (v === '' || v === null || v === undefined) return false;
  const n = Number(normalizeDecimal(v));
  return !isNaN(n) && n >= 0 && n <= 20;
}

// ✅ #15 — cas limites couverts : '', '.', '0.', '00.5'
function lastNormalizeDecimal(raw) {
  if (!raw || raw.trim() === '' || raw.trim() === '.') return '0';
  let v = raw.trim().replace(',', '.').replace(/[^0-9.]/g, '');
  if (v === '.' || v === '') return '0';
  if (v.startsWith('.')) v = '0' + v;
  const dotIdx  = v.indexOf('.');
  const intRaw  = dotIdx === -1 ? v : v.slice(0, dotIdx);
  const decRaw  = dotIdx === -1 ? '' : v.slice(dotIdx + 1, dotIdx + 3);
  const intPart = intRaw.replace(/^0+(?=\d)/, '') || '0';
  if (!decRaw || /^0+$/.test(decRaw)) return intPart;
  return intPart + '.' + decRaw;
}

// ✅ #5 — n'itère que sur les devoirs actifs (nbrenote)
function validateAllNotes() {
  const rowNotes    = state.get('rowNotes');
  const rowMatieres = state.get('rowMatieres');

  // Contexte actif au moment de la validation (pour snapshot)
  const activeClasse  = dom.fClasseSel.value;
  const activeMatiere = dom.fMatiereSel.value;
  const activeNdevoir = dom.nbNotesSel.value;

  // Vérification cohérence référentielle : matières orphelines
  const matiereIds = new Set(rowMatieres.map(m => String(m.idmatiere)));
  for (const r of rowNotes) {
    if (r.idmatiere && !matiereIds.has(String(r.idmatiere))) {
      logger.warn(`validateAllNotes : idmatiere "${r.idmatiere}" introuvable dans rowMatieres`);
    }
  }

  for (const r of rowNotes) {
    const matRow   = rowMatieres.find(m => m.idmatiere === r.idmatiere);
    const matName  = matRow?.namemat ?? '?';
    const matId    = r.idmatiere;
    const nbActive = Number(r.nbrenote) || 1;

    // Helper snapshot : retrouve la classe de cette ligne
    const classeRow = r.fkclasse ?? activeClasse;

    for (let j = 0; j < nbActive; j++) {
      const f = CONFIG.noteFields[j];
      if (!validNoteValue(r[f])) {
        const snap = {
          classe  : classeRow,
          matiere : matId,
          ndevoir : nbActive,
          eleveId : r[CONFIG.idField],
          champ   : f,
          valeur  : r[f],
        };
        showErrorToast({
          title  : `Note invalide — ${escHtml(r.prenomel)} ${escHtml(r.nomel)}`,
          detail : `Matière : <strong>${escHtml(matName)}</strong> · Champ : <strong>${escHtml(CONFIG.headerLabels[f] ?? f)}</strong><br>Valeur saisie : <em>${escHtml(r[f] ?? '(vide)')}</em> — attendu : 0 à 20`,
          actions: [
            {
              label  : '🎯 Corriger',
              style  : 'fix',
              onClick: () => highlightAndFocusCell(snap),
            },
          ],
        });
        return false;
      }
    }

    // Vérifier qu'un devoir inactif ne contient pas de note saisie par erreur
    for (let j = nbActive; j < CONFIG.noteFields.length; j++) {
      const f = CONFIG.noteFields[j];
      if (Number(r[f]) > 0) {
        const snap = {
          classe  : r.fkclasse ?? activeClasse,
          matiere : matId,
          ndevoir : nbActive,
          eleveId : r[CONFIG.idField],
          champ   : f,
          valeur  : r[f],
        };
        showErrorToast({
          title  : `Note hors Ndevoir — ${escHtml(r.prenomel)} ${escHtml(r.nomel)}`,
          detail : `Matière : <strong>${escHtml(matName)}</strong> · <strong>${escHtml(CONFIG.headerLabels[f] ?? f)}</strong> contient une valeur alors que Ndevoir = ${nbActive}`,
          actions: [
            {
              label  : '🎯 Corriger',
              style  : 'fix',
              onClick: () => highlightAndFocusCell(snap),
            },
          ],
        });
        return false;
      }
    }

    if (!validNoteValue(r[CONFIG.compoField])) {
      const snap = {
        classe  : r.fkclasse ?? activeClasse,
        matiere : matId,
        ndevoir : nbActive,
        eleveId : r[CONFIG.idField],
        champ   : CONFIG.compoField,
        valeur  : r[CONFIG.compoField],
      };
      showErrorToast({
        title  : `Composition invalide — ${escHtml(r.prenomel)} ${escHtml(r.nomel)}`,
        detail : `Matière : <strong>${escHtml(matName)}</strong><br>Valeur saisie : <em>${escHtml(r[CONFIG.compoField] ?? '(vide)')}</em> — attendu : 0 à 20`,
        actions: [
          {
            label  : '🎯 Corriger',
            style  : 'fix',
            onClick: () => highlightAndFocusCell(snap),
          },
        ],
      });
      return false;
    }
  }
  return true;
}

