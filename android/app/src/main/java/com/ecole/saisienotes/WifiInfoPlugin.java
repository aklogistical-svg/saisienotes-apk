package com.ecole.saisienotes;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.RouteInfo;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Réseau local pour l'app Saisie Notes :
 *
 *  - getLocalIp()  : IP / préfixe / passerelle du téléphone sur le WiFi.
 *  - bindToWifi()  : force TOUT le trafic de l'app (WebView + HTTP natif) à
 *                    passer par le WiFi, même s'il n'a pas d'accès Internet.
 *  - scan()        : cherche le serveur école sur le réseau local, en natif.
 *  - cancelScan()  : interrompt un scan en cours.
 *
 * Pourquoi bindToWifi() : quand le WiFi de l'école n'a pas Internet (cas
 * normal : il ne sert qu'à joindre le serveur), Android garde les DONNÉES
 * MOBILES comme réseau par défaut. Les sockets de l'app partent alors par
 * la 4G/5G, qui ne connaît évidemment pas 192.168.x.x : la requête échoue
 * même avec la bonne adresse. Lire la bonne IP WiFi ne suffit pas, il faut
 * aussi lier le processus au réseau WiFi (ConnectivityManager
 * .bindProcessToNetwork). Aucune permission supplémentaire n'est requise.
 *
 * Pourquoi un scan natif plutôt que fetch() depuis la WebView :
 *  - pas de CORS, pas de restriction WebView ;
 *  - connexion TCP brute très rapide (délai 400 ms) sur ~96 fils en
 *    parallèle, puis vérification d'identité (/whoami) uniquement sur les
 *    hôtes qui ont un port ouvert : un /24 complet se balaie en ~1 s ;
 *  - sockets créés via Network.getSocketFactory() : ils passent par le
 *    WiFi sans dépendre d'un éventuel bindProcessToNetwork ;
 *  - respecte le vrai masque du réseau (jusqu'à /22) au lieu de supposer
 *    un /24 ; balaie aussi les interfaces de point d'accès (hotspot du
 *    téléphone) et USB.
 */
@CapacitorPlugin(name = "WifiInfo")
public class WifiInfoPlugin extends Plugin {

    /** Masque minimal balayé (/22 = 1022 hôtes). Plus large : repli sur un /24. */
    private static final int MIN_PREFIX = 22;
    private static final int THREADS = 96;
    private static final int MAX_HOSTS = 2100;

    /** Session de scan en cours (une seule à la fois). */
    private static class ScanSession {
        final AtomicBoolean cancelled = new AtomicBoolean(false);
        volatile ExecutorService pool;
    }

    private volatile ScanSession activeSession;

    /** Photo du réseau WiFi courant. */
    private static class WifiSnapshot {
        Network network;
        Inet4Address ip;
        int prefix;
        Inet4Address gateway;
    }

    // ------------------------------------------------------------------
    //  Lecture du réseau WiFi
    // ------------------------------------------------------------------

    @SuppressWarnings("deprecation") // getAllNetworks() : déprécié API 31 mais toujours fonctionnel
    private WifiSnapshot findWifi(ConnectivityManager cm) {
        for (Network network : cm.getAllNetworks()) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            if (caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                continue; // on ignore données mobiles, VPN, etc.
            }
            LinkProperties props = cm.getLinkProperties(network);
            if (props == null) continue;

            for (LinkAddress addr : props.getLinkAddresses()) {
                InetAddress ip = addr.getAddress();
                if (ip instanceof Inet4Address && !ip.isLoopbackAddress()) {
                    WifiSnapshot snap = new WifiSnapshot();
                    snap.network = network;
                    snap.ip = (Inet4Address) ip;
                    snap.prefix = addr.getPrefixLength();
                    for (RouteInfo route : props.getRoutes()) {
                        InetAddress gw = route.getGateway();
                        if (route.isDefaultRoute() && gw instanceof Inet4Address) {
                            snap.gateway = (Inet4Address) gw;
                            break;
                        }
                    }
                    return snap;
                }
            }
        }
        return null;
    }

    private ConnectivityManager connectivity() {
        return (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
    }

    @PluginMethod
    public void getLocalIp(PluginCall call) {
        try {
            ConnectivityManager cm = connectivity();
            if (cm == null) {
                call.reject("Service de connectivité indisponible");
                return;
            }
            WifiSnapshot wifi = findWifi(cm);
            if (wifi == null) {
                call.reject("Aucune adresse IPv4 WiFi trouvée (WiFi désactivé ou non connecté ?)");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("ip", wifi.ip.getHostAddress());
            ret.put("prefixLength", wifi.prefix);
            if (wifi.gateway != null) ret.put("gateway", wifi.gateway.getHostAddress());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Échec de lecture de l'IP locale : " + e.getMessage(), e);
        }
    }

    // ------------------------------------------------------------------
    //  Liaison du trafic de l'app au WiFi
    // ------------------------------------------------------------------

    /**
     * À appeler avant toute requête vers le serveur. Ré-évalué à chaque
     * appel : si le WiFi a disparu depuis, la liaison est levée (sinon
     * l'app resterait liée à un réseau mort et n'aurait plus aucune
     * connexion, même en 4G).
     */
    @PluginMethod
    public void bindToWifi(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ConnectivityManager cm = connectivity();
            if (cm == null) {
                ret.put("bound", false);
                ret.put("reason", "no_connectivity_service");
                call.resolve(ret);
                return;
            }
            WifiSnapshot wifi = findWifi(cm);
            if (wifi == null) {
                cm.bindProcessToNetwork(null);
                ret.put("bound", false);
                ret.put("reason", "no_wifi");
            } else {
                boolean ok = cm.bindProcessToNetwork(wifi.network);
                ret.put("bound", ok);
                ret.put("ip", wifi.ip.getHostAddress());
            }
            call.resolve(ret);
        } catch (Exception e) {
            // Non bloquant : le JS continue sans liaison.
            ret.put("bound", false);
            ret.put("reason", "error");
            ret.put("message", String.valueOf(e.getMessage()));
            call.resolve(ret);
        }
    }

    // ------------------------------------------------------------------
    //  Scan du réseau local
    // ------------------------------------------------------------------

    @PluginMethod
    public void cancelScan(PluginCall call) {
        cancelActiveScan();
        call.resolve();
    }

    private void cancelActiveScan() {
        ScanSession s = activeSession;
        if (s != null) {
            s.cancelled.set(true);
            ExecutorService p = s.pool;
            if (p != null) p.shutdownNow();
        }
    }

    /**
     * Paramètres (tous optionnels) :
     *  port (8000), path ("/whoami"), service (valeur attendue du champ
     *  "service" du JSON), hintHost (IP à tester en premier, ex. dernière
     *  adresse connue), connectTimeoutMs (400), readTimeoutMs (1500).
     *
     * Résultat : { url|null, reason?, phoneIp?, prefix?, gateway?,
     *              subnets[], total, scanned, elapsedMs }
     * Événements "scanProgress" : { done, total }
     */
    @PluginMethod
    public void scan(final PluginCall call) {
        final int port = call.getInt("port", 8000);
        final String path = call.getString("path", "/whoami");
        final String expected = call.getString("service", "");
        final String hintHost = call.getString("hintHost", "");
        final int connectTimeout = call.getInt("connectTimeoutMs", 400);
        final int readTimeout = call.getInt("readTimeoutMs", 1500);

        cancelActiveScan();
        final ScanSession session = new ScanSession();
        activeSession = session;

        // Fil dédié : ne pas bloquer le fil des plugins Capacitor (sinon
        // cancelScan() resterait en file d'attente derrière le scan).
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    runScan(call, session, port, path, expected, hintHost, connectTimeout, readTimeout);
                } catch (Exception e) {
                    call.reject("Échec du scan réseau : " + e.getMessage(), e);
                }
            }
        }, "SaisieNotes-Scan").start();
    }

    private void runScan(PluginCall call, final ScanSession session, final int port, final String path,
                         final String expected, String hintHost, final int connectTimeout,
                         final int readTimeout) throws Exception {
        final long t0 = System.currentTimeMillis();
        ConnectivityManager cm = connectivity();
        WifiSnapshot wifi = (cm != null) ? findWifi(cm) : null;

        final LinkedHashSet<String> hosts = new LinkedHashSet<>();
        final List<String> subnets = new ArrayList<>();
        final Set<String> ownIps = new HashSet<>();

        // Ordre de priorité : dernière adresse connue, passerelle, puis le reste.
        if (hintHost != null && !hintHost.isEmpty()) hosts.add(hintHost);

        if (wifi != null) {
            ownIps.add(wifi.ip.getHostAddress());
            if (wifi.gateway != null) hosts.add(wifi.gateway.getHostAddress());
            addSubnetHosts(hosts, subnets, ipToLong(wifi.ip), wifi.prefix);
        }
        collectExtraInterfaces(hosts, subnets, ownIps);
        hosts.removeAll(ownIps);

        final JSObject ret = new JSObject();
        if (wifi != null) {
            ret.put("phoneIp", wifi.ip.getHostAddress());
            ret.put("prefix", wifi.prefix);
            if (wifi.gateway != null) ret.put("gateway", wifi.gateway.getHostAddress());
        }
        JSArray subnetsJs = new JSArray();
        for (String s : subnets) subnetsJs.put(s);
        ret.put("subnets", subnetsJs);

        if (hosts.isEmpty()) {
            ret.put("url", JSONObject.NULL);
            ret.put("reason", "no_network");
            ret.put("total", 0);
            ret.put("scanned", 0);
            ret.put("elapsedMs", System.currentTimeMillis() - t0);
            call.resolve(ret);
            return;
        }

        final Network net = (wifi != null) ? wifi.network : null;
        final int total = hosts.size();
        final ExecutorService pool = Executors.newFixedThreadPool(Math.min(THREADS, total));
        session.pool = pool;
        final ExecutorCompletionService<String> ecs = new ExecutorCompletionService<>(pool);

        for (final String host : hosts) {
            ecs.submit(new Callable<String>() {
                @Override
                public String call() {
                    return probe(host, port, path, expected, connectTimeout, readTimeout, net, session);
                }
            });
        }

        String found = null;
        int done = 0;
        try {
            while (done < total && !session.cancelled.get()) {
                // poll (et non take) : après un shutdownNow() les tâches encore
                // en file ne se terminent jamais, take() bloquerait indéfiniment.
                Future<String> f = ecs.poll(250, TimeUnit.MILLISECONDS);
                if (f == null) continue;
                done++;
                String result = null;
                try {
                    result = f.get();
                } catch (Exception ignored) {
                    // hôte injoignable : normal
                }
                if (result != null) {
                    found = result;
                    break;
                }
                if (done % 16 == 0) {
                    JSObject progress = new JSObject();
                    progress.put("done", done);
                    progress.put("total", total);
                    notifyListeners("scanProgress", progress);
                }
            }
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        } finally {
            pool.shutdownNow();
        }

        ret.put("url", found != null ? found : JSONObject.NULL);
        if (found == null) {
            ret.put("reason", session.cancelled.get() ? "cancelled" : "not_found");
        }
        ret.put("total", total);
        ret.put("scanned", done);
        ret.put("elapsedMs", System.currentTimeMillis() - t0);
        call.resolve(ret);
    }

    /** Étape 1 : port TCP ouvert ? Étape 2 : est-ce bien NOTRE serveur ? */
    private String probe(String host, int port, String path, String expected,
                         int connectTimeout, int readTimeout, Network net, ScanSession session) {
        if (session.cancelled.get()) return null;

        Socket socket = null;
        try {
            socket = (net != null) ? net.getSocketFactory().createSocket() : new Socket();
            socket.connect(new InetSocketAddress(host, port), connectTimeout);
        } catch (Exception e) {
            return null; // fermé, filtré ou hôte absent
        } finally {
            if (socket != null) {
                try { socket.close(); } catch (Exception ignored) { }
            }
        }

        if (session.cancelled.get()) return null;

        String base = "http://" + host + ":" + port;
        HttpURLConnection conn = null;
        try {
            URL url = new URL(base + path);
            conn = (HttpURLConnection) (net != null ? net.openConnection(url) : url.openConnection());
            conn.setConnectTimeout(connectTimeout * 2);
            conn.setReadTimeout(readTimeout);
            conn.setUseCaches(false);
            conn.setRequestMethod("GET");
            if (conn.getResponseCode() != 200) return null;

            String body = readBody(conn.getInputStream(), 4096);
            JSONObject json = new JSONObject(body);
            if (expected == null || expected.isEmpty() || expected.equals(json.optString("service"))) {
                return base;
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    private static String readBody(InputStream in, int maxBytes) throws Exception {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[1024];
            int n;
            while (out.size() < maxBytes && (n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
            }
            return out.toString("UTF-8");
        } finally {
            try { in.close(); } catch (Exception ignored) { }
        }
    }

    // ------------------------------------------------------------------
    //  Construction de la liste d'hôtes
    // ------------------------------------------------------------------

    private static long ipToLong(Inet4Address a) {
        byte[] b = a.getAddress();
        return ((b[0] & 0xFFL) << 24) | ((b[1] & 0xFFL) << 16) | ((b[2] & 0xFFL) << 8) | (b[3] & 0xFFL);
    }

    private static String longToIp(long v) {
        return ((v >> 24) & 0xFF) + "." + ((v >> 16) & 0xFF) + "." + ((v >> 8) & 0xFF) + "." + (v & 0xFF);
    }

    /** Ajoute tous les hôtes du sous-réseau de (ip, prefix), plafonné à un /22. */
    private static void addSubnetHosts(LinkedHashSet<String> out, List<String> subnets, long ip, int prefix) {
        if (prefix > 30 || prefix <= 0) return;   // /31, /32 ou invalide : rien à balayer
        if (prefix < MIN_PREFIX) prefix = 24;     // réseau énorme : on reste sur le /24 du téléphone

        long mask = (0xFFFFFFFFL << (32 - prefix)) & 0xFFFFFFFFL;
        long network = ip & mask;
        long broadcast = network | (~mask & 0xFFFFFFFFL);

        String label = longToIp(network) + "/" + prefix;
        if (subnets.contains(label)) return;
        subnets.add(label);

        for (long h = network + 1; h < broadcast && out.size() < MAX_HOSTS; h++) {
            if (h != ip) out.add(longToIp(h));
        }
    }

    /**
     * Autres interfaces utiles : point d'accès WiFi du téléphone (ap0,
     * swlan0...), partage USB (rndis0), Ethernet. Le WiFi client (wlan0) est
     * déjà traité via ConnectivityManager. Best effort : Android 11+ limite
     * l'accès aux interfaces réseau, on ignore silencieusement les échecs.
     */
    private void collectExtraInterfaces(LinkedHashSet<String> hosts, List<String> subnets, Set<String> ownIps) {
        try {
            Enumeration<NetworkInterface> en = NetworkInterface.getNetworkInterfaces();
            if (en == null) return;
            for (NetworkInterface ni : Collections.list(en)) {
                String name = ni.getName() == null ? "" : ni.getName().toLowerCase();
                if (!ni.isUp() || ni.isLoopback()) continue;
                if (!name.matches("^(ap|swlan|softap|wlan|eth|rndis|usb|bt-pan)\\d*$")) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress a = ia.getAddress();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        ownIps.add(a.getHostAddress());
                        addSubnetHosts(hosts, subnets, ipToLong((Inet4Address) a), ia.getNetworkPrefixLength());
                    }
                }
            }
        } catch (Exception ignored) {
            // interfaces inaccessibles : on se contente du WiFi client
        }
    }
}
