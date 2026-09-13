'use strict';

/* ============================================================
   DONNÉES EN MÉMOIRE                                        ✅ #20
   ============================================================ */
function getCellVal(row, field) { return row[field] ?? ''; }

function setCellVal(row, field, val) {
  row[field]  = val; row.__dirty = true;
  markUnsaved(); draftManager.schedule();
}

// ✅ #20 — effet de bord UI isolé
function markUnsaved() {
  state.set('unsaved', true);
  dom.msgState.textContent = '🔷Modifié';
}

/* ============================================================
   CHARGEMENT JSON — découpé en sous-fonctions               ✅ #6
   ============================================================ */
let currentMeta = {};

// ✅ #6a — parsing + validation structurelle uniquement
function parseAndValidateJSON(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { showToast('JSON invalide ou corrompu', 'error'); return null; }

  const { notes_mpr, matieres_mpr, infos_mpr } = parsed;
  if (!Array.isArray(notes_mpr) || !Array.isArray(matieres_mpr)) {
    showToast('Structure JSON invalide (notes / matieres attendus)', 'error', 4000);
    return null;
  }
  return { notes_mpr, matieres_mpr, infos_mpr };
}

// ✅ #6b — validation des clés métier
function validateJSONKeys(notes) {
  if (!notes.length) return true;
  const keys    = Object.keys(notes[0]).map(k => k.trim().toLowerCase());
  const missing = CONFIG.requiredKeys.filter(k => !keys.includes(k));
  if (missing.length) {
    showToast('Clés manquantes : ' + missing.join(', '), 'error', 4000);
    return false;
  }
  return true;
}

// ✅ #6b — normalisation des clés en minuscules
function normalizeRows(rows) {
  return rows.map(r =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v]))
  );
}

// ✅ #6c — affichage signature dans le DOM
function displaySignature(meta) {
  dom.txtPeriode.textContent = `${meta.datasequ ?? ''} | ${meta.forprof ?? ''}`;
  dom.txtSource.textContent  = `${meta.source   ?? ''} | ${meta.generatedAt ?? ''}`;
}

// ✅ #6c — application des données dans state + UI
function applyDataset(parsedNotes, parsedMatieres, meta) {
  currentMeta = {...currentMeta, ...meta};
  displaySignature(currentMeta);
  state.set('currentSourceId', currentMeta?.datasequ || 'id_json');
  state.set('rowNotes',        parsedNotes);
  state.set('rowMatieres',     parsedMatieres);
  state.set('headers',         Object.keys(parsedNotes[0] ?? {}));
  state.set('unsaved',         false);
  state.set('filtered',        []);

  fillFilters();
}

async function loadJSONDataset(file, hasWriteAccess = false) {
  try {
    if (!file) { showToast('Aucun fichier fourni', 'error'); return; }
    const nameLooksJson = !!file.name?.toLowerCase().endsWith('.json');
    // application/octet-stream est délibérément autorisé au niveau du sélecteur
    // (voir FileManager.open) pour laisser passer les .json mal typés par
    // Android 9 et antérieur — on doit donc aussi l'accepter ici, sinon le
    // fichier franchit le filtre système pour se faire rejeter juste après.
    const mimeLooksJson = ['application/json', 'text/json', 'application/octet-stream'].includes(file.mimeType);
    if (!nameLooksJson && !mimeLooksJson) { showToast('Fichier JSON requis', 'error'); return; }

    const text   = await file.text();
    const parsed = parseAndValidateJSON(text);              // ✅ #6a
    if (!parsed) return;

    const { notes_mpr, matieres_mpr, infos_mpr } = parsed;
    if (!validateJSONKeys(notes_mpr)) { state.set('rowNotes', []); state.set('rowMatieres', []); return; }

    const parsedNotes    = normalizeRows(notes_mpr);            // ✅ #6b
    const parsedMatieres = normalizeRows(matieres_mpr);

    applyDataset(parsedNotes, parsedMatieres, infos_mpr);    // ✅ #6c

    // Tentative de restauration du brouillon
    // hasWriteAccess est passé explicitement — on ne consulte plus canWrite() ici
    const draft = await draftManager.tryRestore(restored => {
      if (!hasWriteAccess) {
        showToast('Notes non enregistrées retrouvées, veuillez recharger le fichier d\'origine.', 'warn', 6000);
        dom.msgState.textContent = '🔷Notes non enregistrées, recharger le même fichier';
      } else {
        dom.msgState.textContent = '🔷Brouillon restauré.';
        attachDeleteDraftBtn('Voulez-vous effacer le brouillon de notes ? Confirmer');
        showToast('Notes non enregistrées, restaurées. Supprimez si nécessaire', 'warn');
      }
    });

    if (!draft) {
      dom.msgState.textContent = '✔ Données chargées';
      showToast('Données chargées', 'success');
    }
    return true; // ✅ #25 — signale un chargement réussi (fichier valide)
  } catch (err) {
    logger.error('loadJSONDataset', err);
    showToast(err.message || 'Erreur chargement JSON', 'error');
    return false;
  }
}

/* ============================================================
   FILTRES
   ============================================================ */
function fillFilters() {
  const classesMap  = new Map();
  const rowMatieres = state.get('rowMatieres');
  rowMatieres.forEach(r => {
    if (r.fkclasse && !classesMap.has(r.fkclasse))
      classesMap.set(r.fkclasse, r.nomclasse || r.fkclasse);
  });
  dom.fClasseSel.innerHTML = '<option value="" disabled selected>— Choisir —</option>';
  classesMap.forEach((nom, id) => {
    const opt = Object.assign(document.createElement('option'), { value: id, textContent: nom });
    dom.fClasseSel.appendChild(opt);
  });
  populateMatieres();
}

function populateMatieres(selectedClasse = '') {
  if (!selectedClasse) {
    dom.fMatiereSel.innerHTML = '<option value="" disabled selected>— Choisir —</option>';
    state.set('isOptionMat', false);
    return;
  }
  const list = state.get('rowMatieres')
    .filter(r => String(r.fkclasse) === String(selectedClasse))
    .map(r   => ({ id: r.idmatiere, name: r.namemat, opt: r.affichopt }))
    .filter(m => m.id);

  // Construction DOM sécurisée (pas d'innerHTML avec données JSON)
  dom.fMatiereSel.innerHTML = '';
  const placeholder = Object.assign(document.createElement('option'), {
    value: '', disabled: true, selected: true, textContent: '— Choisir —'
  });
  dom.fMatiereSel.appendChild(placeholder);
  list.forEach(m => {
    const opt = Object.assign(document.createElement('option'), {
      value: m.id,
      textContent: m.name,
    });
    opt.dataset.option = m.opt ?? '0';
    dom.fMatiereSel.appendChild(opt);
  });

  dom.fMatiereSel.value = '';
  state.set('isOptionMat', false);
  state.set('filtered', []);
}

function applyFilters() {
  const matSel = dom.fMatiereSel.value;
  const clsSel = dom.fClasseSel.value;
  if (!matSel) {
    state.set('filtered', []);
    dom.effectif.textContent = 'Effectif : 0';
    render();
    return;
  }
  const filtered = state.get('rowNotes').filter(r =>
    String(r.idmatiere ?? '') === String(matSel) &&
    (!clsSel || String(r.fkclasse ?? '') === String(clsSel))
  );
  state.set('filtered', filtered);
  dom.effectif.textContent = `Effectif : ${filtered.length}`;
  render();
}

// ✅ #9 — mise à jour nbNotes séparée de l'appel applyFilters
function updateNbNotes(newVal) {
  state.set('nbNotes', newVal);
  state.get('filtered').forEach(r => { r.nbrenote = newVal; });
}

function majNbreNotes() {
  if (!dom.fMatiereSel.value || !dom.fClasseSel.value) {
    showToast('Classe et Matière requises', 'warn');
    dom.nbNotesSel.value = state.get('nbNotes');
    return;
  }
  updateNbNotes(Number(dom.nbNotesSel.value) || 1);       // ✅ #9
  applyFilters();
}

