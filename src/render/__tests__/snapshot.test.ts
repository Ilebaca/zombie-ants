/**
 * A STILL OF THE BOARD, for the manual.
 *
 * The point of it is that it is not a screenshot: it is the board's own drawing code over a
 * real position, so a figure in How to play cannot illustrate a rule the game no longer has
 * and there is no image file to keep in step. What matters here is that it draws the state
 * it was given, that the window crops rather than scales, and that it survives a canvas it
 * cannot get a context from.
 */
import { describe, expect, it } from "vitest";
import { createGame, recomputeConnectivity, tile } from "../../engine";
import type { GameState } from "../../engine";
import { drawSnapshot } from "../snapshot";
import { makeRecorder } from "./recorder";

/** A canvas whose context is the recorder, so the draw calls can be read back. */
function canvasOf(rec: ReturnType<typeof makeRecorder>): HTMLCanvasElement {
  return {
    style: {} as CSSStyleDeclaration,
    width: 0, height: 0,
    getContext: () => rec.ctx,
  } as unknown as HTMLCanvasElement;
}

const board = (): GameState => {
  const s = createGame({ map: "tiny", species: { you: "fire", ai: "leafcutter" }, seed: 3 });
  for (const row of s.grid) {
    for (const t of row) {
      t.owner = null; t.struct = null; t.soldiers = 0; t.guard = 0; t.terrain = "ground";
    }
  }
  const t = tile(s, 1, 1);
  t.owner = "you"; t.struct = "nest"; t.soldiers = 10;
  recomputeConnectivity(s);
  return s;
};

describe("a still of the board", () => {
  it("draws the position it was given", () => {
    const rec = makeRecorder();
    expect(drawSnapshot(canvasOf(rec), board(), { tile: 20 })).toBe(true);
    // A nest is a filled cell with a count on it — enough to prove the board pass ran.
    expect(rec.of("fillRect").length + rec.of("fill").length).toBeGreaterThan(0);
    expect(rec.of("fillText").map((c) => String(c.args[0]))).toContain("10");
  });

  /**
   * The window is an ORIGIN, not a scale: a figure is a corner of a position, and the
   * tiles outside it still have to be drawn or a colony's edges would be wrong at the crop.
   */
  it("sizes the canvas to the window and crops rather than scales", () => {
    const rec = makeRecorder();
    const canvas = canvasOf(rec);
    drawSnapshot(canvas, board(), { tile: 20, view: { c: 0, r: 0, cols: 3, rows: 2 } });
    const PAD = Math.round(20 * 0.18) * 2;
    expect(canvas.style.width).toBe(`${3 * 20 + PAD}px`);
    expect(canvas.style.height).toBe(`${2 * 20 + PAD}px`);

    // No window means the whole board, at the same tile size — it never scales to fit.
    const wide = canvasOf(makeRecorder());
    drawSnapshot(wide, board(), { tile: 20 });
    expect(wide.style.width).toBe(`${7 * 20 + PAD}px`);
  });

  it("shows a tile as picked up when it is asked to", () => {
    const plain = makeRecorder();
    drawSnapshot(canvasOf(plain), board(), { tile: 20 });
    const picked = makeRecorder();
    drawSnapshot(canvasOf(picked), board(), {
      tile: 20, selection: { c: 1, r: 1 }, valid: [{ c: 2, r: 1 }],
    });
    expect(picked.calls.length,
      "the selection and its targets drew nothing").toBeGreaterThan(plain.calls.length);
  });

  /** jsdom has no 2D context, and a screen must survive one rather than throw (§6). */
  it("gives up quietly on a canvas with no context", () => {
    const dead = {
      style: {} as CSSStyleDeclaration, width: 0, height: 0, getContext: () => null,
    } as unknown as HTMLCanvasElement;
    expect(drawSnapshot(dead, board())).toBe(false);
  });
});
