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
//  API CLIENT
// ============================================================
class ApiClient {
  #baseUrl;

  constructor() {
    this.#baseUrl  = location.origin;
  }

  // ── En-têtes communs ───────────────────────────────────────
  #headers() {
    return {
      "Content-Type": "application/json",
      "userProfId": state.get('user_id'),
    };
  }

  // ── Fetch avec retry ───────────────────────────────────────
  async #safeFetch(url, options = {}, retries = 1) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (e) {
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

    const res = await this.#api.upload(data);
    if (res?.success) {showToast('Export réussi vers la centrale','success');
    } else {showToast('Erreur export vers la centrale','error');
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
    const res = await this.#api.download();

    if (res.error?.length > 0) console.warn(res.error);
    if (res.notes_mpr?.length > 0) {
     await this.#applique_data(res);
    }
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
    currentMeta = { ...currentMeta, forprof: data.user_nom };

    showToast("Connexion réussie. Charger ou Exporter");
    return data;
  }

  logout() {
    state.set('user_id', null);
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
      try {
        const resp = await this.#api.ping();
        if (!resp) throw new Error ();
        this.#loginPage.classList.add("show");
        this.#loginPage.querySelector(".closeg").onclick = () => this.#loginPage.classList.remove("show");
        document.getElementById("loginBtn").onclick = async () => await this.#handleLogin();
      } catch {
        showToast("Serveur indisponible","warn");
      }
    });
  }

  async #handleLogin() {
    const user = document.getElementById("userLogin").value;
    const pass = document.getElementById("passLogin").value;
    if (!user || !pass) {
      showToast("Identifiant(s) vide(s)","warn");
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
