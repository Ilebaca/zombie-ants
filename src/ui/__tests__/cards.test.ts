/**
 * THE COLLECTION CARD'S PICTURE, AND THE RARITY UNDER IT.
 *
 * Two things that fail silently and look identical when they do. A card picture that is
 * named wrong is not shown — and a tile with no picture is a flat colour, which is what
 * the screen draws on purpose today, so nothing on screen says the file was ignored. And
 * a rarity's fill is a colour: a second table of them would never fail anything, it would
 * just mean a rung looked like one thing here and another thing in the hatch.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { SPECIES, TIERS as LADDER, TIER_IDS } from "../../engine";
import { TIERS, tierOf } from "../../platform";
import { cardArt } from "../cards";

const DIR = resolve(__dirname, "..", "cards");

describe("a collection tile is painted by dropping a file in", () => {
  /** Nothing is painted yet, and that is a legal state — the tile is its own colour. */
  it("answers null for a colony with no picture", () => {
    expect(cardArt("fire")).toBeNull();
  });

  /**
   * AND NOTHING SITS IN THE FOLDER DOING NOTHING. A file whose name is not a colony's id
   * is precached, downloaded and never shown, and the tile under it looks exactly as it
   * does when the art was never sent at all.
   */
  it("has a colony for every file in the folder", () => {
    if (!existsSync(DIR)) return;
    const stray = readdirSync(DIR)
      .filter((f) => f.endsWith(".webp") && !(f.replace(/\.webp$/, "") in SPECIES));
    expect(stray, "these pictures are not any colony's and will never be shown").toEqual([]);
  });
});

describe("a rarity painted as a surface", () => {
  /**
   * ONE LADDER, TWO JOBS. `colour` is what a rarity is WRITTEN in and `fill` is what a
   * whole tile is PAINTED in — one rung, one table. What this holds is that they are a
   * pair on every rung: a fill missing from one would fall back to the locked grey, so a
   * whole rarity would read as "you do not own this".
   */
  it("gives every rung on the ladder a fill as well as an ink", () => {
    for (const id of TIER_IDS) {
      const def = LADDER[id];
      expect(def.fill, `${id} has no fill`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(def.fill, `${id}'s fill is its ink`).not.toBe(def.colour);
    }
  });

  /** And the progression layer's copy is DERIVED, never typed beside it. */
  it("carries the same fill through to the screens", () => {
    for (const t of TIERS) expect(t.fill).toBe(LADDER[t.k].fill);
  });

  /**
   * NO TWO RUNGS MAY LOOK ALIKE ON A TILE, and no rung may look like a colony you do not
   * own — a grey fill would say "locked" on a colony the player has bought.
   */
  it("keeps every rung's fill distinct, and none of them grey", () => {
    const fills = TIER_IDS.map((id) => LADDER[id].fill.toLowerCase());
    expect(new Set(fills).size, "two rungs are painted the same").toBe(fills.length);
    for (const id of TIER_IDS) {
      const hex = LADDER[id].fill.replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const spread = Math.max(r!, g!, b!) - Math.min(r!, g!, b!);
      // `common` is the one rung with no colony on it (it is held open), so it is allowed
      // to be the neutral one; every rung a colony can actually sit on has to have colour.
      if (id === "common") continue;
      expect(spread, `${id}'s fill is grey, which is what a locked tile is`)
        .toBeGreaterThan(60);
    }
  });

  /** Every colony resolves to a rung that has one. */
  it("gives every colony a fill to be drawn in", () => {
    for (const id of Object.keys(SPECIES)) {
      expect(tierOf(id as keyof typeof SPECIES).fill, `${id} has no tile colour`)
        .toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
