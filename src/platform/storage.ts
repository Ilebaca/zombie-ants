/**
 * Key/value persistence.
 *
 * Behind an interface because the target is a Capacitor app: the web build uses
 * localStorage, and a native build can swap in Preferences without touching the profile
 * code. Every read is defensive — a corrupt or half-written value must never stop the game
 * booting, it just falls back to defaults.
 */

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  /**
   * Does a write survive the app closing?
   *
   * DECLARED, never inferred. It was read as `!(store instanceof MemoryStore)`, which is
   * wrong the first time anybody subclasses the memory store — a subclass inherits the
   * `instanceof` and would be reported as durable while losing everything on reload. It is
   * also the one fact a new backend (Capacitor Preferences, §12) has to state about
   * itself, so the interface is where it belongs.
   */
  readonly durable: boolean;
  /**
   * Can something OTHER than the player delete it?
   *
   * A second fact, and not the same one: `localStorage` is durable — a write survives the
   * app closing — and still evictable, because iOS Safari bins it after a week away and
   * Chromium bins it under storage pressure. Capacitor Preferences is neither.
   *
   * It is separate because `saveRisk` needs both and they genuinely differ: a store can be
   * durable and evictable (every browser), or neither (memory). Reading eviction off
   * `durable` is what made the native build warn a player about a risk it does not have.
   */
  readonly evictable: boolean;
}

/** In-memory store. Used by tests, and as the fallback when localStorage is unavailable. */
export class MemoryStore implements KeyValueStore {
  /** Nothing here outlives the tab, and the app has to be able to say so. */
  readonly durable = false;
  /** Nothing to evict — it was never written anywhere in the first place. */
  readonly evictable = false;
  private data = new Map<string, string>();
  get(key: string): string | null { return this.data.get(key) ?? null; }
  set(key: string, value: string): void { this.data.set(key, value); }
  remove(key: string): void { this.data.delete(key); }
}

class LocalStorageStore implements KeyValueStore {
  readonly durable = true;
  /** The whole reason `platform/persistence.ts` exists: a browser can take this away. */
  readonly evictable = true;
  get(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }
  set(key: string, value: string): void {
    // Private browsing and quota limits both throw here. Losing a save is bad; crashing
    // mid-match because we could not write one is worse.
    try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
  }
  remove(key: string): void {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

export function defaultStore(): KeyValueStore {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const probe = "__zombie_ants_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return new LocalStorageStore();
    }
  } catch { /* fall through */ }
  return new MemoryStore();
}

/** Parse JSON without ever throwing. */
export function readJson<T>(store: KeyValueStore, key: string): T | null {
  const raw = store.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function writeJson(store: KeyValueStore, key: string, value: unknown): void {
  try { store.set(key, JSON.stringify(value)); } catch { /* ignore */ }
}
