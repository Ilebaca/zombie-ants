/**
 * THE GAME IS PLAYED UPRIGHT.
 *
 * The lock is the half that fails most of the time, and it has to fail QUIETLY: an
 * ordinary browser tab refuses it and iOS Safari does not implement it at all, so a
 * rejection here is the normal case rather than an error. What must never happen is an
 * unhandled rejection on every load, or a throw that takes the first tap down with it.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { lockPortrait } from "../orientation";

const withScreen = (screen: unknown): void => {
  Object.defineProperty(globalThis, "screen", { value: screen, configurable: true, writable: true });
};

afterEach(() => { withScreen(undefined); });

describe("asking for portrait", () => {
  it("asks for portrait when the device allows it", () => {
    const lock = vi.fn(() => Promise.resolve());
    withScreen({ orientation: { lock } });
    lockPortrait();
    expect(lock).toHaveBeenCalledWith("portrait");
  });

  /** A browser tab refuses. That is the ordinary case, and it must be silent. */
  it("swallows a refusal", async () => {
    const lock = vi.fn(() => Promise.reject(new Error("NotSupportedError")));
    withScreen({ orientation: { lock } });
    expect(() => lockPortrait()).not.toThrow();
    // Give the rejection a turn to land: an unhandled one fails the run.
    await Promise.resolve();
    await Promise.resolve();
  });

  /** iOS Safari has no `lock` at all, and older engines have no `orientation`. */
  it("does nothing on a device that cannot do this", () => {
    withScreen({ orientation: {} });
    expect(() => lockPortrait()).not.toThrow();
    withScreen({});
    expect(() => lockPortrait()).not.toThrow();
    withScreen(undefined);
    expect(() => lockPortrait()).not.toThrow();
  });

  /** And a getter that throws — some embedded browsers do — is not a crash either. */
  it("survives a screen object that throws when read", () => {
    withScreen({ get orientation(): never { throw new Error("nope"); } });
    expect(() => lockPortrait()).not.toThrow();
  });
});
