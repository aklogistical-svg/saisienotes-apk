package com.ecole.saisienotes;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.Inet4Address;
import java.net.InetAddress;

/**
 * Expose l'adresse IPv4 locale du téléphone sur le réseau WiFi actuel.
 *
 * Sert à déduire automatiquement le préfixe de sous-réseau (ex: "192.168.1")
 * pour scanner ce réseau à la recherche du serveur école, sans jamais
 * demander au prof de saisir une adresse IP à la main.
 *
 * Volontairement écrit sur-mesure plutôt que de dépendre d'un plugin
 * mDNS/Zeroconf tiers (écosystème fragmenté, souvent abandonné) : une
 * seule API Android standard et non dépréciée (ConnectivityManager),
 * aucune permission supplémentaire (ACCESS_NETWORK_STATE est déjà
 * déclarée dans le manifeste pour d'autres besoins).
 */
@CapacitorPlugin(name = "WifiInfo")
public class WifiInfoPlugin extends Plugin {

    @PluginMethod
    public void getLocalIp(PluginCall call) {
        try {
            ConnectivityManager cm =
                (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                call.reject("Service de connectivité indisponible");
                return;
            }

            Network network = cm.getActiveNetwork();
            if (network == null) {
                call.reject("Aucune connexion réseau active");
                return;
            }

            LinkProperties props = cm.getLinkProperties(network);
            if (props == null) {
                call.reject("Impossible de lire les informations réseau");
                return;
            }

            for (LinkAddress addr : props.getLinkAddresses()) {
                InetAddress ip = addr.getAddress();
                if (ip instanceof Inet4Address && !ip.isLoopbackAddress()) {
                    JSObject ret = new JSObject();
                    ret.put("ip", ip.getHostAddress());
                    call.resolve(ret);
                    return;
                }
            }

            call.reject("Aucune adresse IPv4 locale trouvée (WiFi désactivé ?)");
        } catch (Exception e) {
            call.reject("Échec de lecture de l'IP locale : " + e.getMessage(), e);
        }
    }
}
