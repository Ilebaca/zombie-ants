/**
 * THE ANDROID HARDWARE BACK BUTTON.
 *
 * A WebView has no history to go back through — the game is one page — so the shell's
 * default behaviour for a press is to CLOSE THE APP. Anywhere. Mid-match, in the shop, two
 * screens deep in the Antarium: one press and the game is gone. Every Android player
 * expects back to mean "up one screen", and every Play reviewer checks it.
 *
 * THE APP DECIDES, NOT THIS FILE. `onHardwareBack` takes a handler that answers one
 * question — did anything here consume the press? — and only a `false` closes the app. A
 * back that swallows everything is as wrong as one that swallows nothing: from the home
 * screen, back SHOULD leave, and an app that cannot be left with the button that leaves
 * apps is the more annoying of the two failures.
 *
 * AND THE BROWSER NEEDS IT TOO, which this file used to say the opposite of. The note
 * here read "a no-op in a browser, deliberate rather than unfinished: a tab's back button
 * is the browser's history and taking it over would break the one gesture that gets
 * somebody out of a page." That is true of a TAB on a desktop and it is wrong about a
 * PHONE, where back is a swipe in from the edge of the screen and the installed app has
 * no browser chrome at all. Reported from a Nothing Phone: "when I swipe from the left
 * edge, usually that's the action for going a step back, but in the game it exits
 * completely." There was nothing in the history but the page itself, so the system
 * gesture did the only thing left — it left.
 *
 * THE ESCAPE HATCH IS KEPT, which is why the old reasoning can be reversed rather than
 * overruled: when the app answers `false` — nothing above home to go up to — the gesture
 * is handed straight back to the browser and it leaves exactly as it always did. What
 * changes is only that the app's own screens are walked FIRST.
 */
import { isNative } from "./native";

/** Answers whether the app consumed the press. `false` means "there is nowhere to go up to". */
export type BackHandler = () => boolean;

/** The slice of `@capacitor/app` this needs, so nothing else is pulled across the bridge. */
interface CapApp {
  addListener(
    event: "backButton",
    fn: (event: { canGoBack: boolean }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  exitApp(): Promise<void>;
}

/**
 * Wire the hardware button up. Returns a function that unwires it.
 *
 * The registration is asynchronous (it crosses the bridge) while every caller is not, so
 * the returned function may be called before the listener exists — it remembers that and
 * removes the listener the moment it arrives, rather than leaving one running against a
 * torn-down app.
 */
export function onHardwareBack(handler: BackHandler): () => void {
  return isNative() ? nativeBack(handler) : historyBack(handler);
}

/**
 * THE BROWSER'S BACK IS ITS HISTORY, so the app has to put something in it.
 *
 * One SENTINEL entry is pushed on top of the page. A back gesture pops it, `popstate`
 * fires, and the app gets its one question; if it consumed the press the sentinel is
 * pushed again, so the next gesture asks again. One entry rather than one per screen:
 * the app already knows what is stacked on what (`App.goBack`), and a parallel stack in
 * the history is a second answer that would drift from it — the same reason this file
 * asks rather than decides.
 *
 * The sentinel changes no URL. `pushState` with no url keeps the address bar, the
 * service worker's navigation match and the `?v=<commit>` freshness reload all exactly
 * as they were.
 */
function historyBack(handler: BackHandler): () => void {
  if (typeof window === "undefined" || typeof history?.pushState !== "function") {
    return () => {};
  }

  const push = (): void => {
    try { history.pushState({ zaBack: true }, ""); } catch { /* blocked: back just leaves */ }
  };

  // LEAVING IS A ONE-WAY LATCH, and it is not belt and braces: `history.back()` from
  // inside a `popstate` handler can fire another one, and at home the answer is `false`
  // every time — so without it the app would ask to leave, be asked again, and spin.
  let leaving = false;
  const onPop = (): void => {
    if (leaving) return;
    let handled = false;
    // A handler that throws must not take the gesture down with it: back would then do
    // nothing at all for the rest of the session, which is the fault this is fixing.
    try { handled = handler(); } catch { handled = true; }
    if (handled) { push(); return; }
    // NOTHING ABOVE HOME, so the press belongs to the browser. The sentinel is already
    // gone, so this is the page's own entry going back — out of the app, exactly as it
    // behaved before any of this existed.
    leaving = true;
    try { history.back(); } catch { /* nowhere to go; the player uses the home gesture */ }
  };

  window.addEventListener("popstate", onPop);
  push();
  return () => { window.removeEventListener("popstate", onPop); };
}

/** The Android shell's own button, which closes the app unless something consumes it. */
function nativeBack(handler: BackHandler): () => void {
  let live = true;
  let off: (() => Promise<void>) | null = null;

  void (async () => {
    try {
      const mod = await import("@capacitor/app") as { App?: CapApp };
      const cap = mod.App;
      if (!cap) return;
      const sub = await cap.addListener("backButton", () => {
        // A handler that throws must not take the button down with it: the next press
        // would then do nothing at all, which reads as a frozen app.
        let handled = false;
        try {
          handled = handler();
        } catch {
          handled = true;             // stay put rather than close on a bug
        }
        if (!handled) void cap.exitApp().catch(() => {});
      });
      if (!live) { void sub.remove(); return; }
      off = sub.remove;
    } catch {
      // No plugin, no bridge: the button keeps the shell's own behaviour, which is the
      // situation this whole file is an improvement on rather than a dependency of.
    }
  })();

  return () => {
    live = false;
    if (off) void off().catch(() => {});
  };
}
