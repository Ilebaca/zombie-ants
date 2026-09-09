/**
 * A HIDDEN SCREEN IS HIDDEN.
 *
 * The router shows one page by putting `.hidden` on every other one, and the legacy rule
 * that acts on it is `.screen.hidden { display: none }` — two classes, which ANY per-screen
 * rule keyed on an id outranks. `#formation { display: flex }` did, so pressing Play left
 * the setup screen standing on top of the match it had just started.
 *
 * This runs the real cascade rather than reading the file: both stylesheets go into the
 * document and the computed display is asked for, which is the only way a specificity bug
 * shows up at all.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";

const sheet = (name: string): string =>
  readFileSync(resolve(__dirname, "..", name), "utf8");

/** Every id `skin.css` styles directly — those are the rules that can outrank `.hidden`. */
function styledIds(css: string): string[] {
  const ids = new Set<string>();
  for (const m of css.matchAll(/(^|[\s,{}])#([A-Za-z][\w-]*)/g)) ids.add(m[2] as string);
  return [...ids];
}

beforeAll(() => {
  document.head.replaceChildren();
  for (const name of ["game.css", "skin.css"]) {
    const style = document.createElement("style");
    style.textContent = sheet(name);
    document.head.appendChild(style);
  }
});

describe("hiding a screen", () => {
  it("takes it off the screen whatever its own rules say", () => {
    const ids = styledIds(sheet("skin.css"));
    expect(ids).toContain("formation");
    for (const id of ids) {
      const el = document.createElement("div");
      el.id = id;
      el.className = "screen hidden";
      document.body.replaceChildren(el);
      expect(getComputedStyle(el).display, `#${id} is still drawn while hidden`).toBe("none");
    }
  });

  it("still lays the screen out when it is showing", () => {
    const el = document.createElement("div");
    el.id = "formation";
    el.className = "screen";
    document.body.replaceChildren(el);
    expect(getComputedStyle(el).display).toBe("flex");
  });
});
