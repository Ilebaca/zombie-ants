/**
 * DECLARATIONS THAT DO NOTHING.
 *
 * CSS fails SILENTLY: a malformed value is dropped and the rest of the rule still applies,
 * so `border-radius: 12pxpx` is not an error anywhere — it is a corner that quietly stays
 * square while the file says it is round. Twelve of those had accumulated in `skin.css`,
 * every one of them a considered decision that was never actually taking effect, and the
 * only reason any of them was found was a search for something else.
 *
 * Nothing here is about taste. Each check is for a value the browser THROWS AWAY.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (name: string): string =>
  readFileSync(resolve(__dirname, "..", name), "utf8");

const SHEETS = ["skin.css", "game.css"];

/** Strip comments, so a unit written inside prose is not a finding. */
const code = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("every declaration does something", () => {
  it("has no doubled units", () => {
    for (const sheet of SHEETS) {
      const bad = [...code(read(sheet)).matchAll(/\d+(px|em|rem|%|vh|vw)\1/g)].map((m) => m[0]);
      expect(bad, `${sheet} has values the browser drops`).toEqual([]);
    }
  });

  /**
   * A length with no unit is dropped too — except zero, which is legal, and except inside
   * the handful of properties that take bare numbers.
   */
  it("has no unitless lengths", () => {
    const UNITLESS = /^(z-index|opacity|flex|flex-grow|flex-shrink|order|zoom|line-height|font-weight|scale|grid-row|grid-column|grid-row-start|grid-row-end|grid-column-start|grid-column-end|columns|column-count|animation-iteration-count|-webkit-line-clamp|stroke-width|tab-size|aspect-ratio)$/;
    for (const sheet of SHEETS) {
      const bad: string[] = [];
      for (const m of code(read(sheet)).matchAll(/(^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]+)/g)) {
        const prop = m[2] ?? "", value = (m[3] ?? "").trim();
        if (UNITLESS.test(prop)) continue;
        if (!/^(width|height|min-width|min-height|max-width|max-height|top|right|bottom|left|gap|row-gap|column-gap)$/.test(prop)) continue;
        if (/^\d+(\.\d+)?$/.test(value) && value !== "0") bad.push(`${prop}: ${value}`);
      }
      expect(bad, `${sheet} has lengths with no unit`).toEqual([]);
    }
  });
});

describe("the design scales", () => {
  /**
   * The whole point of the responsive pass: on a bigger screen the COLUMN grows and the
   * type does not. If a breakpoint ever starts scaling font sizes, the app stops looking
   * like itself at one size and starts looking like a phone app blown up at another.
   */
  it("grows the page column on wider screens", () => {
    const css = read("skin.css");
    const widths = [...css.matchAll(/@media \(min-width: (\d+)px\)\s*\{\s*:root\s*\{\s*--page: (\d+)px/g)]
      .map((m) => [Number(m[1]), Number(m[2])] as const);
    expect(widths.length, "no breakpoint widens the content column").toBeGreaterThanOrEqual(2);
    // Each step has to be wider than the one before it, in both directions.
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]?.[0] ?? 0).toBeGreaterThan(widths[i - 1]?.[0] ?? 0);
      expect(widths[i]?.[1] ?? 0).toBeGreaterThan(widths[i - 1]?.[1] ?? 0);
    }
  });

  /** And the chrome follows the column, or a tablet gets an 1100px bar over a 500px page. */
  it("keeps the bars lined up with the column", () => {
    const css = read("skin.css");
    expect(css, "the top bar does not follow the column").toMatch(
      /\.topnav,\s*\n\.homenav\s*\{[^}]*padding-inline:\s*max\(/,
    );
  });
});

describe("the game is played upright", () => {
  /**
   * The shade is the half that actually holds the line: `screen.orientation.lock` is
   * refused in a browser tab and absent on iOS, so on most devices this rule IS the
   * portrait lock.
   */
  it("covers the app when a handheld device is turned sideways", () => {
    const css = read("skin.css");
    expect(css, "nothing stops the app rendering in landscape").toMatch(
      /@media \(orientation: landscape\) and \(pointer: coarse\)\s*\{[^}]*#rotate\s*\{\s*display:\s*flex/,
    );
  });

  /**
   * `pointer: coarse` and not a screen size. A tablet held sideways is 1100px tall and
   * would sail through any height threshold; a laptop window is landscape by nature and
   * must never be told to rotate.
   */
  it("does not tell a laptop to rotate", () => {
    const css = read("skin.css");
    const rule = css.slice(css.indexOf("@media (orientation: landscape)"));
    expect(rule.startsWith("@media (orientation: landscape) and (pointer: coarse)"),
      "the shade is gated on something other than a coarse pointer").toBe(true);
  });

  /**
   * In the DOCUMENT, not built by the app. A phone held sideways while the bundle is still
   * loading must not show the layout sideways, even for a frame.
   */
  it("ships the shade in the html, before any script runs", () => {
    const html = readFileSync(resolve(__dirname, "..", "..", "..", "index.html"), "utf8");
    expect(html).toContain('id="rotate"');
    expect(html.indexOf('id="rotate"'), "the shade is built after the script tag")
      .toBeLessThan(html.indexOf("main.ts"));
  });
});
