'use strict';

  'use strict';

/* ============================================================
   ✅ #26 — CAPTEUR D'ERREURS GLOBAL (diagnostic)
   Affiche toute erreur JS non gérée à l'écran au lieu de la laisser
   silencieuse. showToast est une function declaration plus bas dans
   ce même script, donc hoistée : utilisable ici sans souci d'ordre.
   ============================================================ */
window.addEventListener('error', (e) => {
  try {
    const msg = `Erreur JS : ${e?.message || 'inconnue'} (${(e?.filename||'').split('/').pop()}:${e?.lineno||'?'})`;
    console.error(msg, e?.error);
    if (typeof showToast === 'function') showToast(msg, 'error', 10000);
    else alert(msg);
  } catch (_) {}
});
window.addEventListener('unhandledrejection', (e) => {
  try {
    const msg = `Erreur async : ${e?.reason?.message || e?.reason || 'inconnue'}`;
    console.error(msg, e?.reason);
    if (typeof showToast === 'function') showToast(msg, 'error', 10000);
    else alert(msg);
  } catch (_) {}
});

/* ============================================================
   CONFIG — toutes les constantes de paramétrage centralisées
   ============================================================ */
const CONFIG = Object.freeze({
  csvDelimiter  : ';',
  noteFields    : ['devoir11', 'devoir22', 'devoir33'],       // ✅ #12 renommés
  compoField    : 'componote',
  idField       : 'ideleve',
  nomField      : 'nomel',
  prenomField   : 'prenomel',
  genreField    : 'genre',
  optionField   : 'bloption',
  requiredKeys  : [
    'ideleve','nomel','prenomel','genre','fkclasse',
    'idmatiere','devoir11','devoir22','devoir33','componote','bloption'
  ],
  headerLabels  : {
    ideleve   : 'ID',
    nomel     : 'Nom',
    prenomel  : 'Prénom',
    genre     : 'Genre',
    fkclasse  : 'Classe',
    idmatiere : 'Matière',
    bloption  : 'Exempté',
    devoir11  : 'Devoir 1',
    devoir22  : 'Devoir 2',
    devoir33  : 'Devoir 3',
    componote : 'Composition',
  },
  exportFields  : [                                        // ✅ #17 sorti de ExportManager
    'ideleve','idmatiere','fksequ',
    'devoir11','devoir22','devoir33',
    'componote','nbrenote','bloption',
  ],
  draftDelay    : 800,
  idbMaxRetries : 3,
});

/* ============================================================
   LOGGER — gestion d'erreurs centralisée                    ✅ #16
   ============================================================ */
const logger = {
  warn : (...args) => console.warn('[App]',  ...args),
  error: (...args) => console.error('[App]', ...args),
  info : (...args) => console.info('[App]',  ...args),
};

/* ============================================================
   STATE — état applicatif encapsulé                         ✅ #18
   ============================================================ */
const state = (() => {
  let _data = {
    rowNotes        : [],
    rowMatieres     : [],
    filtered        : [],
    headers         : [],
    unsaved         : false,
    isOptionMat     : false,
    idbError        : false,
    currentSourceId : null,
    currentView     : window.matchMedia('(max-width:768px)').matches ? 'card' : 'table',
    nbNotes         : 1,
    user_id         : null,
  };

  const _onChange = new Map();                             // callbacks par champ

  return {
    get: key        => _data[key],
    set: (key, val) => { _data[key] = val; _onChange.get(key)?.(_data[key]); },
    onchange: (key, fn) => _onChange.set(key, fn),
    snapshot: ()    => ({ ..._data }),
  };
})();

/* ============================================================
   DOM — références centralisées, plus d'appels directs à $() ✅ #11
   ============================================================ */
const byId = id => document.getElementById(id);

const dom = {
  openBtn         : byId('openBtn'),
  saveBtn         : byId('saveBtn'),
  toggleBtn       : byId('toggleView'),
  exportBtn       : byId('exportBtn'),
  fClasseSel      : byId('fClasseSel'),
  fMatiereSel     : byId('fMatiereSel'),
  nbNotesSel      : byId('nbNotesSel'),
  theadtab        : byId('theadtab'),
  tbodytab        : byId('tbodytab'),
  cardstab        : byId('cardstab'),
  effectif        : byId('effectif'),
  msgState        : byId('msgstate'),
  overlayWrap     : byId('OverlayWrap'),
  toastWrap       : byId('toastWrap'),
  fileInput       : byId('fileInput'),
  toggleHeaderBtn : byId('toggleHeaderBtn'),
  txtPeriode      : byId('txtPeriode'),
  txtSource       : byId('txtSource'),
  confirmModal    : byId('confirmModal'),
  confirmTitle    : byId('confirmTitle'),
  confirmMessage  : byId('confirmMessage'),
  btnOk           : byId('btnOk'),
  btnCancel       : byId('btnCancel'),
  permiOverlay    : byId('permiOverlay'),
  btnGrant        : byId('btnGrant'),
  openGuide       : byId('openGuide'),
  expDownload     : byId('expDownload'),
  headWrap        : byId('HeadWrap'),
  mainWrap        : byId('MainWrap'),
  tableWrap       : byId('tableWrap'),
};

/* ============================================================
   DÉTECTION DE MODE D'INTERACTION — robuste et réactive     ✅ #22
   Combine taille d'écran + disponibilité d'un pointeur précis
   (any-pointer, pas pointer seul) pour éviter les faux positifs
   sur PC tactile grand écran ou tablette + souris Bluetooth.
   ============================================================ */
const InteractionMode = (() => {
  const mqSmallScreen = window.matchMedia('(max-width: 768px)');
  const mqFinePointer = window.matchMedia('(any-pointer: fine)'); // souris/trackpad dispo, même en plus du tactile

  function computeIsMobile() {
    if (!mqSmallScreen.matches) return false; // grand écran → jamais le pavé, même tactile
    if (mqFinePointer.matches)  return false; // souris dispo → clavier physique prioritaire
    return true;                              // petit écran + pas de souris → tactile
  }

  let isMobile = computeIsMobile();
  const listeners = [];

  function notify() {
    const next = computeIsMobile();
    if (next !== isMobile) {
      isMobile = next;
      listeners.forEach(fn => fn(isMobile));
    }
  }

  [mqSmallScreen, mqFinePointer].forEach(mq => {
    mq.addEventListener ? mq.addEventListener('change', notify) : mq.addListener(notify);
  });
  window.addEventListener('resize', notify);

  return {
    get isMobile() { return isMobile; },
    onChange(fn)   { listeners.push(fn); },
  };
})();

// Compat rétro : ancien nom utilisé ailleurs dans le fichier (branche desktop = pas mobile)
const isDesktop = !InteractionMode.isMobile;

