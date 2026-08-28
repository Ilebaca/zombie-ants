/**
 * WHO IS PLAYING, on the forest floor.
 *
 * What matters here is WHERE it lands, because that is the whole point of the change: a
 * name centred on the screen points at the middle of the board, and each of these names is
 * about one corner of it. The enemy's base is top-right and the player's is bottom-left, so
 * each row is lined up with the tiles at its own end and sits clear of the board.
 */
import { describe, expect, it } from "vitest";
import { Layout } from "../layout";
import { drawPlates } from "../plates";
import type { Plate } from "../plates";
import { makeRecorder } from "./recorder";

const you: Plate = { name: "Milan", colony: 1_284_000, species: "fire" };
const ai: Plate = { name: "Formica42", colony: 1_100_000, species: "leafcutter" };
const size = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : String(n));

/** A 7x7 board of 40px tiles, inset 15px in a 390x620 canvas. */
const board = (): Layout => {
  const layout = new Layout(7);
  layout.ts = 40; layout.ox = 55; layout.oy = 170;
  layout.width = 390; layout.height = 620;
  return layout;
};

interface Text { s: string; x: number; y: number }

const texts = (plates: Partial<Record<"you" | "ai", Plate>>, alpha = 1): Text[] => {
  const rec = makeRecorder();
  drawPlates(rec.ctx, board(), plates, size, alpha);
  return rec.of("fillText").map((c) => ({
    s: String(c.args[0]), x: c.args[1] as number, y: c.args[2] as number,
  }));
};

describe("names on the ground", () => {
  it("writes each side's name and colony", () => {
    const said = texts({ you, ai }).map((t) => t.s);
    expect(said).toContain("Milan");
    expect(said).toContain("1.3M");
    expect(said).toContain("Formica42");
    expect(said).toContain("1.1M");
  });

  /*
   * The player's nest is in the bottom-left corner and the enemy's in the top-right, so
   * each row goes under or over the board on the side its own base is on.
   */
  it("puts the player under the board and the enemy over it", () => {
    const at = texts({ you, ai });
    const mine = at.find((t) => t.s === "Milan");
    const theirs = at.find((t) => t.s === "Formica42");
    const top = 170, bottom = 170 + 40 * 7;
    expect(theirs?.y, "the enemy is not above the board").toBeLessThan(top);
    expect(mine?.y, "the player is not below the board").toBeGreaterThan(bottom);
    // ...and CLEAR of the tiles. The head is drawn around the same line, so half an icon
    // of daylight is not clearance — a row that only just misses the outer rank reads as
    // a label stuck to it.
    const TILE = 40;
    expect(top - (theirs?.y ?? 0), "the enemy row is stuck to the tiles")
      .toBeGreaterThan(TILE * 0.4);
    expect((mine?.y ?? 0) - bottom, "the player row is stuck to the tiles")
      .toBeGreaterThan(TILE * 0.4);
  });

  /**
   * LINED UP WITH THE TILES, not with the screen. Centred, each row would point at the
   * middle of the board rather than at the corner it is about.
   */
  it("aligns each row to the board edge its base is on", () => {
    const at = texts({ you, ai });
    const left = 55, right = 55 + 40 * 7;
    // The player's row starts at the board's left edge (its head is drawn first, so the
    // name sits a little in from it) and stays well left of the middle.
    const mine = at.find((t) => t.s === "Milan");
    expect(mine?.x).toBeGreaterThanOrEqual(left);
    expect(mine?.x).toBeLessThan(left + 80);
    // The enemy's row ENDS at the board's right edge, so its last word finishes there.
    const troops = at.filter((t) => t.s === "1.1M").pop();
    expect(troops?.x).toBeGreaterThan(right - 80);
    expect(troops?.x).toBeLessThan(right);
  });

  it("draws only the side it was given", () => {
    expect(texts({ you }).map((t) => t.s)).toEqual(["Milan", "1.3M"]);
    expect(texts({}).length).toBe(0);
  });

  /** The winner's wash takes the whole board; a name left standing would be the exception. */
  it("goes under the finale rather than over it", () => {
    expect(texts({ you, ai }, 0).length).toBe(0);
  });
});
