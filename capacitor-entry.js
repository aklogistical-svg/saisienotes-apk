// Point d'entrée bundlé — expose Filesystem/Haptics/Directory/Encoding
// en global window.CapPlugins pour usage direct dans index.html (pas de <script type=module>)
import { registerPlugin, CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Share } from '@capacitor/share';

// Plugin natif custom (voir android/.../DownloadsSaverPlugin.java) : écrit
// proprement dans le dossier public Downloads (MediaStore Android 10+, sinon
// écriture directe + permission WRITE_EXTERNAL_STORAGE sur Android 9 et moins).
const DownloadsSaver = registerPlugin('DownloadsSaver');

// Plugin natif custom (voir android/.../WifiInfoPlugin.java) : lit l'IP
// locale du téléphone sur le WiFi, force le trafic de l'app à passer par
// le WiFi (même sans Internet) et scanne le réseau local à la recherche
// du serveur école (voir ServerDiscovery dans sync.js).
const WifiInfo = registerPlugin('WifiInfo');

// Client HTTP natif de Capacitor (HttpURLConnection) : contourne CORS et
// applique de vrais délais de connexion/lecture. Utilisé explicitement
// par ApiClient (sync.js) — inutile d'activer le patch global de fetch.
const Http = CapacitorHttp;

window.CapPlugins = { Filesystem, Directory, Encoding, Haptics, ImpactStyle, FilePicker, Share, DownloadsSaver, WifiInfo, Http };
