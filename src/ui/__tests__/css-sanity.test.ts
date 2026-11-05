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
    // AND IT IS THE ROOT TOKEN, because the TAB BAR is lifted by the same number and
    // the bar is on every deck screen — outside `#home`, where this variable lives.
    expect(rulesFor(css, ":root"), "the frame's inset is not the design's 12")
      .toMatch(/--hudgut:\s*calc\(12 \* var\(--u\)\)/);
    expect(rulesFor(css, "#home"), "home has a gutter of its own")
      .toMatch(/--gutter:\s*var\(--hudgut\)/);
    for (const sel of ["#home #colonyHero,\n#home .granpill", "#home .homeplay"]) {
      expect(ruleFor(css, sel), `${sel} is not on home's gutter`)
        .toMatch(/var\(--gutter\)|var\(--homemax\)/);
    }
    // The full-bleed top block escapes by the SAME number it is put back by, or it
    // overhangs the screen it is meant to fill.
    expect(rulesFor(css, "#home .tophead")).toContain("calc(-1 * var(--gutter))");
  });

  /**
   * AND THE SAME INSET ON THE TOP AS ON THE SIDES, asked for directly — the top bar sat
   * flush on the glass while everything beside it stood 12 off it. Two rules, one
   * number: the screen's top padding and its side padding.
   *
   * THE BOTTOM IS NOT ONE OF THEM, and that is a device fact rather than a preference:
   * iOS keeps the home-indicator strip outside the web view, so a lift of our own under
   * the tray only adds to a margin the phone has already taken. See the bar's own rule.
   *
   * THE GAP UNDER PLAY IS THREE OF IT, also asked for directly ("roughly side margin
   * times 3"), minus the row's own 8 of padding — what is read is the air between the
   * two BOXES, and the padding is already inside it. What it replaced was a share of the
   * viewport HEIGHT, which on a phone that is not the design's 800 tall put most of a
   * quarter of the screen between the button and the menu.
   *
   * Nothing a jsdom test can see would notice any of this: there is no layout, so only
   * the stylesheet says where the edges are.
   */
  it("insets the frame by one number on the sides and the top, and PLAY by three of it", () => {
    const css = code(read("skin.css"));
    const home = rulesFor(css, "#home");
    expect(home, "the top edge is not on the frame's inset")
      .toMatch(/padding-top:\s*calc\(var\(--gutter\) \+ env\(safe-area-inset-top\)\)/);
    expect(home, "the sides are not on the frame's inset")
      .toMatch(/padding-inline:\s*var\(--gutter\)/);
    // `rulesFor`, because `#home .homeplay` is written twice — the column cap in the
    // responsive block and the design's own padding in the HOME one.
    expect(rulesFor(css, "#home .homeplay"), "the gap under PLAY is not three insets")
      .toMatch(/margin-bottom:\s*calc\(3 \* var\(--gutter\) - 8 \* var\(--u\)\)/);
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

/**
 * ONE MEASUREMENT OFF THE MOCK-UP. Home is drawn to a fixed 360x800 frame and scaled to
 * the screen by `--u`, one design pixel — so a box the design draws at 24 is written
 * `calc(24 * var(--u))` and this builds the pattern that says so. Asserting the bare
 * number instead would pass just as well against a rule that had quietly fallen off the
 * scale and gone back to real pixels, which is exactly the regression worth catching.
 */
const dp = (prop: string, n: number): RegExp =>
  new RegExp(`${prop}:\\s*calc\\(${n} \\* var\\(--u\\)\\)`);

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

  /**
   * AND THE SAME IS TRUE OF A CHROME MARK, which is the second pair this app has.
   *
   * `hudMark` answers an `<img>` where a mark is painted (`ui/hud.ts`) and the drawn
   * `<svg>` where it is not, so a box that sizes only `svg` sizes whichever half has no
   * file yet and lets the rest render at 100px. The roots are where `hudMark` is used —
   * the home screen, the tab bar and the drawer — and a fourth would be a deliberate
   * change to this list rather than something that drifts into it.
   */
  it("names the painted mark wherever it sizes a drawn one", () => {
    const css = code(read("skin.css"));
    const ROOTS = ["#home", "#mainNav", ".menudraw"];
    // Every selector in the file that sizes something, flattened once: the pair may be
    // in the SAME rule (one size for both tags) or in a rule of its own, which is what a
    // box needs when the painted mark and the drawn one are different sizes.
    const sized: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!/(^|[;{])\s*width\s*:/.test(m[2] ?? "")) continue;
      for (const part of (m[1] ?? "").split(",")) sized.push(part.trim().replace(/\s*>\s*/g, " "));
    }
    const bad = sized.filter((part) =>
      /\bsvg$/.test(part) && ROOTS.some((root) => part.startsWith(root)) &&
      !sized.includes(`${part.replace(/\s*svg$/, "")} .hudmark`));
    expect(bad, "these boxes size a drawn mark and not a painted one").toEqual([]);
  });
});

/**
 * THE DRAWER (Figma `05-menu-drawer 3`). The same three things the rest of the redesign
 * is built from, minus the gloss: the panel is a hole cut in the screen rather than a
 * tile standing on it. Its position is the one number here that is not a style — it hangs
 * three pixels under the menu button, which only works while the top block starts at the
 * top of the frame.
 */
describe("the drawer is drawn to the design", () => {
  const css = code(read("skin.css"));

  it("hangs off the menu button", () => {
    // 166 is measured from the TOP OF THE FRAME, so the screen's own inset has to be
    // added here as well or the panel climbs back up over the button it hangs off.
    expect(rulesFor(css, ".menuwrap"))
      .toMatch(/padding:\s*calc\(166 \* var\(--u\) \+ var\(--hudgut\) \+ env\(safe-area-inset-top\)\)/);
  });

  /** The block above it is what 166 is measured from, so the screen's own top inset has
   *  to be the frame's own gutter and the NOTCH and nothing else — `.screen` pads by
   *  `--sp4` on top of both, which pushed the whole block down by another 16. */
  it("starts the top block at the frame's own inset", () => {
    expect(rulesFor(css, "#home"))
      .toMatch(/padding-top:\s*calc\(var\(--gutter\) \+ env\(safe-area-inset-top\)\)/);
    expect(rulesFor(css, "#home .tophead"), "the bar's own escape would hang it off the top")
      .toMatch(/margin-top:\s*0/);
  });

  it("wears the face and the ledge, and no gloss", () => {
    const panel = rulesFor(css, ".menudraw");
    expect(panel).toMatch(/background:\s*var\(--hud-face\)/);
    expect(panel).toMatch(/box-shadow:\s*var\(--hud-ledge\)\s*!important/);
    expect(panel, "the panel is a hole, not a tile standing on the screen")
      .not.toContain("--hud-gloss");
    expect(panel).toMatch(dp("padding", 12));
    expect(panel).toMatch(dp("gap", 16));
  });

  it("gives every row the design's own plate", () => {
    const row = rulesFor(css, ".menudraw .menuitem");
    expect(row).toMatch(dp("height", 24));
    expect(row).toMatch(/background:\s*rgba\(255, 255, 255, \.05\)/);
    expect(row).toMatch(dp("font-size", 12));
    expect(row).toMatch(/color:\s*var\(--hud-ink\)/);
  });

  /** The design has no scrim: the artwork behind it is the point, and the panel brings
   *  its own ground. A tap outside still closes it — the wrapper is still the full
   *  screen, it just no longer paints over it. */
  it("lays nothing over the artwork behind it", () => {
    const wrap = rulesFor(css, ".menuwrap");
    expect(wrap).toMatch(/background:\s*none/);
    expect(wrap).toMatch(/backdrop-filter:\s*none/);
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
 * as the image "somehow still having a brown background". The species cover must also
 * stay transparent so its cut-out stands directly on the page.
 */
describe("the colony rail", () => {
  it("shows the cut-out on the screen's own ground", () => {
    const css = read("skin.css");
    expect(rulesFor(css, ".coverslide"), "the rail grew a plate under the cut-out again")
      .not.toMatch(/background(-color)?\s*:\s*#/);
    expect(rulesFor(css, ".spgcover"), "the cover grew a separate fill behind the cut-out")
      .toMatch(/background\s*:\s*(?:transparent|none)\s*;/);
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

  /**
   * AND THE HANDFUL UNDER IT IS ALWAYS DRAWN, so it has a state for a purse that cannot
   * cover ten — which has to read as UNCLICKABLE rather than merely quiet. It is an
   * OUTLINE, so dimming the ink alone leaves a dead label inside a live green border,
   * which is what the button above it looks like while it is working. Nothing a jsdom
   * test can see says a word about this: the attribute is set either way.
   */
  it("dims the handful's border as well as its ink", () => {
    const rule = rulesFor(read("skin.css"), ".hatchbtn.bulk[disabled]");
    expect(rule, "the ink is still the live green").toMatch(/color\s*:\s*var\(--muted\)/);
    expect(rule, "a dim label is sitting inside a live border").toMatch(/border-color\s*:/);
    expect(rule, "it went see-through instead").not.toMatch(/(^|[;{])\s*opacity\s*:/);
  });
});

/** Road areas use uninterrupted flat fills from edge to edge. */
describe("the road's area fills", () => {
  it("clears background images from the chapter panels", () => {
    const blanket = read("skin.css").split("\n")
      .find((l) => l.includes("background-image: none !important"));
    expect(blanket).toBeTruthy();
    expect(blanket).not.toContain(":not(.rd-chap)");
    expect(blanket).toContain("*::before");
    expect(rulesFor(read("skin.css"), ".rd-chap")).toMatch(/background-image:\s*none/);
  });

  it("keeps the fills unobstructed and edge to edge", () => {
    const css = code(read("skin.css"));
    expect(css, "area fills have a full-panel overlay").not.toMatch(/^\.rd-chap::after\s*\{/m);

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

/**
 * THE HOME SCREEN'S DESIGN LANGUAGE (Figma `03-home 2`).
 *
 * This screen is built out of three things — a face, a hard black ledge and one inset
 * hairline of gloss — and every one of them is the kind of decision a stylesheet cannot
 * show is missing. The ledge in particular is drawn ON TOP of a blanket that says "no
 * shadows, anywhere, `!important`": lose the `!important` on any one rule and that
 * control goes flat while everything around it stays raised, with nothing failing.
 */
describe("the home screen's ledge survives the blanket", () => {
  const css = code(read("skin.css"));

  /** The blanket is the reason the `!important`s below are needed. If it ever goes, these
   *  tests should be deleted rather than quietly left passing against nothing. */
  it("still has the blanket that makes this necessary", () => {
    expect(css, "the no-shadows blanket is gone")
      .toMatch(/\*:not\(\.playbtn\)\s*\{\s*box-shadow:\s*none\s*!important/);
  });

  it("marks every ledge important, or the blanket wins", () => {
    const weak: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*--hud-ledge[^{}]*)\}/g)) {
      const body = m[2] ?? "";
      for (const decl of body.split(";")) {
        if (!decl.includes("--hud-ledge") || !decl.trim().startsWith("box-shadow")) continue;
        if (!decl.includes("!important")) weak.push((m[1] ?? "").trim());
      }
    }
    expect(weak, "these would be flattened by the blanket").toEqual([]);
  });

  /** The two figures sit on a green slab and a near-black one with no plate behind them;
   *  the text ledge is what carries them. `text-shadow: none !important` blankets those. */
  it("marks the text ledges important too", () => {
    for (const sel of ["#home .col-n", "#home .granpill .gp-n"]) {
      expect(ruleFor(css, sel), `${sel} lost its text ledge`)
        .toMatch(/text-shadow:[^;]*!important/);
    }
  });

  /** One table, and the design's own values. */
  it("keeps the palette in one place", () => {
    const root = rulesFor(css, ":root");
    expect(root).toMatch(/--hud-face:\s*#1c1e25/i);
    expect(root).toMatch(/--hud-go:\s*#4ac707/i);
    // The ledge and the gloss are MEASUREMENTS off the mock-up like everything else on
    // this screen, so they ride the design scale too: a 3px ledge under a HUD scaled up
    // a fifth is a thinner edge than the one that was drawn.
    expect(root).toMatch(/--hud-ledge:\s*calc\(3 \* var\(--u\)\) calc\(4 \* var\(--u\)\) 0 #000/i);
    expect(root)
      .toMatch(/--hud-gloss:\s*inset 0 calc\(2 \* var\(--u\)\) 0 rgba\(255, 255, 255, \.4\)/i);
  });

  /**
   * ONE DESIGN PIXEL, AND THE WHOLE SCREEN IS MEASURED IN IT.
   *
   * The mock-up is a fixed 360x800 frame. Left at its own px the HUD crowded a 320
   * phone and floated on a 430 one — measured in a browser at both — so `--u` is one
   * design pixel and every box on home is `calc(N * var(--u))` with N the design's own
   * figure. What this test holds is the three things that make that honest: 360 is the
   * neutral width (so the mock-up reproduces exactly), it is CLAMPED at both ends, and
   * the clamp is wide enough that no real phone is pinned to a bound.
   */
  it("scales the whole composition off one design pixel", () => {
    const u = /--u:\s*clamp\(([^;]+)\);/.exec(rulesFor(css, ":root"))?.[1];
    expect(u, "home has no design scale").toBeTruthy();
    const [lo, mid, hi] = (u ?? "").split(",").map((x) => x.trim());
    // The middle term is what makes 360 neutral: at 360 the scale is exactly 1.
    expect(mid, "the scale is not measured against the design's own width")
      .toBe("calc(100vw / 360)");
    const n = (v: string): number => Number(v.replace("px", ""));
    expect(n(lo ?? ""), "no floor, so a narrow phone shrinks the type away")
      .toBeGreaterThan(0.5);
    expect(n(hi ?? ""), "no ceiling, so a tablet inflates a phone HUD").toBeLessThan(2);
    // 320 is the narrowest phone that ships and 430 the widest; neither may be clamped,
    // or the scale stops tracking the screen exactly where a device actually lives.
    expect(n(lo ?? ""), "a 320 phone is pinned to the floor").toBeLessThanOrEqual(320 / 360);
    expect(n(hi ?? ""), "a 430 phone is pinned to the ceiling")
      .toBeGreaterThanOrEqual(430 / 360);
  });

  /**
   * THE ARTWORK IS ANCHORED TO ITS FOOT, so only the TOP is ever cut.
   *
   * It is 842x1871 under `cover`, which always fills the width — so a screen that is not
   * the design's 360x800 loses HEIGHT. Centred, that came off both ends: measured at 20%
   * on a 320x568 and a 375x667 phone, a tenth off each. The tenth off the BOTTOM is the
   * expensive one, because the chapter mound carrying the crossed swords — the one thing
   * on this picture that says where the player is standing — is painted near the foot.
   *
   * Nothing a jsdom test can see says a word about this: there is no layout, and the
   * screen looks identical either way until a short phone opens it.
   */
  it("cuts the artwork off the top rather than the bottom", () => {
    const home = rulesFor(css, "#home");
    expect(home, "the artwork is not pinned to its foot")
      .toMatch(/background-position:\s*center bottom/);
    // Pinning it is only meaningful while the picture is still filling the width.
    expect(home).toMatch(/background-size:\s*cover/);
  });

  /**
   * ONE VERTICAL GAP DOWN THE WHOLE TOP BLOCK, asked for directly.
   *
   * The mock-up spaced it three different ways — 5 under the bar, 5 + 5 + 8 stacked
   * between the banner and the buttons, 16 down the button column — which measured out
   * as 5 / 18 / 16 and read as three decisions rather than one. What is held here is
   * that every one of them names the SAME TOKEN: four copies of `8 * var(--u)` would
   * pass an assertion about the number while being four chances for "uniform" to stop
   * being true, which is the only thing this rule actually says.
   */
  it("puts one gap between everything in the top block", () => {
    expect(rulesFor(css, ":root"), "the top block has no gap of its own")
      .toMatch(dp("--vgap", 8));
    // Under the bar. Top only — what sits below the banner is the granary row, and that
    // row's own top padding is the gap, so a bottom margin here would be it spelled twice.
    expect(ruleFor(css, "#home .colhero"))
      .toMatch(/margin:\s*var\(--vgap\) var\(--gutter\) 0/);
    // Under the banner, and above whatever follows the row.
    expect(ruleFor(css, "#home .homerow"))
      .toMatch(/padding:\s*var\(--vgap\) var\(--gutter\)/);
    // Down the column of three side buttons.
    expect(ruleFor(css, "#home .homefabs")).toMatch(/gap:\s*var\(--vgap\)/);
    /*
     * AND THE BAR MAY NOT PAD ITS OWN BOTTOM. It carries no background here, so that
     * padding is invisible air that ADDS to the banner's margin — 16 from the chips to
     * the banner where everything else was 8, which is how it was reported. The top
     * padding is the air under the notch and stays, so what this holds is the THIRD
     * value: `padding: Xu Ygutter 0`.
     */
    expect(rulesFor(css, "#home .topnav"), "the bar pads its own bottom, doubling the gap")
      .toMatch(/padding:\s*calc\(8 \* var\(--u\)\) var\(--gutter\) 0\s*;/);
  });

  /**
   * AND THE SCALE DOES NOT OUTRANK THE TAP FLOOR. `--tap` is a rule about a thumb, not a
   * measurement off the mock-up, so it does not shrink with one: at the bottom of the
   * scale the three side buttons are 48 design px, which is 42 real ones.
   */
  it("keeps the side buttons a thumb wide at every scale", () => {
    // `rulesFor`, not `ruleFor`: this selector has TWO blocks — the responsive section
    // pins its right edge to home's column, and the design block sizes it. A helper that
    // stops at the first one asserts against whichever happens to come first in the file.
    const fab = rulesFor(css, "#home .settingsfab,\n#home .dailyfab");
    expect(fab).toMatch(dp("width", 48));
    expect(fab, "a scaled-down button falls under the tap floor")
      .toMatch(/min-width:\s*var\(--tap\)/);
    expect(fab).toMatch(/min-height:\s*var\(--tap\)/);
  });

  /**
   * THE CHIP IS SIZED BY WHAT IS IN IT. The legacy sheet pins `.tn-coin` to 26px, which is
   * exactly the currency mark's own height — so the 2px of padding around it had nowhere
   * to go and the chip clipped itself. Nothing a jsdom test can see: jsdom has no layout.
   */
  it("lets the currency chip size itself", () => {
    expect(ruleFor(css, "#home .tn-coin")).toMatch(/height:\s*auto/);
  });

  /**
   * THE AVATAR IS 30px AND ITS TARGET IS A THUMB. The app's floor for anything pressable
   * is `--tap`; the design draws the disc at 30. The floor moves to an invisible box
   * centred on it, the same answer the currency steppers use — so a mutation that drops
   * the `::after` leaves a control a third under the floor with every test still green.
   */
  it("keeps a thumb-sized target under the 30px avatar", () => {
    expect(ruleFor(css, "#home .tn-id")).toMatch(dp("width", 30));
    expect(ruleFor(css, "#home .tn-id::after")).toMatch(/width:\s*var\(--tap\)/);
  });

  /**
   * THE BAR AND THE ROOM RESERVED FOR IT ARE ONE NUMBER. The tab bar grew from 64 to 70,
   * and the padding every scrolling screen keeps at its foot is what stops the last row
   * sitting under it. Two places spelling out one rule (§7), so they are read together.
   */
  it("reserves exactly the room the tab bar stands in", () => {
    // It is ONE token now rather than two numbers that have to agree, which is what the
    // design scale forced: a bar measured in design pixels over a reservation measured
    // in real ones clips the last row's ledge on every phone that is not 360 wide.
    const nav = ruleFor(css, "#mainNav.homenav");
    const bar = /height:\s*([^;]+);/.exec(nav)?.[1];
    const roomIn = (sel: string): string | undefined =>
      /padding-bottom:\s*calc\(([^;]+) \+ env\(safe-area-inset-bottom\)\)/
        .exec(rulesFor(css, sel))?.[1];
    expect(bar, "the tab bar has a height of its own").toBe("var(--navh)");
    // Home takes it as its own padding, because nothing on it scrolls.
    expect(roomIn("#home"), "home reserves the wrong room for the bar").toBe(bar);
    // And the four that SCROLL take it on the screen itself, which IS the scroller.
    expect(roomIn("#shop, #anthill, #antarium, #challenges"),
      "a deck screen reserves the wrong room for the bar").toBe(bar);
    expect(rulesFor(css, ":root"), "the bar's height is not the design's 70")
      .toMatch(/--navh:\s*calc\(70 \* var\(--u\)\)/);
    // THE NOTCH IS CARRIED ONCE, by the lift that stands the bar off the bottom edge —
    // in the height or the padding as well it would be counted twice and the tray would
    // float a thumb's width off the glass.
    expect(nav, "the bar does not stand on the safe area")
      .toMatch(/bottom:\s*env\(safe-area-inset-bottom\)/);
    expect(nav, "the bar's own box carries the notch as well as the lift")
      .not.toMatch(/(height|padding):[^;]*safe-area-inset-bottom/);
    // AND NOTHING OF OURS IS ADDED TO IT. iOS keeps the home-indicator strip outside
    // the web view and fills it with the page colour, so a lift of our own on top of
    // that strip is a band of flat dark under the tray that no element can paint.
    expect(nav, "the bar adds the frame's inset to the device's own bottom strip")
      .not.toMatch(/bottom:[^;]*--hudgut/);
  });

  /**
   * A SCREEN DOES NOT SHORTEN ITSELF FOR THE BAR.
   *
   * Reported from a phone as "a black frame under the menu cutting off the content", and
   * that is what it was: the legacy rule pads the SCREEN, so the scroller inside ends at
   * the TOP of the bar — while the bar is transparent down to its half-height shelf. The
   * band between the two is bare page with nothing in it. It never showed on home, which
   * is a full-bleed picture with nothing to clip, so it survived the redesign.
   *
   * Nothing a jsdom test can see would notice this: there is no layout, the markup is
   * identical, and only the cascade decides where a scroller ends.
   */
  it("scrolls the whole deck screen, header and all", () => {
    const rule = rulesFor(css, "#shop, #anthill, #antarium, #challenges");
    // THE SCREEN IS THE SCROLLER. That is what makes the header scroll — it is inside
    // the thing that moves — and what turns the padding above from a shorter box into
    // room at the END of the scroll.
    expect(rule, "the deck screens do not scroll themselves").toMatch(/overflow-y:\s*auto/);

    // AND NOTHING INSIDE THEM MAY SCROLL. An inner scroller takes the gesture and holds
    // the page still: the header stops moving again and the dead band comes back one
    // element down, wearing a different selector.
    const inner = rulesFor(css,
      "#shop .screenbody,\n#antarium .screenbody,\n#anthill .screenbody,\n#anthill .hillwrap,"
      + "\n#challenges .screenbody,\n#challenges .challist");
    expect(inner, "an inner box still scrolls on its own").toMatch(/overflow:\s*visible/);
    expect(inner, "an inner box still takes the leftover height").toMatch(/flex:\s*none/);
  });

  /**
   * AND THE ANTARIUM'S BODY MAY NOT USE THE `padding` SHORTHAND.
   *
   * `padding: var(--block) 0` reads as a tidy way to say "12 at the top" and silently
   * sets padding-bottom to 12 as well. It is in a block that comes LATER in the file than
   * the bar's room, so it wiped it — and the last card went back under the tiles with
   * every other rule here still correct.
   */
  it("sets the antarium body's padding on one side only", () => {
    const rule = ruleFor(code(read("skin.css")), "#antarium .screenbody");
    expect(rule, "a padding shorthand here wipes whatever the rules above set")
      .not.toMatch(/(^|[;{])\s*padding:/);
    expect(rule).toMatch(/padding-top:\s*var\(--block\)/);
  });

  /**
   * AND THE SCREENS THE BAR NO LONGER STANDS ON RESERVE NOTHING FOR IT. The legacy list
   * is thirteen screens, from a build where every one of them showed the bar; it is the
   * five deck screens now (§ NAV_SCREENS), so on the other eight that padding is a 70px
   * strip of nothing at the foot of the page — the road's sticky footer floating clear of
   * the bottom edge it is meant to sit on.
   */
  it("reserves no bar room on the screens that no longer show one", () => {
    const rule = rulesFor(css,
      "#profile, #rules, #achievements, #settings, #news, #friends,\n#support, #luckyhatch");
    expect(rule, "the non-deck screens still reserve room for a bar that is not there")
      .toMatch(/padding-bottom:\s*env\(safe-area-inset-bottom\)/);
    expect(rule).not.toMatch(/--navh/);
  });
});

/**
 * THE COLONY BAR, AND THE SHELF UNDER THE TABS.
 *
 * Both were asked for directly and neither is visible to a jsdom test: the markup is
 * identical either way and only the cascade decides what is drawn. What is held here is
 * the handful of declarations that carry the shape.
 */
describe("the colony bar and the tab tray", () => {
  const css = read("skin.css");

  /*
   * ONE HEIGHT DOWN THE WHOLE ROW, asked for directly — and it is the INK, not the em
   * box. The mark was 21 against a 30 figure, which reads as a small picture stuck on
   * the front of a big number; matched to the font-SIZE it came back visibly TALLER
   * than the figure, because an em box is always bigger than the glyphs in it.
   *
   * `--colink` is the measured ink height (see the token's own comment — 0.7385 of the
   * font-size, read off Poetsen One in a browser). What is held here is that the mark
   * and the bar both name THAT token and the figure names the font-size one: four
   * copies of a number would satisfy an assertion about the number while being four
   * chances for the rule to stop being true — the lesson `--vgap` is on record for.
   */
  it("gives the mark and the bar the figure's ink height", () => {
    const root = rulesFor(css, "#home");
    expect(root, "the row has no font-size of its own").toMatch(dp("--colline", 30));
    expect(root, "the ink height is not derived from the font-size")
      .toMatch(/--colink:\s*calc\(var\(--colline\) \* 0?\.\d+\)/);
    // The FIGURE is set in the font-size; the two things matched to it take the INK.
    expect(ruleFor(css, "#home .col-n")).toMatch(/font-size:\s*var\(--colline\)/);
    expect(ruleFor(css, "#home .col-mark svg,\n#home .col-mark .hudmark"))
      .toMatch(/height:\s*var\(--colink\)/);
    expect(ruleFor(css, "#home .col-rail .tr-bar"))
      .toMatch(/height:\s*var\(--colink\)/);
    // ...and nothing in the row is stretched to a different one.
    for (const sel of ["#home .col-size", "#home .col-pay", "#home .col-rail .tr-bar"]) {
      expect(ruleFor(css, sel), `${sel} does not hold its own middle`)
        .toMatch(/align-self:\s*center/);
    }
  });

  /*
   * THE CURRENCY CHIP'S LEFT END IS A SEMICIRCLE AND ITS RIGHT END MATCHES THE BLOCK.
   * Both asked for. The mark at the left is a painted DISC, so a square-ish corner
   * behind it is a second shape fighting the first; the right two are the 7 the colony
   * banner and the granary pill beside it carry.
   *
   * AND THE LEFT END IS EXACTLY HALF THE HEIGHT, NEVER A HUGE NUMBER. `999px` was
   * written here on the argument that a browser clamps a radius larger than its box.
   * It does not: when the two radii on ANY EDGE add up to more than that edge, the spec
   * scales EVERY corner of the box by the same factor — 999 + 999 down the left edge of
   * a 30-tall chip is about one sixtieth, so the RIGHT corners came out at a seventh of
   * a pixel. `getComputedStyle` reports the value as written, so the rule measured as
   * correct every time it was checked, and was reported as square twice.
   *
   * The half is DERIVED here from the two numbers that decide the chip's height — its
   * mark and its padding — so retuning either moves this with it rather than leaving a
   * radius that quietly starts scaling the corners down again.
   */
  it("rounds the currency chip's left end to exactly half its height", () => {
    const rule = ruleFor(css, "#home .tn-coin");
    const mark = /width:\s*calc\((\d+) \* var\(--u\)\)/
      .exec(ruleFor(css, "#home .tn-coin .tn-ic"))?.[1];
    const padY = /padding:\s*calc\((\d+) \* var\(--u\)\)/.exec(rule)?.[1];
    expect(mark, "the chip's mark has no size to measure").toBeTruthy();
    expect(padY, "the chip's padding has no size to measure").toBeTruthy();
    const half = (Number(mark) + 2 * Number(padY)) / 2;
    expect(rule, `the chip's left end is not half its ${half * 2} height`).toMatch(
      new RegExp(`border-radius:\\s*calc\\(${half} \\* var\\(--u\\)\\)`
        + ` calc\\(7 \\* var\\(--u\\)\\) calc\\(7 \\* var\\(--u\\)\\)`
        + ` calc\\(${half} \\* var\\(--u\\)\\)`));
    expect(rule, "a radius this big scales every other corner to nothing")
      .not.toMatch(/border-radius:[^;]*\d{3,}px/);
    // ...and the right end is the SAME corner the frames around it carry, never its own.
    for (const sel of ["#home .colhero",
      "#home .granpill,\n#home #granaryPill.granpill"]) {
      expect(ruleFor(css, sel), `${sel} no longer carries the block's corner`)
        .toMatch(dp("border-radius", 7));
    }
  });

  /*
   * THE GREEN IS IN THE BAR, NOT ON THE PLATE. The banner was `--hud-go`, the design's
   * one bright colour, with a cream fill on it; it is the same dark face as every other
   * card now and the green marks the thing that MOVES. It also settles a contrast note
   * on record since the redesign — the cream figure measured 2.22 on the green.
   */
  it("puts the green on the fill and the dark face on the banner", () => {
    expect(ruleFor(css, "#home .colhero"), "the banner is still the bright slab")
      .toMatch(/background:\s*var\(--hud-face\)/);
    expect(ruleFor(css, "#home .col-rail .tr-fill"))
      .toMatch(/background:\s*var\(--hud-go\)/);
  });

  /*
   * AND THE FILL CARRIES AN INNER BAND A THIRD OF ITS HEIGHT, asked for directly — the
   * same idea as `--hud-gloss` and far taller, so the fill reads as a solid bar with a
   * lit top rather than a flat rectangle of colour. `!important` or the blanket clears
   * it (§10), which is the half nothing else would notice.
   */
  it("lights the top third of the fill", () => {
    expect(ruleFor(css, "#home .col-rail .tr-fill"), "the band is not a third of the bar")
      .toMatch(/box-shadow:\s*inset 0 calc\(var\(--colink\) \/ 3\) 0 [^;]*!important/);
  });

  /*
   * TWO DESIGN PIXELS OF RADIUS, ON BOTH. It was a 30px pill, which rounds five
   * hard-edged fifths back into one object — the corner is what lets the ruled bar read
   * as five pieces. The fill takes the same corner as the track or the two disagree at
   * the ends.
   */
  it("gives the track and the fill the same barely-rounded corner", () => {
    for (const sel of ["#home .col-rail .tr-bar", "#home .col-rail .tr-fill"]) {
      expect(ruleFor(css, sel), `${sel} is not on the design's 2px corner`)
        .toMatch(dp("border-radius", 2));
    }
  });

  /*
   * AND THE DIVIDERS ARE A COLOUR, NEVER A GRADIENT. A repeating gradient is the obvious
   * way to rule a bar into fifths and is silently nothing here: the blanket clears every
   * background IMAGE with `!important` and exempts four whole SCREENS, none of which a
   * `.tr-cut` is. A black hairline is a background COLOUR — black because it is the
   * TRACK's own colour, so the empty part of the bar reads as one piece and the cuts
   * show exactly where they matter, across the green.
   */
  it("cuts the fifths with a colour the blanket cannot clear", () => {
    const rule = ruleFor(css, "#home .col-rail .tr-cut");
    expect(rule, "the dividers are drawn with an image the blanket strips")
      .not.toMatch(/gradient/);
    expect(rule).toMatch(/background:\s*#000/);
    expect(rule).toMatch(/width:\s*1px/);
    expect(rule).toMatch(/position:\s*absolute/);
    // It has to be positioned against the TRACK, or every divider lands on the screen.
    expect(ruleFor(css, "#home .col-rail .tr-bar")).toMatch(/position:\s*relative/);
  });

  /*
   * THE TRAY IS HALF A PLATE. A full-height slab behind five tiles is a second rectangle
   * around them; half of one is a shelf they stand on. Same trap as the dividers — a
   * pseudo-element is blanketed for background IMAGES with no exemption whatever, so
   * this one is a colour too.
   */
  it("stands the tabs on a half-height shelf", () => {
    const before = ruleFor(css, "#mainNav.homenav::before");
    expect(before, "the tab tray has no plate behind it").toBeTruthy();
    expect(before).not.toMatch(/gradient/);
    expect(before).toMatch(/height:\s*50%/);
    expect(before).toMatch(/background:\s*var\(--hud-face\)/);
    expect(before).toMatch(/bottom:\s*0/);
    /*
     * AND IT WEARS THE SAME INNER OUTLINE AS EVERY OTHER FRAME, asked for directly: it
     * was the one surface on this screen with a face and no gloss, which read as a band
     * of flat colour rather than as a ledge the tiles stand on. `!important` or the
     * blanket clears it, which is the half nothing a jsdom test can see would notice.
     */
    expect(before, "the shelf has no gloss, or the blanket will clear it")
      .toMatch(/box-shadow:\s*var\(--hud-gloss\)\s*!important/);
    // ...and the tiles stand ON it rather than under it.
    expect(ruleFor(css, "#mainNav.homenav .navitem")).toMatch(/z-index:\s*1/);
    /*
     * AND THE BAR MAY NOT BE GIVEN A POSITION HERE. The legacy sheet pins it with
     * `#mainNav { position: fixed; bottom: 0 }` — ONE id, which `#mainNav.homenav`
     * outranks, so a `position: relative` added for the shelf above put the whole bar
     * back in the flow at the TOP of the screen, lying over the colony banner. Being
     * fixed, it is already a containing block for the plate.
     */
    expect(code(ruleFor(css, "#mainNav.homenav")), "the design block re-positions the bar")
      .not.toMatch(/position:/);
    expect(read("game.css"), "the bar is no longer pinned to the bottom")
      .toMatch(/#mainNav\{position:fixed;[^}]*bottom:0/);
  });
});

/**
 * THE SHOP, DRAWN TO THE DESIGN.
 *
 * What was asked for is not a layout — it is that the things a screen is BUILT from are
 * the same on every screen: "some things should be uniform for all screens like font
 * size, gap, corner radius". That is a rule about the file rather than about a box, and
 * nothing a jsdom test can see would notice it breaking: a literal `font-size: 11px`
 * typed into one card renders perfectly and is the design quietly coming apart.
 *
 * So these are SWEEPS over the whole block rather than assertions about single rules.
 */
/**
 * THE SLICE IS BOUNDED AT BOTH ENDS, and that is not tidiness: the sweeps below run over
 * everything from a block's marker onwards, so an unbounded shop slice swallowed the
 * ANTARIUM block the day it landed and failed it for the shop's rules. A design block
 * runs from its own marker to the next one.
 *
 * THE BOUND IS THE DIVIDER, NOT THE NEXT BLOCK'S NAME. It was a pattern matching the
 * words "DRAWN TO THE DESIGN", and the first block added whose heading did not say that
 * was swallowed by the one above it — the same fault again, one marker further on. Every
 * one of these blocks opens on a `=====` rule, so that is what ends the one before it.
 */
const designBlock = (css: string, marker: string): string => {
  const at = css.indexOf(marker);
  expect(at, `the ${marker} block is gone`).toBeGreaterThan(-1);
  const rest = css.slice(at + marker.length);
  const next = rest.search(/^\/\* ={6,}/m);
  return code(next === -1 ? rest : rest.slice(0, next));
};

describe("the shop is written in the shared language", () => {
  const whole = read("skin.css");
  const shop = designBlock(whole, "THE SHOP, DRAWN TO THE DESIGN");

  it("still has a shop block to check", () => {
    expect(shop).toMatch(/#shop \.stile\s*\{/);
  });

  /** FOUR SIZES, AND ONLY FOUR. A fifth typed in as a number is the thing this holds. */
  it("sets no type size of its own", () => {
    const bad = [...shop.matchAll(/font-size:\s*([^;]+);/g)]
      .map((m) => (m[1] ?? "").trim())
      .filter((v) => !/^var\(--fs-(label|small|body|title)\)$/.test(v));
    expect(bad, "the shop types a size instead of naming one").toEqual([]);
  });

  /**
   * TWO RADII, AND ONLY TWO: a CARD and the button inside it. A pill is the one
   * exception and it is not a third number — it is "round this as far as the box
   * allows", which a browser clamps for itself.
   */
  it("rounds every corner with a token or a pill", () => {
    const bad = [...shop.matchAll(/border-radius:\s*([^;]+);/g)]
      .map((m) => (m[1] ?? "").trim())
      .filter((v) => !/^(var\(--r-(card|btn)\)|999px)/.test(v));
    expect(bad, "the shop rounds a corner to its own number").toEqual([]);
  });

  /** ONE GAP DOWN THE SCROLLER AND ONE ACROSS A ROW, both named. */
  it("spaces the blocks and the shelves with the shared gaps", () => {
    expect(ruleFor(shop, "#shop .shopwrap")).toMatch(/gap:\s*var\(--block\)/);
    expect(ruleFor(shop, "#shop .tilerow")).toMatch(/gap:\s*var\(--inrow\)/);
  });

  /** And the tokens themselves are in ONE place, with the design's own values. */
  it("keeps the shared language on :root", () => {
    const root = rulesFor(code(whole), ":root");
    for (const [name, value] of [
      ["--hud-card", "#282930"], ["--hud-well", "#12151c"], ["--hud-dim", "#d5d5d5"],
      ["--r-card", "7px"], ["--r-btn", "5px"],
      ["--fs-label", "8px"], ["--fs-small", "10px"],
      ["--fs-body", "12px"], ["--fs-title", "14px"],
      ["--block", "12px"], ["--inrow", "8px"],
    ]) {
      expect(root, `${name} is not the design's value`)
        .toMatch(new RegExp(`${name}:\\s*${value}`, "i"));
    }
  });

  /**
   * A SHELF'S PICTURE ANSWERS WITH TWO DIFFERENT TAGS, so the box has to size BOTH —
   * an `<img>` where the shelf is painted (`ui/shelf.ts`) and an `<img>` or `<svg>`
   * from the chrome's mark where it is not. This is the trap the match history paid
   * for once: a rule naming one tag sizes half the shelves and lets the rest render
   * at the file's own size.
   */
  it("sizes a shelf's picture whichever tag it comes back as", () => {
    const art = shop.slice(shop.indexOf("#shop .sh-art"));
    expect(art, "the shelf art sizes no img").toMatch(/#shop img\.sh-art/);
    expect(art, "the shelf art sizes no svg").toMatch(/#shop svg\.sh-art/);
    expect(ruleFor(shop, "#shop .sh-art,\n#shop img.sh-art,\n#shop svg.sh-art"))
      .toMatch(/width:\s*70px/);
  });

  /**
   * A SLAB THAT CANNOT BE PRESSED DARKENS ITS FILL, never its opacity. The legacy
   * `[disabled]` rule drops the whole control to .7 — which on a lit card reads as the
   * button having gone missing rather than as one that is not for sale. Exactly the
   * lesson the hatch's own button is on record for, and the half a jsdom test cannot
   * see: the attribute is set either way and only the cascade decides how it looks.
   */
  it("darkens a sold-out price rather than fading it", () => {
    const rule = ruleFor(shop, "#shop .buybar.off,\n#shop .buybar[disabled]");
    expect(rule, "a dead price has no fill of its own").toMatch(/background:\s*#/);
    expect(rule, "a dead price goes see-through").toMatch(/opacity:\s*1/);
  });

  /**
   * THE ODDS PANEL IS ONE PANEL ON TWO SCREENS (`ui/odds.ts`) — the shop, where the
   * purchase is, and the hatch, where the roll is. Dressing it on one would leave the
   * other wearing whatever the legacy sheet gives it, which is the compliance half of
   * this screen looking like a different app.
   */
  it("dresses the odds panel on both screens that show it", () => {
    for (const part of [".hatchodds", ".hatchodds .ho-rows", ".hatchodds .ho-row"]) {
      expect(shop, `${part} is dressed on the shop alone`)
        .toMatch(new RegExp(`#shop ${part.replace(/[.\s]/g, (c) => (c === "." ? "\\." : "\\s"))},\\s*\\n#luckyhatch `));
    }
    expect(ruleFor(shop, "#shop .hatchodds,\n#luckyhatch .hatchodds"))
      .toMatch(/background:\s*var\(--hud-well\)/);
  });
});

/**
 * THE ANTARIUM, DRAWN TO THE DESIGN.
 *
 * Same two sweeps as the shop, because the request behind both was the same one: what a
 * screen is built from is shared, and a literal typed into one rule renders perfectly
 * while the design quietly comes apart. What is different here is the one thing this
 * screen needed that the language did not have — a rarity painted as a SURFACE — and the
 * rules below are the ones nothing a jsdom test can see would ever notice breaking.
 */
describe("the antarium is written in the shared language", () => {
  const whole = read("skin.css");
  const ant = designBlock(whole, "THE ANTARIUM, DRAWN TO THE DESIGN");

  it("still has an antarium block to check", () => {
    expect(ant).toMatch(/#antarium \.an-tile\s*\{/);
  });

  /** The four, plus the hero — which is a token in the same table, not a literal. */
  it("sets no type size of its own", () => {
    const bad = [...ant.matchAll(/font-size:\s*([^;]+);/g)]
      .map((m) => (m[1] ?? "").trim())
      .filter((v) => !/^var\(--fs-(label|small|body|title|hero)\)$/.test(v));
    expect(bad, "the antarium types a size instead of naming one").toEqual([]);
  });

  /**
   * Two radii, a pill, and an explicit reset. The research PIP is the one exemption and
   * it is named: it is a 12px mark rather than a card or a button, and either token on it
   * is a lozenge.
   */
  it("rounds every corner with a token, a pill or a reset", () => {
    const bad: string[] = [];
    for (const m of ant.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if ((m[1] ?? "").includes("rb-pip")) continue;
      for (const d of (m[2] ?? "").matchAll(/border-radius:\s*([^;]+);/g)) {
        const v = (d[1] ?? "").trim();
        if (!/^(var\(--r-(card|btn)\)|999px|0)$/.test(v)) bad.push(`${(m[1] ?? "").trim()} → ${v}`);
      }
    }
    expect(bad, "the antarium rounds a corner to its own number").toEqual([]);
  });

  /**
   * A RARITY PAINTED AS A SURFACE. The tile reads its colour off a custom property the
   * SCREEN sets from the one tier table — so a retune moves it here and on every other
   * screen at once. A literal green written into this rule would be a second ladder, the
   * exact fault `engine/tiers.ts` exists to prevent.
   */
  it("takes the tile's colour from the tier the screen hands it", () => {
    const rule = ruleFor(ant, "#antarium .an-tile");
    expect(rule, "the tile paints itself instead of being told")
      .toMatch(/background:\s*var\(--fill,\s*var\(--hud-lock\)\)/);
  });

  /**
   * AND A COLONY YOU DO NOT OWN IS GREY IN EXACTLY ONE PLACE. The screen sets no fill at
   * all on a locked tile, so this rule is the whole of "not yours" — and the grey is a
   * token rather than a sixth rung on a ladder it is not part of.
   */
  it("greys a locked tile from one rule", () => {
    expect(ruleFor(ant, "#antarium .an-tile.locked"))
      .toMatch(/background:\s*var\(--hud-lock\)/);
    expect(rulesFor(code(whole), ":root")).toMatch(/--hud-lock:\s*#696b72/i);
  });

  /**
   * THE LEDGE IS THE TILE'S, NOT THE CARD'S. The name stands on the page under the tile;
   * a card carrying the ledge would draw a box around the pair and turn the name into the
   * bottom half of it. Both halves are load-bearing, so both are asserted — and the
   * card's `none` has to be `!important` or the LEDGE wins by specificity, not the
   * blanket.
   */
  it("hangs the ledge on the tile and clears it off the card", () => {
    expect(ruleFor(ant, "#antarium .an-tile"))
      .toMatch(/box-shadow:\s*var\(--hud-ledge\), var\(--hud-gloss\)\s*!important/);
    expect(ruleFor(ant, "#antarium .ccard"), "the card grew a ledge of its own")
      .toMatch(/box-shadow:\s*none\s*!important/);
  });

  /**
   * THE CARD MUST STRETCH ITS TILE, and this is here because it was a real bug on the
   * first build of this screen: the legacy `.ccard` rule CENTRES its children, so a tile
   * whose only content is a colour sized itself to that content and came out ZERO WIDE.
   * Every card on the screen was a name with nothing above it. The markup is identical
   * either way, and jsdom has no layout, so a test that reads the rule is the only thing
   * that can see it.
   */
  it("stretches the tile across the card it sits in", () => {
    expect(ruleFor(ant, "#antarium .ccard"), "the legacy centring is back and the tile is zero wide")
      .toMatch(/align-items:\s*stretch/);
  });

  /**
   * THE HEADING IS ONE LABEL, SO IT IS ONE COLOUR. The legacy sheet paints the tier name
   * and its count separately — cream and green — which read as two different kinds of
   * fact on a line that is two short words. Nothing a jsdom test can see would notice
   * this rule going: the markup is identical either way and only the cascade decides.
   */
  it("gives both halves of a tier heading the heading's own ink", () => {
    const rule = ruleFor(ant, "#antarium .tierhead .tl,\n#antarium .tierhead .tc");
    expect(rule, "the count keeps a colour of its own").toMatch(/color:\s*inherit/);
    expect(rule, "the count keeps a face of its own").toMatch(/font:\s*inherit/);
  });

  /** The badge sits IN the tile's corner, on the well, and widens for a second digit. */
  it("puts the level badge in the tile's corner", () => {
    const rule = ruleFor(ant, "#antarium .an-lv");
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/top:\s*2px/);
    expect(rule).toMatch(/left:\s*2px/);
    expect(rule).toMatch(/background:\s*var\(--hud-well\)/);
    expect(rule, "a two-digit level would overflow a fixed width")
      .toMatch(/min-width:\s*26px/);
    expect(rule, "the badge is sized rather than left to grow").not.toMatch(/[^-]width:\s*26px/);
  });
});

/**
 * THE MATCH CHROME SHRINKS WITH THE SCREEN.
 *
 * The board is 90vw exactly and cannot yield (§ THE PICTURE CARRIES THE GRID), so on a
 * short phone the chrome is the only thing that can — and a canvas too short for that
 * square falls back to FITTING it, which shrinks the playfield and takes the painted
 * region's cells off the board's. Measured: at 320x480 the bar was 239px of a 480 screen
 * and the board could not hold its square; it is 175 now and does.
 *
 * None of this is visible to jsdom, which has no layout and no viewport — the markup is
 * identical at every size and only the cascade decides how tall a button is.
 */
describe("the match chrome gives the board room on a short screen", () => {
  const whole = read("skin.css");
  const match = designBlock(whole, "THE MATCH CHROME SHRINKS WITH THE SCREEN");

  it("still has a match block to check", () => {
    expect(match).toMatch(/\.match footer\s*\{/);
  });

  /**
   * THE FOUR ACTIONS NEVER GO UNDER THE TAP FLOOR. `--tap` is a rule about a thumb rather
   * than a measurement off any mock-up (§10), so it is the clamp's LOWER bound — written
   * as the token, because a literal 44 here is the floor spelled twice and the copy is
   * what goes stale.
   */
  it("floors the action buttons at a thumb", () => {
    expect(ruleFor(match, ".match .brow4 .btn"),
      "an action button can shrink under the tap floor")
      .toMatch(/min-height:\s*clamp\(var\(--tap\),/);
  });

  /**
   * AND A TALL PHONE IS UNCHANGED. Every clamp's UPPER bound is the size the bar already
   * was, so the `vh` term only ever takes something away — a curve that topped out higher
   * would be a redesign of a screen that was not reported as wrong.
   */
  it("tops every clamp out at the size the bar already was", () => {
    for (const [sel, prop, top] of [
      [".match .brow4 .btn", "min-height", "58px"],
      [".match footer", "gap", "8px"],
      [".match .brow4", "gap", "6px"],
      [".match .timeband .timebar", "height", "10px"],
    ] as const) {
      expect(ruleFor(match, sel), `${sel} no longer tops out at its old ${prop}`)
        .toMatch(new RegExp(`${prop}:\\s*clamp\\([^;]*,\\s*${top}\\)`));
    }
  });

  /**
   * THE MARK IS SIZED TOO, and it has to be done here. The shell fills each slot with
   * `icon(name, 20)`, which writes width and height ATTRIBUTES onto the SVG — so without
   * a rule the label shrinks under a mark that never does, and the button ends up mostly
   * picture.
   */
  it("shrinks the mark with the label", () => {
    expect(ruleFor(match, ".match .brow4 .btn .ic svg"), "the mark keeps its fixed 20px")
      .toMatch(/width:\s*clamp\(/);
  });

  /**
   * SURRENDER IS A LINE, NOT A TILE — a full-width row that was the same height as the
   * four above it, which is the most room on the screen given to the least used control
   * in the game.
   */
  /**
   * THE HEADER TOPS OUT AT THE SAME 8 and carries the NOTCH on top of it. The match
   * screen is the one page in the app that is not a `.screen`, so nothing pads it for
   * the status bar — reported from an iPhone as the top chips being cut in half.
   */
  it("pads the header for the notch and still tops out at the old 8", () => {
    const rule = rulesFor(match, ".match header");
    expect(rule, "the header does not make room for the status bar")
      .toMatch(/padding-block:\s*calc\(clamp\([^)]*\) \+ env\(safe-area-inset-top\)\)/);
    expect(rule, "the header's own padding no longer tops out at 8px")
      .toMatch(/clamp\(4px, 1\.1vh, 8px\);/);
  });

  /**
   * SURRENDER IS A MARK IN THE CORNER, asked for directly — a small floating button above
   * the four, rather than a full-width slab the same height as them. It costs the footer
   * no height (it is OUT of the flow) and it says nothing until it is armed, which is the
   * only state where the word matters.
   */
  it("floats surrender in the corner above the four", () => {
    const row = ruleFor(match, ".match .brow.surrow");
    expect(row, "surrender is still in the footer's flow").toMatch(/position:\s*absolute/);
    expect(row, "surrender does not stand above the action row").toMatch(/bottom:\s*100%/);
    expect(row, "surrender is not in a corner").toMatch(/right:/);
    expect(rulesFor(match, ".match footer"), "the floating row has nothing to hang off")
      .toMatch(/position:\s*relative/);
    const btn = ruleFor(match, ".match .brow .btn.surr");
    expect(btn, "surrender still stretches the row").toMatch(/flex:\s*none/);
    expect(btn, "surrender stacks its mark over its label again")
      .toMatch(/flex-direction:\s*row/);
    expect(ruleFor(match, ".match .brow .btn.surr .lb"), "the word is shown unarmed")
      .toMatch(/display:\s*none/);
    expect(ruleFor(match, ".match .brow .btn.surr.armed .lb"), "the confirm says nothing")
      .toMatch(/display:\s*block/);
  });

  /**
   * THE GROUND IS THE WHOLE SCREEN AND THE CHROME FLOATS ON IT, asked for directly. The
   * dark grey above and below the board was the PAGE showing where the canvas stopped,
   * not a fill on those strips — so the fix is the canvas covering the screen, with the
   * two strips lying over it.
   *
   * `position` on both is the load-bearing half: they carry `z-index: 5` in the legacy
   * sheet with nothing to apply it to, so a positioned `main` paints straight over them
   * and the whole HUD disappears behind the board. Nothing a jsdom test can see would
   * notice any of this — there is no layout and the markup is identical.
   */
  it("spreads the board's canvas behind the chrome", () => {
    expect(ruleFor(match, ".match main"), "the canvas is still a band between the strips")
      .toMatch(/position:\s*absolute;\s*inset:\s*0/);
    expect(rulesFor(match, ".match header"), "the header has no position to stack with")
      .toMatch(/position:\s*relative/);
    expect(rulesFor(match, ".match footer"), "the footer has no position to stack with")
      .toMatch(/position:\s*relative/);
    expect(rulesFor(match, ".match footer"), "the footer no longer holds the bottom")
      .toMatch(/margin-top:\s*auto/);
    expect(ruleFor(match, ".match header,\n.match footer"),
      "a strip still paints over the ground").toMatch(/background:\s*none/);
    // THE CLOCK IS THE EXCEPTION, and it is a card on the glass rather than part of it:
    // a bright bar and a bright word written straight onto ten paintings is the Colony
    // Road's label problem again. It wears the chips' own face, so it is read against two
    // colours in this file.
    expect(ruleFor(match, ".match .timeband"), "the clock is not a card like the chips")
      .toMatch(/background:\s*var\(--hud\)/);
  });
});
