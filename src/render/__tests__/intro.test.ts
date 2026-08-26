/**
 * THE OPENING: the camera drops onto the map.
 *
 * The pixels are not the thing to hold here. What matters is that it is a VIEW — the board
 * it lands on is the board the engine built, untouched — that the descent ends, that the
 * frame is FULL while the board is small in it, that the undergrowth clears rather than
 * being left over the playfield, and that reduced motion gets the map without the journey.
 */
import { describe, expect, it } from "vitest";
import { Layout } from "../layout";
import {
  INTRO_FILL_MS, INTRO_MS, drawSurround, introAt, introScale, introTotal, planIntro,
  resetSurround,
} from "../intro";
import { makeRecorder } from "./recorder";

const around = (p: number): ReturnType<typeof makeRecorder> => {
  resetSurround();
  const rec = makeRecorder();
  drawSurround(rec.ctx, 400, 800, p);
  return rec;
};

describe("the descent", () => {
  it("runs from high above the clearing to locked on it", () => {
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

describe("the undergrowth around the clearing", () => {
  /**
   * The board's scenery is painted to the edges of the canvas and no further, so the moment
   * the camera pulls back there is a border of nothing around it and the map reads as a
   * picture floating on a colour.
   */
  it("fills the frame while the board is small in it", () => {
    expect(around(0.1).of("fill").length).toBeGreaterThan(0);
  });

  it("is gone before the camera locks", () => {
    expect(around(1).calls.length, "a bush was left on the playfield").toBe(0);
    // The last frames of the descent are the board and nothing else.
    expect(around(0.96).calls.length).toBe(0);
  });

  /** It thins out as the board grows into the frame rather than cutting off. */
  it("clears over the end of the descent", () => {
    const full = around(0.2).num("globalAlpha");
    const going = around(0.8).num("globalAlpha");
    expect(full).toBeGreaterThan(going);
    expect(going).toBeGreaterThan(0);
  });

  it("places the same bushes every time, so a resize does not reshuffle them", () => {
    const a = around(0.3).of("arc").map((c) => c.args.join(","));
    const b = around(0.3).of("arc").map((c) => c.args.join(","));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  /**
   * Around the outside AND a little way over the rim: the overlap is what stops the
   * scenery ending on a straight line.
   */
  it("rings the board on all four sides and leans over its edge", () => {
    const at = around(0.2).of("arc")
      .map((c) => ({ x: c.args[0] as number, y: c.args[1] as number }));
    expect(at.some((a) => a.x < 0), "nothing off the left").toBe(true);
    expect(at.some((a) => a.x > 400), "nothing off the right").toBe(true);
    expect(at.some((a) => a.y < 0), "nothing off the top").toBe(true);
    expect(at.some((a) => a.y > 800), "nothing off the bottom").toBe(true);
    expect(at.some((a) => a.x > 0 && a.x < 400 && a.y > 0 && a.y < 800),
      "nothing leaning over the rim").toBe(true);
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
    around(0.4);
    expect(JSON.stringify([layout.ts, layout.ox, layout.oy, layout.size])).toBe(before);
  });
});
