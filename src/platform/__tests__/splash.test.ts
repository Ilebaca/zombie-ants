/**
 * THE COVER OVER A COLD BOOT (`#splash` in index.html, platform/splash.ts).
 *
 * `#app` is empty until the bundle has run, so a cold load showed a bare dark rectangle for
 * most of a second. The cover fills it — and everything worth testing here is about it
 * GOING AWAY, because a full-screen element left behind is a worse fault than the blank
 * moment it was added for: it takes every tap on the home screen underneath.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { catchCrashes, resetCrash } from "../crash";
import { hideSplash, resetSplash } from "../splash";

const html = readFileSync(resolve(__dirname, "../../../index.html"), "utf8");

/** The cover as the document really carries it. */
function cover(): void {
  document.body.innerHTML = `<div id="app"></div>
    <div id="splash" aria-hidden="true">
      <div class="sp-mark"><b>ZOMBIE</b><span>ANTS</span></div>
      <div class="sp-bar"><i></i></div>
    </div>`;
}

const there = (): boolean => !!document.getElementById("splash");

beforeEach(() => { resetSplash(); resetCrash(); cover(); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe("the markup", () => {
  /**
   * IT HAS TO BE IN THE DOCUMENT. Anything the app builds arrives at exactly the moment the
   * app does, which is the moment the cover stops being needed.
   */
  it("ships in index.html rather than being built by the app", () => {
    expect(html).toContain('id="splash"');
  });

  /**
   * AND ITS STYLES INLINE. `skin.css` is emitted by the bundler and is one more file to
   * wait for; the one thing a cover must not do is wait for a download.
   */
  it("carries its own styles inline, not in the bundled stylesheet", () => {
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toMatch(/#splash\s*\{/);
    const skin = readFileSync(resolve(__dirname, "../../ui/skin.css"), "utf8");
    expect(skin).not.toContain("#splash");
  });

  /** No image: everything in this game is drawn by the code that owns it, and an <img>
   *  here is a second request that can land after the thing it was meant to cover. */
  it("draws the wordmark rather than loading a picture", () => {
    const block = html.slice(html.indexOf('id="splash"'), html.indexOf("</body>"));
    expect(block).not.toContain("<img");
    expect(block).toContain("ZOMBIE");
  });

  /**
   * THE WATCHDOG. A bundle that 404s or throws before anything is armed would leave the
   * cover on screen for ever, hiding the very thing that would say what went wrong.
   */
  it("removes itself on a timer even if the app never boots", () => {
    expect(html).toMatch(/getElementById\("splash"\)[\s\S]{0,40}remove\(\)/);
  });
});

describe("taking it down", () => {
  it("removes the cover rather than leaving it over the game", async () => {
    vi.useFakeTimers();
    hideSplash();
    await vi.advanceTimersByTimeAsync(1000);
    expect(there(), "the cover was left in the document").toBe(false);
  });

  it("fades before it goes, so the screen under it is not cut to", async () => {
    vi.useFakeTimers();
    hideSplash();
    await vi.advanceTimersByTimeAsync(20);
    expect(document.getElementById("splash")?.classList.contains("gone")).toBe(true);
    expect(there(), "it was removed before the fade could play").toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(there()).toBe(false);
  });

  it("does nothing when there is no cover, and survives being called twice", async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    expect(() => { hideSplash(); hideSplash(); }).not.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
  });

  /**
   * A BOOT THAT THREW NEVER TOOK THE COVER DOWN, and the cover sits above everything — so
   * the panel that says what went wrong would be behind it.
   */
  it("is gone before the crash panel goes up", () => {
    const off = catchCrashes();
    window.dispatchEvent(new ErrorEvent("error", {
      error: new Error("boom"), message: "boom",
    }));
    expect(there(), "the crash panel came up behind the cover").toBe(false);
    expect(document.getElementById("crashpanel")).not.toBeNull();
    off();
  });
});
