package com.ecole.saisienotes;

import android.os.Bundle;
import android.view.View;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Install SplashScreen BEFORE super.onCreate() and BEFORE setContentView()
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        
        // Keep splash visible until app is ready
        splashScreen.setKeepOnScreenCondition(() -> true);
        
        super.onCreate(savedInstanceState);
        
        enterImmersiveMode();
        
        // Dismiss splash after webview is loaded
        // Small delay to ensure content is visible
        getWindow().getDecorView().post(() -> {
            splashScreen.setKeepOnScreenCondition(() -> false);
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Réapplique le mode immersif quand l'app revient au premier plan
        // (Android réaffiche les barres système après un retour depuis une autre app)
        if (hasFocus) enterImmersiveMode();
    }

    private void enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        // Cache barre de statut + barre de navigation
        controller.hide(WindowInsetsCompat.Type.systemBars());
        // Réapparition temporaire par balayage depuis le bord (pas de bouton dédié)
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
    }
}
