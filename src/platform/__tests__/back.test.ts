/**
 * GOING A STEP BACK (platform/back.ts).
 *
 * Reported from a Nothing Phone: "when I swipe from the left edge, usually that's the
 * action for going a step back, but in the game it exits completely." On Android that
 * gesture IS back, and in a browser back is the history — of which this app had exactly
 * one entry, so the only thing the gesture could do was leave.
 *
 * What is held here is the shape rather than the plumbing: the app is asked once per
 * press, a consumed press leaves the gesture armed for the next one, and an unconsumed
 * one is handed straight back to the browser so home still leaves. The native half is
 * asserted separately — it is a Capacitor listener behind a dynamic import.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { onHardwareBack } from "../back";

/** A history stub: jsdom has one, but `back()` there is async and does not pop a push. */
function fakeHistory() {
  const calls = { push: 0, back: 0 };
  const real = window.history;
  Object.defineProperty(window, "history", {
    configurable: true,
    value: {
      pushState: () => { calls.push++; },
      back: () => { calls.back++; },
    },
  });
  return { calls, restore: () => Object.defineProperty(window, "history", { configurable: true, value: real }) };
}

const pop = (): void => { window.dispatchEvent(new PopStateEvent("popstate")); };

let undo: (() => void) | null = null;
afterEach(() => { undo?.(); undo = null; });

describe("the back gesture in a browser", () => {
  it("puts an entry in the history so the gesture has something to pop", () => {
    const h = fakeHistory(); undo = h.restore;
    const off = onHardwareBack(() => true);
    expect(h.calls.push, "nothing was pushed, so back leaves on the first swipe").toBe(1);
    off();
  });

  it("asks the app, and re-arms when the app consumed the press", () => {
    const h = fakeHistory(); undo = h.restore;
    const handler = vi.fn(() => true);
    const off = onHardwareBack(handler);
    pop();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(h.calls.push, "the sentinel was not put back, so the next swipe would leave").toBe(2);
    expect(h.calls.back, "a consumed press was handed to the browser anyway").toBe(0);
    pop();
    expect(handler, "the second swipe never reached the app").toHaveBeenCalledTimes(2);
    off();
  });

  /** The escape hatch, and the whole reason the old "no-op in a browser" could be reversed. */
  it("hands the press back to the browser when there is nowhere to go up to", () => {
    const h = fakeHistory(); undo = h.restore;
    const off = onHardwareBack(() => false);
    pop();
    expect(h.calls.back, "home swallowed the press and the app cannot be left").toBe(1);
    expect(h.calls.push, "it re-armed on a press it did not consume").toBe(1);
    off();
  });

  /**
   * `history.back()` inside a `popstate` handler can fire another one, and at home the
   * answer is `false` every time — so without the latch the app asks to leave, is asked
   * again, and spins.
   */
  it("only tries to leave once", () => {
    const h = fakeHistory(); undo = h.restore;
    const off = onHardwareBack(() => false);
    pop(); pop(); pop();
    expect(h.calls.back, "it asked to leave on every event").toBe(1);
    off();
  });

  /** A throw must not take the gesture down for the rest of the session. */
  it("keeps the gesture alive when the app throws", () => {
    const h = fakeHistory(); undo = h.restore;
    const off = onHardwareBack(() => { throw new Error("nope"); });
    expect(() => pop()).not.toThrow();
    expect(h.calls.back, "a bug in a screen leaked the press and closed the app").toBe(0);
    expect(h.calls.push, "the gesture was left unarmed").toBe(2);
    off();
  });

  it("stops listening when torn down", () => {
    const h = fakeHistory(); undo = h.restore;
    const handler = vi.fn(() => true);
    onHardwareBack(handler)();
    pop();
    expect(handler).not.toHaveBeenCalled();
  });
});
