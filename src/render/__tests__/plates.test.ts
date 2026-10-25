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
import { SOCKETS, drawPlates, drawSockets, seamsHeld } from "../plates";
import type { Plate } from "../plates";
import { makeRecorder } from "./recorder";
import { createGame } from "../../engine";
import { blankGame, put } from "../../engine/__tests__/helpers";

const you: Plate = { name: "Milan", colony: 1_284_000 };
const ai: Plate = { name: "Formica42", colony: 1_100_000 };
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
      // The row is the name then the figure, so it starts where the name does.
      const font = Math.max(11, Math.min(15, 40 * 0.34));
      const end = (f?.x ?? 0) + font * 2; // the figure's own width, roughly
      expect(Math.abs(((n?.x ?? 0) + end) / 2 - mid), `${name} is not centred on the board`)
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

/**
 * THE SEAM COUNTER — the four sockets painted on each plaque.
 *
 * A seam pays three a turn where a plain stable pays one, and nothing on the board said
 * who held them: the only way to know was to find all four on the grid and read their
 * colours. One socket lights per seam held, left to right.
 */
describe("the seam counter", () => {
  const pips = (held: Partial<Record<"you" | "ai", number>>, painted = true): Rec[] => {
    const rec = makeRecorder();
    drawSockets(rec.ctx, board(), held, painted);
    return rec.of("moveTo").map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }));
  };
  interface Rec { x: number; y: number }

  /**
   * FOUR SOCKETS BECAUSE THE BOARD HAS FOUR SEAMS, and the sockets are PAINTED into every
   * region's ground — so the count here is the artwork's and cannot be read off the map at
   * runtime. This is what stops the two drifting: a fifth seam on the board would light
   * nothing, and a map with three would leave a socket that can never come on.
   */
  it("has a socket for every seam the map carries", () => {
    const state = createGame({ map: "small", species: { you: "fire", ai: "fire" }, first: "you" });
    const seams = state.grid.flat().filter((t) => t.terrain === "resource").length;
    expect(seams, "the map and the plaque disagree about how many seams there are")
      .toBe(SOCKETS);
  });

  it("counts only the resource tiles a side owns", () => {
    const state = blankGame();
    put(state, 1, 3, { terrain: "resource", owner: "you", struct: "stable", soldiers: 3 });
    put(state, 5, 1, { terrain: "resource", owner: "you", struct: "stable", soldiers: 3 });
    put(state, 7, 5, { terrain: "resource", owner: "ai", struct: "stable", soldiers: 3 });
    put(state, 3, 7, { terrain: "resource", owner: null, guard: 6 });
    put(state, 2, 2, { terrain: "ground", owner: "you", struct: "stable", soldiers: 3 });
    expect(seamsHeld(state, "you")).toBe(2);
    expect(seamsHeld(state, "ai")).toBe(1);
  });

  /** Lose the tile, lose the light — the counter is read off the board, never tallied. */
  it("goes dark again when the tile is lost", () => {
    const state = blankGame();
    const t = put(state, 1, 3, { terrain: "resource", owner: "you", struct: "stable", soldiers: 3 });
    expect(seamsHeld(state, "you")).toBe(1);
    t.owner = "ai";
    expect(seamsHeld(state, "you")).toBe(0);
    expect(seamsHeld(state, "ai")).toBe(1);
  });

  /** One diamond per seam, lit left to right — and nothing for the ones not held. */
  it("lights one socket per seam, from the left", () => {
    for (let n = 0; n <= SOCKETS; n++) {
      const lit = pips({ you: n });
      expect(lit.length, `${n} seams drew ${lit.length} shapes`).toBe(n * 2); // body + facet
      const xs = [...new Set(lit.map((p) => Math.round(p.x)))].sort((a, b) => a - b);
      expect(xs.length).toBe(n);
      // Each one it lights is to the LEFT of every one it has not.
      const all = [...new Set(pips({ you: SOCKETS }).map((p) => Math.round(p.x)))]
        .sort((a, b) => a - b);
      expect(xs).toEqual(all.slice(0, n));
    }
  });

  /**
   * THE EMPTY SOCKETS ARE THE GROUND'S, not ours — a painted region has them cut into the
   * stone already. On the game's own drawn floor there is no plaque at all, so they are
   * drawn: four pips with nothing behind them read as decoration rather than a counter.
   */
  it("draws the empty sockets only where the ground has none", () => {
    expect(pips({ you: 1 }, true).length).toBe(2);
    expect(pips({ you: 1 }, false).length).toBe(2 + (SOCKETS - 1));
  });

  /** Each side's counter sits on its own edge, with the plaque the ground paints there. */
  it("puts each side's sockets on its own edge of the board", () => {
    const top = 170, bottom = 170 + 40 * 7;
    for (const p of pips({ ai: SOCKETS })) expect(p.y).toBeLessThan(top);
    for (const p of pips({ you: SOCKETS })) expect(p.y).toBeGreaterThan(bottom);
  });

  /** ...and on the plaque, which is within half a tile of the edge — not out with the name. */
  it("keeps the pips on the plaque rather than out with the name", () => {
    const top = 170, bottom = 170 + 40 * 7, TILE = 40;
    for (const p of pips({ ai: SOCKETS })) expect(top - p.y).toBeLessThan(TILE * 0.5);
    for (const p of pips({ you: SOCKETS })) expect(p.y - bottom).toBeLessThan(TILE * 0.5);
  });

  /** Centred on the BOARD, like the names — the plaque is painted on its middle. */
  it("centres the four on the board", () => {
    const xs = [...new Set(pips({ you: SOCKETS }).map((p) => p.x))];
    const mid = 55 + 40 * 7 / 2;
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - mid)).toBeLessThan(0.5);
  });

  /** It goes under the finale with the names: the wash takes the whole board. */
  it("goes under the finale rather than over it", () => {
    const rec = makeRecorder();
    drawSockets(rec.ctx, board(), { you: SOCKETS, ai: SOCKETS }, true, 0);
    expect(rec.of("moveTo").length).toBe(0);
  });

  /** A side the renderer was not given a count for draws nothing at all. */
  it("draws only the side it was given", () => {
    expect(pips({}).length).toBe(0);
  });
});
