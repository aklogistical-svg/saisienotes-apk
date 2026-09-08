// Point d'entrée bundlé — expose Filesystem/Haptics/Directory/Encoding
// en global window.CapPlugins pour usage direct dans index.html (pas de <script type=module>)
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Share } from '@capacitor/share';

window.CapPlugins = { Filesystem, Directory, Encoding, Haptics, ImpactStyle, FilePicker, Share };
