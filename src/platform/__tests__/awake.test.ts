/**
 * OFF SCREEN IS NOT CLOSED (platform/awake.ts).
 *
 * Switching to another app leaves the game RUNNING, which is the point of switching
 * rather than closing — and the music went on playing out of it. What this file watches
 * is the one question that decides: is the game on screen?
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { onAwake } from "../awake";

/**
 * jsdom exposes `hidden` and `visibilityState` as two SEPARATE read-only getters — it
 * does not derive one from the other — so a stub that sets only `visibilityState`
 * leaves `document.hidden` reading false and the test watches nothing change.
 */
const setHidden = (hidden: boolean): void => {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  Object.defineProperty(document, "visibilityState", {
    value: hidden ? "hidden" : "visible",
    configurable: true,
  });
};

afterEach(() => { setHidden(false); });

describe("watching whether the game is on screen", () => {
  it("reports going away and coming back", () => {
    const seen: boolean[] = [];
    const off = onAwake((a) => seen.push(a));
    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(seen).toEqual([false, true]);
    off();
  });

  /**
   * It does NOT fire on registration. The caller's audio is already in whatever state
   * boot left it in, and announcing "visible" at boot would resume a device no gesture
   * has unlocked yet. The first call is the first CHANGE.
   */
  it("says nothing until something changes", () => {
    const handler = vi.fn();
    const off = onAwake(handler);
    expect(handler).not.toHaveBeenCalled();
    off();
  });

  it("stops watching when told to", () => {
    const handler = vi.fn();
    onAwake(handler)();
    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(handler).not.toHaveBeenCalled();
  });

  /**
   * A HANDLER THAT THROWS MUST NOT REACH THE CRASH PANEL.
   *
   * An exception out of a listener does not unregister it — the browser catches it and
   * reports it on `window.onerror`, which in this app is `platform/crash.ts` putting a
   * full-screen "something went wrong" panel over the game. So the thing to assert is
   * not that the listener survives (it would anyway) but that nothing escapes: switching
   * apps is not a crash, and a panel raised by one is worse than music that did not mute.
   */
  it("keeps a throwing handler off the crash panel", () => {
    const crashed = vi.fn();
    window.addEventListener("error", crashed);
    const off = onAwake(() => { throw new Error("nope"); });
    setHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(crashed, "a throw here would put the crash panel over the game").not.toHaveBeenCalled();
    off();
    window.removeEventListener("error", crashed);
  });
});
