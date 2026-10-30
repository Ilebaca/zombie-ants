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

/**
 * THE APP CLEARS EVERY BACKGROUND IMAGE (§10), so a `background: <gradient>` written
 * on anything the blanket does not EXEMPT is a declaration that never takes effect —
 * the same silent failure as a doubled unit, and it happened twice on the lucky hatch
 * before this existed.
 *
 * THE EXEMPT LIST IS READ OUT OF THE BLANKET ITSELF rather than typed here. It was
 * `#home` alone, which was right while home was the only picture in the app; the hatch
 * wears a vignette over its chamber now and the fourth exemption is a CLASS. A second
 * copy of that list is a second thing to keep in step, and the day it fell behind this
 * test would be failing a rule that works perfectly.
 */
describe("no rule paints a gradient the app has already cleared", () => {
  it("has no gradient outside what the blanket exempts", () => {
    const css = code(read("skin.css"));
    const blanket = css.split("\n").find((l) => l.includes("background-image: none !important"));
    expect(blanket, "the blanket rule moved").toBeTruthy();
    const exempt = [...(blanket ?? "").matchAll(/:not\(([^)]+)\)/g)].map((m) => m[1] ?? "");
    expect(exempt.length, "the blanket exempts nothing").toBeGreaterThan(0);

    const bad: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selector = (m[1] ?? "").trim();
      // `background` and `background-image` ONLY. A gradient in a `mask-image` is
      // untouched by the blanket rule and is exactly how the matchmaking reel fades its
      // ends — the first version of this check called that a fault.
      const paints = [...(m[2] ?? "").matchAll(/(^|[;{])\s*(background(?:-image)?)\s*:([^;]*)/g)]
        .some((d) => /gradient\(/.test(d[3] ?? ""));
      if (!paints) continue;
      if (selector.startsWith("@")) continue;
      // A pseudo-element is NEVER exempt, however its own element is spelled.
      if (!/::(before|after)/.test(selector) && exempt.some((e) => selector.includes(e))) continue;
      bad.push(selector.slice(0, 60));
    }
    expect(bad, "these gradients are cleared by the app-wide rule").toEqual([]);
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
    expect(rulesFor(css, "#home"), "home has no gutter of its own").toMatch(/--gutter:\s*\d+px/);
    for (const sel of ["#home #colonyHero,\n#home .granpill", "#home .homeplay"]) {
      expect(ruleFor(css, sel), `${sel} is not on home's gutter`)
        .toMatch(/var\(--gutter\)|var\(--homemax\)/);
    }
    // The full-bleed top block escapes by the SAME number it is put back by, or it
    // overhangs the screen it is meant to fill.
    expect(ruleFor(css, "#home .tophead")).toContain("calc(-1 * var(--gutter))");
  });

  /**
   * THREE BODIES THAT IGNORED THE COLUMN. `.achbody`, `.lbbody` and `.shopbody` each set
   * `width: 100%` in the legacy sheet, and two classes outrank the one rule that puts a
   * `.screenbody` in the reading column — so on a tablet the Colony Road, the Leaderboard
   * and the Shop each had a 440px header sitting over an 800px body. Nothing showed on a
   * phone, which is why it survived the responsive pass.
   */
  it("keeps every screen body in the column, including the three that opted out", () => {
    const css = code(read("skin.css"));
    const rule = ruleFor(css, ".screenbody.achbody,\n.screenbody.lbbody,\n.screenbody.shopbody");
    expect(rule).toMatch(/width:\s*min\(100%, var\(--page\)\)/);
    expect(rule).toContain("margin-inline: auto");
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
/**
 * EVERY block for a selector, not the first one.
 *
 * `#home` is written twice on purpose — the artwork in the HOME section and the gutter in
 * the responsive one — and a helper that stops at the first block asserted against
 * whichever happened to come first in the file.
 */
const rulesFor = (css: string, selector: string): string => {
  const head = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "gm");
  const out: string[] = [];
  for (const m of css.matchAll(head)) out.push(css.slice(m.index, css.indexOf("}", m.index)));
  expect(out.length, `${selector} is not in the stylesheet any more`).toBeGreaterThan(0);
  return out.join("\n");
};

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

/**
 * A PORTRAIT IS EITHER A PAINTING OR A DRAWING, AND A BOX HAS TO SIZE BOTH.
 *
 * `antPortrait` answers with an `<img>` when the colony has a painted face and a
 * `<canvas>` when it has to be drawn — so a box that sizes only `canvas` sizes half of
 * them, and the other half render at whatever the file is. That is exactly what happened
 * to the match history: the face came out at twice the row's height, overlapping the rows
 * above and below and the text beside it, on every row in the list.
 *
 * The four surfaces below are the ones that are ALWAYS drawn — a board, a replay stage, a
 * news picture — and can never be handed an image, so naming one there would be a
 * selector that matches nothing.
 */
describe("a box that sizes a portrait sizes both kinds", () => {
  const DRAWN_ONLY = [".setupstage", ".replaystage", ".newshero"];

  it("names img wherever it names canvas", () => {
    const css = code(read("skin.css"));
    const bad: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selector = (m[1] ?? "").trim();
      const body = m[2] ?? "";
      if (!/(^|[;{])\s*width\s*:/.test(body)) continue;
      // A child combinator is the same reach as a descendant one for this question, so
      // `.ccard canvas, .ccard > img` counts as a pair rather than as a miss.
      const parts = selector.split(",").map((s) => s.trim().replace(/\s*>\s*/g, " "));
      for (const part of parts) {
        if (!/\bcanvas$/.test(part)) continue;
        if (DRAWN_ONLY.some((drawn) => part.includes(drawn))) continue;
        if (!parts.includes(part.replace(/\bcanvas$/, "img"))) bad.push(part);
      }
    }
    expect(bad, "these boxes size a drawn portrait and not a painted one").toEqual([]);
  });
});

/**
 * A SOLID BUTTON STAYS SOLID WHILE IT IS WORKING.
 *
 * The hatch button is the one filled slab on a screen that is otherwise a lit painting,
 * and it is disabled for the whole of the hold — so `opacity: .7` on `[disabled]` let the
 * chamber through it at exactly the moment the player is watching that corner of the
 * screen. Reported as the button going transparent. Darkening the FILL says "working"
 * without saying "gone", and opacity is the only way to say it that cannot.
 */
/**
 * THE SETUP RAIL HAS NO PLATE UNDER IT.
 *
 * It shows the CUT-OUT set, so the ground under the ant is the screen's own. The box
 * carried `#1a120a` from when the rail showed the painted set, and a brown rectangle
 * behind a transparent picture is the one thing a cut-out is made to remove — reported
 * as the image "somehow still having a brown background". The species page's hero keeps
 * that colour, because the paintings are lit on exactly it.
 */
describe("the colony rail", () => {
  it("shows the cut-out on the screen's own ground", () => {
    const css = read("skin.css");
    expect(rulesFor(css, ".coverslide"), "the rail grew a plate under the cut-out again")
      .not.toMatch(/background(-color)?\s*:\s*#/);
    expect(rulesFor(css, ".spgcover"), "the hero lost the ground its paintings are lit on")
      .toMatch(/background\s*:\s*#1a120a/);
  });
});

describe("the hatch button while it is hatching", () => {
  it("darkens its fill rather than going see-through", () => {
    // `rulesFor` escapes the brackets itself, so the selector is written as it is in the file.
    const rule = rulesFor(read("skin.css"), ".hatchbtn[disabled]");
    expect(rule, "it is transparent again while hatching").not.toMatch(/(^|[;{])\s*opacity\s*:/);
    expect(rule, "the fill was dropped, so there is nothing to darken")
      .toMatch(/background\s*:\s*color-mix/);
  });
});

/**
 * THE ROAD'S CHAPTER PANELS ARE EXEMPT FROM THE BACKGROUND BLANKET.
 *
 * `*:not(#home)… { background-image: none !important }` near the top of `skin.css` clears
 * every background image in the app, because a gradient cannot be selected for (§10). Each
 * chapter of the Colony Road wears its own painting, set inline by `ui/road.ts` — so
 * without `:not(.rd-chap)` the fifty pictures are stripped off with `!important` and the
 * screen comes back grey, silently, which is exactly the fault that blanket creates. The
 * blanket's own comment says adding a picture means adding it there; this is the fourth.
 *
 * It is held HERE as well as by the screen's test because nothing a jsdom test can see
 * would notice: the inline style is set either way, and only the cascade removes it.
 */
describe("the road's artwork", () => {
  it("is let through the stylesheet's background blanket", () => {
    const blanket = read("skin.css").split("\n")
      .find((l) => l.includes("background-image: none !important"));
    expect(blanket, "the blanket rule moved").toBeTruthy();
    expect(blanket, "every chapter's picture is being stripped off").toContain(":not(.rd-chap)");
    // And the picture cannot be hidden on a pseudo-element instead — those are blanketed
    // with no exemption at all, so the art has to be on the element itself.
    expect(blanket).toContain("*::before");
  });

  /**
   * AND NOTHING IS LAID OVER IT. Asked for directly: no dark overlay, no rounded
   * corners, no gap between the chapters and no margins at the sides. All four are
   * absences, which is the one kind of decision a stylesheet cannot show — a scrim
   * written back onto the panel, or the reading column reapplied, looks like an
   * ordinary rule rather than the thing the screen was corrected for. The ratios the
   * labels pass are measured against the PICTURE now (the plates under them), so a
   * tint put back would be contrast nobody is relying on.
   */
  it("lays nothing over the picture and keeps no margins", () => {
    const css = code(read("skin.css"));
    expect(css, "the chapter panels are tinted again").not.toMatch(/^\.rd-chap::(before|after)\s*\{/m);

    const panel = rulesFor(css, ".rd-chap");
    expect(panel, "the panels are rounded again").not.toMatch(/border-radius/);
    expect(panel, "there is a gap between the chapters again").not.toMatch(/margin/);
    expect(rulesFor(css, ".rd-gate"), "there is a gap under the breaker again")
      .not.toMatch(/margin/);

    // The road is the one screen body in the app that is edge to edge: it escapes
    // `.screen`'s gutter by the same number, rather than that padding being removed.
    const body = rulesFor(css, "#achievements > .screenbody.achbody");
    expect(body, "the road is back inside the reading column").not.toMatch(/var\(--page\)/);
    expect(body, "the road has side margins again")
      .toMatch(/margin-inline:\s*calc\(-1 \* var\(--sp4\)\)/);
    // ...but NOT the bottom one, which is the room the tab bar stands in.
    expect(body, "the road runs underneath the tab bar").not.toMatch(/margin-bottom/);
  });
});

/**
 * THE HATCH'S VIGNETTE IS A LAYER ON THE ELEMENT, NOT A PSEUDO-ELEMENT.
 *
 * Everything but the middle of the chamber is dimmed, so the burrow reads as a
 * hole with one thing lit in it. A gradient IS a background image, and the
 * blanket at the top of `skin.css` clears every `*::before` and `*::after`
 * with `!important` and NO exemption — so written there the wash is silently
 * nothing at all, which is the trap `#home::after` is already on record for.
 * `#luckyhatch` itself is one of the four exempt selectors, and
 * `background-image` stacks, so the wash rides in front of the picture in the
 * same declaration.
 *
 * Nothing a jsdom test can see would notice: both spellings parse, and only
 * the cascade decides which one paints.
 */
describe("the lucky hatch's vignette", () => {
  it("rides on the screen's own background, in front of the picture", () => {
    const css = read("skin.css");
    const rule = rulesFor(css, "#luckyhatch");
    expect(rule, "the chamber lost its picture").toContain("backdrops/hatch.webp");
    expect(rule, "the vignette is gone").toContain("radial-gradient");
    // Layer order is front-to-back, so the wash has to be written FIRST or it
    // is painted behind the picture and does nothing.
    const layers = /background-image:([\s\S]*?);/.exec(rule)?.[1] ?? "";
    expect(layers.indexOf("radial-gradient"), "the wash is behind the picture")
      .toBeLessThan(layers.indexOf("backdrops/hatch.webp"));
    // And it must not have moved onto a pseudo-element, where the blanket eats it.
    expect(css, "a vignette on a pseudo-element is cleared with !important")
      .not.toMatch(/#luckyhatch::(before|after)\s*\{[^}]*gradient/);
  });
});
