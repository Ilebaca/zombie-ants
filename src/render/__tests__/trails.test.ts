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
import { drawTrail, drawVeinTrail, territoryLoops, veinTrails } from "../trails";
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

  /**
   * A vein is drawn as a LINE down the middle of its tile, so outlining the tile as well
   * would wrap that line in a tube whose two sides march against each other. The outline
   * stops at the solid ground; `veinTrails` picks the trail up from there.
   */
  it("leaves veins out of the outline", () => {
    const s = blankGame();
    put(s, 3, 3, { owner: "you", struct: "stable", soldiers: 2 });
    put(s, 4, 3, { owner: "you", struct: "vein", soldiers: 0 });
    recomputeConnectivity(s);
    const loops = territoryLoops(s, "you");
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
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

/**
 * The ants on a vein walk the bar the tile already draws, not a ring around the tile. The
 * spine therefore has to run through each vein's CENTRE and hand over to the outline exactly
 * on the edge it shares with solid ground.
 */
describe("tracing the vein spines", () => {
  const trail = (s: ReturnType<typeof blankGame>): { c: number; r: number }[][] =>
    veinTrails(s, "you");

  it("runs a straight trail out as one unbroken path", () => {
    const s = blankGame();
    put(s, 3, 3, { owner: "you", struct: "stable", soldiers: 2 });
    put(s, 4, 3, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 5, 3, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 6, 3, { owner: "you", struct: "stable", soldiers: 2 });
    recomputeConnectivity(s);

    const paths = trail(s);
    expect(paths, "two half-trails would restart the dash pattern in the middle").toHaveLength(1);
    // Edge of the first solid tile, through both centres, to the edge of the last.
    expect(paths[0]).toEqual([
      { c: 4, r: 3.5 }, { c: 4.5, r: 3.5 }, { c: 5, r: 3.5 }, { c: 5.5, r: 3.5 }, { c: 6, r: 3.5 },
    ]);
  });

  it("turns the corner inside the tile that bends", () => {
    const s = blankGame();
    put(s, 3, 3, { owner: "you", struct: "stable", soldiers: 2 });
    put(s, 4, 3, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 4, 4, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 4, 5, { owner: "you", struct: "stable", soldiers: 2 });
    recomputeConnectivity(s);

    const paths = trail(s);
    expect(paths).toHaveLength(1);
    // The bend happens at the centre of (4,3) — the only point that is not collinear.
    expect(paths[0]).toContainEqual({ c: 4.5, r: 3.5 });
    expect(paths[0]?.[0]).toEqual({ c: 4, r: 3.5 });
    expect(paths[0]?.[(paths[0]?.length ?? 1) - 1]).toEqual({ c: 4.5, r: 5 });
  });

  /**
   * A crossroads is two lines crossing, not four stubs. The walk has to carry straight on
   * through it, or the long run through the junction is chopped into pieces and the dashes
   * take a rounded turn where the bar underneath goes straight.
   */
  it("carries straight on through a crossroads", () => {
    const s = blankGame();
    for (const [c, r] of [[4, 1], [3, 3], [5, 3], [4, 5]] as const) {
      put(s, c, r, { owner: "you", struct: "stable", soldiers: 2 });
    }
    for (const [c, r] of [[4, 2], [4, 3], [4, 4]] as const) {
      put(s, c, r, { owner: "you", struct: "vein", soldiers: 0 });
    }
    recomputeConnectivity(s);

    const paths = trail(s);
    const vertical = paths.find((p) => p.some((q) => q.c === 4.5 && q.r === 2)
      && p.some((q) => q.c === 4.5 && q.r === 5));
    expect(vertical, "the run through the crossroads must stay one path").toBeTruthy();
  });

  it("gives a lone vein a bar to walk while it is still filling in", () => {
    const s = blankGame();
    put(s, 4, 3, { owner: "you", struct: "vein", soldiers: 0 });
    recomputeConnectivity(s);
    expect(trail(s)[0]).toEqual([{ c: 4, r: 3.5 }, { c: 4.5, r: 3.5 }, { c: 5, r: 3.5 }]);
  });

  it("has nothing to draw when the colony has no veins", () => {
    const s = blankGame();
    put(s, 3, 3, { owner: "you", struct: "stable", soldiers: 2 });
    recomputeConnectivity(s);
    expect(trail(s)).toHaveLength(0);
  });

  it("rounds the bend rather than mitring it", () => {
    const rec = makeRecorder();
    const path = [{ c: 4, r: 3.5 }, { c: 4.5, r: 3.5 }, { c: 4.5, r: 4 }];
    drawVeinTrail(rec.ctx, layout(), [path], { colour: "#0f0", width: 2, phase: 0 }, 0);
    const bends = rec.of("arcTo");
    expect(bends).toHaveLength(1);
    // Rounded ABOUT the centre of the tile that bends: 4.5 * 40, 3.5 * 40.
    expect(bends[0]?.args.slice(0, 2)).toEqual([180, 140]);
  });

  it("marches at the same rate as the outline", () => {
    const off = (draw: (r: ReturnType<typeof makeRecorder>) => void): number => {
      const rec = makeRecorder();
      draw(rec);
      return rec.num("lineDashOffset");
    };
    const style = { colour: "#0f0", width: 2, phase: 0 };
    const loop = [{ c: 1, r: 1 }, { c: 2, r: 1 }, { c: 2, r: 2 }, { c: 1, r: 2 }];
    const spine = [{ c: 4, r: 3.5 }, { c: 4.5, r: 3.5 }, { c: 5, r: 3.5 }];
    expect(off((r) => drawVeinTrail(r.ctx, layout(), [spine], style, 700)))
      .toBe(off((r) => drawTrail(r.ctx, layout(), [loop], style, 700)));
  });
});
