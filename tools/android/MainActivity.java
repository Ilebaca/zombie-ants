package io.github.ilebaca.zombieants;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/** Immersive native host: transient bars overlay a stable, cutout-safe game. */
public class MainActivity extends BridgeActivity {
    private int safeTop;
    private int safeBottom;
    private boolean pageLoaded;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
        if (getBridge() == null) return;

        View container = (View) getBridge().getWebView().getParent();
        ViewCompat.setOnApplyWindowInsetsListener(container, (view, insets) -> {
            // Ignoring visibility prevents clock/navigation peeks from moving controls.
            Insets stable = insets.getInsetsIgnoringVisibility(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int nextTop = Math.max(safeTop, stable.top);
            int nextBottom = Math.max(safeBottom, stable.bottom);
            if (nextTop != safeTop || nextBottom != safeBottom) {
                safeTop = nextTop;
                safeBottom = nextBottom;
                applySafeArea();
            }
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                .build();
        });
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                pageLoaded = true;
                ViewCompat.requestApplyInsets(container);
                applySafeArea();
            }
        });
        ViewCompat.requestApplyInsets(container);
        immerse();
    }

    private void applySafeArea() {
        if (!pageLoaded || getBridge() == null) return;
        float density = getResources().getDisplayMetrics().density;
        String script = "document.documentElement.style.setProperty('--safe-top','"
            + (safeTop / density) + "px');"
            + "document.documentElement.style.setProperty('--safe-bottom','"
            + (safeBottom / density) + "px');";
        getBridge().getWebView().evaluateJavascript(script, null);
    }

    private void immerse() {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override
    public void onResume() {
        super.onResume();
        immerse();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immerse();
    }
}
