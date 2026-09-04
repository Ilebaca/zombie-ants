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
 * It is a no-op in a browser, which is deliberate rather than unfinished. A tab's back
 * button is the browser's history and taking it over would break the one gesture that gets
 * somebody out of a page — and the web build has no "exit" to offer either way.
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
  if (!isNative()) return () => {};

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
