'use strict';

/* ============================================================
   CLASSE FileManager — ouverture + sauvegarde JSON
   ============================================================ */
class FileManager {
  #handle = null; // { path, directory } en mode natif Capacitor

  canWrite() {
    return !!this.#handle;
  }

  setHandle(h)   { this.#handle = h; }
  clearHandle()  { this.#handle = null; }

  #buildJSONName(meta) {
    const d       = new Date();
    const pad     = n => String(n).padStart(2, '0');
    const profnom = meta?.forprof ?? 'notes';
    return `Notes_${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}_${profnom.replace(/[^\p{L}]/gu, '_')}.json`;
  }

  // ── Ouverture via le sélecteur de fichiers natif Android/iOS ──
  async open() {
    try {
      const result = await CapPlugins.FilePicker.pickFiles({
        // application/octet-stream : sur Android 9 et antérieur (et certains
        // gestionnaires de fichiers tiers), les .json sont rapportés avec ce
        // type MIME générique au lieu d'application/json — sans ça, le
        // sélecteur système exclut purement et simplement ces fichiers.
        types    : ['application/json', 'application/octet-stream'],
        readData : true,       // renvoie le contenu en base64 directement
        multiple : false,
      });
      const picked = result?.files?.[0];
      if (!picked) return;

      // atob() seul renvoie une chaîne "binaire" (1 octet = 1 caractère) ;
      // traiter ça comme du texte directement corrompt tous les accents
      // UTF-8 multi-octets (ex. "Sétou" devient "SÃ©tou"). TextDecoder
      // reconstitue correctement le texte à partir des octets décodés.
      const bytes = Uint8Array.from(atob(picked.data), c => c.charCodeAt(0));
      const text  = new TextDecoder('utf-8').decode(bytes);
      const fileShim = {
        name     : picked.name,
        mimeType : picked.mimeType,
        text     : async () => text,
      };

      // Le fichier choisi devient la destination d'enregistrement suivante,
      // dans le dossier applicatif dédié (SaisieNotes/)
      this.#handle = { path: `SaisieNotes/${picked.name}`, directory: CapPlugins.Directory.External };
      await handleStore.store('lastJSON', this.#handle);

      const loaded = await loadJSONDataset(fileShim, true);

      // ✅ #25 — Garde immédiatement une copie sur disque dès l'ouverture (si le fichier
      // est valide), pour que la restauration automatique au prochain lancement fonctionne
      // même si l'utilisateur n'a pas encore appuyé sur "Enregistrer".
      if (loaded) await this.#persistSnapshot();
    } catch (e) {
      if (e?.message?.includes('cancelled') || e?.code === 'cancelled') return;
      logger.warn('FilePicker error', e);
      showToast('Impossible d\'ouvrir le fichier', 'error');
    }
  }

  // ── Écrit l'état courant sur disque, juste après l'ouverture ──
  // Garantit qu'un fichier existe physiquement même sans clic sur "Enregistrer".
  async #persistSnapshot() {
    if (!this.#handle) {
      showToast('⚠️ #persistSnapshot : aucun handle défini', 'warn', 6000);
      return;
    }
    const rowNotesToSave = state.get('rowNotes');
    if (!Array.isArray(rowNotesToSave) || !rowNotesToSave.length) {
      logger.warn('#persistSnapshot annulé : rowNotes vide, écriture bloquée par sécurité');
      showToast('⚠️ Copie automatique annulée : données vides détectées', 'warn', 6000);
      return;
    }
    try {
      const payload = {
        notes_mpr    : state.get('rowNotes'),
        matieres_mpr : state.get('rowMatieres'),
        infos_mpr    : currentMeta,
      };
      await CapPlugins.Filesystem.writeFile({
        path      : this.#handle.path,
        directory : this.#handle.directory,
        data      : JSON.stringify(payload, null, 2),
        encoding  : CapPlugins.Encoding.UTF8,
        recursive : true,
      });
      // ✅ #26 diagnostic — confirmation visible que la copie a bien été écrite
      showToast(`💾 Copie mémorisée : ${this.#handle.path}`, 'success', 4000);
    } catch (e) {
      // ✅ #26 diagnostic — rendu visible : sinon la restauration auto échoue en silence
      logger.warn('FileManager.#persistSnapshot failed', e);
      showToast(`❌ Échec mémorisation fichier : ${e?.message || e}`, 'error', 8000);
    }
  }

  async save() {
    if (!state.get('unsaved')) {
      showToast('Aucune modification à enregistrer', 'warn');
      return { ok: false, reason: 'no_changes' };
    }

    // Garde-fou anti-perte de données : n'écrase jamais un fichier existant
    // par un contenu vide, quelle qu'en soit la cause.
    const rowNotesToSave = state.get('rowNotes');
    if (!Array.isArray(rowNotesToSave) || !rowNotesToSave.length) {
      showErrorToast({
        title  : 'Sauvegarde bloquée par sécurité',
        detail : 'Aucune donnée en mémoire — enregistrer écraserait le fichier existant avec un contenu vide.<br>Rechargez le fichier source avant de réessayer.',
        actions: [{ label: '📂 Recharger un fichier', style: 'primary', onClick: () => dom.openBtn.click() }],
      });
      return { ok: false, reason: 'empty_data' };
    }

    showOverlay();
    if (!validateAllNotes()) { hideOverlay(); return; }

    if (!this.#handle) {
      // Première sauvegarde : fichier créé automatiquement dans le dossier de l'app
      this.#handle = {
        path     : `SaisieNotes/${this.#buildJSONName(currentMeta)}`,
        directory: CapPlugins.Directory.External,
      };
      await handleStore.store('lastJSON', this.#handle);
    }

    try {
      const payload = {
        notes_mpr    : state.get('rowNotes'),
        matieres_mpr : state.get('rowMatieres'),
        infos_mpr    : currentMeta,
      };
      await CapPlugins.Filesystem.writeFile({
        path      : this.#handle.path,
        directory : this.#handle.directory,
        data      : JSON.stringify(payload, null, 2),
        encoding  : CapPlugins.Encoding.UTF8,
        recursive : true,
      });
      state.set('unsaved', false);
      dom.msgState.textContent = '✅Enregistré';
      await draftManager.deleteCurrent();

      // Affiche l'emplacement exact + permet de partager immédiatement le fichier
      const { uri } = await CapPlugins.Filesystem.getUri({
        path: this.#handle.path, directory: this.#handle.directory,
      });
      showActionToast({
        variant: 'success', icon: '✅',
        title  : 'Enregistré',
        detail : `Fichier : <code>${this.#handle.path}</code><br>Appuyez sur "Partager" pour l'envoyer vers Drive, mail, etc.`,
        actions: [
          { label: '📤 Partager', style: 'primary', onClick: () => CapPlugins.Share.share({ title: 'Fichier de notes', url: uri }).catch(() => {}) },
        ],
      });
      return { ok: true };
    } catch (e) {
      logger.error('FileManager.save error', e);
      showErrorToast({
        title  : 'Échec de l\'enregistrement',
        detail : 'L\'écriture du fichier a échoué. Réessayez ou choisissez un autre fichier.',
        actions: [
          { label: '🔁 Réessayer', style: 'primary', onClick: () => this.save() },
          { label: '📂 Choisir un fichier', style: 'secondary', onClick: () => dom.openBtn.click() },
        ],
      });
      return { ok: false, reason: 'write_failed' };
    } finally {
      hideOverlay();
    }
  }

  // ── Restauration automatique du dernier fichier ouvert (mode natif) ──
  async tryAutoRestore() {
    try {
      const h = await handleStore.load('lastJSON');
      // ✅ #26 diagnostic — distingue "jamais rien enregistré" de "échec de restauration"
      if (!h?.path) {
        showToast('🔍 Aucun fichier précédent mémorisé', 'warn', 4000);
        return;
      }

      const stat = await CapPlugins.Filesystem.stat({
        path: h.path, directory: h.directory,
      }).catch((err) => { logger.warn('stat failed', err); return null; });

      if (!stat) {
        // Le fichier n'existe plus à cet emplacement
        showToast(`⚠️ Fichier précédent introuvable : ${h.path}`, 'warn', 6000);
        return;
      }

      this.#handle = h;
      const result = await CapPlugins.Filesystem.readFile({
        path: h.path, directory: h.directory, encoding: CapPlugins.Encoding.UTF8,
      });
      const fileShim = { name: h.path.split('/').pop(), text: async () => result.data };
      const loaded = await loadJSONDataset(fileShim, true);
      if (loaded) showToast(`🔄 Restauré automatiquement : ${h.path}`, 'success', 4000);
    } catch (e) {
      logger.warn('FileManager.tryAutoRestore failed', e);
      showToast(`❌ Échec restauration auto : ${e?.message || e}`, 'error', 8000);
    }
  }
}

/* ============================================================
   CLASSE ExportManager — export CSV                         ✅ #3 #17
   ============================================================ */
class ExportManager {
  // ✅ #3 — reçoit meta en paramètre, ne lit plus le DOM
  #buildName(meta) {
    const d      = new Date();
    const pad    = n => String(n).padStart(2, '0');
    const profnom = meta?.forprof ?? 'export';
    return `Saisie_${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}_${profnom.replace(/[^\p{L}]/gu, '_')}.csv`;
  }

  #buildBlob() {
    if (typeof Papa === 'undefined') {
      showToast('Librairie papaparse introuvable — téléchargement impossible', 'error');
      throw new Error('papaparse not loaded');
    }
    const fields = CONFIG.exportFields;
    const data   = state.get('rowNotes').map(r => fields.map(f => r[f] ?? ''));
    const csv    = Papa.unparse({ fields, data }, { delimiter: CONFIG.csvDelimiter, newline: '\n', quotes: true });
    return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  }

  #blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async export() {
    const rowNotes = state.get('rowNotes');
    if (!Array.isArray(rowNotes) || !rowNotes.length) {
      showErrorToast({
        title  : 'Aucune donnée à exporter',
        detail : 'Chargez d\'abord un fichier de notes avant d\'exporter.',
        actions: [{ label: '📂 Charger un fichier', style: 'primary', onClick: () => dom.openBtn.click() }],
      });
      return;
    }
    if (!validateAllNotes()) { return; }
    showOverlay('Exportation en cours…');
    if (state.get('user_id')) { await main.sync.exportdt(); hideOverlay(); return; }

    try {
      const blob       = this.#buildBlob();
      const exportName = this.#buildName(currentMeta);
      const csvText    = await blob.text();

      // 1. Écriture native dans Documents/SaisieNotes/exports/
      const exportPath = `SaisieNotes/exports/${exportName}`;
      await CapPlugins.Filesystem.writeFile({
        path      : exportPath,
        directory : CapPlugins.Directory.External,
        data      : csvText,
        encoding  : CapPlugins.Encoding.UTF8,
        recursive : true,
      });
      const { uri } = await CapPlugins.Filesystem.getUri({
        path: exportPath, directory: CapPlugins.Directory.External,
      });

      showToast(`Export réussi — ${exportName}`, 'success', 4000);

      // 2. Propose le partage natif (Drive, email, WhatsApp, etc.)
      await CapPlugins.Share.share({
        title: 'Export notes CSV',
        text : exportName,
        url  : uri,
        dialogTitle: 'Partager le fichier CSV',
      }).catch(() => {}); // annulation du partage = pas une erreur
    } catch (err) {
      logger.error('ExportManager.export error', err);
      showErrorToast({
        title  : 'Erreur inattendue lors de l\'export',
        detail : err?.message ?? '',
        actions: [
          { label: '🔄 Réessayer', style: 'primary', onClick: () => exportManager.export() },
        ],
      });
    } finally {
      hideOverlay();
    }
  }

  // ✅ Copie propre du CSV dans le dossier public Downloads de l'appareil,
  // via le plugin natif DownloadsSaver (MediaStore Android 10+, permission
  // WRITE_EXTERNAL_STORAGE seulement sur Android 9 et moins). Pas de boîte
  // de partage : fluide, silencieux, retrouvable dans Downloads.
  async downloadToDownloads() {
    const rowNotes = state.get('rowNotes');
    if (!Array.isArray(rowNotes) || !rowNotes.length) {
      showErrorToast({
        title  : 'Aucune donnée à télécharger',
        detail : 'Chargez d\'abord un fichier de notes avant de télécharger.',
        actions: [{ label: '📂 Charger un fichier', style: 'primary', onClick: () => dom.openBtn.click() }],
      });
      return;
    }
    if (!validateAllNotes()) { return; }
    if (!CapPlugins?.DownloadsSaver) {
      showToast('Téléchargement indisponible sur cette plateforme', 'warn');
      return;
    }
    showOverlay('Téléchargement en cours…');
    try {
      const blob     = this.#buildBlob();
      const fileName = this.#buildName(currentMeta);
      const data     = await this.#blobToBase64(blob);

      await CapPlugins.DownloadsSaver.saveFile({ fileName, mimeType: 'text/csv', data });

      showToast(`Téléchargé dans Downloads — ${fileName}`, 'success', 4000);
    } catch (err) {
      logger.error('ExportManager.downloadToDownloads error', err);
      showErrorToast({
        title  : 'Échec du téléchargement',
        detail : err?.message ?? '',
        actions: [
          { label: '🔄 Réessayer', style: 'primary', onClick: () => exportManager.downloadToDownloads() },
        ],
      });
    } finally {
      hideOverlay();
    }
  }
}

/* ============================================================
   INSTANCES
   ============================================================ */
const handleStore   = new HandleStore();
const draftStore    = new DraftStore();
const draftManager  = new DraftManager(draftStore);
const fileManager   = new FileManager();
const exportManager = new ExportManager();

