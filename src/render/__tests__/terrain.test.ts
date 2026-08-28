/**
 * THE GROUND PLATE.
 *
 * It is baked bigger than the canvas so the camera's descent never sees its edge, and that
 * one change broke two things that matter more than the pixels: how MUCH scenery ends up
 * around the tiles, and whether it stays put when the layout twitches.
 */
import { describe, expect, it } from "vitest";
import { Layout } from "../layout";
import { plateFor, scatter, terrainBleed } from "../terrain";
import type { Rect } from "../terrain";

/** A phone-shaped board, laid out the way `measure` lays one out. */
function phone(height = 844): Layout {
  const layout = new Layout(7);
  layout.width = 390; layout.height = height;
  const span = Math.min(390, height) - 28;
  layout.ts = Math.max(8, Math.floor(span / 7));
  layout.ox = Math.round((390 - layout.ts * 7) / 2);
  layout.oy = Math.round((height - layout.ts * 7) / 2);
  return layout;
}

const onScreen = (layout: Layout, n: number, size: number): number =>
  scatter(layout, plateFor(layout), 0xa27c01, n, size)
    .filter((p) => p.x >= 0 && p.x <= layout.width && p.y >= 0 && p.y <= layout.height).length;

describe("how much scenery ends up on screen", () => {
  /**
   * The counts are written per SCREENFUL, so growing the plate has to buy more props or the
   * ring around the tiles empties out. Scaling by total area looked right and was not: a
   * prop never lands on the playfield, and the board is a large hole in the canvas and
   * barely a dent in the plate, so the free ground grew by much more than the area did.
   */
  it("still puts a screenful of props on the screen once the plate is bigger", () => {
    const layout = phone();
    for (const [n, size] of [[8, layout.ts * 1.15], [18, layout.ts * 0.8],
      [34, layout.ts * 0.45], [30, layout.ts * 0.28]] as const) {
      const got = onScreen(layout, n, size);
      expect(got, `asked for ${n} on screen, got ${got}`).toBeGreaterThan(n * 0.6);
      expect(got, `asked for ${n} on screen, got ${got}`).toBeLessThan(n * 1.8);
    }
  });

  it("keeps every prop off the playfield", () => {
    const layout = phone();
    const board = { x: layout.ox, y: layout.oy, w: layout.ts * 7 };
    for (const p of scatter(layout, plateFor(layout), 0xa27c01, 34, layout.ts * 0.45)) {
      const on = p.x > board.x && p.x < board.x + board.w
        && p.y > board.y && p.y < board.y + board.w;
      expect(on, `a prop landed on the board at ${Math.round(p.x)},${Math.round(p.y)}`)
        .toBe(false);
    }
  });
});

describe("staying put", () => {
  /**
   * A few pixels of relayout must not rearrange the forest. With one shared generator it
   * did: a prop rejected for landing on the board consumed a different number of draws than
   * one that was kept, so every prop after the first difference shifted. That is how a
   * five-pixel footer growth at the end of the opening came out as a different background.
   */
  it("barely moves when the canvas loses five pixels", () => {
    const a = scatter(phone(844), plateFor(phone(844)), 0x7f4a11, 34, 18);
    const b = scatter(phone(839), plateFor(phone(839)), 0x7f4a11, 34, 18);
    const near = a.filter((p, i) => {
      const q = b[i];
      return q && Math.abs(p.x - q.x) < 12 && Math.abs(p.y - q.y) < 12;
    }).length;
    expect(near / a.length, "the scenery reshuffled itself over a five-pixel resize")
      .toBeGreaterThan(0.9);
  });

  it("places the same scenery twice for the same layout", () => {
    const layout = phone();
    const one = scatter(layout, plateFor(layout), 0xfe271d, 18, 20).map((p) => `${p.x},${p.y}`);
    const two = scatter(layout, plateFor(layout), 0xfe271d, 18, 20).map((p) => `${p.x},${p.y}`);
    expect(one).toEqual(two);
    expect(one.length).toBeGreaterThan(0);
  });

  /** The bake has to reach past the canvas, or the camera sees the plate's own edge. */
  it("overhangs the canvas on every side", () => {
    expect(terrainBleed(phone())).toBeGreaterThan(100);
  });
});

/**
 * THE NAMES ARE WRITTEN ON THE SOIL (plates.ts), and a fern or a fallen log baked where one
 * goes reads as clutter over the text. The scenery drops what overlaps — and ONLY what
 * overlaps: everything else is exactly where it grew, or a name would thin the whole ring.
 */
describe("scenery around the names", () => {
  const SIZE = 40;
  /** A box on the soil under the board, the shape a nameplate row is. */
  const row = (layout: Layout): Rect => ({
    x: layout.ox, y: layout.oy + layout.ts * 7 + 16, w: 140, h: 20,
  });

  const props = (layout: Layout, reserve: Rect[]): { x: number; y: number }[] =>
    scatter(layout, { ...plateFor(layout), reserve }, 0xfe271d, 18, SIZE)
      .map((p) => ({ x: p.x, y: p.y }));

  it("drops the props that land where a name is written", () => {
    const layout = phone();
    const box = row(layout);
    const pad = plateFor(layout).margin + SIZE * 0.5;
    for (const p of props(layout, [box])) {
      const over = p.x > box.x - pad && p.x < box.x + box.w + pad
        && p.y > box.y - pad && p.y < box.y + box.h + pad;
      expect(over, `a prop at ${Math.round(p.x)},${Math.round(p.y)} is under the name`)
        .toBe(false);
    }
  });

  /**
   * Every prop is placed from its OWN generator, keyed on its index, so one being dropped
   * cannot shift the next. Without that, reserving a box would reshuffle the whole scene.
   */
  it("leaves every other prop exactly where it was", () => {
    const layout = phone();
    const box = row(layout);
    const before = props(layout, []);
    const after = props(layout, [box]);
    expect(after.length, "the box removed nothing at all").toBeLessThan(before.length);
    // What survives is a SUBSET, in order, at the same coordinates.
    const kept = before.filter((p) => after.some((q) => q.x === p.x && q.y === p.y));
    expect(kept.length).toBe(after.length);
    expect(before.length - after.length, "a name emptied the whole ring")
      .toBeLessThan(before.length / 2);
  });

  it("changes nothing when nobody is named", () => {
    const layout = phone();
    expect(props(layout, [])).toEqual(
      scatter(layout, plateFor(layout), 0xfe271d, 18, SIZE).map((p) => ({ x: p.x, y: p.y })),
    );
  });
});