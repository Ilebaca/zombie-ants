import { describe, expect, it } from "vitest";
import { blankGame, put } from "../../engine/__tests__/helpers";
import { recomputeConnectivity, tile } from "../../engine";
import type { Coord, EngineEvent, GameState, Tile } from "../../engine";
import { Layout } from "../layout";
import { RevealTracker, edgeFor } from "../reveal";
import { FxLayer } from "../fx";
import { animate, sourceOf } from "../animate";
import { basicLook } from "../art";
import { drawTile, type Scene } from "../board";
import { makeRecorder, type Recorder } from "./recorder";

function scene(state: GameState, over: Partial<Scene> = {}): { s: Scene; rec: Recorder } {
  const rec = makeRecorder();
  const layout = new Layout(state.size);
  layout.ts = 40; layout.ox = 0; layout.oy = 0; layout.width = 400; layout.height = 400;
  const s: Scene = {
    ctx: rec.ctx,
    layout,
    state,
    reveal: new RevealTracker(),
    looks: { you: basicLook("fire"), ai: basicLook("leafcutter") },
    hideCounts: false,
    selection: null,
    valid: [],
    current: "you",
    ...over,
  };
  return { s, rec };
}

const draw = (state: GameState, t: Tile, over?: Partial<Scene>): Recorder => {
  const { s, rec } = scene(state, over);
  drawTile(s, t);
  return rec;
};

describe("reveal direction", () => {
  // Troops moving east must fill the cell starting at its WEST edge, or the territory
  // appears to grow backwards out of the tile it is advancing into.
  it("fills from the edge opposite the direction of travel", () => {
    expect(edgeFor("R")).toBe("L");
    expect(edgeFor("L")).toBe("R");
    expect(edgeFor("D")).toBe("U");
    expect(edgeFor("U")).toBe("D");
  });

  it("locates the attacker's tile from the attack direction", () => {
    expect(sourceOf({ c: 3, r: 3 }, "R")).toEqual({ c: 2, r: 3 });
    expect(sourceOf({ c: 3, r: 3 }, "L")).toEqual({ c: 4, r: 3 });
    expect(sourceOf({ c: 3, r: 3 }, "D")).toEqual({ c: 3, r: 2 });
    expect(sourceOf({ c: 3, r: 3 }, "U")).toEqual({ c: 3, r: 4 });
  });
});

describe("animate: events to animation", () => {
  const sinks = () => ({ reveal: new RevealTracker(), fx: new FxLayer() });

  it("reveals a captured tile from the correct edge, over the previous owner", () => {
    const s = sinks();
    s.reveal.reduced = false;
    animate([{ type: "capture", at: { c: 2, r: 1 }, owner: "you", from: "R", previous: "ai" }], s);
    const st = s.reveal.get(2, 1);
    expect(st).toBeDefined();
    expect(st?.edge).toBe("L");
    expect(st?.prev).toBe("ai");
  });

  it("treats a whole travel path as one sweeping group", () => {
    const s = sinks();
    s.reveal.reduced = false;
    const path: Coord[] = [{ c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }, { c: 3, r: 0 }];
    animate([{ type: "travel", path, owner: "you", count: 9 }], s);
    // the source tile is not revealed; each step is, and all share one front
    expect(s.reveal.get(0, 0)).toBeUndefined();
    expect(s.reveal.get(1, 0)?.edge).toBe("L");
    expect(s.reveal.get(3, 0)?.edge).toBe("L");
    // the tail has not started while the head is still filling
    s.reveal.step(performance.now());
    expect(s.reveal.progress(3, 0)).toBeLessThan(1);
  });

  it("does not double-reveal veins that a travel already covered", () => {
    const s = sinks();
    s.reveal.reduced = false;
    const path: Coord[] = [{ c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }];
    animate([
      { type: "travel", path, owner: "you", count: 5 },
      { type: "veinLaid", at: { c: 1, r: 0 }, owner: "you" },
    ], s);
    expect(s.reveal.get(1, 0)?.edge).toBe("L");   // still the path's edge, not a fresh default
  });

  it("reinforcing your own tile flows troops but captures nothing", () => {
    const s = sinks();
    s.reveal.reduced = false;
    animate([{ type: "move", from: { c: 0, r: 0 }, to: { c: 1, r: 0 }, owner: "you", count: 3 }], s);
    expect(s.reveal.get(1, 0)).toBeUndefined();
  });

  it("honours reduced motion by skipping reveals entirely", () => {
    const s = sinks();
    s.reveal.reduced = true;
    animate([{ type: "capture", at: { c: 2, r: 1 }, owner: "you", from: "R", previous: null }], s);
    expect(s.reveal.get(2, 1)).toBeUndefined();
    expect(s.reveal.progress(2, 1)).toBe(1);       // draws settled, never invisible
  });

  /**
   * The whole reason events exist (CLAUDE.md §3): the view may not write to the engine.
   * The legacy build stored reveal progress on the tile, which the AI's snapshot copied.
   */
  it("never mutates game state", () => {
    const state = blankGame("tiny");
    put(state, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(state);
    const before = JSON.stringify(state.grid);

    const events: EngineEvent[] = [
      { type: "capture", at: { c: 2, r: 1 }, owner: "you", from: "R", previous: null },
      { type: "combat", at: { c: 3, r: 1 }, attacker: "you", from: "R", won: true, survivors: 4 },
      { type: "rally", to: { c: 1, r: 1 }, owner: "you", sources: [{ c: 2, r: 1 }], count: 3 },
    ];
    animate(events, sinks());
    expect(JSON.stringify(state.grid)).toBe(before);
  });

  it("keeps reveal progress off the tiles", () => {
    const state = blankGame("tiny");
    const s = sinks();
    s.reveal.reduced = false;
    animate([{ type: "capture", at: { c: 2, r: 1 }, owner: "you", from: "R", previous: null }], s);
    expect(Object.keys(tile(state, 2, 1))).not.toContain("rv");
  });
});

describe("drawTile", () => {
  it("draws a rock for blocked terrain and nothing else", () => {
    const state = blankGame("tiny");
    const t = put(state, 1, 1, { terrain: "blocked" });
    const rec = draw(state, t);
    expect(rec.fills().some((f) => f.includes("120,112,96"))).toBe(true);
    expect(rec.texts()).toHaveLength(0);          // no count pill on a rock
  });

  /**
   * Veins are infrastructure, not territory (CLAUDE.md §4.5). They must render as a thin
   * trail of bars, never as a filled cell — a filled vein reads as captured ground.
   */
  it("draws a vein as connecting bars, not a filled cell", () => {
    const state = blankGame("tiny");
    put(state, 1, 1, { owner: "you", struct: "nest", soldiers: 5 });
    const vein = put(state, 2, 1, { owner: "you", struct: "vein", soldiers: 0 });
    recomputeConnectivity(state);

    const rec = draw(state, vein);
    const bars = rec.of("fillRect");
    expect(bars.length).toBeGreaterThanOrEqual(2);            // hub + an arm toward the nest
    // a vein must never paint the full tile
    expect(bars.some((b) => b.args[2] === 40 && b.args[3] === 40)).toBe(false);
  });

  it("draws captured territory as a filled cell", () => {
    const state = blankGame("tiny");
    put(state, 1, 1, { owner: "you", struct: "nest", soldiers: 5 });
    const stable = put(state, 2, 1, { owner: "you", struct: "stable", soldiers: 4 });
    recomputeConnectivity(state);
    const rec = draw(state, stable);
    expect(rec.has("fill")).toBe(true);
    expect(rec.texts()).toContain("4");                        // soldier count pill
  });

  it("greys out a tile cut off from the nest", () => {
    const state = blankGame("tiny");
    put(state, 1, 1, { owner: "you", struct: "nest", soldiers: 5 });
    const island = put(state, 5, 5, { owner: "you", struct: "stable", soldiers: 7 });
    recomputeConnectivity(state);
    const rec = draw(state, island);
    expect(rec.fills().some((f) => f.includes("56,68,88"))).toBe(true);
  });

  it("hides every count during the win-flood finale", () => {
    const state = blankGame("tiny");
    const t = put(state, 1, 1, { owner: "you", struct: "stable", soldiers: 9 });
    recomputeConnectivity(state);
    expect(draw(state, t).texts()).toContain("9");
    expect(draw(state, t, { hideCounts: true }).texts()).not.toContain("9");
  });

  it("stamps a shield badge on a wild garrison", () => {
    const state = blankGame("tiny");
    const t = put(state, 3, 3, { owner: null, guard: 6, terrain: "ground" });
    const rec = draw(state, t);
    expect(rec.texts().some((s) => s.includes("6"))).toBe(true);
  });

  it("draws the nest illustration only on the queen's tile", () => {
    const state = blankGame("tiny");
    const nest = put(state, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    const stable = put(state, 2, 1, { owner: "you", struct: "stable", soldiers: 3 });
    recomputeConnectivity(state);
    // the mound is drawn with quadratic curves; a plain stable has none
    expect(draw(state, nest).has("quadraticCurveTo")).toBe(true);
    expect(draw(state, stable).has("quadraticCurveTo")).toBe(false);
  });
});
