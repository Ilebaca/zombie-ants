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
  resetSurround, surroundEase,
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

  /**
   * THE LOCK HAS TO BE STILL.
   *
   * There was a hair of overshoot here, meant to read as a lock. It did the opposite: the
   * bump returned to zero at the end but its SLOPE did not, so the last drawn frame was
   * still moving and the next one, with the camera gone, was not — a jolt on the one frame
   * the whole descent is aiming at.
   */
  it("comes to rest rather than arriving with speed left", () => {
    const step = 0.001;
    const last = (introScale(1) - introScale(1 - step)) / step;
    const middle = (introScale(0.5) - introScale(0.5 - step)) / step;
    expect(Math.abs(last), "the camera was still moving when it stopped").toBeLessThan(0.01);
    expect(middle, "the camera was not moving in the middle either").toBeGreaterThan(0.1);
  });

  it("never goes past the framing it is landing on", () => {
    for (let p = 0; p <= 1; p += 0.01) expect(introScale(p)).toBeLessThanOrEqual(1);
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

  /**
   * It gets out of the way by MOVING, not by fading. What is left in a corner can stay —
   * a corner is off the playfield anyway, and something still in frame reads as forest
   * rather than as a curtain that failed to close.
   */
  it("clears the playfield without fading out", () => {
    const late = around(0.99);
    expect(late.calls.length, "the bushes were faded away rather than moved").toBeGreaterThan(0);
    expect(late.num("globalAlpha"), "a fade crept back in").toBe(1);

    // Nothing left over the middle of the board, where the player is about to be looking.
    const over = late.of("arc").filter((c) => {
      const x = c.args[0] as number, y = c.args[1] as number;
      return x > 400 * 0.2 && x < 400 * 0.8 && y > 800 * 0.2 && y < 800 * 0.8;
    });
    expect(over.length, "a bush was left sitting on the playfield").toBe(0);
  });

  /**
   * The surround stops being drawn the moment the camera lands, so anything still inside
   * the frame at that instant pops out of existence — which is exactly the kind of jolt the
   * whole descent is aiming to avoid.
   */
  it("is outside the frame by the time it stops being drawn", () => {
    const last = around(0.999).of("arc");
    expect(last.length, "nothing was drawn to check").toBeGreaterThan(0);
    for (const c of last) {
      const x = c.args[0] as number, y = c.args[1] as number, r = c.args[2] as number;
      const inside = x + r > 0 && x - r < 400 && y + r > 0 && y - r < 800;
      expect(inside, `a clump was still in frame at ${Math.round(x)},${Math.round(y)}`)
        .toBe(false);
    }
  });

  it("holds them early and sends them out at the end", () => {
    expect(surroundEase(0)).toBe(0);
    expect(surroundEase(1)).toBe(1);
    expect(surroundEase(0.6)).toBeGreaterThan(surroundEase(0.3));
    // The frame has to stay full while the board is still small in it.
    expect(surroundEase(0.3), "the ring opened too early").toBeLessThan(0.2);
  });

  /** The corners hold the frame longest — they are off the playfield, so they can. */
  it("sends a clump on a diagonal later than one on an edge", () => {
    for (const p of [0.3, 0.6, 0.9]) {
      expect(surroundEase(p, 1), `at ${p}`).toBeLessThan(surroundEase(p, 0));
    }
    // ...but gone by the end, or it would pop out when the surround stops being drawn.
    expect(surroundEase(1, 1)).toBe(1);
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
