/**
 * WHAT A DEVICE IS DOING TO THE SAVE.
 *
 * The whole point of this module is not to be over-eager. A warning that shows on a device
 * whose save is fine is a warning nobody believes the second time, and the one player who
 * really is about to lose a colony is the one who has stopped reading it. So what is held
 * here is mostly the NEGATIVE cases: installed is safe, persistence granted is safe, and a
 * desktop browser that simply has not been granted persistence is not worth alarming.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { isInstalled, isIos, installSteps, saveRisk, storageIsDurable } from "../persistence";
import { MemoryStore } from "../storage";
import type { KeyValueStore } from "../storage";

/** A store that says it writes somewhere real — the shape a Capacitor backend would have. */
const diskStore = (): KeyValueStore => ({
  durable: true,
  get: () => null,
  set: () => {},
  remove: () => {},
});

const ua = (value: string, touch = 0): void => {
  vi.stubGlobal("navigator", { userAgent: value, maxTouchPoints: touch });
};
const standalone = (on: boolean): void => {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: on }) });
};

afterEach(() => { vi.unstubAllGlobals(); });

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36";

describe("reading the device", () => {
  it("knows an iPhone", () => {
    ua(IPHONE);
    expect(isIos()).toBe(true);
  });

  /**
   * iPadOS reports a Mac user agent, and a Mac with a touchscreen is what tells the two
   * apart. Getting this wrong means every iPad player is never warned.
   */
  it("knows an iPad pretending to be a Mac", () => {
    ua("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1", 5);
    expect(isIos()).toBe(true);
    ua("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1", 0);
    expect(isIos(), "a real Mac must not be told to install anything").toBe(false);
  });

  it("does not mistake Android for iOS", () => {
    ua(ANDROID);
    expect(isIos()).toBe(false);
  });

  it("never throws where there is no navigator at all", () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("window", undefined);
    expect(() => isIos()).not.toThrow();
    expect(() => isInstalled()).not.toThrow();
  });
});

describe("what the save is at risk of", () => {
  it("calls an unwritable store out above everything else", () => {
    ua(ANDROID);
    standalone(false);
    // Even installed, even persisted: nothing has been saved and nothing will be.
    expect(saveRisk(new MemoryStore(), true)).toBe("unwritable");
  });

  it("warns an iPhone in a tab, because Safari really does bin it", () => {
    ua(IPHONE);
    standalone(false);
    expect(saveRisk(diskStore(), false)).toBe("eviction");
  });

  it("says nothing once the game is installed", () => {
    ua(IPHONE);
    standalone(true);
    expect(saveRisk(diskStore(), false)).toBe("none");
  });

  it("says nothing once the browser granted persistence", () => {
    ua(IPHONE);
    standalone(false);
    expect(saveRisk(diskStore(), true)).toBe("none");
  });

  /**
   * ONLY iOS HAS A CLOCK ON IT. Everywhere else an un-persisted origin is evicted under
   * real storage pressure, which is rare enough that warning about it would be crying wolf
   * at every player on the platform where the save is mostly fine.
   */
  it("does not warn Android or desktop without persistence", () => {
    ua(ANDROID);
    standalone(false);
    expect(saveRisk(diskStore(), false)).toBe("none");
  });

  /**
   * The store DECLARES this. It was read as `!(store instanceof MemoryStore)`, which a
   * subclass inherits — a memory-backed store would have reported as durable while losing
   * everything on reload, which is the exact failure this module exists to catch.
   */
  it("takes the store's own word for whether it is durable", () => {
    expect(storageIsDurable(new MemoryStore())).toBe(false);
    expect(storageIsDurable(diskStore())).toBe(true);
    class Subclassed extends MemoryStore {}
    expect(storageIsDurable(new Subclassed())).toBe(false);
  });
});

describe("the way out", () => {
  /**
   * The Share sheet is exactly where somebody gives up, and installing is the ONLY thing
   * that saves an iPhone colony — so it is the one instruction in the app worth spelling
   * out step by step rather than as "add it to your home screen".
   */
  it("names Safari's Share sheet on iOS and not elsewhere", () => {
    ua(IPHONE);
    const ios = installSteps().join(" ");
    expect(ios).toContain("Share");
    expect(ios).toContain("Add to Home Screen");

    ua(ANDROID);
    expect(installSteps().join(" ")).not.toContain("Share");
  });

  it("always ends by telling the player to use the new icon", () => {
    for (const agent of [IPHONE, ANDROID]) {
      ua(agent);
      const steps = installSteps();
      expect(steps.length).toBeGreaterThan(1);
      expect(steps[steps.length - 1]).toContain("icon");
    }
  });
});
