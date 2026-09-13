'use strict';

/* ============================================================
   UI DIVERS
   ============================================================ */
function attachDeleteDraftBtn(text) {
  const btn = Object.assign(document.createElement('button'), { textContent: '❌' });
  dom.msgState.appendChild(btn);
  btn.onclick = async () => {
    if (!await confirmBox('Attention', text)) return;
    await draftManager.deleteCurrent();
    dom.msgState.textContent = 'Continuer ou charger un fichier';
    state.set('unsaved', false);
  };
}

/* ============================================================
   WIRING ÉVÉNEMENTS
   ============================================================ */
dom.openBtn.addEventListener('click', async () => {
  if (state.get('unsaved') && !confirm('Données non sauvegardées. Continuer ?')) return;
  if (state.get('user_id')) {
    main.sync.chargedt().catch(e => showToast('Erreur chargement serveur', 'error'));
    return;
  } else {
    await fileManager.open();
  }
});

// Empêche le double-clic pendant une opération async (évite double validation/
// double sauvegarde et les toasts d'erreur dupliqués qui en résultent).
function guardBusyClick(btn, fn) {
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('is-busy');
    try { await fn(); }
    finally {
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  });
}

guardBusyClick(dom.saveBtn,      async () => { await draftManager.flushNow(); await fileManager.save(); });
guardBusyClick(dom.exportBtn,    ()      => exportManager.export());
guardBusyClick(dom.expDownload,  ()      => exportManager.downloadToDownloads());

dom.fClasseSel.addEventListener('change', ()  => populateMatieres(dom.fClasseSel.value));
dom.fMatiereSel.addEventListener('change', e  => {
  state.set('isOptionMat', (e.target.selectedOptions[0]?.dataset.option ?? '0') !== '0');
  majNbreNotes();
});
dom.nbNotesSel.addEventListener('change', () => majNbreNotes());

// Icônes pour le toggle table/cartes : chacune symbolise la vue VERS LAQUELLE le clic bascule
const VIEW_TOGGLE_ICONS = {
  // icône "cartes" (affichée quand on est en vue tableau → clic passe en cartes)
  card : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>',
  // icône "tableau" (affichée quand on est en vue cartes → clic revient au tableau)
  table: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17"/><path d="M9 9.5V19.5"/></svg>',
};

// Met à jour l'icône/texte/aria-label du bouton selon la vue courante
function updateViewToggleIcon(current) {
  const target = current === 'table' ? 'card' : 'table';
  dom.toggleBtn.querySelector('.ico').innerHTML = VIEW_TOGGLE_ICONS[target];
  dom.toggleBtn.querySelector('.txt').textContent = target === 'card' ? 'Cartes' : 'Tableau';
  const label = target === 'card' ? 'Passer en vue cartes' : 'Passer en vue tableau';
  dom.toggleBtn.setAttribute('aria-label', label);
  dom.toggleBtn.setAttribute('title', label);
}

dom.toggleBtn.addEventListener('click', () => {
  const next = state.get('currentView') === 'table' ? 'card' : 'table';
  state.set('currentView', next);
  dom.tableWrap.style.display = next === 'card' ? 'none' : 'block';
  dom.cardstab.style.display  = next === 'card' ? 'flex'  : 'none';

  updateViewToggleIcon(next);
  render();
});

// Init icône au chargement
updateViewToggleIcon(state.get('currentView') === 'card' ? 'card' : 'table');

//dom.toggleHeaderBtn.addEventListener('click', toggleHeader);

dom.fileInput.addEventListener('change', async ev => {
  const f = ev.target.files[0];
  if (!f) return;
  dom.fileInput.value = '';
  try {
    if (f.name.toLowerCase().endsWith('.json')) {
      fileManager.clearHandle();
      await loadJSONDataset(f, false);
    } else {
      showToast('Fichier JSON requis', 'error');
    }
  } catch (e) {
    logger.error('fileInput onchange', e);
    showToast('Erreur lecture fichier', 'error');
  }
});

