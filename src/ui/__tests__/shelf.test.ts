/**
 * THE SHOP'S PAINTED GOODS.
 *
 * The folder IS the table, the fifth time this app uses that rule — so the only thing
 * that can go wrong is a NAME, and a name that does not match is silent: the glob finds
 * the file, the lookup misses it, and the tile falls back to the chrome's mark exactly
 * as it does when nothing has been painted at all. A shelf that was painted and is not
 * being shown looks identical to one nobody has painted yet.
 *
 * So what is held here is the naming rule itself, from both ends: every product can be
 * painted, and every file in the folder is some product's.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { SHOP_PRODUCTS } from "../../platform";
import { shelfArt, shelfKey } from "../shelf";

const DIR = resolve(__dirname, "..", "shelf");

/** The filename a product's painting has to carry, asked of the module itself — a
 *  second copy of the rule here would pass while the lookup used another one. */
const fileFor = (id: string): string => `${shelfKey(id)}.webp`;

describe("a shelf is painted by dropping a file in", () => {
  /**
   * THE DOT IS THE WHOLE TRAP. A product id is `mycel.220`, and a dot in a filename is
   * an extension to everything that will ever touch this folder — the glob's own name
   * pattern stops at it. So the key is hyphenated, and a file named after the id
   * verbatim would be found by the build and matched by nothing.
   */
  it("names every product with a filename that carries no dot", () => {
    for (const p of SHOP_PRODUCTS) {
      expect(fileFor(p.id), `${p.id} cannot be painted`).toMatch(/^[\w-]+\.webp$/);
    }
  });

  /** A missing painting is not a hole — the caller draws the chrome's mark instead. */
  it("answers null for a shelf nobody has painted", () => {
    expect(shelfArt("no.such.product")).toBeNull();
  });

  /**
   * AND NOTHING SITS IN THE FOLDER DOING NOTHING. A file whose name is not a product's
   * is precached, downloaded and never shown; this is the only thing that would say so.
   * The daily gift is not in `SHOP_PRODUCTS` — it is free — so it is named here.
   */
  it("has a product for every file in the folder", () => {
    if (!existsSync(DIR)) return;             // nothing painted yet is a legal state
    const owned = new Set([...SHOP_PRODUCTS.map((p) => fileFor(p.id)), "daily-gift.webp"]);
    const stray = readdirSync(DIR).filter((f) => f.endsWith(".webp") && !owned.has(f));
    expect(stray, "these paintings are not any product's and will never be shown")
      .toEqual([]);
  });
});
