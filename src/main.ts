/** App entry point. */
import {
  LocalAccounts, catchCrashes, defaultStore, goOffline, hideSplash, isNative, loadNative,
} from "./platform";
import { App } from "./ui/app";
import { stabilizeInstalledViewport } from "./ui/installed-viewport";

const host: HTMLElement | null = document.getElementById("app");
if (!host) throw new Error("#app host element is missing");
const root: HTMLElement = host;

/**
 * START THE GAME, on whichever storage this device actually has.
 *
 * In a browser that is `localStorage` and the app starts immediately. In the Android shell
 * the save lives in Capacitor Preferences, which is a promise on the far side of a bridge —
 * so the whole save is read once, here, before anything reads a profile
 * (`platform/native.ts` explains why it is done that way rather than making the profile
 * layer async).
 *
 * The await is only ever taken in the native build, and there the WebView is behind a
 * splash screen anyway. A browser never waits.
 */
async function boot(): Promise<void> {
  // FIRST, BEFORE ANYTHING CAN THROW. Without it an exception anywhere leaves a board that
  // no longer answers a tap or a blank page, with no way out but knowing to kill the app —
  // and on a phone there is no console to find out why (platform/crash.ts).
  catchCrashes();
  stabilizeInstalledViewport();
  const store = (await loadNative()) ?? defaultStore();
  // The ACCOUNTS are handed over, never a profile. A profile passed here is the caller
  // saying "this is the colony" and skips the sign-in screen entirely (see `App.given`),
  // which is right for a test and wrong for the real app: the shell has to open the
  // account that is signed in, and the picker when there is none.
  const app = new App(root, undefined, new LocalAccounts(store));
  app.start();
  app.enableLiveServices();

  // THE COVER COMES DOWN ONCE THERE IS A SCREEN UNDER IT, and not before: `start()` builds
  // home synchronously, so by this line there is one (platform/splash.ts).
  hideSplash();

  // Native assets already live inside the APK. Only the web game needs a service
  // worker; release and inbox checks above run on both platforms without blocking play.
  if (isNative()) return;

  // And make the next launch work with no network at all. The game is a static bundle and
  // a save on the device — it never needed to be online, and a tunnel gave a blank page.
  goOffline();
}
void boot();
