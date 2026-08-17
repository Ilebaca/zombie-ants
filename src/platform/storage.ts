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
}

/** In-memory store. Used by tests, and as the fallback when localStorage is unavailable. */
export class MemoryStore implements KeyValueStore {
  private data = new Map<string, string>();
  get(key: string): string | null { return this.data.get(key) ?? null; }
  set(key: string, value: string): void { this.data.set(key, value); }
  remove(key: string): void { this.data.delete(key); }
}

class LocalStorageStore implements KeyValueStore {
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
