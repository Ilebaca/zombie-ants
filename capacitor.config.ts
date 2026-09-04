import type { CapacitorConfig } from "@capacitor/cli";

/**
 * THE ANDROID SHELL (roadmap step 4).
 *
 * The game is a static bundle with everything drawn at runtime and the save on the device,
 * so the wrap is genuinely thin: Capacitor serves `dist/` inside a WebView and the game
 * does not know the difference. That is what `base: "./"` in `vite.config.ts` has always
 * been for — relative paths work under a GitHub Pages project path AND under the shell's
 * own scheme, where an absolute "/zombie-ants/" would point at nothing.
 *
 * WHAT THE SHELL ACTUALLY BUYS, beyond a Play Store listing:
 *  - the save stops being disposable. `@capacitor/preferences` is real storage rather than
 *    `localStorage`, so none of the eviction that `platform/persistence.ts` exists to warn
 *    about applies — which is why `CapacitorStore` declares `durable: true` and the warning
 *    never appears in the app.
 *  - the portrait lock is a real one rather than a request the browser may refuse.
 *
 * To build it: `npm run build && npx cap sync android`, then open `android/` in Android
 * Studio. The `android/` directory is generated and NOT committed — it is a build output
 * the size of a small library, and `npx cap add android` recreates it from this file.
 */
const config: CapacitorConfig = {
  appId: "io.github.ilebaca.zombieants",
  appName: "Zombie Ants",
  webDir: "dist",
  android: {
    // The board is drawn on a canvas that fills the screen; a bounce at the top edge on
    // over-scroll reads as the ground coming loose.
    allowMixedContent: false,
    backgroundColor: "#0e1a12",
  },
  plugins: {
    // The soil, so the splash and the status bar are the ground the game is played on
    // rather than a black band (index.html says the same for the web build).
    SplashScreen: {
      backgroundColor: "#0e1a12",
      showSpinner: false,
      launchAutoHide: true,
    },
  },
};

export default config;
