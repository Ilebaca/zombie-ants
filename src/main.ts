/** App entry point. */
import {
  LocalAccounts, catchCrashes, defaultStore, goOffline, isNative, loadNative, takeNewerBuild,
} from "./platform";
import { App } from "./ui/app";

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
  const store = (await loadNative()) ?? defaultStore();
  // The ACCOUNTS are handed over, never a profile. A profile passed here is the caller
  // saying "this is the colony" and skips the sign-in screen entirely (see `App.given`),
  // which is right for a test and wrong for the real app: the shell has to open the
  // account that is signed in, and the picker when there is none.
  new App(root, undefined, new LocalAccounts(store)).start();

  // BOTH OF THESE ARE ABOUT BEING A WEB PAGE, so the native build wants neither. Its
  // bundle ships inside the APK — there is no Pages cache to be stale against and nothing
  // to fetch over a network it may not have — and a service worker inside a WebView is a
  // second cache in front of files that are already local.
  if (isNative()) return;

  // If a newer build is live, take it. The page starts either way — the check is a fetch
  // that may never answer, and a game that waits for the network to start is a worse
  // problem than a stale one.
  void takeNewerBuild();

  // And make the next launch work with no network at all. The game is a static bundle and
  // a save on the device — it never needed to be online, and a tunnel gave a blank page.
  goOffline();
}
void boot();
