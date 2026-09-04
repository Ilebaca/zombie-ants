/**
 * KEEPING A SAVE ALIVE ON A DEVICE THAT DID NOT PROMISE TO KEEP IT.
 *
 * Everything a player has is in `localStorage` (§12), and there is no server to fall back
 * on. That is fine right up until the browser decides the storage is disposable — and two
 * browsers do decide exactly that:
 *
 *  - **iOS Safari deletes all script-writable storage after seven days without a visit**,
 *    for any site that is not installed to the Home Screen. So the player most likely to
 *    lose a colony is the one who took a week off, which is also the one least likely to
 *    have written anything down. Installing is the ONLY thing that exempts them; there is
 *    no API to ask.
 *  - Chromium evicts under storage pressure unless the origin is marked persistent, and
 *    `navigator.storage.persist()` is how you ask. It grants silently on engagement, so
 *    asking costs nothing and is worth doing on every boot.
 *
 * And a third case that is not eviction at all: a browser where the write NEVER LANDED.
 * Private mode, a full quota, or site data blocked — `defaultStore()` falls back to memory
 * and the game plays perfectly for one session and forgets all of it. Silently, which is
 * the worst way for a game to lose somebody's evening.
 *
 * Nothing here can make a save permanent. What it can do is tell the truth about which of
 * those three a device is in, so the app can ask for the one thing that actually helps.
 */
import type { KeyValueStore } from "./storage";

export type SaveRisk =
  /** Nothing to warn about: installed, or persistence granted. */
  | "none"
  /** The save is real but the browser may bin it — iOS Safari in a tab is the live case. */
  | "eviction"
  /** Writes are not landing at all. Everything this session is lost on reload. */
  | "unwritable";

/**
 * Is the game running as an installed app rather than in a browser tab?
 *
 * Two checks because neither covers both platforms: `display-mode: standalone` is the
 * standard one and iOS Safari answers it inconsistently across versions, while
 * `navigator.standalone` is Apple's own and exists nowhere else.
 */
export function isInstalled(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
    return window.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch { return false; }
}

/**
 * iOS, including iPadOS pretending to be a Mac.
 *
 * Deliberately a platform test rather than a browser one: every browser on iOS is Safari's
 * engine underneath, so Chrome and Firefox there evict on the same seven-day clock.
 */
export function isIos(): boolean {
  try {
    const nav = navigator as Navigator & { maxTouchPoints?: number };
    if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
    // iPadOS 13+ reports a Mac UA; a Mac with a touchscreen is what tells them apart.
    return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
  } catch { return false; }
}

/**
 * Ask the browser to keep this origin's storage.
 *
 * Cheap and worth doing at every boot: Chromium grants it silently once a site has any
 * engagement, and a granted origin is exempt from eviction entirely. It resolves false
 * where it is unsupported or refused — iOS among them — which is not a failure, it is the
 * answer, and it is what puts the device into the "eviction" case below.
 */
export async function askToPersist(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}

/**
 * True when the store really writes to the device rather than to memory.
 *
 * The store DECLARES it (storage.ts). Asking `instanceof MemoryStore` looked equivalent
 * and is not: a subclass inherits it, so a memory-backed store would report as durable
 * while losing everything on reload — which is the exact failure this whole file is for.
 */
export const storageIsDurable = (store: KeyValueStore): boolean => store.durable;

/**
 * What this device is doing to the save, in one word.
 *
 * `persisted` is passed in rather than read here because asking is asynchronous and the
 * answer is worth keeping: a screen that has to await a promise to decide whether to draw
 * a row draws it a frame late.
 */
export function saveRisk(store: KeyValueStore, persisted: boolean): SaveRisk {
  if (!storageIsDurable(store)) return "unwritable";
  // A store nothing can evict is the end of it — that is the native build, where the save
  // is real application storage rather than a browser's (platform/native.ts). Asked of
  // `durable` alone this said "eviction" inside the Android shell, warning a player about
  // a clock that does not run there.
  if (!store.evictable) return "none";
  if (persisted || isInstalled()) return "none";
  // Only iOS has a CLOCK on it. Everywhere else an un-persisted origin is evicted under
  // real storage pressure, which is rare enough that warning about it would be crying
  // wolf at every player on the platform where the save is mostly fine.
  return isIos() ? "eviction" : "none";
}

/**
 * How to install, in the words of the platform the player is holding.
 *
 * Written out rather than left as "add it to your home screen" because the Share sheet is
 * exactly the step somebody gives up on — and it is the only thing that saves an iPhone
 * player's colony, so it is the one instruction in the app worth spelling out.
 */
export function installSteps(): string[] {
  return isIos()
    ? [
      "Tap the Share button at the bottom of Safari.",
      "Scroll down and tap \"Add to Home Screen\".",
      "Tap Add. Open the game from that icon from now on.",
    ]
    : [
      "Open your browser's menu.",
      "Tap \"Install app\" or \"Add to Home screen\".",
      "Open the game from that icon from now on.",
    ];
}
