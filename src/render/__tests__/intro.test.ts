/**
 * THE OPENING: the camera comes down through the canopy.
 *
 * The pixels are not the thing to hold here. What matters is that it is a VIEW — the board
 * it lands on is the board the engine built, untouched — that the descent ends, that the
 * canopy clears rather than being left over the map, and that reduced motion gets the map
 * without the journey.
 */
import { describe, expect, it } from "vitest";
import { Layout } from "../layout";
import {
  INTRO_FILL_MS, INTRO_MS, drawCanopy, introAt, introScale, introTotal, planIntro,
  resetCanopy,
} from "../intro";
import { makeRecorder } from "./recorder";

const canopy = (p: number): ReturnType<typeof makeRecorder> => {
  resetCanopy();
  const rec = makeRecorder();
  drawCanopy(rec.ctx, 400, 800, p);
  return rec;
};

describe("the descent", () => {
  it("runs from above the trees to locked on the map", () => {
    const intro = planIntro(0);
    expect(introAt(intro, 0)).toBe(0);
    expect(introAt(intro, INTRO_MS / 2)).toBeCloseTo(0.5, 5);
    expect(introAt(intro, INTRO_MS)).toBe(1);
    // ...and stays there. A camera that keeps going has nowhere to be.
    expect(introAt(intro, INTRO_MS * 3)).toBe(1);
  });

  it("brings the floor up to its true size and leaves it there", () => {
    expect(introScale(0), "the map started at its final size").toBeLessThan(1);
    expect(introScale(1)).toBeCloseTo(1, 5);
    // Falling toward the floor: it only ever gets bigger on the way down.
    expect(introScale(0.5)).toBeGreaterThan(introScale(0));
  });

  /** The last settle back is what reads as a LOCK rather than a drift to a halt. */
  it("overshoots a hair before it settles", () => {
    let over = 0;
    for (let p = 0.82; p < 1; p += 0.01) over = Math.max(over, introScale(p));
    expect(over).toBeGreaterThan(1);
    expect(over, "the camera bounced").toBeLessThan(1.05);
  });

  it("waits for the colonies as well as the camera", () => {
    const intro = planIntro(0);
    expect(introTotal(intro)).toBe(INTRO_MS + INTRO_FILL_MS);
  });

  /** Reduced motion asks for the map, not for the journey down to it. */
  it("collapses when motion is reduced", () => {
    const intro = planIntro(0, true);
    expect(introAt(intro, 1)).toBe(1);
    // Nothing to fill in behind an opening that never played.
    expect(introTotal(intro)).toBe(intro.dur);
  });
});

describe("the canopy", () => {
  it("is drawn while the camera is coming down", () => {
    expect(canopy(0.2).of("fill").length).toBeGreaterThan(0);
  });

  it("is gone once the camera has landed", () => {
    expect(canopy(1).calls.length, "leaves were left over the map").toBe(0);
  });

  /**
   * Three sheets at three rates, not one. That difference is the only cue a flat canvas has
   * for "between the trees" — one sheet scaling up is a texture being zoomed.
   */
  it("clears its sheets one after another, nearest first", () => {
    const early = canopy(0.1).of("ellipse").length;
    const mid = canopy(0.55).of("ellipse").length;
    const late = canopy(0.9).of("ellipse").length;
    expect(early).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(late);
    expect(late).toBeGreaterThan(0);
  });

  it("places the same leaves every time, so a resize does not reshuffle them", () => {
    const a = canopy(0.3).of("ellipse").map((c) => c.args.join(","));
    const b = canopy(0.3).of("ellipse").map((c) => c.args.join(","));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("shades the floor while there are still leaves above it", () => {
    expect(canopy(0.1).of("fillRect").length).toBeGreaterThan(0);
    expect(canopy(0.99).fills().join("|")).not.toContain("#0b1a0d");
  });
});

describe("the camera is only a camera", () => {
  /**
   * It is a transform around the frame and a wash over the top. Nothing about the board's
   * own geometry changes, or a tap during the opening would land on the wrong cell.
   */
  it("leaves the layout alone", () => {
    const layout = new Layout(9);
    layout.ts = 40; layout.ox = 12; layout.oy = 20; layout.width = 400; layout.height = 800;
    const before = JSON.stringify([layout.ts, layout.ox, layout.oy, layout.size]);
    canopy(0.4);
    expect(JSON.stringify([layout.ts, layout.ox, layout.oy, layout.size])).toBe(before);
  });
});
