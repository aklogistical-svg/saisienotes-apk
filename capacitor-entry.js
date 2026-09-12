// Point d'entrée bundlé — expose Filesystem/Haptics/Directory/Encoding
// en global window.CapPlugins pour usage direct dans index.html (pas de <script type=module>)
import { registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Share } from '@capacitor/share';

// Plugin natif custom (voir android/.../DownloadsSaverPlugin.java) : écrit
// proprement dans le dossier public Downloads (MediaStore Android 10+, sinon
// écriture directe + permission WRITE_EXTERNAL_STORAGE sur Android 9 et moins).
const DownloadsSaver = registerPlugin('DownloadsSaver');

window.CapPlugins = { Filesystem, Directory, Encoding, Haptics, ImpactStyle, FilePicker, Share, DownloadsSaver };
