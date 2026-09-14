/**
 * WHO IS PLAYING, on the forest floor.
 *
 * What matters here is WHERE it lands. Each row sits on the same side of the board as the
 * base it names — the enemy over the top edge, the player under the bottom one — and both
 * are CENTRED on the board, so they line up with each other and the board reads as two
 * players facing off across it. They were pushed out to opposite corners once, which on a
 * wide screen read as two labels flung to the ends of it rather than as a pair.
 */
import { describe, expect, it } from "vitest";
import { Layout } from "../layout";
import { drawPlates } from "../plates";
import type { Plate } from "../plates";
import { makeRecorder } from "./recorder";
import { basicLook } from "../../engine";

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

/** Both sides basic, which is what an opponent always fields. */
const LOOKS = { you: basicLook("fire"), ai: basicLook("ghost") };

interface Text { s: string; x: number; y: number }

const texts = (plates: Partial<Record<"you" | "ai", Plate>>, alpha = 1): Text[] => {
  const rec = makeRecorder();
  drawPlates(rec.ctx, board(), plates, size, LOOKS, alpha);
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
   * CENTRED ON THE BOARD, never on the canvas. The board is what the row is about, and on
   * a screen wider than the playfield a canvas-centred row would drift off its end.
   */
  it("centres each row on the board", () => {
    const at = texts({ you, ai });
    const left = 55, board = 40 * 7, mid = left + board / 2;
    // Each row runs head, name, figure — so its own middle is halfway between where the
    // head starts and where the figure ends, and that has to land on the board's middle.
    for (const [name, troops] of [["Milan", "1.3M"], ["Formica42", "1.1M"]] as const) {
      const n = at.find((t) => t.s === name);
      const f = at.filter((t) => t.s === troops).pop();
      expect(n, `no row for ${name}`).toBeTruthy();
      // The head is drawn before the name, one icon plus a gap wide (icon = font * 1.5,
      // gap = font * 0.5, font = 40 * 0.34 = 13.6), so the row starts there.
      const font = Math.max(11, Math.min(15, 40 * 0.34));
      const start = (n?.x ?? 0) - font * 1.5 - font * 0.5;
      const end = (f?.x ?? 0) + font * 2; // the figure's own width, roughly
      expect(Math.abs((start + end) / 2 - mid), `${name} is not centred on the board`)
        .toBeLessThan(font * 1.5);
    }
  });

  /** ...and the two rows line up with EACH OTHER, which is the point of centring them. */
  it("lines the two rows up with one another", () => {
    const at = texts({ you, ai });
    const mine = at.find((t) => t.s === "Milan");
    const theirs = at.find((t) => t.s === "Formica42");
    // Not the same x — the names are different lengths — but their MIDDLES agree, and
    // the old corner layout put them a whole board apart.
    expect(Math.abs((mine?.x ?? 0) - (theirs?.x ?? 0)), "the rows are flung apart")
      .toBeLessThan(40 * 7 / 2);
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
