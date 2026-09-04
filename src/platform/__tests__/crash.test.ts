/**
 * WHEN SOMETHING THROWS (platform/crash.ts).
 *
 * There was nothing at all before this: an exception went to a console nobody has on a
 * phone, and the game just stopped answering. Three things are worth holding — both kinds
 * of failure are caught, the panel comes up ONCE however many times the fault repeats, and
 * it carries the build, because on a phone a stale cached page and a real bug look
 * identical from the outside.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach } from "vitest";
import { BUILD } from "../build";
import { catchCrashes, resetCrash } from "../crash";

let off: (() => void) | null = null;
afterEach(() => { off?.(); off = null; resetCrash(); document.body.replaceChildren(); });

const panel = (): HTMLElement | null => document.getElementById("crashpanel");

/** A throw that reached the top of the stack, as the browser reports it. */
const threw = (message: string): void => {
  window.dispatchEvent(new ErrorEvent("error", { error: new Error(message), message }));
};

describe("catching what nothing else caught", () => {
  it("puts a panel up when something throws", () => {
    off = catchCrashes();
    expect(panel()).toBeNull();
    threw("board is not a function");
    expect(panel()).not.toBeNull();
    expect(panel()?.textContent).toContain("Something went wrong");
  });

  /**
   * A PROMISE NOBODY CAUGHT is the other half, and in this app it is the commoner one:
   * the search worker, the storage bridge and the build check are all asynchronous.
   */
  it("catches a rejected promise as well as a throw", () => {
    off = catchCrashes();
    const e = new Event("unhandledrejection") as Event & { reason?: unknown };
    e.reason = new Error("the bridge went away");
    window.dispatchEvent(e);
    expect(panel(), "an unhandled rejection was ignored").not.toBeNull();
  });

  /**
   * ONCE. One fault usually becomes many — a broken frame throws sixty times a second —
   * and a panel that redraws itself per frame is a worse fault than the one it reports.
   */
  it("shows one panel however many times it goes wrong", () => {
    off = catchCrashes();
    for (let i = 0; i < 20; i++) threw("again");
    expect(document.querySelectorAll("#crashpanel")).toHaveLength(1);
  });

  /** The build, and the message: it is the only thing a player can send to Support. */
  it("names the build it is running", () => {
    off = catchCrashes();
    threw("board is not a function");
    expect(panel()?.textContent).toContain(BUILD);
    expect(panel()?.textContent).toContain("board is not a function");
  });

  /** A dead end is not an answer. There is a way out, and it says the save is safe. */
  it("offers a way out and says the colony is kept", () => {
    off = catchCrashes();
    threw("boom");
    expect(document.getElementById("crashReload")).not.toBeNull();
    expect(panel()?.textContent).toContain("saved");
  });

  it("stops listening when it is taken down", () => {
    catchCrashes()();
    // With nothing listening the event really is unhandled, which is the point of the
    // test — and which the runner would otherwise report as a failure of its own.
    const swallow = (e: ErrorEvent): void => e.preventDefault();
    window.addEventListener("error", swallow);
    threw("boom");
    window.removeEventListener("error", swallow);
    expect(panel(), "it was still listening after being removed").toBeNull();
  });
});
