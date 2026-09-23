/**
 * THE GROUND PLATE.
 *
 * It is baked bigger than the canvas so the camera's descent never sees its edge, and that
 * one change broke two things that matter more than the pixels: how MUCH scenery ends up
 * around the tiles, and whether it stays put when the layout twitches.
 */
import { describe, expect, it } from "vitest";
import { Layout } from "../layout";
import { drawTerrain, groundCover, plateFor, resetTerrain, scatter, terrainBleed, tileMark }
  from "../terrain";
import { makeRecorder } from "./recorder";
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
/**
 * A REGION'S PAINTED GROUND (ui/regions.ts) has to cover the plate, and the plate is a
 * different shape on every phone. Cover, never fit: a letterboxed background draws the
 * plate's own bare colour down two edges, which is the hard rectangle the bleed exists to
 * avoid in the first place.
 */
describe("a painted ground covering the plate", () => {
  const shapes: ReadonlyArray<readonly [number, number, number, number]> = [
    [1000, 1400, 1000, 1400],   // exactly the same shape
    [1000, 1400, 2000, 1000],   // a wide picture on a tall plate
    [1400, 1000, 900, 1900],    // a tall picture on a wide plate
    [812, 1000, 2678, 3158],    // the placeholder, on a small plate
  ];

  it("never leaves a gap, whatever shape the picture is", () => {
    for (const [pw, ph, iw, ih] of shapes) {
      const at = groundCover(pw, ph, iw, ih);
      expect(at.w, `${iw}x${ih} is narrower than the plate`).toBeGreaterThanOrEqual(pw - 0.001);
      expect(at.h, `${iw}x${ih} is shorter than the plate`).toBeGreaterThanOrEqual(ph - 0.001);
      expect(at.x).toBeLessThanOrEqual(0.001);
      expect(at.y).toBeLessThanOrEqual(0.001);
    }
  });

  /** And it keeps the picture's own shape: a stretched background reads as a mistake. */
  it("does not stretch", () => {
    for (const [pw, ph, iw, ih] of shapes) {
      const at = groundCover(pw, ph, iw, ih);
      expect(at.w / at.h).toBeCloseTo(iw / ih, 5);
    }
  });

  /**
   * CENTRED, because the clearing sits in the middle of the plate — so whatever an artist
   * put in the middle of the picture is what ends up under the board.
   */
  it("centres the overflow", () => {
    const at = groundCover(1000, 1400, 2000, 1000);
    expect(at.x + at.w / 2).toBeCloseTo(500, 5);
    expect(at.y + at.h / 2).toBeCloseTo(700, 5);
  });

  /** A picture that has not decoded reports 0x0, and must not produce a NaN draw. */
  it("survives a picture with no size", () => {
    const at = groundCover(1000, 1400, 0, 0);
    expect(at).toEqual({ x: 0, y: 0, w: 1000, h: 1400 });
  });
});

/**
 * THE TILE INDICATORS ARE A LAYER, NOT PART OF THE GROUND (`tileMark`).
 *
 * They mark where the cells are, so they go over whatever is underneath — the drawn floor
 * or a painted region (`ui/regions.ts`). The colour cannot be the floor's own: `groundA`
 * is light against the soil it was picked for and DARK against a bright painted map,
 * which would put muddy patches where light tiles should be.
 */
describe("the tile indicators", () => {
  it("lightens a painted ground rather than tinting it with the soil's colour", () => {
    expect(tileMark(true, 0).fill).toBe("#ffffff");
    expect(tileMark(false, 0).fill).not.toBe("#ffffff");
  });

  /**
   * And FAR fainter, because white is a much stronger mark than brown on brown: measured
   * on the board, a third of the alpha gives about four times the effect (twelve levels
   * out of 255 over the artwork against three over the drawn floor). Anything like the
   * soil's own alpha is a whitewash — and anything under a few percent is the grid the
   * player asked to be able to see.
   */
  it("is much fainter over a picture than over the drawn floor", () => {
    expect(tileMark(true, 0).alpha).toBeLessThan(tileMark(false, 0).alpha / 3);
    expect(tileMark(true, 0).alpha).toBeGreaterThan(0.08);
  });

  /** The rim fades either way, or the playfield gets a hard border. */
  it("fades toward the edge of the grid, by the same proportion on both", () => {
    for (const light of [true, false]) {
      const mid = tileMark(light, 0).alpha, rim = tileMark(light, 1).alpha;
      expect(rim).toBeLessThan(mid);
      expect(rim / mid).toBeCloseTo(0.58, 2);
    }
  });

  /** A cell outside the grid cannot ask for more than the middle's strength. */
  it("clamps", () => {
    expect(tileMark(true, 4).alpha).toBe(tileMark(true, 1).alpha);
    expect(tileMark(true, -2).alpha).toBe(tileMark(true, 0).alpha);
  });
});

/**
 * THE PLATE IS BAKED AT DEVICE RESOLUTION.
 *
 * The board's own context is scaled by `dpr`, so a plate baked one canvas pixel per CSS
 * pixel is blown up two- or three-fold on the way in — every pixel of the ground averaged
 * with its neighbours. That was invisible while the ground was DRAWN (soil and ferns are
 * soft shapes anyway) and it is the whole picture once a region is PAINTED: reported as a
 * blur on the map, after the tilt-shift that used to be blamed for it was removed.
 */
describe("the plate's resolution", () => {
  /** Stub every offscreen canvas with a recorder, and hand back the ones that were baked. */
  function bakeWith(dpr: number): { plate: HTMLCanvasElement; blit: unknown[] } {
    const real = HTMLCanvasElement.prototype.getContext;
    const made: HTMLCanvasElement[] = [];
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      made.push(this);
      return makeRecorder().ctx;
    } as unknown as HTMLCanvasElement["getContext"];
    try {
      resetTerrain();
      const layout = phone();
      layout.dpr = dpr;
      const target = makeRecorder();
      drawTerrain(target.ctx, layout);
      const plate = made[0];
      expect(plate, "nothing was baked").toBeTruthy();
      return { plate: plate as HTMLCanvasElement, blit: target.of("drawImage")[0]?.args ?? [] };
    } finally {
      HTMLCanvasElement.prototype.getContext = real;
      resetTerrain();
    }
  }

  it("gives the backing store one pixel per DEVICE pixel", () => {
    const layout = phone();
    const bleed = terrainBleed(layout);
    const css = Math.round(layout.width) + bleed * 2;
    expect(bakeWith(1).plate.width).toBe(css);
    expect(bakeWith(2).plate.width).toBe(css * 2);
  });

  /** ...and it is still blitted at its CSS size, or the plate would land twice as wide. */
  it("blits it back at its CSS size", () => {
    const layout = phone();
    const bleed = terrainBleed(layout);
    const { blit } = bakeWith(2);
    expect(blit.slice(1)).toEqual([
      -bleed, -bleed,
      Math.round(layout.width) + bleed * 2,
      Math.round(layout.height) + bleed * 2,
    ]);
  });
});
