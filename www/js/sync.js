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
//  DÉCOUVERTE AUTOMATIQUE DU SERVEUR SUR LE RÉSEAU LOCAL
// ============================================================
// Principe : le téléphone lit sa propre IP WiFi (plugin natif WifiInfo,
// voir android/.../WifiInfoPlugin.java), en déduit le sous-réseau
// (ex: "192.168.1"), puis teste chaque adresse candidate via /whoami —
// un endpoint léger qui confirme qu'il s'agit bien DU serveur école (pas
// un autre appareil qui répondrait par hasard sur le même port).
//
// Pas de mDNS/Zeroconf tiers : écosystème de plugins Capacitor fragmenté
// et souvent abandonné, et risque réel que le WiFi de l'école bloque le
// trafic multicast. Pas de WebRTC pour deviner l'IP locale non plus :
// Chrome/Android masque volontairement cette IP depuis 2020 (mDNS
// obfuscation anti-fingerprinting), cette astuce ne fonctionne plus de
// façon fiable sur les navigateurs/WebView récents.
const ServerDiscovery = (() => {
  const PORT = 8000;
  const EXPECTED_SERVICE = 'adminschool-platform_api';
  const SCAN_TIMEOUT_MS = 800;
  const CONCURRENCY = 24;

  async function isOurServer(baseUrl) {
    if (!baseUrl) return false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SCAN_TIMEOUT_MS);
    try {
      const res = await fetch(`${baseUrl}/whoami`, { signal: ctrl.signal });
      if (!res.ok) return false;
      const data = await res.json();
      return data.service === EXPECTED_SERVICE;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function guessLocalSubnetPrefix() {
    try {
      const { ip } = await window.CapPlugins.WifiInfo.getLocalIp();
      const parts = (ip || '').split('.');
      return parts.length === 4 ? parts.slice(0, 3).join('.') : null;
    } catch {
      return null; // WiFi coupé, pas sur Capacitor, permission refusée, etc.
    }
  }

  async function scanSubnet(prefix) {
    for (let start = 1; start <= 254; start += CONCURRENCY) {
      const batch = [];
      for (let n = start; n < start + CONCURRENCY && n <= 254; n++) {
        const url = `http://${prefix}.${n}:${PORT}`;
        batch.push(isOurServer(url).then(ok => ok ? url : null));
      }
      const found = (await Promise.all(batch)).find(Boolean);
      if (found) return found;
    }
    return null;
  }

  // Point d'entrée : réessaie d'abord l'adresse déjà connue (instantané
  // si elle marche encore), sinon relance un scan complet du réseau.
  async function discover(savedUrl) {
    if (await isOurServer(savedUrl)) return savedUrl;

    const prefix = await guessLocalSubnetPrefix();
    if (!prefix) return null;

    return scanSubnet(prefix);
  }

  return { discover };
})();

// ============================================================
//  API CLIENT
// ============================================================
class ApiClient {
  #baseUrl;

  constructor() {
    // ⚠ Dans l'APK packagé (Capacitor), location.origin vaut toujours
    // "https://localhost" (l'origine interne de la WebView), jamais
    // l'adresse réseau du serveur école — la sync ne pouvait donc
    // techniquement jamais fonctionner. L'adresse est maintenant saisie
    // une fois par le prof (écran de connexion) et persistée sur
    // l'appareil (localStorage, propre au téléphone, jamais partagée).
    this.#baseUrl = localStorage.getItem('server_url') || '';
  }

  getBaseUrl() {
    return this.#baseUrl;
  }

  // Normalise ("192.168.1.50:8000" → "http://192.168.1.50:8000") et
  // enlève un éventuel "/" final avant de sauvegarder.
  setBaseUrl(url) {
    let clean = (url || '').trim().replace(/\/+$/, '');
    if (clean && !/^https?:\/\//i.test(clean)) clean = `http://${clean}`;
    this.#baseUrl = clean;
    localStorage.setItem('server_url', clean);
    return clean;
  }

  // ── En-têtes communs ───────────────────────────────────────
  // Le token JWT (reçu au login) est ajouté automatiquement dès qu'il
  // existe — /login n'en a pas besoin, /sync/upload et /sync/download si.
  #headers() {
    const headers = { "Content-Type": "application/json" };
    const token = state.get('token');
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  // ── Fetch avec retry ───────────────────────────────────────
  // Un 401 (session expirée/absente) ne doit jamais être relancé : ça ne
  // réussira pas sans reconnexion, autant échouer tout de suite plutôt
  // que perdre une seconde sur une tentative vouée à échouer.
  async #safeFetch(url, options = {}, retries = 1) {
    try {
      const res = await fetch(url, options);
      if (res.status === 401) {
        const err = new Error('HTTP 401');
        err.status = 401;
        throw err;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (e) {
      if (e.status === 401) throw e;
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 1000));
        return this.#safeFetch(url, options, retries - 1);
      }
      throw e;
    }
  }

  // ── Endpoints ──────────────────────────────────────────────
  ping() {
    return this.#baseUrl.startsWith('http') ? this.#safeFetch(`${this.#baseUrl}/ping`) : null;
  }

  login(user, password) {
    return this.#safeFetch(`${this.#baseUrl}/login`, {
      method: "POST",
      headers: this.#headers(),
      body: JSON.stringify({ user, password })
    });
  }

  upload(changes) {
    return this.#safeFetch(`${this.#baseUrl}/sync/upload`, {
      method: "POST",
      headers: this.#headers(),
      body: JSON.stringify({ changes })
    });
  }

  download() {
    return this.#safeFetch(
      `${this.#baseUrl}/sync/download`, { headers: this.#headers() }
    );
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
  async exportdt() {
    await this.#ensureAuth();
    const data = await this.#buildData();
    if (!data) return;

    try {
      const res = await this.#api.upload(data);
      if (res?.success) { showToast('Export réussi vers la centrale', 'success');
      } else { showToast('Erreur export vers la centrale', 'error');
      }
    } catch (e) {
      if (e.status === 401) { this.#handleSessionExpired(); return; }
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

    let res;
    try {
      res = await this.#api.download();
    } catch (e) {
      if (e.status === 401) { this.#handleSessionExpired(); return; }
      throw e;
    }

    if (res.error?.length > 0) console.warn(res.error);
    if (res.notes_mpr?.length > 0) {
     await this.#applique_data(res);
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

    if (!data.success) throw new Error("Login failed");

    this.#userId = data.user_id;
    state.set('user_id', this.#userId);
    state.set('token', data.token);
    currentMeta = { ...currentMeta, forprof: data.user_nom };

    showToast("Connexion réussie. Charger ou Exporter");
    return data;
  }

  logout() {
    state.set('user_id', null);
    state.set('token', null);
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

  constructor(auth, sync, api) {
    this.#auth     = auth;
    this.#sync     = sync;
    this.#api      = api
    this.#loginPage = document.getElementById("loginPage");
    this.#btnNet = document.getElementById('netToggle');
    this.#indicator = document.getElementById('netIndicator');
    this.#bindEvents();
  }

  // ── Binding des événements ─────────────────────────────────
  #bindEvents() {
    this.#btnNet.addEventListener('click', async () => {
      showToast("Recherche du serveur sur le réseau...", "info");
      const found = await ServerDiscovery.discover(this.#api.getBaseUrl());
      if (found) {
        this.#api.setBaseUrl(found);
        showToast("Serveur trouvé automatiquement", "success");
      } else if (!this.#api.getBaseUrl()) {
        showToast("Serveur non trouvé — indiquez son adresse manuellement", "warn");
      }
      // Repli : le champ reste modifiable (préempli si trouvé/déjà connu,
      // vide sinon) — le prof peut toujours corriger à la main.
      document.getElementById("serverUrlInput").value = this.#api.getBaseUrl();
      this.#loginPage.classList.add("show");
      this.#loginPage.querySelector(".closeg").onclick = () => this.#loginPage.classList.remove("show");
      document.getElementById("loginBtn").onclick = async () => await this.#handleLogin();
    });
  }

  async #handleLogin() {
    const serverUrl = document.getElementById("serverUrlInput").value;
    const user = document.getElementById("userLogin").value;
    const pass = document.getElementById("passLogin").value;

    if (!serverUrl || !user || !pass) {
      showToast("Adresse, identifiant ou mot de passe manquant", "warn");
      return;
    }

    this.#api.setBaseUrl(serverUrl);

    try {
      const resp = await this.#api.ping();
      if (!resp) throw new Error();
    } catch {
      showToast("Serveur injoignable — vérifiez l'adresse et le réseau WiFi", "warn");
      return;
    }

    try {
      await this.#auth.login(user, pass);
      this.#loginPage.classList.remove("show");
      this.#indicator.classList.add('active');
    } catch {
      showToast("Identifiants incorrects","warn");
      this.#indicator.classList.remove('active');
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
