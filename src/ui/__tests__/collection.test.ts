/**
 * A COLLECTION CARD HAS NO PLATE OF ITS OWN.
 *
 * Each colony's icon is a PAINTING with its own frame and its own dark ground baked into
 * the file, so a card background behind it is a second box around a box — two rounded
 * rectangles a few pixels apart. Reported exactly that way: "there is a dark green
 * background for each ant icon, we don't need it".
 *
 * It RUNS THE CASCADE rather than reading the file, which is the only thing that can see
 * this: the plate was set in four separate places — the blanket that fills every panel
 * surface, the card rule itself, and twice more on `.ccard.locked` in two later theme
 * blocks. Three of those are later in the file than the first, so a grep for one of them
 * proves nothing about what a player sees.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";

const sheet = (name: string): string =>
  readFileSync(resolve(__dirname, "..", name), "utf8");

/**
 * What the browser would paint behind an element carrying these classes.
 *
 * THE SHORTHAND IS READ AS WELL AS THE COLOUR, and that is not belt and braces. jsdom
 * leaves an UNRESOLVED `var()` out of `backgroundColor` entirely — it computes to
 * transparent — so a test that asked only for the colour passed against a stylesheet
 * with `background: var(--panel-hi)` put straight back on the card. The mutation that
 * found this is the one this comment exists for.
 */
const plate = (classes: string): { color: string; image: string; shorthand: string } => {
  const el = document.createElement("div");
  el.className = classes;
  document.body.replaceChildren(el);
  const style = getComputedStyle(el);
  return {
    color: style.backgroundColor,
    image: style.backgroundImage,
    shorthand: style.background,
  };
};

const BARE = ["rgba(0, 0, 0, 0)", "transparent", ""];

beforeAll(() => {
  document.head.replaceChildren();
  for (const name of ["game.css", "skin.css"]) {
    const style = document.createElement("style");
    style.textContent = sheet(name);
    document.head.appendChild(style);
  }
});

describe("a colony's card in the collection", () => {
  it("paints nothing behind the picture, owned or locked", () => {
    for (const classes of ["ccard", "ccard locked", "ccard sel", "ccard prem"]) {
      const { color, image, shorthand } = plate(classes);
      expect(BARE, `"${classes}" is standing on a plate (${color})`).toContain(color);
      expect(image, `"${classes}" is standing on a gradient`).toBe("none");
      expect(shorthand, `"${classes}" is standing on a plate (${shorthand})`)
        .not.toMatch(/var\(/);
    }
  });

  /**
   * THE CONTROL, and it is load-bearing. jsdom leaves an unresolved `var()` out of the
   * computed colour, so a test that only asked about `.ccard` would pass just as well
   * against a stylesheet where nothing anywhere has a background. The Anthill's cell is
   * the neighbour that kept its plate — it carries no picture of its own.
   */
  it("is not the whole app losing its surfaces", () => {
    const el = document.createElement("div");
    el.className = "antcell";
    document.body.replaceChildren(el);
    expect(getComputedStyle(el).background, "the Anthill's cell lost its plate too")
      .toContain("--panel");
  });

  /**
   * ONE SIZE IN ONE GRID. A painted colony is an `<img>` at its natural size and one
   * wearing a SKIN is still a canvas (a painting cannot be recoloured), so without a rule
   * covering both the two sit at different sizes side by side.
   */
  it("sizes a painted icon and a drawn one the same", () => {
    const css = sheet("skin.css");
    const rule = /\.ccard canvas,\s*\.ccard > img\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule, "nothing sizes both kinds of icon").not.toBe("");
    expect(rule.replace(/\s/g, "")).toContain("width:100%");
    expect(rule.replace(/\s/g, "")).toContain("aspect-ratio:1");
  });
});
