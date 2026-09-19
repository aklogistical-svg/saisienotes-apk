package com.ecole.saisienotes;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    // Reste true tant que la page n'a pas fini de se charger : le splash
    // natif est maintenu à l'écran pendant ce temps (voir setKeepOnScreenCondition
    // ci-dessous), ce qui évite de montrer le fond de transition de la WebView.
    private volatile boolean webViewReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Enregistrement des plugins natifs custom (doit précéder super.onCreate())
        registerPlugin(DownloadsSaverPlugin.class);
        registerPlugin(WifiInfoPlugin.class);

        // Doit être appelé AVANT super.onCreate() : active l'API officielle
        // Android 12+ SplashScreen (voir styles.xml AppTheme.NoActionBarLaunch).
        // Sans cet appel, Android ignore notre thème et affiche son propre
        // splash par défaut (icône + fond bleu dérivé automatiquement).
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);

        // Garde le splash affiché tant que webViewReady est false, au lieu de
        // le retirer dès que l'Activity est créée (ce qui laissait apparaître
        // brièvement le fond bleu de la WebView avant que la page ne soit prête).
        splashScreen.setKeepOnScreenCondition(() -> !webViewReady);

        super.onCreate(savedInstanceState);
        enterImmersiveMode();

        // On étend le client existant de Capacitor (BridgeWebViewClient) au lieu
        // de le remplacer entièrement : tout le comportement Capacitor (chargement
        // des fichiers locaux, gestion des liens, etc.) reste intact, on ajoute
        // juste le déclenchement de webViewReady quand la page a fini de charger.
        this.bridge.setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                webViewReady = true;
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    private void enterImmersiveMode() {
        // Pas de setDecorFitsSystemWindows(false) ici : on garde le comportement
        // standard où le système réserve l'espace de la barre de statut restée
        // visible. Seule la barre de navigation (bas) est masquée.
        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.navigationBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
    }
}

