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
  INTRO_FILL_MS, INTRO_FROM, INTRO_MS, descent, drawSupply, drawSurround, introAt,
  edgePoint, introScale, introTotal, planIntro, resetSurround, supplyEdge, supplyFade,
  surroundEase,
} from "../intro";
import type { Frame, Supply } from "../intro";
import { terrainBleed } from "../terrain";
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

  /**
   * ONE MOVEMENT, ONE CURVE. The ring opening and the floor growing are the same camera
   * coming down, so they start together, end together and are shaped the same. They were
   * not: the floor eased out while the ring eased in, and it read as two things happening
   * at once rather than as one lens descending.
   */
  it("opens on exactly the curve the floor grows on", () => {
    expect(surroundEase(0)).toBe(0);
    expect(surroundEase(1)).toBe(1);
    for (const p of [0.15, 0.3, 0.5, 0.75, 0.9]) {
      // The scale is the same curve mapped onto FROM..1, so undoing that mapping has to
      // land back on the ring's own progress — to the last decimal, not merely close.
      const floor = (introScale(p) - introScale(0)) / (1 - introScale(0));
      expect(floor, `the ring and the floor parted company at ${p}`)
        .toBeCloseTo(surroundEase(p), 10);
    }
  });

  /**
   * The corners still hold the frame longest, but they do it by GEOMETRY — a clump leaving
   * on a diagonal has further to go — rather than by a timing of their own, which would put
   * them back on a second curve.
   */
  it("gives every clump the same timing", () => {
    expect(surroundEase).toBe(descent);
    expect(descent(0.4)).toBeGreaterThan(descent(0.2));
  });

  /**
   * THE GROUND UNDER THEM IS ONE PLATE. The bushes used to be what hid the board's straight
   * rim while the camera was high, which meant the match opened on a ring of foliage and
   * settled onto rocks and sticks — two different backgrounds, with the scenery appearing
   * to shift as the plate grew into place. The terrain is baked past the canvas now
   * (`terrainBleed`) and the bushes are only foliage to come down past.
   */
  it("is backed by ground that already covers the frame the camera starts in", () => {
    for (const [size, w, h] of [[7, 400, 800], [9, 390, 640], [13, 1024, 700]] as const) {
      const layout = new Layout(size);
      layout.width = w; layout.height = h;
      layout.ts = Math.floor(Math.min(w, h) / size);
      layout.ox = Math.round((w - layout.ts * size) / 2);
      layout.oy = Math.round((h - layout.ts * size) / 2);

      // What the lens can see at the top of the descent: the canvas, blown up about the
      // middle of the BOARD — which is not always the middle of the canvas.
      const s = introScale(0);
      const cx = layout.ox + (layout.size * layout.ts) / 2;
      const cy = layout.oy + (layout.size * layout.ts) / 2;
      const bleed = terrainBleed(layout);
      const seen = {
        l: cx - cx / s, r: cx + (w - cx) / s,
        t: cy - cy / s, b: cy + (h - cy) / s,
      };
      expect(seen.l, `left edge of the plate came into shot on ${size}`)
        .toBeGreaterThanOrEqual(-bleed);
      expect(seen.t, `top edge of the plate came into shot on ${size}`)
        .toBeGreaterThanOrEqual(-bleed);
      expect(seen.r, `right edge of the plate came into shot on ${size}`)
        .toBeLessThanOrEqual(w + bleed);
      expect(seen.b, `bottom edge of the plate came into shot on ${size}`)
        .toBeLessThanOrEqual(h + bleed);
    }
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
    // Measured where they are PLACED. The ring opens on the camera's curve now, so by a
    // fifth of the way down it has already carried the clumps out past the rim.
    const at = around(0).of("arc")
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

/**
 * THE SUPPLY LINES. Each colony's nest is reached by a vein running in from off the frame,
 * so five tiles in a corner read as a detachment of something carrying on past the clearing
 * rather than as a colony that begins and ends there.
 */
describe("the colonies arrive from somewhere", () => {
  // What the camera sees at the top of the descent, around a board centred on a 400x800.
  const FRAME: Frame = {
    x0: 200 - 200 / INTRO_FROM, x1: 200 + 200 / INTRO_FROM,
    y0: 400 - 400 / INTRO_FROM, y1: 400 + 400 / INTRO_FROM,
  };
  const you: Supply = { x: 80, y: 700, colour: "#5c6" };
  const ai: Supply = { x: 320, y: 100, colour: "#e64" };
  // A nest nearest the TOP of the frame comes in vertically. Both of the two above happen
  // to run horizontally, and a test with only those cannot tell a bar from a rectangle.
  const above: Supply = { x: 200, y: 40, colour: "#48f" };

  /** Where the camera ends up: the canvas itself. */
  const SCREEN: Frame = { x0: 0, y0: 0, x1: 400, y1: 800 };

  const drawn = (grow: number): ReturnType<typeof makeRecorder> => {
    const rec = makeRecorder();
    drawSupply(rec.ctx, FRAME, SCREEN, [you, ai], grow, 1, 8);
    return rec;
  };

  /** Nothing in this game moves diagonally, and no vein on the board is drawn that way. */
  it("runs along one axis, never a diagonal", () => {
    const rec = makeRecorder();
    drawSupply(rec.ctx, FRAME, SCREEN, [you, ai, above], 0.5, 1, 8);
    const bars = rec.of("fillRect");
    expect(bars.length).toBe(3);
    const axes = new Set<string>();
    for (const bar of bars) {
      const [, , w = 0, h = 0] = bar.args as number[];
      // EXACTLY one axis is the bar's thickness, and the other is a real run: a diagonal
      // is long in both, and a bar drawn along the wrong axis has no length at all.
      expect(w === 8 !== (h === 8), `a bar ${w}x${h} is not a line`).toBe(true);
      expect(Math.max(w, h), `a bar ${w}x${h} has no length`).toBeGreaterThan(8);
      axes.add(w === 8 ? "vertical" : "horizontal");
    }
    expect(axes.has("vertical"), "no vertical case was exercised").toBe(true);
    expect(axes.has("horizontal"), "no horizontal case was exercised").toBe(true);
  });

  /*
   * THE TAIL IS OFF THE PICTURE AND THE FRONT IS ON IT. Both measured from the outer frame,
   * the front spends most of the descent outside the canvas and the line shows as a
   * two-pixel nub at the rim until the last moment — which is exactly what it did.
   */
  it("runs in from off the picture, visible from the first frame", () => {
    const edge = supplyEdge(you, FRAME);
    const tail = edgePoint(you, FRAME, edge);
    const front = edgePoint(you, SCREEN, edge);
    expect(tail.x <= FRAME.x0 || tail.x >= FRAME.x1
      || tail.y <= FRAME.y0 || tail.y >= FRAME.y1, "the tail is inside the picture").toBe(true);
    // The front starts on the edge the camera lands on, so there is a line to see at once.
    const bars = drawn(0).of("fillRect").map((c) => c.args as number[]);
    expect(bars.some((b) => (b[2] ?? 0) > 20 || (b[3] ?? 0) > 20),
      "nothing visible on the first frame").toBe(true);
    // Both ends sit on the nest's own row or column: the run never turns a corner.
    expect(tail.y === you.y && front.y === you.y).toBe(true);
  });

  it("reaches the nest exactly as the camera lands, and not before", () => {
    const reaches = (grow: number, at: Supply): boolean =>
      drawn(grow).of("fillRect").some((bar) => {
        const [x = 0, y = 0, w = 0, h = 0] = bar.args as number[];
        return x <= at.x + 4 && x + w >= at.x - 4 && y <= at.y + 4 && y + h >= at.y - 4;
      });
    expect(reaches(1, you), "the line never got there").toBe(true);
    expect(reaches(1, ai), "only one colony was connected").toBe(true);
    expect(reaches(0.4, you), "the line arrived before the camera did").toBe(false);
  });

  it("draws each colony in its own colour", () => {
    const rec = drawn(1);
    expect(rec.fills()).toContain(you.colour);
    expect(rec.fills()).toContain(ai.colour);
  });

  /** A mark that outlives the opening is a lie about the position: the board has no tile there. */
  it("holds through the opening and is gone by the end of it", () => {
    expect(supplyFade(0)).toBe(1);
    expect(supplyFade(0.6), "faded while the camera was still coming down").toBe(1);
    expect(supplyFade(1)).toBe(0);
    expect(drawn(1).of("fillRect").length).toBeGreaterThan(0);
    const rec = makeRecorder();
    drawSupply(rec.ctx, FRAME, SCREEN, [you, ai], 1, 0, 8);
    expect(rec.of("fillRect").length, "still drawn at zero alpha").toBe(0);
  });
});