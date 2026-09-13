'use strict';

/* ============================================================
   FACTORY INPUTS — regroupement des créateurs d'inputs      ✅ #8
   ============================================================ */
const InputFactory = {

  noteInput(row, fieldName, rowIdx = 0) {
    const input = Object.assign(document.createElement('input'), {
      type        : 'text',
      inputMode   : 'decimal',
      pattern     : '[0-9]+([,.][0-9]+)?',
      value       : formatForDisplay(getCellVal(row, fieldName)),
      autocomplete: 'off',
    });
    input.dataset.field = fieldName;
    input.dataset.id    = String(row[CONFIG.idField] ?? '');

    const paint = val => {
      const n = normalizeDecimal(val);
      input.className = !validNoteValue(n) ? 'note-invalid' : Number(n) === 0 ? 'note-zero' : '';
    };

    // Toujours attaché (mobile ET desktop) : c'est ce qui repeint la cellule
    // après une saisie. Sur mobile, numpad.commit() dispatche ce même 'change'
    // après avoir mis à jour input.value — sans cet écouteur, la couleur de
    // fond restait figée sur l'état initial et ne réagissait plus du tout
    // aux saisies faites via le pavé numérique.
    input.addEventListener('change', () => {
      input.value = lastNormalizeDecimal(input.value);
      setCellVal(row, fieldName, input.value);
      paint(input.value);
    });

    if (InteractionMode.isMobile) {
      numpad.bindInput(input, row, rowIdx, fieldName);
    } else {
      input.addEventListener('input',  () => { input.value = input.value.replace(/[^0-9.,]/g, ''); });
      input.addEventListener('focus',   () => input.select());
      input.addEventListener('keydown', e  => navigateInput(input, e));
    }

    paint(input.value);
    return input;
  },

  checkbox(row, fieldName) {
    const cb    = Object.assign(document.createElement('input'), { type: 'checkbox' });
    cb.checked  = Number(getCellVal(row, fieldName)) !== 0;
    cb.addEventListener('change', () => setCellVal(row, fieldName, cb.checked ? 1 : 0));
    return cb;
  },
};

/* ============================================================
   NAVIGATION CLAVIER
   ============================================================ */
function navigateInput(input, e) {
  const { key } = e;
  const start   = input.selectionStart;
  const end     = input.selectionEnd;
  const len     = input.value.length;
  if (key === 'ArrowLeft')  { if (start > 0) return; e.preventDefault(); focusCellule(input, 0, -1); }
  if (key === 'ArrowRight') { if (end < len) return; e.preventDefault(); focusCellule(input, 0,  1); }
  if (key === 'ArrowUp')    { e.preventDefault(); focusCellule(input, -1, 0); }
  if (key === 'ArrowDown')  { e.preventDefault(); focusCellule(input,  1, 0); }
}

function focusCellule(currentInput, rowOffset, colOffset) {
  const td     = currentInput.closest('td');
  const tr     = td?.parentElement;
  if (!tr) return;
  const tbody  = tr.parentElement;
  const ri     = [...tbody.children].indexOf(tr);
  const ci     = [...tr.children].indexOf(td);
  const target = tbody.children[ri + rowOffset]?.children[ci + colOffset]?.querySelector('input');
  if (target) target.focus();
}

/* ============================================================
   HELPERS AFFICHAGE
   ============================================================ */
function formatForDisplay(v) {
  return (v === null || v === undefined) ? '' : String(v).replace('.', ',');
}

