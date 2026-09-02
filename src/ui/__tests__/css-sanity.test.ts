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
  /**
   * The TOP bar's contents join the reading column, so a tablet does not get a currency
   * row spread across eleven hundred pixels while the cards under it sit in a narrow
   * one. The TAB TRAY deliberately does not: five tabs are targets rather than text and
   * they fill the bar, which on a phone means no side padding at all.
   */
  it("keeps the top bar lined up with the column", () => {
    const css = read("skin.css");
    expect(css, "the top bar does not follow the column").toMatch(
      /\.topnav\s*\{[^}]*padding-inline:\s*max\(16px,\s*calc\(\(100% - var\(--page\)\)/,
    );
  });

  /**
   * HOME IS ONE PAIR OF EDGES. Its gutter is a single variable and nothing on the screen
   * sets its own inset — the banner and the granary pill live inside a full-bleed block
   * and ended up hard against the glass when the tab tray's gutter came off, while the
   * hero under them sat at the gutter. Three insets on one screen.
   */
  it("puts everything on home on one gutter", () => {
    const css = code(read("skin.css"));
    expect(ruleFor(css, "#home"), "home has no gutter of its own").toMatch(/--gutter:\s*\d+px/);
    for (const sel of ["#home .granpill", "#home .homeplay"]) {
      expect(ruleFor(css, sel), `${sel} is not on home's gutter`)
        .toMatch(/var\(--gutter\)|var\(--homemax\)/);
    }
    // The full-bleed top block escapes by the SAME number it is put back by, or it
    // overhangs the screen it is meant to fill.
    expect(ruleFor(css, "#home .tophead")).toContain("calc(-1 * var(--gutter))");
  });

  it("lets the tab tray fill the bar on a phone", () => {
    const css = read("skin.css");
    expect(css, "the tab tray still pads itself in").toMatch(
      /\.homenav\s*\{[^}]*padding-inline:\s*max\(0px,/,
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

/**
 * ONE VERTICAL RHYTHM.
 *
 * Every screen that is a column of rows had picked its own gap — 6 between friends, 6
 * between research levels, 6 between granary levels, 8 between settings rows, 8 between
 * challenge cards, 10 between collection rows — with four different heading margins over
 * them. No two of these screens sat on the same grid, and the app read as several apps
 * stitched together. Nothing failed; it just never looked designed.
 *
 * The step is `--stack` and a heading adds 12 above itself. This holds both.
 */
/**
 * The rule whose selector is EXACTLY this one, at the start of a line. `.challist` also
 * appears as `.slide .challist` — a different rule about overscroll — and a plain
 * `indexOf` finds that one first and reads a rule the check is not about.
 */
const ruleFor = (css: string, selector: string): string => {
  const at = css.search(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m"));
  expect(at, `${selector} is not in the stylesheet any more`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
};

describe("the app is on one vertical rhythm", () => {
  const STACKS = [
    "#profileBody", ".pf-coll", ".setwrap", ".frpanel", ".frlist",
    ".spwrap", ".spgwrap", ".challist", ".histlist",
  ];

  it("spaces every stacking column by the same step", () => {
    const css = code(read("skin.css"));
    expect(css, "the step itself is gone").toMatch(/--stack:\s*\d+px/);
    for (const sel of STACKS) {
      expect(ruleFor(css, sel), `${sel} spaces its rows by a number of its own`)
        .toMatch(/gap:\s*var\(--stack\)/);
    }
  });

  /**
   * A heading needs MORE air above it than a row does — that space is what makes it read
   * as the start of a section — and none of its own below, because the step already
   * separates it from what it introduces.
   */
  it("gives every section heading the same air above it", () => {
    const css = code(read("skin.css"));
    for (const sel of ["#profileBody > .secthead", ".setwrap .secthead",
      ".frpanel .secthead", ".spwrap .secthead", ".spgwrap .secthead"]) {
      expect(ruleFor(css, sel), `${sel} sets its own heading spacing`)
        .toContain("margin: 12px 0 0");
    }
  });
});
