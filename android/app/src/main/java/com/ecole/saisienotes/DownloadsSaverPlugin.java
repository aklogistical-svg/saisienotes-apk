package com.ecole.saisienotes;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Enregistre un fichier dans le dossier public "Downloads" de l'appareil.
 *
 * - Android 10+ (API 29+) : passe par MediaStore.Downloads. Aucune permission
 *   requise pour créer ses propres entrées dans cette collection publique
 *   (c'est le mécanisme prévu par le stockage scoped d'Android).
 * - Android 9 et moins (API ≤ 28) : écriture directe dans le dossier public
 *   Downloads, ce qui nécessite la permission WRITE_EXTERNAL_STORAGE — demandée
 *   à l'utilisateur seulement sur ces anciennes versions.
 */
@CapacitorPlugin(
    name = "DownloadsSaver",
    permissions = {
        @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage")
    }
)
public class DownloadsSaverPlugin extends Plugin {

    @PluginMethod
    public void saveFile(PluginCall call) {
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String data     = call.getString("data"); // base64 brut, sans préfixe "data:...;base64,"

        if (fileName == null || data == null) {
            call.reject("fileName et data sont requis");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveViaMediaStore(call, fileName, mimeType, data);
            return;
        }

        if (getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermsCallback");
            return;
        }
        saveLegacy(call, fileName, mimeType, data);
    }

    @PermissionCallback
    private void storagePermsCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            saveLegacy(call, call.getString("fileName"), call.getString("mimeType", "application/octet-stream"), call.getString("data"));
        } else {
            call.reject("Permission de stockage refusée — impossible d'enregistrer dans Downloads");
        }
    }

    private void saveViaMediaStore(PluginCall call, String fileName, String mimeType, String data) {
        try {
            ContentResolver resolver = getContext().getContentResolver();

            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri itemUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (itemUri == null) {
                call.reject("Impossible de créer le fichier dans Downloads");
                return;
            }

            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            try (OutputStream os = resolver.openOutputStream(itemUri)) {
                if (os == null) { call.reject("Flux d'écriture indisponible"); return; }
                os.write(bytes);
            }

            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(itemUri, values, null, null);

            JSObject ret = new JSObject();
            ret.put("uri", itemUri.toString());
            ret.put("fileName", fileName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Échec de l'écriture dans Downloads : " + e.getMessage(), e);
        }
    }

    private void saveLegacy(PluginCall call, String fileName, String mimeType, String data) {
        try {
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!downloadsDir.exists()) downloadsDir.mkdirs();
            File outFile = new File(downloadsDir, fileName);

            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                fos.write(bytes);
            }

            // Rend le fichier visible immédiatement dans les gestionnaires de fichiers/galerie
            MediaScannerConnection.scanFile(
                getContext(),
                new String[]{ outFile.getAbsolutePath() },
                new String[]{ mimeType },
                null
            );

            JSObject ret = new JSObject();
            ret.put("uri", Uri.fromFile(outFile).toString());
            ret.put("fileName", fileName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Échec de l'écriture dans Downloads : " + e.getMessage(), e);
        }
    }
}
