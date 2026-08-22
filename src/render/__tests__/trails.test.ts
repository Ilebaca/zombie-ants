/**
 * The marching ants.
 *
 * The tracer is the part worth testing: it has to turn a set of owned tiles into CLOSED
 * loops, because that is the whole reason the dashes flow instead of sitting still. A
 * per-edge version needs no tracing and looks wrong, so "does it produce one loop of the
 * right length" is exactly the property that separates the two.
 */
import { describe, expect, it } from "vitest";
import { blankGame, put } from "../../engine/__tests__/helpers";
import { recomputeConnectivity } from "../../engine";
import { Layout } from "../layout";
import { drawTrail, territoryLoops } from "../trails";
import { makeRecorder } from "./recorder";

const layout = (): Layout => {
  const l = new Layout(13);
  l.ts = 40; l.ox = 0; l.oy = 0; l.width = 520; l.height = 520;
  return l;
};

describe("tracing a colony's outline", () => {
  it("wraps a single tile in one four-corner loop", () => {
    const s = blankGame();
    put(s, 3, 3, { owner: "you", struct: "stable", soldiers: 2 });
    recomputeConnectivity(s);
    const loops = territoryLoops(s, "you");
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
  });

  /**
   * Two tiles side by side share an edge, and a shared edge is not a boundary. Six corners,
   * not eight — if this says eight, the inner edge is being drawn and the ants will run
   * straight through the middle of the colony.
   */
  it("does not trace the seam between two neighbours", () => {
    const s = blankGame();
    put(s, 3, 3, { owner: "you", struct: "stable", soldiers: 2 });
    put(s, 4, 3, { owner: "you", struct: "stable", soldiers: 2 });
    recomputeConnectivity(s);
    const loops = territoryLoops(s, "you");
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(6);
  });

  it("gives a detached group its own loop", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "stable", soldiers: 2 });
    put(s, 9, 9, { owner: "you", struct: "stable", soldiers: 2 });
    recomputeConnectivity(s);
    expect(territoryLoops(s, "you")).toHaveLength(2);
  });

  /** A hole in the middle of a colony is its own ring of ants, wound the other way. */
  it("traces a hole as a second loop", () => {
    const s = blankGame();
    for (let c = 2; c <= 4; c++) {
      for (let r = 2; r <= 4; r++) {
        if (c === 3 && r === 3) continue;               // the hole
        put(s, c, r, { owner: "you", struct: "stable", soldiers: 2 });
      }
    }
    recomputeConnectivity(s);
    const loops = territoryLoops(s, "you");
    expect(loops).toHaveLength(2);
    expect(loops.map((l) => l.length).sort((a, b) => a - b)).toEqual([4, 12]);
  });

  it("counts veins as territory — the ants walk the trails too", () => {
    const s = blankGame();
    put(s, 3, 3, { owner: "you", struct: "stable", soldiers: 2 });
    put(s, 4, 3, { owner: "you", struct: "vein", soldiers: 0 });
    recomputeConnectivity(s);
    expect(territoryLoops(s, "you")[0]).toHaveLength(6);
  });

  it("leaves a side with nothing on the board alone", () => {
    const s = blankGame();
    expect(territoryLoops(s, "you")).toHaveLength(0);
  });
});

describe("drawing the trail", () => {
  const loop = [
    { c: 1, r: 1 }, { c: 2, r: 1 }, { c: 2, r: 2 }, { c: 1, r: 2 },
  ];

  it("strokes a dashed path", () => {
    const rec = makeRecorder();
    drawTrail(rec.ctx, layout(), [loop], { colour: "#0f0", width: 2, phase: 0 }, 0);
    expect(rec.calls.some((c) => c.fn === "setLineDash")).toBe(true);
    expect(rec.calls.some((c) => c.fn === "stroke")).toBe(true);
  });

  /** The dashes MOVE. Without this the outline is just a dotted border. */
  it("shifts the dash offset as time passes", () => {
    const at = (now: number): number => {
      const rec = makeRecorder();
      drawTrail(rec.ctx, layout(), [loop], { colour: "#0f0", width: 2, phase: 0 }, now);
      return rec.num("lineDashOffset");
    };
    expect(at(0)).not.toBe(at(400));
  });

  it("draws nothing at all for a side with no territory", () => {
    const rec = makeRecorder();
    drawTrail(rec.ctx, layout(), [], { colour: "#0f0", width: 2, phase: 0 }, 0);
    expect(rec.calls.some((c) => c.fn === "stroke")).toBe(false);
  });
});
