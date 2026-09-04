/**
 * RUNNING INSIDE THE ANDROID SHELL (roadmap step 4).
 *
 * The wrap is thin on purpose: Capacitor serves the same `dist/` in a WebView and the game
 * does not know the difference. Two things ARE different, and both matter enough to be
 * worth the file.
 *
 * THE SAVE STOPS BEING DISPOSABLE. `localStorage` in a WebView is the browser's, with the
 * browser's rules — it can be cleared with the app's cache, and on some devices it is.
 * `@capacitor/preferences` is real application storage: it is backed up, it survives a
 * cache wipe, and nothing evicts it. That is why `CapacitorStore` declares `durable: true`,
 * which is the flag `platform/persistence.ts` reads — so the save-at-risk prompt never
 * appears in the native build, because there is genuinely nothing at risk.
 *
 * IT IS SYNCHRONOUS OVER AN ASYNCHRONOUS API, and that is the whole difficulty here.
 * `KeyValueStore` is synchronous because every caller is — `ProfileStore` reads the profile
 * in its constructor and writes it inside an action — while Preferences is a promise on the
 * far side of a bridge. Rewriting the profile layer to be async would reach every screen in
 * the app for a storage detail. So the whole save is READ ONCE into memory at startup
 * (`loadNative`) and written back through, which is exactly what `localStorage` does behind
 * its own synchronous face. The save is a few kilobytes and there is one writer.
 */
import type { KeyValueStore } from "./storage";

/** The narrow slice of `@capacitor/preferences` this needs, so nothing else is imported. */
interface Preferences {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  keys(): Promise<{ keys: string[] }>;
}

/** True when the game is running inside a Capacitor shell rather than a browser tab. */
export function isNative(): boolean {
  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/**
 * A durable store over Capacitor Preferences.
 *
 * Reads come from the snapshot taken at startup; writes go to memory AND are sent on to the
 * device. A write that fails is swallowed exactly as the web store's is: losing a save is
 * bad, and crashing mid-match because one could not be written is worse.
 */
export class CapacitorStore implements KeyValueStore {
  /** Native storage is real application storage — a write survives the app closing... */
  readonly durable = true;
  /** ...and nothing but the player can take it away, which is the half that matters for
   *  the save-at-risk prompt: it never appears in the native build (persistence.ts). */
  readonly evictable = false;

  constructor(private prefs: Preferences, private data: Map<string, string>) {}

  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.data.set(key, value);
    void this.prefs.set({ key, value }).catch(() => {});
  }

  remove(key: string): void {
    this.data.delete(key);
    void this.prefs.remove({ key }).catch(() => {});
  }
}

/**
 * Read the whole save off the device, once, before the app starts.
 *
 * Returns null in a browser, or if the plugin is missing or refuses — and null means the
 * app builds its usual `localStorage` store instead. There is no half state: either the
 * native store is ready with everything in it, or the web one is used.
 */
export async function loadNative(): Promise<CapacitorStore | null> {
  if (!isNative()) return null;
  try {
    const mod = await import("@capacitor/preferences") as { Preferences?: Preferences };
    const prefs = mod.Preferences;
    if (!prefs) return null;

    const data = new Map<string, string>();
    const { keys } = await prefs.keys();
    for (const key of keys) {
      const { value } = await prefs.get({ key });
      if (value !== null) data.set(key, value);
    }
    return new CapacitorStore(prefs, data);
  } catch {
    return null;                 // no plugin, no bridge, no permission — use the web store
  }
}
