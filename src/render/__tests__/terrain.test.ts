/**
 * THE GROUND PLATE.
 *
 * It is baked bigger than the canvas so the camera's descent never sees its edge, and that
 * one change broke two things that matter more than the pixels: how MUCH scenery ends up
 * around the tiles, and whether it stays put when the layout twitches.
 */
import { describe, expect, it } from "vitest";
import { Layout } from "../layout";
import { ART_GRID, drawTerrain, groundAlign, plateFor, resetGroundArt,
  resetTerrain, scatter, terrainBleed, tileMark }
  from "../terrain";
import { MAP } from "../palette";
import { makeRecorder, type Recorder } from "./recorder";
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
    // Matched by WHERE THEY ARE rather than by their place in the list: a prop dropped
    // for landing on the board is simply absent, so the two lists do not line up index
    // for index — and have not since the plate stopped being bigger than the canvas.
    const near = a.filter((p) =>
      b.some((q) => Math.abs(p.x - q.x) < 12 && Math.abs(p.y - q.y) < 12)).length;
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

  /**
   * THE PLATE IS THE CANVAS. It used to be baked half as big again in every direction,
   * because the opening pulled the camera back and would otherwise have seen the plate's
   * own edge. There is no camera now (`renderer.playIntro`), and the region's picture is
   * painted to fit the frame exactly — so an overhang is several times the area of ground
   * nobody can ever see.
   */
  it("does not overhang the canvas", () => {
    expect(terrainBleed(phone())).toBe(0);
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
    scatter(layout, { ...plateFor(layout), reserve }, 0xfe271d, 40, SIZE)
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
      scatter(layout, plateFor(layout), 0xfe271d, 40, SIZE).map((p) => ({ x: p.x, y: p.y })),
    );
  });
});
/**
 * A REGION'S PICTURE IS PLACED BY ITS OWN GRID (`groundAlign`).
 *
 * Every region picture is painted to one template (`ART_GRID`): the nine-by-nine grid of
 * cells occupies a known rectangle of the file. So the picture is scaled until those
 * painted cells are the size of the board's and centred on them — which is the whole
 * point of the board being 90vw (§ layout.ts). Covering the plate instead put the artwork
 * at a different size on every phone, which is fine for soil and impossible once the
 * slabs in the picture ARE the cells.
 */
describe("lining a painted ground up with the board", () => {
  /** The shipped picture, and the board on a few real phones. */
  const ART = [841, 1870] as const;

  const board = (tile: number, ox = 20, oy = 100): Layout => {
    const l = new Layout(9);
    l.ts = tile; l.ox = ox; l.oy = oy; l.width = tile * 10; l.height = tile * 16;
    return l;
  };

  /** Where the picture's painted grid actually lands, given where the picture landed. */
  const painted = (at: { x: number; y: number; w: number; h: number }) => ({
    x: at.x + ART_GRID.x * at.w,
    y: at.y + ART_GRID.y * at.h,
    w: ART_GRID.w * at.w,
    h: ART_GRID.h * at.h,
  });

  /**
   * The one scale cannot make both sides exact, because the file's cells are not quite
   * square — so what is held is the SIZE OF THE ERROR: a quarter of one percent of the
   * board, which is under a pixel at every phone tile size and still inside the grout
   * line between two painted slabs on a tablet.
   */
  it("puts the painted grid on the board at every size", () => {
    for (const tile of [32, 36, 39, 43, 76, 120]) {
      const l = board(tile);
      const g = painted(groundAlign(l, ...ART));
      const side = tile * 9, slack = side * 0.0025;
      expect(Math.abs(g.x - l.ox), `left at tile ${tile}`).toBeLessThan(slack);
      expect(Math.abs(g.y - l.oy), `top at tile ${tile}`).toBeLessThan(slack);
      expect(Math.abs(g.w - side), `width at tile ${tile}`).toBeLessThan(slack);
      expect(Math.abs(g.h - side), `height at tile ${tile}`).toBeLessThan(slack);
      if (tile < 50) expect(Math.abs(g.w - side), `a phone at tile ${tile}`).toBeLessThan(1);
    }
  });

  /** ONE scale: the file's own cells are a hair off square, and stretching art to hide
   *  that is worse than the half pixel it costs. */
  it("does not stretch the picture", () => {
    const at = groundAlign(board(39), ...ART);
    expect(at.w / at.h).toBeCloseTo(ART[0] / ART[1], 5);
  });

  /** The error is SPLIT between the two edges rather than all landing on one of them. */
  it("centres the grid on the board", () => {
    const l = board(39, 17, 133);
    const g = painted(groundAlign(l, ...ART));
    expect(g.x + g.w / 2).toBeCloseTo(l.ox + (l.ts * 9) / 2, 5);
    expect(g.y + g.h / 2).toBeCloseTo(l.oy + (l.ts * 9) / 2, 5);
  });

  /** It follows the board, not the canvas — a bigger canvas moves nothing. */
  it("ignores the canvas around the board", () => {
    const l = board(39), wide = board(39);
    wide.width = 2000; wide.height = 3000;
    expect(groundAlign(wide, ...ART)).toEqual(groundAlign(l, ...ART));
  });

  /** A picture that has not decoded reports 0x0, and must not produce a NaN draw. */
  it("survives a picture with no size", () => {
    const l = board(40);
    expect(groundAlign(l, 0, 0)).toEqual({ x: 20, y: 100, w: 360, h: 360 });
  });

  /**
   * AND THE PICTURE REACHES THE EDGES OF THE CANVAS once the camera has landed, because
   * the artwork is a little wider than its own grid and the board is nine tenths of the
   * screen. It is only a HAIR wider — the margin comes to a pixel or two — so the test is
   * that nothing is left to fill but that hair, which the soft copy behind it covers. The
   * frame proper is only ever seen during the opening descent.
   */
  it("reaches the edges of the canvas on a phone", () => {
    for (const [vw, vh] of [[320, 331], [390, 606], [430, 694], [768, 786]] as const) {
      const tile = Math.floor(Math.min(vw / 10, Math.min(vw, vh) / 9));
      const l = new Layout(9);
      l.ts = tile; l.width = vw; l.height = vh;
      l.ox = Math.round((vw - tile * 9) / 2); l.oy = Math.round((vh - tile * 9) / 2);
      const at = groundAlign(l, ...ART);
      expect(at.x, `${vw}x${vh} left`).toBeLessThanOrEqual(1);
      expect(at.x + at.w, `${vw}x${vh} right`).toBeGreaterThanOrEqual(vw - 1);
      expect(at.y, `${vw}x${vh} top`).toBeLessThanOrEqual(0);
      expect(at.y + at.h, `${vw}x${vh} bottom`).toBeGreaterThanOrEqual(vh);
    }
  });
});

/**
 * THE TILE INDICATORS ARE THE DRAWN FLOOR'S (`tileMark`).
 *
 * A region's picture has its cells painted in and is placed by them, so it needs no mark
 * of its own — marking it anyway is two grids on one board. What is left is the soil's
 * own lighter colour on the soil it was picked for.
 */
describe("the tile indicators", () => {
  it("marks the drawn floor with the soil's own colour, not a tint", () => {
    expect(tileMark(0).fill).not.toBe("#ffffff");
    expect(tileMark(0).fill).not.toBe("#000000");
    expect(tileMark(0).alpha).toBeGreaterThan(0);
  });

  /** The rim fades, or the playfield gets a hard border. */
  it("fades toward the edge of the grid", () => {
    const mid = tileMark(0).alpha, rim = tileMark(1).alpha;
    expect(rim).toBeLessThan(mid);
    expect(rim / mid).toBeCloseTo(0.58, 2);
  });

  /** A cell outside the grid cannot ask for more than the middle's strength. */
  it("clamps", () => {
    expect(tileMark(4).alpha).toBe(tileMark(1).alpha);
    expect(tileMark(-2).alpha).toBe(tileMark(0).alpha);
  });
});

/**
 * WHAT A BAKE WITH A PAINTED GROUND ACTUALLY PUTS ON THE PLATE.
 *
 * Two draws and no chequer: the soft copy that fills the frame, then the picture itself
 * lined up with the board. A chequer over it would be a second grid on top of the one
 * painted into the artwork, which is the fault this whole template exists to avoid.
 */
describe("baking a painted ground", () => {
  const ART = [841, 1870] as const;

  /** Bake once with (or without) a picture, and hand back the PLATE's recorded calls. */
  function bake(ground: string | null): { plate: Recorder; layout: Layout } {
    const realCtx = HTMLCanvasElement.prototype.getContext;
    const realImg = Object.getOwnPropertyDescriptors(HTMLImageElement.prototype);
    const made: Recorder[] = [];
    HTMLCanvasElement.prototype.getContext = (() => {
      const rec = makeRecorder();
      made.push(rec);
      return rec.ctx;
    }) as unknown as HTMLCanvasElement["getContext"];
    // jsdom loads nothing, so the picture is declared decoded by hand — `groundArt` asks
    // for exactly these three and nothing else.
    for (const [k, v] of [["complete", true], ["naturalWidth", ART[0]], ["naturalHeight", ART[1]]] as const)
      Object.defineProperty(HTMLImageElement.prototype, k, { value: v, configurable: true });
    try {
      resetTerrain();
      resetGroundArt();
      const layout = phone();
      drawTerrain(makeRecorder().ctx, layout, [], ground ? { ground } : {});
      return { plate: made[0] as Recorder, layout };
    } finally {
      HTMLCanvasElement.prototype.getContext = realCtx;
      for (const k of ["complete", "naturalWidth", "naturalHeight"])
        Object.defineProperty(HTMLImageElement.prototype, k, realImg[k] as PropertyDescriptor);
      resetTerrain();
      resetGroundArt();
    }
  }

  it("draws the picture where the board is, and nothing else", () => {
    const { plate, layout } = bake("rg01.webp");
    const drawn = plate.of("drawImage");
    expect(drawn.length).toBe(1);
    const at = groundAlign(layout, ...ART);
    const [, x, y, w, h] = drawn[0]?.args as [unknown, number, number, number, number];
    for (const [got, want] of [[x, at.x], [y, at.y], [w, at.w], [h, at.h]] as const)
      expect(got).toBeCloseTo(want, 5);
  });

  it("marks no cells over a picture that has them painted in", () => {
    const { plate } = bake("rg01.webp");
    expect(plate.fills()).not.toContain(MAP.groundA.toLowerCase());
  });

  /** And the drawn floor still gets its chequer, or the mutation above says nothing. */
  it("still marks the cells on the drawn floor", () => {
    const { plate } = bake(null);
    expect(plate.fills()).toContain(MAP.groundA.toLowerCase());
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
