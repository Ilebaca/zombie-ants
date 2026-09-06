/**
 * THE DEPTH OF FIELD'S GEOMETRY.
 *
 * The compositing itself needs a real canvas and cannot be asserted on here (jsdom has
 * none, which is also why the effect is skipped there — see `TiltShift.begin`). What CAN
 * be held is the part that decides WHERE the picture is sharp, and that is the part with
 * a rule in it: the band is measured off the BOARD, not off the screen, so a 7x7 map and
 * a 13x13 map both keep their whole playfield in focus.
 */
import { describe, expect, it } from "vitest";
import { bandStops, softBands } from "../depth";

/** How soft the mask is at a given fraction down the canvas. */
const softAt = (stops: ReturnType<typeof bandStops>, at: number): number => {
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (!a || !b) break;
    if (at <= b.at) {
      const span = b.at - a.at;
      const t = span > 0 ? (at - a.at) / span : 0;
      return a.soft + (b.soft - a.soft) * t;
    }
  }
  return stops[stops.length - 1]?.soft ?? 0;
};

describe("the plane of focus", () => {
  it("keeps the whole board sharp, on a small map and a large one", () => {
    // A little board in a tall canvas, and one that nearly fills it.
    for (const [top, bottom] of [[300, 500], [120, 680]] as const) {
      const stops = bandStops(top, bottom, 800);
      for (const y of [top, (top + bottom) / 2, bottom]) {
        expect(softAt(stops, y / 800)).toBe(0);
      }
    }
  });

  it("is fully soft at the top and bottom of the canvas", () => {
    const stops = bandStops(300, 500, 800);
    expect(softAt(stops, 0)).toBeGreaterThan(0.8);
    expect(softAt(stops, 1)).toBeGreaterThan(0.8);
  });

  it("ramps rather than stepping — it is a lens, not a wipe", () => {
    const stops = bandStops(300, 500, 800);
    // Just outside the board it is still nearly sharp; further out it is not.
    const near = softAt(stops, 280 / 800);
    const far = softAt(stops, 200 / 800);
    expect(near).toBeLessThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it("never runs backwards, however little room the feather has", () => {
    // A board taller than the canvas is what a mid-resize frame can hand us. An offset
    // that went backwards would reverse the blend either side of it; two on the same
    // offset is fine and is the right picture, because there is no room for a ramp.
    for (const [top, bottom, h] of [[0, 800, 800], [-200, 1000, 800], [399, 401, 800]] as const) {
      const stops = bandStops(top, bottom, h);
      for (let i = 1; i < stops.length; i++) {
        expect(stops[i]?.at).toBeGreaterThanOrEqual(stops[i - 1]?.at ?? -1);
      }
      for (const stop of stops) {
        expect(stop.at).toBeGreaterThanOrEqual(0);
        expect(stop.at).toBeLessThanOrEqual(1);
      }
    }
  });

  it("leaves a board that fills the canvas entirely sharp", () => {
    const stops = bandStops(0, 800, 800);
    for (const y of [0.05, 0.5, 0.95]) expect(softAt(stops, y)).toBe(0);
  });

  it("gives a flat answer rather than throwing on a canvas with no size", () => {
    for (const stops of [bandStops(0, 100, 0), bandStops(500, 100, 800)]) {
      expect(stops.every((s) => s.soft === 0)).toBe(true);
    }
  });
});

describe("what actually gets painted back", () => {
  it("paints the two soft bands and skips the sharp middle", () => {
    const stops = bandStops(300, 500, 800);
    const bands = softBands(stops, 800, 0, 720);
    expect(bands).toHaveLength(2);
    // The middle of the board is in neither.
    for (const band of bands) {
      expect(400 >= band.from && 400 < band.to).toBe(false);
    }
    // And the top and bottom of the canvas are.
    expect(bands.some((b) => b.from === 0 && b.to > 0)).toBe(true);
    expect(bands.some((b) => b.to === 800)).toBe(true);
  });

  it("widens the bands by the tilt, or a slanted edge is clipped square", () => {
    const stops = bandStops(300, 500, 800);
    const flat = softBands(stops, 800, 0, 720);
    const tilted = softBands(stops, 800, 0.055, 720);
    // The rotation carries the boundary down by half the width times the tangent, so the
    // top band has to end LATER and the bottom one start EARLIER.
    expect(tilted[0]?.to).toBeLessThan(flat[0]?.to ?? 0);
    expect(tilted[1]?.from).toBeGreaterThan(flat[1]?.from ?? 0);
  });

  it("covers everything when nothing is in focus", () => {
    const bands = softBands([{ at: 0, soft: 0.9 }, { at: 1, soft: 0.9 }], 800, 0, 720);
    expect(bands).toEqual([{ from: 0, to: 800 }]);
  });

  it("stays inside the canvas", () => {
    for (const [top, bottom] of [[0, 800], [-300, 1100], [780, 800]] as const) {
      for (const band of softBands(bandStops(top, bottom, 800), 800, 0.055, 720)) {
        expect(band.from).toBeGreaterThanOrEqual(0);
        expect(band.to).toBeLessThanOrEqual(800);
      }
    }
  });
});
