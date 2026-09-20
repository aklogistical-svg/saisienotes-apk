package com.ecole.saisienotes;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;

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
 * ⚠ Version corrigée : cible explicitement le réseau WiFi via
 * getAllNetworks() + TRANSPORT_WIFI, plutôt que getActiveNetwork().
 * getActiveNetwork() retourne le réseau "par défaut" du téléphone, et
 * Android bascule souvent celui-ci sur les données mobiles quand le WiFi
 * connecté n'a pas d'accès Internet — exactement le cas d'un WiFi d'école
 * qui ne sert qu'à joindre un serveur local. Avec l'ancienne version, le
 * plugin pouvait donc renvoyer l'IP des données mobiles au lieu du WiFi,
 * et le scan cherchait alors sur le mauvais sous-réseau.
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

            for (Network network : cm.getAllNetworks()) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                if (caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    continue; // on ignore données mobiles, VPN, etc. — WiFi uniquement
                }

                LinkProperties props = cm.getLinkProperties(network);
                if (props == null) continue;

                for (LinkAddress addr : props.getLinkAddresses()) {
                    InetAddress ip = addr.getAddress();
                    if (ip instanceof Inet4Address && !ip.isLoopbackAddress()) {
                        JSObject ret = new JSObject();
                        ret.put("ip", ip.getHostAddress());
                        call.resolve(ret);
                        return;
                    }
                }
            }

            call.reject("Aucune adresse IPv4 WiFi trouvée (WiFi désactivé ou non connecté ?)");
        } catch (Exception e) {
            call.reject("Échec de lecture de l'IP locale : " + e.getMessage(), e);
        }
    }
}

