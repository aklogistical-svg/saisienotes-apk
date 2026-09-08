# Saisie Notes — App Android (Capacitor)

Conversion native de `index-v5-sept.html` en application Android autonome,
avec gestion des permissions natives (stockage, vibration) au lieu des API
web incompatibles avec une WebView (File System Access API notamment).

## Ce qui a été fait

- **Icône** : carnet de notes + validation + toque de graduation, dégradé
  bleu institutionnel. Générée en icône adaptative (fond + foreground
  séparés, testée sous masque circulaire) + icône plate pour Android < 8.
- **`FileManager`** (ouverture/sauvegarde des fichiers JSON de notes) :
  remplacé `showOpenFilePicker`/`showDirectoryPicker` (absents des WebView)
  par `@capawesome/capacitor-file-picker` + `@capacitor/filesystem`.
  Les fichiers sont lus/écrits dans `Documents/SaisieNotes/`.
- **`ExportManager`** (export CSV) : écriture native + partage via
  `@capacitor/share` (Drive, mail, WhatsApp, etc.).
- **Vibrations** : `navigator.vibrate` remplacé par `@capacitor/haptics`.
- **Dexie / Papaparse** : vendorisés en local dans `www/` (ils étaient
  chargés en `<script src="dexie.min.js">` mais absents du fichier fourni).
- **Détection tactile robuste** : `InteractionMode` (déjà discuté)
  combine `max-width` et `any-pointer: fine` pour ne plus activer le pavé
  numérique sur un PC à écran tactile.
- **Permissions déclarées** dans `AndroidManifest.xml` : `INTERNET`,
  `ACCESS_NETWORK_STATE`, `VIBRATE`, `READ/WRITE_EXTERNAL_STORAGE`
  (ces deux dernières seulement actives ≤ Android 12, au-delà le
  stockage scoped de l'app suffit).

## Prérequis pour builder

- Node.js 18+
- Android Studio (avec Android SDK installé) — **obligatoire**, cet
  environnement ne peut pas compiler d'APK signé (nécessite le SDK/JDK
  Android + Gradle, non disponibles ici).

## Commandes de build

```bash
# 1. Installer les dépendances JS
npm install

# 2. Rebuilder le bundle des plugins Capacitor si vous modifiez
#    capacitor-entry.js ou index.html
npm run build:bundle

# 3. Synchroniser web assets + plugins natifs vers le projet Android
npx cap sync android

# 4. Ouvrir dans Android Studio pour compiler/signer l'APK
npx cap open android
```

Dans Android Studio : **Build → Generate Signed Bundle / APK** →
choisissez APK, créez ou réutilisez un keystore, puis **release** pour
la version à distribuer (ou **debug** pour tester rapidement sur un
appareil/émulateur via le bouton ▶️).

## Arborescence

```
saisienotes-apk/
├── www/                      → assets web (index.html, dexie, papaparse, bundle Capacitor)
├── android/                  → projet natif Android généré par `cap add android`
│   └── app/src/main/res/mipmap-*/  → icônes déjà en place à toutes les résolutions
├── capacitor-entry.js        → source du bundle des plugins (Filesystem/Haptics/FilePicker/Share)
├── icon-source.svg           → icône source (icône plate, fond inclus)
├── icon-foreground.svg       → foreground de l'icône adaptative (sans fond)
├── capacitor.config.json
└── package.json
```

## Points de vigilance avant mise en production

- **appId** dans `capacitor.config.json` (`com.ecole.saisienotes`) —
  à adapter à votre nom de domaine inversé réel avant publication.
- **HTTPS obligatoire** : Android bloque le trafic non chiffré par défaut
  (`allowMixedContent: false` déjà réglé) — vérifiez que l'URL de votre
  serveur de synchronisation (`fetch` dans `SyncManager`) est bien en
  `https://`.
- **Signature de l'APK** : un keystore doit être créé et conservé en lieu
  sûr — sa perte empêche toute mise à jour future de l'app sur le Play
  Store.
