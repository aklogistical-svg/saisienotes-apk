'use strict';

/* ============================================================
   INIT
   ============================================================ */
window.addEventListener('load', () => fileManager.tryAutoRestore());
window.addEventListener('beforeunload', e => {
  const hasUnsaved = state.get('unsaved');
  const hasIdbError = state.get('idbError');
  if (hasUnsaved || hasIdbError) {
    if (hasUnsaved) draftManager.flushNow().catch(() => {});
    e.preventDefault();
    e.returnValue = hasIdbError && !hasUnsaved
      ? 'Sauvegarde automatique indisponible. Exportez vos données avant de partir.'
      : 'Vous avez des modifications non enregistrées. Voulez-vous vraiment quitter ?';
  }
});

// ============================================================
//  COUCHE RÉSEAU
// ============================================================
// Toutes les requêtes vers le serveur école passent par netRequest().
//
// Deux problèmes réglés ici :
//
// 1. CORS. Dans l'APK, la WebView a pour origine "http://localhost" ; un
//    fetch() vers http://192.168.x.x:8000 est donc une requête cross-origin
//    que le serveur doit autoriser explicitement, sinon la réponse est
//    silencieusement bloquée (et la découverte concluait "rien trouvé").
//    On passe par le client HTTP natif de Capacitor (HttpURLConnection),
//    qui n'est pas soumis à CORS. En navigateur (PWA servie par le
//    serveur lui-même) on retombe sur fetch().
//
// 2. Délais. Un fetch() sans timeout sur une adresse morte peut rester
//    suspendu très longtemps dans une WebView : la fenêtre d'attente ou
//    l'écran de connexion restaient figés. Chaque requête a maintenant un
//    délai maximum, appliqué nativement ET doublé d'un filet de sécurité
//    côté JS.

class NetError extends Error {
  // kind : 'timeout' | 'network' | 'config'
  constructor(kind, message) {
    super(message);
    this.name = 'NetError';
    this.kind = kind;
  }
}

// Message lisible pour le prof, quelle que soit l'origine de l'erreur.
function describeNetError(e) {
  if (!e) return 'Erreur inconnue.';
  if (e.status) return e.message || `Erreur serveur (HTTP ${e.status}).`;
  if (e.kind === 'timeout') return 'Le serveur ne répond pas (délai dépassé). Vérifiez le WiFi et que le serveur est allumé.';
  if (e.kind === 'network') return 'Serveur injoignable. Vérifiez le WiFi et l\'adresse du serveur.';
  if (e.kind === 'config')  return e.message;
  return e.message || 'Erreur inconnue.';
}

// Lie le trafic de l'app au WiFi (sans effet hors Android). Voir
// WifiInfoPlugin.bindToWifi : sans ça, un WiFi sans Internet est
// contourné par Android au profit des données mobiles.
async function bindWifi() {
  try { return await window.CapPlugins?.WifiInfo?.bindToWifi?.(); }
  catch { return null; }
}

function parseMaybeJson(data) {
  if (typeof data !== 'string') return data;
  try { return JSON.parse(data); } catch { return data; }
}

async function netRequest(url, { method = 'GET', headers = {}, body, timeoutMs = 10000 } = {}) {
  const http = window.CapPlugins?.Http;
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new NetError('timeout', 'Délai dépassé')),
      timeoutMs + 2000                      // marge : le natif doit échouer en premier
    );
  });

  const work = http
    ? (async () => {
        try {
          const res = await http.request({
            url, method, headers, data: body,
            connectTimeout: Math.min(timeoutMs, 8000),
            readTimeout   : timeoutMs,
          });
          return { status: res.status, data: parseMaybeJson(res.data) };
        } catch (e) {
          const msg = String(e?.message || e || '').toLowerCase();
          throw new NetError(/timed? ?out|timeout/.test(msg) ? 'timeout' : 'network', e?.message || 'Erreur réseau');
        }
      })()
    : (async () => {
        const ctrl = new AbortController();
        const abortTimer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            method, signal: ctrl.signal,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          const text = await res.text();
          return { status: res.status, data: parseMaybeJson(text) };
        } catch (e) {
          throw new NetError(e?.name === 'AbortError' ? 'timeout' : 'network', e?.message || 'Erreur réseau');
        } finally {
          clearTimeout(abortTimer);
        }
      })();

  try {
    return await Promise.race([work, guard]);
  } finally {
    clearTimeout(timer);
    work.catch(() => {});                   // évite un "unhandled rejection" si le garde a gagné
  }
}

// Extrait le message d'erreur renvoyé par FastAPI ({"detail": "..."} ou liste 422).
function httpErrorFrom(status, data) {
  let detail = null;
  if (data && typeof data === 'object') {
    if (typeof data.detail === 'string') detail = data.detail;
    else if (Array.isArray(data.detail) && data.detail[0]?.msg) detail = data.detail[0].msg;
  }
  const err = new Error(detail || `Erreur serveur (HTTP ${status})`);
  err.status = status;
  return err;
}

// ============================================================
//  DÉCOUVERTE AUTOMATIQUE DU SERVEUR SUR LE RÉSEAU LOCAL
// ============================================================
// Ordre des tentatives (la première qui répond gagne) :
//   1. l'adresse déjà connue (instantané si elle marche encore) ;
//   2. l'origine de la page si l'app est servie par le serveur (PWA) ;
//   3. un scan NATIF du réseau (WifiInfoPlugin.scan) : masque réel du
//      réseau, points d'accès/USB inclus, hôtes testés en parallèle.
//
// Chaque candidat est vérifié via /whoami : on ne retient que le vrai
// serveur école, jamais un autre appareil qui répondrait sur le port 8000.
//
// Pas de mDNS : trop dépendant du WiFi de l'école (le multicast y est
// souvent filtré) et de plugins tiers peu maintenus.
const ServerDiscovery = (() => {
  const PORT = 8000;
  const EXPECTED_SERVICE = 'adminschool-platform_api';
  const PROBE_TIMEOUT_MS = 1500;

  let seq = 0;                               // invalide les découvertes obsolètes

  async function isOurServer(baseUrl) {
    if (!baseUrl) return false;
    try {
      const { status, data } = await netRequest(`${baseUrl}/whoami`, { timeoutMs: PROBE_TIMEOUT_MS });
      return status === 200 && data?.service === EXPECTED_SERVICE;
    } catch {
      return false;
    }
  }

  function hostOf(url) {
    try { return new URL(url).hostname; } catch { return ''; }
  }

  function cancel() {
    seq++;
    try { window.CapPlugins?.WifiInfo?.cancelScan?.(); } catch { /* ignore */ }
  }

  // Résultat : { url, source, cancelled, message, diag }
  async function discover({ savedUrl = '', skipSaved = false, onStatus = () => {} } = {}) {
    const id = ++seq;
    const stale = () => id !== seq;
    const diag = [];
    const finish = (extra) => ({ url: null, source: null, cancelled: false, message: '', ...extra, diag: diag.join('\n') });

    const bind = await bindWifi();
    if (bind) diag.push(`Liaison WiFi : ${bind.bound ? 'oui' : 'non'}${bind.reason ? ` (${bind.reason})` : ''}`);

    // 1. adresse mémorisée
    if (savedUrl && !skipSaved) {
      onStatus('Test de l\'adresse mémorisée…');
      const ok = await isOurServer(savedUrl);
      diag.push(`Adresse mémorisée ${savedUrl} : ${ok ? 'répond' : 'ne répond pas'}`);
      if (stale()) return finish({ cancelled: true });
      if (ok) return finish({ url: savedUrl, source: 'saved' });
    }

    // 2. app servie par le serveur lui-même (PWA dans un navigateur)
    const origin = location.origin;
    if (/^https?:/.test(origin) && !/^https?:\/\/localhost(:|$)/.test(origin) && await isOurServer(origin)) {
      diag.push(`Origine de la page ${origin} : répond`);
      return finish({ url: origin, source: 'origin' });
    }

    // 3. scan natif
    const wifi = window.CapPlugins?.WifiInfo;
    if (!wifi?.scan) {
      diag.push('Scan réseau indisponible (pas dans l\'APK).');
      return finish({ message: 'Recherche automatique indisponible ici — saisissez l\'adresse du serveur.' });
    }

    onStatus('Recherche du serveur sur le réseau…');
    let listener = null;
    try {
      listener = await wifi.addListener('scanProgress', p => {
        if (!stale()) onStatus(`Recherche du serveur… ${p.done}/${p.total}`);
      });
    } catch { /* la progression est facultative */ }

    let res;
    try {
      res = await wifi.scan({
        port: PORT, path: '/whoami', service: EXPECTED_SERVICE,
        hintHost: hostOf(savedUrl),
      });
    } catch (e) {
      diag.push(`Scan en erreur : ${e?.message || e}`);
      return finish({ message: 'Impossible de scanner le réseau. Saisissez l\'adresse du serveur.' });
    } finally {
      try { await listener?.remove(); } catch { /* ignore */ }
    }

    if (res.phoneIp) diag.push(`Téléphone : ${res.phoneIp}/${res.prefix}${res.gateway ? ` (passerelle ${res.gateway})` : ''}`);
    diag.push(`Sous-réseaux balayés : ${(res.subnets || []).join(', ') || 'aucun'}`);
    diag.push(`Adresses testées : ${res.scanned}/${res.total} en ${((res.elapsedMs || 0) / 1000).toFixed(1)} s`);
    diag.push(`Résultat : ${res.url || res.reason}`);
    if (stale()) return finish({ cancelled: true });

    if (res.url) return finish({ url: res.url, source: 'scan' });

    const message =
      res.reason === 'no_network'
        ? 'WiFi non détecté — connectez le téléphone au WiFi de l\'école, puis relancez la recherche.'
        : 'Serveur non trouvé sur ce réseau. Vérifiez qu\'il est allumé et sur le même WiFi, ou saisissez son adresse.';
    return finish({ message });
  }

  return { discover, cancel, isOurServer };
})();

// ============================================================
//  API CLIENT
// ============================================================
class ApiClient {
  #baseUrl;

  constructor() {
    // ⚠ Dans l'APK packagé (Capacitor), location.origin vaut toujours
    // "http://localhost" (l'origine interne de la WebView), jamais
    // l'adresse réseau du serveur école : l'adresse est donc mémorisée
    // sur l'appareil après une connexion réussie (ou une découverte
    // vérifiée par /whoami), jamais avant.
    this.#baseUrl = this.#readStored();
  }

  #readStored() {
    try { return localStorage.getItem('server_url') || ''; } catch { return ''; }
  }

  getBaseUrl() {
    return this.#baseUrl;
  }

  // "192.168.1.50" → "http://192.168.1.50:8000" ; enlève chemin et "/" final
  // (ex. l'utilisateur colle l'adresse de la PWA "http://ip:8000/app/").
  static normalize(url) {
    let clean = (url || '').trim();
    if (!clean) return '';
    const explicitScheme = /^https?:\/\//i.test(clean);
    if (!explicitScheme) clean = `http://${clean}`;
    try {
      const u = new URL(clean);
      if (!u.port && !explicitScheme) u.port = '8000';
      return u.origin;
    } catch {
      return clean.replace(/\/+$/, '');
    }
  }

  // persist=false : adresse saisie à la main, pas encore validée.
  setBaseUrl(url, { persist = true } = {}) {
    this.#baseUrl = ApiClient.normalize(url);
    if (persist) this.persistBaseUrl();
    return this.#baseUrl;
  }

  persistBaseUrl() {
    try { localStorage.setItem('server_url', this.#baseUrl); } catch { /* stockage indisponible */ }
  }

  // ── Requête générique ──────────────────────────────────────
  // Le token JWT (reçu au login) est ajouté dès qu'il existe.
  // Un 401 n'est jamais relancé (il faut se reconnecter). Les POST ne sont
  // jamais relancés automatiquement : un envoi de notes ne doit pas partir
  // deux fois pendant que le prof attend. Seuls les GET (retries > 0)
  // sont réessayés, et seulement sur erreur réseau/timeout/5xx.
  async #request(path, { method = 'GET', body, timeoutMs = 10000, auth = true, retries = 0 } = {}) {
    if (!this.#baseUrl) throw new NetError('config', 'Adresse du serveur non renseignée.');
    await bindWifi();

    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = state.get('token');
    if (auth && token) headers['Authorization'] = `Bearer ${token}`;

    for (let attempt = 0; ; attempt++) {
      try {
        const { status, data } = await netRequest(`${this.#baseUrl}${path}`, { method, headers, body, timeoutMs });
        if (status >= 200 && status < 300) return data;
        throw httpErrorFrom(status, data);
      } catch (e) {
        // Pas de nouvel essai après un timeout : ce serait doubler l'attente du prof.
        const retryable = e.kind !== 'timeout' && (!e.status || e.status >= 500);
        if (e.status === 401 || !retryable || attempt >= retries) throw e;
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }

  // ── Endpoints ──────────────────────────────────────────────
  async ping() {
    const data = await this.#request('/ping', { timeoutMs: 4000, auth: false });
    return data?.status === 'ok';
  }

  login(user, password) {
    return this.#request('/login', {
      method: 'POST', body: { user, password }, timeoutMs: 10000, auth: false,
    });
  }

  // Le serveur attend jusqu'à 60 s la fin d'écriture dans Access avant de
  // répondre 504 : le délai client doit être plus long pour que le prof
  // reçoive ce message plutôt qu'un simple "délai dépassé".
  upload(changes) {
    return this.#request('/sync/upload', {
      method: 'POST', body: { changes }, timeoutMs: 75000,
    });
  }

  download() {
    return this.#request('/sync/download', { timeoutMs: 30000, retries: 1 });
  }

  changePassword(oldPassword, newPassword) {
    return this.#request('/auth/change-password', {
      method: 'POST',
      body: { old_password: oldPassword, new_password: newPassword },
      timeoutMs: 10000,
    });
  }
}

// ============================================================
//  SYNC MANAGER
// ============================================================
class SyncManager {
  #api;
  #auth;

  constructor(api, auth) {
    this.#api       = api;
    this.#auth      = auth;
  }

  // ── Point d'entrée ─────────────────────────────────────────
  async #ensureAuth(){
    if (!await this.#auth.isLogged()){
      throw new Error("Utilisateur non connecté");
    }
  }
  async #buildData(){
    const fields = CONFIG.exportFields;
    const data = state.get('rowNotes').map(item => {
      return fields.reduce((acc, col) => {
        let val = item[col];
        acc.push(val !== undefined && val !== null ? Number(val): null);
        return acc;
      }, []);
    });

    return data;
  }

  // ── Upload (pwa → serveur) ───────────────────────────────
  // Lève une erreur dans tous les cas d'échec (réseau, timeout, HTTP,
  // refus d'écriture côté serveur) : l'appelant (ExportManager.export)
  // ferme la fenêtre d'attente et affiche l'erreur avec "Réessayer".
  // Retourne false uniquement si la session a expiré (déjà signalé).
  async exportdt() {
    await this.#ensureAuth();
    const data = await this.#buildData();

    try {
      const res = await this.#api.upload(data);
      if (!res?.success) {
        throw new Error('Le serveur n\'a pas pu enregistrer les notes dans la base. Réessayez ; si l\'erreur persiste, vérifiez le serveur.');
      }
      showToast('Export réussi vers la centrale', 'success');
      return true;
    } catch (e) {
      if (e.status === 401) { this.#handleSessionExpired(); return false; }
      throw e;
    }
  }

  // ── Download (serveur → pwa) ─────────────────────────────
  async chargedt() {
    await this.#ensureAuth();
    if (state.get('unsaved')) {
      const ok = await new Promise(resolve => {
        const confirmed = window.confirm('Données locales non enregistrées. Les remplacer par les données du serveur ?');
        resolve(confirmed);
      });
      if (!ok) return;
    }

    showOverlay('Chargement des données…');
    try {
      const res = await this.#api.download();
      if (res.error?.length > 0) console.warn(res.error);
      if (res.notes_mpr?.length > 0) {
        await this.#applique_data(res);
      } else {
        showToast('Le serveur n\'a renvoyé aucune note', 'warn', 4000);
      }
    } catch (e) {
      if (e.status === 401) { this.#handleSessionExpired(); return; }
      throw e;
    } finally {
      hideOverlay();
    }
  }

  // ── Session expirée ou token absent : notes locales préservées ──
  // Les notes déjà saisies restent dans IndexedDB (via draftManager),
  // seule la synchro est bloquée tant que le prof ne s'est pas reconnecté.
  #handleSessionExpired() {
    this.#auth.logout();
    showToast('Session expirée, veuillez vous reconnecter', 'warn', 4000);
  }

  // ── appliquer les donnees du serveur au pwa ──────────────────
  async #applique_data(resp){
    applyDataset(resp.notes_mpr, resp.matieres_mpr, resp.infos_mpr);
    state.set('rowNotes', resp.notes_mpr);
    await draftManager.flushNow();
    dom.msgState.textContent = '✔ Données chargées';
    showToast('Données chargées', 'success');
  }
}

// ============================================================
//  AUTH MANAGER
// ============================================================
class AuthManager {
  #api;
  #userId;

  constructor(api) {
    this.#api = api;
  }

  #getUser()  { return state.get('user_id'); }
  async isLogged()  { return !!this.#getUser(); }

  async login(user, password) {
    const data = await this.#api.login(user, password);

    if (!data?.success) {
      const err = new Error('Identifiants incorrects.');
      err.status = 401;
      throw err;
    }

    this.#userId = data.user_id;
    state.set('user_id', this.#userId);
    state.set('token', data.token);
    currentMeta = { ...currentMeta, forprof: data.user_nom };

    // Nom d'utilisateur mémorisé (jamais le mot de passe) pour préremplir
    // l'écran de connexion la prochaine fois — seulement s'il n'est pas vide.
    const clean = (user || '').trim();
    if (clean) {
      try { localStorage.setItem('last_username', clean); } catch { /* stockage indisponible */ }
    }

    showToast("Connexion réussie. Charger ou Exporter");
    return data;
  }

  logout() {
    state.set('user_id', null);
    state.set('token', null);
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }
}

// ============================================================
//  UI CONTROLLER
// ============================================================
class UIController {
  #loginPage;
  #btnNet;
  #indicator;
  #auth;
  #sync;
  #api;

  #urlInput;
  #userInput;
  #passInput;
  #loginBtn;
  #rescanBtn;
  #statusEl;
  #diagEl;

  #accountPage;
  #accountBtn;
  #accountUserLabel;
  #pwdForm;
  #oldPwdInput;
  #newPwdInput;
  #newPwd2Input;
  #pwdStatusEl;
  #pwdSubmitBtn;
  #logoutBtn;
  #pwdBusy = false;   // changement de mot de passe en cours

  #urlDirty    = false;   // l'utilisateur a modifié l'adresse à la main
  #busy        = false;   // connexion en cours
  #discovering = false;   // recherche du serveur en cours
  #runId       = 0;       // identifie la recherche la plus récente (voir #runDiscovery)

  constructor(auth, sync, api) {
    this.#auth      = auth;
    this.#sync      = sync;
    this.#api       = api;
    this.#loginPage = document.getElementById("loginPage");
    this.#btnNet    = document.getElementById('netToggle');
    this.#indicator = document.getElementById('netIndicator');
    this.#urlInput  = document.getElementById("serverUrlInput");
    this.#userInput = document.getElementById("userLogin");
    this.#passInput = document.getElementById("passLogin");
    this.#loginBtn  = document.getElementById("loginBtn");
    this.#rescanBtn = document.getElementById("rescanBtn");
    this.#statusEl  = document.getElementById("serverStatus");
    this.#diagEl    = document.getElementById("netDiag");

    this.#accountPage      = document.getElementById("accountPage");
    this.#accountBtn       = document.getElementById("accountBtn");
    this.#accountUserLabel = document.getElementById("accountUserLabel");
    this.#pwdForm          = document.getElementById("pwdForm");
    this.#oldPwdInput      = document.getElementById("oldPwd");
    this.#newPwdInput      = document.getElementById("newPwd");
    this.#newPwd2Input     = document.getElementById("newPwd2");
    this.#pwdStatusEl      = document.getElementById("pwdStatus");
    this.#pwdSubmitBtn     = document.getElementById("pwdSubmitBtn");
    this.#logoutBtn        = document.getElementById("logoutBtn");

    this.#bindEvents();
  }

  // ── Binding des événements (une seule fois) ────────────────
  #bindEvents() {
    this.#btnNet.addEventListener('click', () => this.#openLogin());
    this.#loginPage.querySelector(".closeg").addEventListener('click', () => this.#closeLogin());
    this.#loginBtn.addEventListener('click', () => this.#handleLogin());
    this.#rescanBtn.addEventListener('click', () => this.#runDiscovery({ force: true }));

    this.#urlInput.addEventListener('input', () => {
      this.#urlDirty = true;
      this.#setStatus('');
    });
    [this.#urlInput, this.#userInput, this.#passInput].forEach(el =>
      el.addEventListener('keydown', e => { if (e.key === 'Enter') this.#handleLogin(); })
    );

    // Session expirée / déconnexion : le voyant repasse au rouge et le
    // menu compte redevient inaccessible.
    window.addEventListener('auth:logout', () => this.#setLoggedInUi(false));

    this.#accountBtn.addEventListener('click', () => this.#openAccount());
    this.#accountPage.querySelector(".closeg").addEventListener('click', () => this.#closeAccount());
    this.#pwdForm.addEventListener('submit', e => { e.preventDefault(); this.#handleChangePassword(); });
    this.#logoutBtn.addEventListener('click', () => this.#handleLogout());
  }

  // ── Bascule l'affichage entre visiteur et professeur connecté ──────
  #setLoggedInUi(loggedIn) {
    this.#indicator.classList.toggle('active', loggedIn);
    this.#accountBtn.hidden = !loggedIn;
    if (!loggedIn) this.#closeAccount();
  }

  // ── Écran « Mon compte » ────────────────────────────────────
  #openAccount() {
    this.#accountUserLabel.textContent = currentMeta?.forprof ? `Connecté en tant que ${currentMeta.forprof}` : '';
    this.#oldPwdInput.value = '';
    this.#newPwdInput.value = '';
    this.#newPwd2Input.value = '';
    this.#setPwdStatus('');
    this.#accountPage.classList.add("show");
    this.#oldPwdInput.focus();
  }

  #closeAccount() {
    this.#accountPage.classList.remove("show");
  }

  #setPwdStatus(text, kind = '') {
    this.#pwdStatusEl.textContent = text;
    this.#pwdStatusEl.className = `server-status${kind ? ' ' + kind : ''}`;
  }

  #setPwdBusy(busy) {
    this.#pwdBusy = busy;
    this.#pwdSubmitBtn.disabled = busy;
    this.#pwdSubmitBtn.querySelector('.btn-text').textContent = busy ? '⏳ Changement…' : '🔒 Changer le mot de passe';
  }

  // ── Changement de mot de passe, en se basant sur l'ancien ──────────
  async #handleChangePassword() {
    if (this.#pwdBusy) return;

    const oldPwd  = this.#oldPwdInput.value;
    const newPwd  = this.#newPwdInput.value;
    const newPwd2 = this.#newPwd2Input.value;

    if (!oldPwd || !newPwd) {
      this.#setPwdStatus('Renseignez l\'ancien et le nouveau mot de passe.', 'warn');
      return;
    }
    if (newPwd.length < 4) {
      this.#setPwdStatus('Le nouveau mot de passe doit contenir au moins 4 caractères.', 'warn');
      return;
    }
    if (newPwd !== newPwd2) {
      this.#setPwdStatus('Les deux mots de passe ne correspondent pas.', 'warn');
      return;
    }
    if (newPwd === oldPwd) {
      this.#setPwdStatus('Le nouveau mot de passe doit être différent de l\'ancien.', 'warn');
      return;
    }

    this.#setPwdBusy(true);
    this.#setPwdStatus('Changement en cours…', 'busy');
    try {
      await this.#api.changePassword(oldPwd, newPwd);
      showToast('Mot de passe changé avec succès', 'success');
      this.#closeAccount();
    } catch (e) {
      // Session expirée pendant l'opération : redirige naturellement vers
      // la reconnexion plutôt que d'afficher une erreur confuse.
      if (e.status === 401 && /token/i.test(e.message || '')) {
        this.#auth.logout();
        showToast('Session expirée, veuillez vous reconnecter', 'warn', 4000);
        return;
      }
      // 401 (mauvais ancien mot de passe), 429 (verrouillé), 422
      // (validation serveur) portent déjà un message clair depuis l'API.
      this.#setPwdStatus(describeNetError(e), 'warn');
    } finally {
      this.#setPwdBusy(false);
    }
  }

  // ── Déconnexion volontaire, depuis le menu compte ───────────────────
  #handleLogout() {
    this.#auth.logout();
    showToast('Déconnecté', 'success');
  }

  // ── Ouverture : la fenêtre s'affiche TOUT DE SUITE, la recherche du
  //    serveur se fait en arrière-plan avec sa progression visible. ──
  #openLogin() {
    this.#urlInput.value = this.#api.getBaseUrl();
    this.#urlDirty = false;

    // Nom mémorisé depuis la dernière connexion réussie ; on ne touche
    // pas au champ s'il n'y a rien de mémorisé.
    let lastUser = '';
    try { lastUser = localStorage.getItem('last_username') || ''; } catch { /* ignore */ }
    if (lastUser) this.#userInput.value = lastUser;

    this.#passInput.value = '';
    this.#setStatus('');
    this.#loginPage.classList.add("show");

    // Focus sur le premier champ réellement à remplir.
    (this.#userInput.value.trim() ? this.#passInput : this.#userInput).focus();

    this.#runDiscovery();
  }

  #closeLogin() {
    ServerDiscovery.cancel();
    this.#discovering = false;
    this.#loginPage.classList.remove("show");
  }

  #setStatus(text, kind = '') {
    this.#statusEl.textContent = text;
    this.#statusEl.className = `server-status${kind ? ' ' + kind : ''}`;
  }

  #setBusy(busy) {
    this.#busy = busy;
    this.#loginBtn.disabled = busy;
    this.#rescanBtn.disabled = busy;
    this.#loginBtn.querySelector('.btn-text').textContent = busy ? '⏳ Connexion…' : '🔑 Se connecter';
  }

  // ── Recherche du serveur ───────────────────────────────────
  // Retourne l'URL trouvée (ou '').
  async #runDiscovery({ force = false, skipSaved = false } = {}) {
    if (this.#discovering) {
      if (!force) return '';
      ServerDiscovery.cancel();
    }
    const run = ++this.#runId;
    this.#discovering = true;
    this.#rescanBtn.classList.add('spinning');

    // Ce que le prof a tapé à la main est testé en premier.
    const typed = this.#urlInput.value.trim();
    const savedUrl = typed ? ApiClient.normalize(typed) : this.#api.getBaseUrl();

    try {
      const res = await ServerDiscovery.discover({
        savedUrl, skipSaved,
        onStatus: msg => { if (run === this.#runId) this.#setStatus(msg, 'busy'); },
      });
      if (res.cancelled || run !== this.#runId) return '';

      this.#diagEl.textContent = res.diag;

      if (res.url) {
        // Le prof est en train de saisir une autre adresse : on ne l'écrase pas.
        if (this.#urlDirty && !force && res.source !== 'saved') {
          this.#setStatus(`ℹ️ Serveur détecté : ${res.url} — touchez ↻ pour l'utiliser`, 'ok');
          return '';
        }
        // Adresse vérifiée par /whoami : on peut la mémoriser.
        this.#urlInput.value = res.url;
        this.#urlDirty = false;
        this.#api.setBaseUrl(res.url);
        this.#setStatus(`✅ Serveur trouvé : ${res.url}`, 'ok');
        return res.url;
      }
      this.#setStatus(res.message, 'warn');
      return '';
    } finally {
      // Une recherche plus récente a pris le relais : ne pas toucher à l'état.
      if (run === this.#runId) {
        this.#discovering = false;
        this.#rescanBtn.classList.remove('spinning');
      }
    }
  }

  async #pingOk() {
    try { return await this.#api.ping(); } catch { return false; }
  }

  // ── Connexion ──────────────────────────────────────────────
  async #handleLogin() {
    if (this.#busy) return;

    const user = this.#userInput.value.trim();
    const pass = this.#passInput.value;
    if (!user || !pass) {
      showToast("Identifiant ou mot de passe manquant", "warn");
      return;
    }

    this.#setBusy(true);
    try {
      let serverUrl = this.#urlInput.value.trim();

      // Pas d'adresse : on la cherche, sans obliger le prof à relancer.
      if (!serverUrl) {
        serverUrl = await this.#runDiscovery({ force: true });
        if (!serverUrl) {
          showToast("Serveur introuvable — saisissez son adresse", "warn", 4000);
          return;
        }
      } else {
        ServerDiscovery.cancel();          // une recherche en arrière-plan ne doit pas gêner la connexion
        this.#discovering = false;
        this.#rescanBtn.classList.remove('spinning');
        this.#urlInput.value = this.#api.setBaseUrl(serverUrl, { persist: false });   // normalisée, mais pas mémorisée tant qu'elle n'a pas servi
      }

      // Le serveur répond-il ? Sinon l'adresse est peut-être périmée
      // (IP attribuée par DHCP qui a changé) : un scan avant d'abandonner.
      this.#setStatus('Connexion au serveur…', 'busy');
      if (!await this.#pingOk()) {
        const found = await this.#runDiscovery({ force: true, skipSaved: true });
        if (!found || !await this.#pingOk()) {
          this.#setStatus('Serveur injoignable. Vérifiez le WiFi et l\'adresse.', 'warn');
          showToast("Serveur injoignable — vérifiez l'adresse et le réseau WiFi", "warn", 4000);
          return;
        }
      }

      await this.#auth.login(user, pass);
      this.#api.persistBaseUrl();
      this.#passInput.value = '';
      this.#closeLogin();
      this.#setLoggedInUi(true);
    } catch (e) {
      this.#setLoggedInUi(false);
      if (e.status === 401) {
        this.#setStatus('Identifiants incorrects.', 'warn');
        showToast("Identifiants incorrects", "warn");
      } else {
        const msg = describeNetError(e);
        this.#setStatus(msg, 'warn');
        showToast(msg, "warn", 5000);
      }
    } finally {
      this.#setBusy(false);
    }
  }
}

// ============================================================
//  point d'entrée unique
// ============================================================
const main = (() => {
  const api  = new ApiClient();
  const auth = new AuthManager(api);
  const sync  = new SyncManager( api, auth);
  const ui    = new UIController(auth, sync, api);

  return { api, auth, sync, ui };
})();
