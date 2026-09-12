package com.ecole.saisienotes;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Enregistrement des plugins natifs custom (doit précéder super.onCreate())
        registerPlugin(DownloadsSaverPlugin.class);

        // Doit être appelé AVANT super.onCreate() : active l'API officielle
        // Android 12+ SplashScreen (voir styles.xml AppTheme.NoActionBarLaunch).
        // Sans cet appel, Android ignore notre thème et affiche son propre
        // splash par défaut (icône + fond bleu dérivé automatiquement).
        SplashScreen.installSplashScreen(this);

        super.onCreate(savedInstanceState);
        enterImmersiveMode();
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
