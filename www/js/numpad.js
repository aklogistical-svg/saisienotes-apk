'use strict';

/* ============================================================
   PAVÉ NUMÉRIQUE MOBILE
   ============================================================ */
const numpad = (() => {
  // ── Activer VirtualKeyboard overlay si disponible ──
  if ('virtualKeyboard' in navigator) {
    navigator.virtualKeyboard.overlaysContent = true;
  }

  const sheet    = document.getElementById('numpadSheet');
  const backdrop = document.getElementById('numpadBackdrop');
  const elName   = document.getElementById('npEleveName');
  const elPos    = document.getElementById('npElevePos');
  const fLabel   = document.getElementById('npFieldLabel');
  const fValue   = document.getElementById('npFieldValue');
  const commaKey = document.getElementById('npCommaKey');
  const delKey   = document.getElementById('npDelKey');
  const btnPrevE = document.getElementById('npPrevEleve');
  const btnNextE = document.getElementById('npNextEleve');
  const btnPrevF = document.getElementById('npPrevField');
  const btnNextF = document.getElementById('npNextField');
  const compactToggle = document.getElementById('npCompactToggle');

  let curValue   = '';   // valeur en cours de saisie (string)
  let curRow     = null; // objet rowNotes courant
  let curRowIdx  = 0;    // index dans filtered[]
  let curField   = '';   // nom du champ (devoir11, componote…)
  let curFields  = [];   // colonnes actives pour cette ligne

  // ✅ #24 — mode compact : masque nom/prénom + libellé, met en évidence
  // la cellule éditée directement dans le tableau à la place. Préférence mémorisée.
  let compact = (() => { try { return localStorage.getItem('np_compact') === '1'; } catch (_) { return false; } })();
  if (compact) sheet.classList.add('compact');

  function setCompact(next) {
    compact = next;
    sheet.classList.toggle('compact', compact);
    try { localStorage.setItem('np_compact', compact ? '1' : '0'); } catch (_) {}
    if (compact) highlightCurrentCell(); else clearCellHighlight();
  }
  compactToggle.addEventListener('click', () => setCompact(!compact));

  // ── Trouve et surligne la cellule du tableau correspondant à curRow/curField ──
  function clearCellHighlight() {
    document.querySelectorAll('.cell-fix-highlight').forEach(el => el.classList.remove('cell-fix-highlight'));
  }
  function highlightCurrentCell() {
    clearCellHighlight();
    if (!curRow) return;
    // Cherche dans les deux vues possibles (tableau desktop / cartes mobile) :
    // l'input porte data-id directement (voir InputFactory.noteInput)
    const input = document.querySelector(
      `input[data-field="${curField}"][data-id="${curRow[CONFIG.idField]}"]`
    );
    if (!input) return;
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.classList.add('cell-fix-highlight');
  }

  // ── Calcule les colonnes de saisie actives ──
  function getActiveFields() {
    const nb = Number(dom.nbNotesSel?.value) || state.get('nbNotes') || 1;
    const f  = [];
    for (let i = 0; i < nb; i++) f.push(CONFIG.noteFields[i]);
    f.push(CONFIG.compoField);
    return f;
  }

  // ── Rafraîchit l'affichage du pavé ──
  function refresh() {
    const filtered = state.get('filtered');
    curRow = filtered[curRowIdx] ?? null;
    if (!curRow) return;

    // Contexte élève
    elName.textContent = `${curRow[CONFIG.nomField] ?? ''} ${curRow[CONFIG.prenomField] ?? ''}`.trim();
    elPos.textContent  = `${curRowIdx + 1} / ${filtered.length}`;

    // Champ
    fLabel.textContent = CONFIG.headerLabels[curField] ?? curField;
    updateDisplay();

    // Nav élèves
    btnPrevE.disabled = curRowIdx === 0;
    btnNextE.disabled = curRowIdx === filtered.length - 1;

    // Nav champs
    const fi = curFields.indexOf(curField);
    btnPrevF.disabled = curRowIdx === 0 && fi === 0;
    btnNextF.disabled = curRowIdx === filtered.length - 1 && fi === curFields.length - 1;

    // Virgule : désactivée si valeur déjà présente ou partie entière > 20
    const hasComma = curValue.includes(',');
    const intPart  = curValue.split(',')[0] || '0';
    commaKey.disabled = hasComma || Number(intPart) > 20;

    // La cellule en cours de saisie reste toujours visible/mise en évidence
    // dans le tableau/carte derrière le pavé (pas seulement en mode compact)
    highlightCurrentCell();
  }

  function updateDisplay() {
    fValue.textContent = curValue === '' ? '—' : curValue;
    const n = Number(curValue.replace(',', '.'));
    fValue.className = 'np-field-value ' +
      (curValue === '' ? '' : !validNoteValue(curValue.replace(',', '.')) ? 'invalid' : n === 0 ? 'zero' : 'ok');
  }

  // ── Applique setCellVal immédiatement ──
  function commit() {
    if (!curRow || curField === '') return;
    const normalized = curValue === '' ? '' : lastNormalizeDecimal(curValue.replace(',', '.'));
    setCellVal(curRow, curField, normalized === '' ? '' : normalized);
    // Sync l'input DOM correspondant si visible
    const inp = document.querySelector(
      `input[data-field="${curField}"][data-id="${curRow[CONFIG.idField]}"]`
    );
    if (inp) {
      inp.value = normalized === '' ? '' : String(normalized).replace('.', ',');
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // ── Frappe d'une touche ──
  function press(v) {
    if (v === 'DEL') {
      curValue = curValue.slice(0, -1);
      commit();
      refresh();
      return;
    }
    // Comma
    if (v === ',') {
      if (curValue.includes(',')) return;
      const intPart = curValue || '0';
      // Autorise la virgule si partie entière = 20 (pour saisir 20,0)
      // Bloque seulement si partie entière > 20 (impossible normalement)
      if (Number(intPart) > 20) return;
      curValue = (curValue || '0') + ',';
      commit(); refresh(); return;
    }
    // Chiffre
    const [intPart = '', decPart] = curValue.split(',');
    if (decPart !== undefined) {
      // Après la virgule : max 2 chiffres
      if (decPart.length >= 2) return;
      const next = curValue + v;
      if (Number(next.replace(',', '.')) > 20) { CapPlugins?.Haptics?.impact({ style: CapPlugins.ImpactStyle.Light }).catch(()=>{}); return; }
      curValue = next;
    } else {
      // Avant la virgule : max 2 chiffres
      // ✅ #23 — un simple "0" pré-rempli (valeur existante = 0, ou fraîchement ouvert)
      // doit être REMPLACÉ par le premier chiffre tapé, pas concaténé ("0"+"1" → "01" bloquait ensuite)
      if (intPart === '0') {
        curValue = v;
        commit();
        refresh();
        return;
      }
      if (intPart.length >= 2) return;
      const candidate = intPart + v;
      if (Number(candidate) > 20) { CapPlugins?.Haptics?.impact({ style: CapPlugins.ImpactStyle.Light }).catch(()=>{}); return; }
      curValue = candidate;
    }
    commit();
    refresh();
  }

  // ── Navigation champs ──
  function goField(direction) {
    const fi = curFields.indexOf(curField);
    const nextFi = fi + direction;
    if (nextFi >= 0 && nextFi < curFields.length) {
      curField  = curFields[nextFi];
      curValue  = String(curRow?.[curField] ?? '').replace('.', ',');
      refresh();
      return;
    }
    // Débordement → changer d'élève
    goEleve(direction);
  }

  // ── Navigation élèves ──
  function goEleve(direction) {
    const filtered = state.get('filtered');
    const next = curRowIdx + direction;
    if (next < 0 || next >= filtered.length) {
      if (direction > 0) close(); // fin de liste → ferme
      return;
    }
    curRowIdx = next;
    curField  = direction > 0 ? curFields[0] : curFields[curFields.length - 1];
    curValue  = String(state.get('filtered')[curRowIdx]?.[curField] ?? '').replace('.', ',');
    refresh();
  }

  // ── Swipe down pour fermer ──
  let touchStartY = 0;
  sheet.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchend',   e => {
    if (e.changedTouches[0].clientY - touchStartY > 60) close();
  }, { passive: true });

  // ── Appui long sur ⌫ → efface tout ──
  let delTimer;
  delKey.addEventListener('touchstart', () => {
    delTimer = setTimeout(() => { curValue = ''; commit(); refresh(); }, 500);
  }, { passive: true });
  delKey.addEventListener('touchend', () => clearTimeout(delTimer), { passive: true });

  // ── Touches du pavé ──
  document.getElementById('npGrid').addEventListener('click', e => {
    const key = e.target.closest('.np-key');
    if (!key || key.disabled) return;
    key.classList.add('pressed');
    setTimeout(() => key.classList.remove('pressed'), 120);
    press(key.dataset.v);
  });

  // ── Cycle de champs via tap sur le label ──
  fLabel.addEventListener('click', () => goField(1));

  // ── Nav champs bas ──
  btnPrevF.addEventListener('click', () => goField(-1));
  btnNextF.addEventListener('click', () => goField(1));

  // ── Nav élèves ──
  btnPrevE.addEventListener('click', () => goEleve(-1));
  btnNextE.addEventListener('click', () => goEleve(1));

  // ── Fermer via backdrop ──
  backdrop.addEventListener('click', close);

  function open(row, rowIdx, field) {
    curRow    = row;
    curRowIdx = rowIdx;
    curFields = getActiveFields();
    curField  = field ?? curFields[0];
    curValue  = String(row?.[curField] ?? '').replace('.', ',');
    sheet.classList.add('open');
    backdrop.classList.add('open');
    refresh();
  }

  function close() {
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    // Focus perdu → retirer highlight si présent
    clearCellHighlight();
  }

  // ── Branche un input mobile ──
  function bindInput(input, row, rowIdx, field) {
    input.readOnly     = true;
    input.inputMode    = 'none';
    input.tabIndex     = -1;          // empêche focus natif
    input.style.cursor = 'pointer';
    // touchstart = réponse immédiate sans délai 300ms
    input.addEventListener('touchstart', e => {
      e.preventDefault();             // bloque focus natif + clavier OS
      open(row, rowIdx, field);
    }, { passive: false });
    // fallback souris (test desktop simulé)
    input.addEventListener('mousedown', e => {
      e.preventDefault();
      open(row, rowIdx, field);
    });
  }
  
  return { open, close, bindInput };
})();

