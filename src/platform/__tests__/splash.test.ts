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
import { dropSplash, hideSplash, resetSplash } from "../splash";

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
    // The one mention `skin.css` is allowed is the exemption below, which DRESSES nothing.
    // Comments are stripped first, or this reads the paragraph explaining the exemption.
    const skin = readFileSync(resolve(__dirname, "../../ui/skin.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const line of skin.split("\n")) {
      if (line.includes("#splash")) expect(line).toContain("background-image: none");
    }
  });

  /**
   * THE PICTURE IS A LAYER, NEVER THE COVER. It is a second request and it can land after
   * the thing it was meant to cover, which used to be the argument against having one at
   * all — so the wordmark is still DRAWN into the markup and the soil colour is still the
   * background underneath it. A splash.webp that never arrives leaves exactly the cover
   * that shipped before there was one.
   */
  it("draws the wordmark rather than depending on the picture", () => {
    const block = html.slice(html.indexOf('id="splash"'), html.indexOf("</body>"));
    expect(block).not.toContain("<img");
    expect(block).toContain("ZOMBIE");
    const rule = html.slice(html.indexOf("#splash {"), html.indexOf("#splash.gone"));
    expect(rule, "the artwork is not a background layer").toContain("splash.webp");
    expect(rule, "there is no colour under the picture").toContain("#0e1a12");
  });

  /** And the file is really there to be named, in `public/` where the document can see it. */
  it("ships the artwork beside the document", () => {
    expect(() => readFileSync(resolve(__dirname, "../../../public/splash.webp"))).not.toThrow();
  });

  /**
   * AND `skin.css` EXEMPTS IT. That sheet clears every background image in the app with
   * `!important`, and it lands while the cover is still up — so without the exemption the
   * picture is stripped off it in front of the player, silently.
   */
  it("is exempt from the stylesheet's blanket background reset", () => {
    const skin = readFileSync(resolve(__dirname, "../../ui/skin.css"), "utf8");
    const blanket = skin.split("\n").find((l) => l.includes("background-image: none !important"));
    expect(blanket, "the blanket rule moved").toBeTruthy();
    expect(blanket).toContain(":not(#splash)");
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
  /** The floor the cover is held up for, however fast the game loaded (`MIN_MS`). */
  const FLOOR = 2000;

  it("removes the cover rather than leaving it over the game", async () => {
    vi.useFakeTimers();
    hideSplash();
    await vi.advanceTimersByTimeAsync(FLOOR + 1000);
    expect(there(), "the cover was left in the document").toBe(false);
  });

  /**
   * IT IS UP FOR AT LEAST TWO SECONDS, HOWEVER FAST THE GAME LOADS.
   *
   * Asked for directly, and the artwork is why: a painted cover that flashes past in two
   * hundred milliseconds on a warm cache is a picture nobody sees and a game that looks
   * like it stuttered on the way in.
   */
  it("holds for two seconds even when the app is ready at once", async () => {
    vi.useFakeTimers();
    hideSplash();
    await vi.advanceTimersByTimeAsync(FLOOR - 200);
    expect(there(), "the cover came down early").toBe(true);
    expect(document.getElementById("splash")?.classList.contains("gone"),
      "it started fading before its two seconds were up").toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(there(), "the cover never came down").toBe(false);
  });

  /**
   * THE FLOOR IS NOT FOR A BOOT THAT FAILED. Two seconds of looking at a picture on top of
   * the one screen that says what went wrong is the fault the watchdog exists to prevent.
   */
  it("goes at once on a crash, floor or no floor", () => {
    dropSplash();
    expect(there(), "the crash path waited out the floor").toBe(false);
  });

  it("fades before it goes, so the screen under it is not cut to", async () => {
    vi.useFakeTimers();
    hideSplash();
    await vi.advanceTimersByTimeAsync(FLOOR + 20);
    expect(document.getElementById("splash")?.classList.contains("gone")).toBe(true);
    expect(there(), "it was removed before the fade could play").toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(there()).toBe(false);
  });

  it("does nothing when there is no cover, and survives being called twice", async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    expect(() => { hideSplash(); hideSplash(); }).not.toThrow();
    await vi.advanceTimersByTimeAsync(FLOOR + 1000);
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
