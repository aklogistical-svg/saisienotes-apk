'use strict';

/* ============================================================
   CLASSE HandleStore — stockage FileSystemFileHandle        ✅ #10
   ============================================================ */
class HandleStore {
  #dexie;

  constructor() {
    this.#dexie = new Dexie('pathAdminSchoolMpr');
    // v1 utilisait une clé inline 'key' incompatible avec put(handle, key) (clé explicite) :
    // IndexedDB rejette cet appel (DataError), donc rien n'était jamais réellement stocké.
    // v2 passe en clé hors-ligne ('') pour que la clé explicite fonctionne.
    this.#dexie.version(1).stores({ mprhandles: 'key' });
    this.#dexie.version(2).stores({ mprhandles: '' });
  }

  async store(key, handle) {
    try   { await this.#dexie.table('mprhandles').put(handle, key); return true; }
    catch (e) {
      logger.warn('HandleStore.store fail', e);
      try { showToast(`❌ Échec mémorisation du chemin : ${e?.message || e}`, 'error', 8000); } catch (_) {}
      return false;
    }
  }

  async load(key) {
    try   { return await this.#dexie.table('mprhandles').get(key) ?? null; }
    catch (e) { logger.warn('HandleStore.load fail', e); return null; }
  }
}

/* ============================================================
   CLASSE DraftStore — stockage brouillons                   ✅ #10
   ============================================================ */
class DraftStore {
  #dexie;

  constructor() {
    this.#dexie = new Dexie('draftAdminSchoolMpr');
    this.#dexie.version(1).stores({ mprdrafts: 'id' });
  }

  async save(draft) {
    // Lance l'exception vers l'appelant — le retry est géré par DraftManager
    await this.#dexie.table('mprdrafts').put(draft);
  }

  async load(id) {
    try   { return await this.#dexie.table('mprdrafts').get(id) ?? null; }
    catch (e) { logger.warn('DraftStore.load fail', e); return null; }
  }

  async delete(id) {
    try   { await this.#dexie.table('mprdrafts').delete(id); return true; }
    catch (e) { logger.warn('DraftStore.delete fail', e); return false; }
  }
}

/* ============================================================
   CLASSE DraftManager — sauvegarde automatique              ✅ #2 #16
   ============================================================ */
class DraftManager {
  #timer      = null;
  #store;
  #retryCount = 0;

  constructor(draftStore) {
    this.#store = draftStore;
  }

  /* ── clé de brouillon ─────────────────────────────────── */
  #key() {
    const id = state.get('currentSourceId');
    return id ? `draft_S${id}` : null;
  }

  /* ── construction du payload ──────────────────────────── */
  /* Ne sauvegarde que les champs de notes + identifiant — pas les données fixes */
  #buildPayload(sourceId, rowNotes) {
    const noteKeys = [CONFIG.idField, ...CONFIG.noteFields, CONFIG.compoField, CONFIG.optionField, 'nbrenote'];
    const delta = rowNotes.map(r =>
      noteKeys.reduce((acc, k) => { if (k in r) acc[k] = r[k]; return acc; }, {})
    );
    return {
      id      : `draft_S${sourceId}`,
      savedAt : new Date().toISOString(),
      rowNotes: delta,
    };
  }

  /* ── flush immédiat vers IDB (sans debounce) ──────────── */
  async #flush() {
    const key = this.#key();
    if (!key) return;

    const payload = this.#buildPayload(
      state.get('currentSourceId'),
      state.get('rowNotes'),
    );

    const maxRetries = CONFIG.idbMaxRetries ?? 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.#store.save(payload);
        // Succès : on réinitialise le compteur et on efface le flag d'erreur
        this.#retryCount = 0;
        if (state.get('idbError')) {
          state.set('idbError', false);
          showToast('Sauvegarde automatique rétablie', 'success');
        }
        return;
      } catch (e) {
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
          logger.warn(`DraftManager flush — tentative ${attempt + 1}/${maxRetries}, retry dans ${delay}ms`, e);
          await new Promise(res => setTimeout(res, delay));
        } else {
          // Toutes les tentatives épuisées
          this.#retryCount++;
          logger.error('DraftManager flush — échec définitif après retries', e);
          if (!state.get('idbError')) {
            state.set('idbError', true);
            showToast('Sauvegarde automatique indisponible — exportez vos données avant de fermer.',
              'error',4000
            );
          }
        }
      }
    }
  }

  /* ── planifie un flush debounced ──────────────────────── */
  schedule() {
    const key = this.#key();
    if (!key) return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(async () => {
      this.#timer = null;
      await this.#flush();
    }, CONFIG.draftDelay);
  }

  /* ── annule le timer en attente ───────────────────────── */
  cancel() {
    if (this.#timer) { clearTimeout(this.#timer); this.#timer = null; }
  }

  /* ── flush immédiat + annulation du timer ─────────────── */
  // À appeler avant fermeture de fichier ou export critique
  async flushNow() {
    this.cancel();
    await this.#flush();
  }

  /* ── restauration au chargement ───────────────────────── */
  async tryRestore(onRestored) {
    const key = this.#key();
    if (!key) return null;
    try {
      const draft = await this.#store.load(key);
      if (!draft || !Array.isArray(draft.rowNotes)) return null;

      // Fusionner le delta sauvegardé dans le rowNotes complet déjà chargé
      const fullRows = state.get('rowNotes');
      const deltaMap = new Map(draft.rowNotes.map(d => [String(d[CONFIG.idField]), d]));
      const noteKeys = [...CONFIG.noteFields, CONFIG.compoField, CONFIG.optionField, 'nbrenote'];
      const merged = fullRows.map(r => {
        const d = deltaMap.get(String(r[CONFIG.idField]));
        if (!d) return r;
        const patched = { ...r };
        noteKeys.forEach(k => { if (k in d) patched[k] = d[k]; });
        return patched;
      });

      state.set('rowNotes', merged);
      state.set('unsaved',  true);

      if (typeof onRestored === 'function') onRestored(draft);
      return draft;
    } catch (e) {
      logger.warn('DraftManager.tryRestore failed', e);
      return null;
    }
  }

  /* ── suppression du brouillon courant ─────────────────── */
  async deleteCurrent() {
    this.cancel();
    const key = this.#key();
    if (key) await this.#store.delete(key);
  }
}

