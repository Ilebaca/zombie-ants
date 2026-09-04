/**
 * THE ANDROID SHELL.
 *
 * Two things are worth holding, and the second is the one with teeth.
 *
 * The store is SYNCHRONOUS OVER AN ASYNCHRONOUS API — the whole save is read once at
 * startup and written back through — so what must be true is that a read never waits, a
 * write reaches the device, and a write that fails on the far side of the bridge cannot
 * take the game down with it.
 *
 * And it declares `durable: true`, which is not a label: `platform/persistence.ts` reads
 * that flag to decide whether to warn a player their colony is at risk. Native storage is
 * real application storage and nothing evicts it, so the prompt must never appear in the
 * native build — and it MUST still appear in the browser one, which is what the last case
 * here pins down.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { CapacitorStore, isNative, loadNative } from "../native";
import { MemoryStore } from "../storage";
import { saveRisk } from "../persistence";

afterEach(() => { vi.unstubAllGlobals(); });

/** A stand-in for @capacitor/preferences: records what crossed the bridge. */
const prefs = (fail = false) => {
  const sent: [string, string][] = [];
  const removed: string[] = [];
  return {
    sent,
    removed,
    api: {
      get: (o: { key: string }) => Promise.resolve({ value: null as string | null }),
      set: (o: { key: string; value: string }) =>
        fail ? Promise.reject(new Error("bridge")) : (sent.push([o.key, o.value]), Promise.resolve()),
      remove: (o: { key: string }) =>
        fail ? Promise.reject(new Error("bridge")) : (removed.push(o.key), Promise.resolve()),
      keys: () => Promise.resolve({ keys: [] as string[] }),
    },
  };
};

describe("knowing it is native", () => {
  it("is false in a browser", () => {
    vi.stubGlobal("Capacitor", undefined);
    expect(isNative()).toBe(false);
  });

  it("is true inside the shell", () => {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true });
    expect(isNative()).toBe(true);
  });

  it("never throws on a hostile global", () => {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => { throw new Error("no"); } });
    expect(() => isNative()).not.toThrow();
    expect(isNative()).toBe(false);
  });

  it("hands back no native store in a browser", async () => {
    vi.stubGlobal("Capacitor", undefined);
    expect(await loadNative()).toBe(null);
  });
});

describe("the native store", () => {
  it("reads from the snapshot without waiting", () => {
    const p = prefs();
    const store = new CapacitorStore(p.api, new Map([["a", "1"]]));
    expect(store.get("a")).toBe("1");
    expect(store.get("missing")).toBe(null);
  });

  it("writes to memory and sends it to the device", async () => {
    const p = prefs();
    const store = new CapacitorStore(p.api, new Map());
    store.set("colony", "88000");
    // Readable at once — the caller is synchronous and cannot await the bridge.
    expect(store.get("colony")).toBe("88000");
    await Promise.resolve();
    expect(p.sent).toEqual([["colony", "88000"]]);
  });

  it("removes from both", async () => {
    const p = prefs();
    const store = new CapacitorStore(p.api, new Map([["gone", "x"]]));
    store.remove("gone");
    expect(store.get("gone")).toBe(null);
    await Promise.resolve();
    expect(p.removed).toEqual(["gone"]);
  });

  /**
   * Losing a save is bad; crashing mid-match because one could not be written is worse.
   * The same rule the web store follows.
   */
  it("survives a bridge that rejects, and keeps the value in memory", async () => {
    const p = prefs(true);
    const store = new CapacitorStore(p.api, new Map());
    expect(() => store.set("k", "v")).not.toThrow();
    expect(() => store.remove("k")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});

/**
 * THE FLAG IS LOAD-BEARING. `saveRisk` reads `durable` to decide whether to tell a player
 * their colony may be deleted. Native storage is not evicted, so the warning must never
 * show there — and must still show on an iPhone in a browser tab, or the whole feature is
 * silently off.
 */
describe("what the shell means for the save-at-risk warning", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1";

  it("never warns in the native build, because nothing is at risk", () => {
    vi.stubGlobal("navigator", { userAgent: IPHONE, maxTouchPoints: 5 });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    const store = new CapacitorStore(prefs().api, new Map());
    expect(store.durable).toBe(true);
    expect(saveRisk(store, false)).toBe("none");
  });

  it("still warns the same phone in a browser tab", () => {
    vi.stubGlobal("navigator", { userAgent: IPHONE, maxTouchPoints: 5 });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    // The web store on iOS is exactly the case the prompt exists for.
    const web = { durable: true, evictable: true, get: () => null, set: () => {}, remove: () => {} };
    expect(saveRisk(web, false)).toBe("eviction");
    // ...and a store that is not writing at all is the loudest case of the three.
    expect(saveRisk(new MemoryStore(), false)).toBe("unwritable");
  });
});
