'use strict';

/* ============================================================
   RENDER — TableRenderer                                    ✅ #7 #8 #19
   ============================================================ */
const TableRenderer = {

  // ✅ #7 — colonnes actives extraites en une seule fonction
  getActiveCols() {
    const cols = [
      CONFIG.idField, CONFIG.nomField, CONFIG.prenomField, CONFIG.genreField,
    ];
    if (state.get('isOptionMat')) cols.push(CONFIG.optionField);
    const nbNotes = state.get('nbNotes');
    for (let i = 0; i < nbNotes; i++) cols.push(CONFIG.noteFields[i]);
    cols.push(CONFIG.compoField);
    return cols;
  },

  // ✅ #8 — helpers regroupés dans TableRenderer
  makeTd(v) {
    return Object.assign(document.createElement('td'), { textContent: v || '' });
  },
  makeTdInput(row, f, rowIdx) {
    const td = document.createElement('td');
    td.appendChild(InputFactory.noteInput(row, f, rowIdx));
    return td;
  },
  makeTdCheck(row, f) {
    const td = document.createElement('td');
    td.appendChild(InputFactory.checkbox(row, f));
    return td;
  },

  renderTable() {
    const cols = this.getActiveCols();
    dom.theadtab.innerHTML = '<tr>' + cols.map(h => `<th>${CONFIG.headerLabels[h] ?? h}</th>`).join('') + '</tr>';
    dom.tbodytab.innerHTML = '';
    const frag    = document.createDocumentFragment();
    const nbNotes = state.get('nbNotes');
    state.get('filtered').forEach((r, rowIdx) => {
      const tr = document.createElement('tr');
      tr.dataset.id = String(r[CONFIG.idField] ?? '');
      tr.appendChild(this.makeTd(getCellVal(r, CONFIG.idField)));
      tr.appendChild(this.makeTd(getCellVal(r, CONFIG.nomField)));
      tr.appendChild(this.makeTd(getCellVal(r, CONFIG.prenomField)));
      tr.appendChild(this.makeTd(getCellVal(r, CONFIG.genreField)));
      if (state.get('isOptionMat')) tr.appendChild(this.makeTdCheck(r, CONFIG.optionField));
      for (let i = 0; i < nbNotes; i++) tr.appendChild(this.makeTdInput(r, CONFIG.noteFields[i], rowIdx));
      tr.appendChild(this.makeTdInput(r, CONFIG.compoField, rowIdx));
      frag.appendChild(tr);
    });
    dom.tbodytab.appendChild(frag);
  },

  renderCards() {
    dom.cardstab.innerHTML = '';
    const frag    = document.createDocumentFragment();
    const nbNotes = state.get('nbNotes');
    state.get('filtered').forEach((r, rowIdx) => {
      const card = document.createElement('div');
      card.className = 'card';
      const cardHeader = document.createElement('div');
      cardHeader.className = 'card-header';
      cardHeader.textContent = `${getCellVal(r, CONFIG.nomField)} ${getCellVal(r, CONFIG.prenomField)} | ${getCellVal(r, CONFIG.genreField)}`;
      card.appendChild(cardHeader);
      const grid = document.createElement('div');
      grid.className = 'card-grid';

      if (state.get('isOptionMat')) {
        const lbl = Object.assign(document.createElement('label'), { className: 'toggle-switch', textContent: 'Exempté' });
        lbl.style.gridColumn = '1/-1';
        lbl.appendChild(InputFactory.checkbox(r, CONFIG.optionField));
        lbl.appendChild(Object.assign(document.createElement('span'), { className: 'slider-toggle' }));
        grid.appendChild(lbl);
      }
      for (let i = 0; i < nbNotes; i++) {
        grid.appendChild(Object.assign(document.createElement('div'), { textContent: 'Devoir ' + (i + 1) }));
        grid.appendChild(InputFactory.noteInput(r, CONFIG.noteFields[i], rowIdx));
      }
      grid.appendChild(Object.assign(document.createElement('div'), { textContent: 'Compo' }));
      grid.appendChild(InputFactory.noteInput(r, CONFIG.compoField, rowIdx));
      card.appendChild(grid);
      frag.appendChild(card);
    });
    dom.cardstab.appendChild(frag);
  },
};

// ✅ #19 — guard explicite pour rendu vide
function render() {
  const headers  = state.get('headers');
  const filtered = state.get('filtered');

  if (!headers.length || !filtered.length) {
    dom.theadtab.innerHTML = dom.tbodytab.innerHTML = dom.cardstab.innerHTML = '';
    return;
  }
  state.get('currentView') === 'table'
    ? TableRenderer.renderTable()
    : TableRenderer.renderCards();
}

// ✅ #22 — re-rend le tableau si le mode d'interaction change en cours de session
// (souris branchée/débranchée sur PC tactile, rotation d'écran, redimensionnement de fenêtre)
InteractionMode.onChange(() => {
  numpad.close();
  render();
});
