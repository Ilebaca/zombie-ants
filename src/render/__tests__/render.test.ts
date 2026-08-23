import { describe, expect, it, vi } from "vitest";
import { blankGame, put } from "../../engine/__tests__/helpers";
import { addEffect, recomputeConnectivity, tile, travel } from "../../engine";
import type { Coord, EngineEvent, GameState, Tile } from "../../engine";
import { Layout } from "../layout";
import { REVEAL_MS_PER_TILE, RevealTracker, edgeFor } from "../reveal";
import { CRUMBLE_MS, FxLayer } from "../fx";
import { animate, sourceOf } from "../animate";
import { basicLook } from "../art";
import { drawFillets, drawTile, drawTileEffects, drawTrails, type Scene } from "../board";
import { MAP, hexA, ownerCol } from "../palette";
import { innerCorners } from "../shapes";
import { makeRecorder, type Call, type Recorder } from "./recorder";

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
    // The engine emits one `veinLaid` per step it actually claims, and the animator
    // reveals exactly those — so a faithful test has to include them.
    animate([
      { type: "veinLaid", at: { c: 1, r: 0 }, owner: "you" },
      { type: "veinLaid", at: { c: 2, r: 0 }, owner: "you" },
      { type: "veinLaid", at: { c: 3, r: 0 }, owner: "you" },
      { type: "travel", path, owner: "you", count: 9 },
    ], s);
    // the source tile is not revealed; each step is, and all share one front
    expect(s.reveal.get(0, 0)).toBeUndefined();
    expect(s.reveal.get(1, 0)?.edge).toBe("L");
    expect(s.reveal.get(3, 0)?.edge).toBe("L");
    // the tail has not started while the head is still filling
    s.reveal.step(performance.now());
    expect(s.reveal.progress(3, 0)).toBeLessThan(1);
  });

  /**
   * A long send usually crosses ground the player ALREADY owns. Those tiles must not fill
   * again — they are not being claimed, the troops are only walking over them, and
   * re-revealing them makes the colony look like it is being rebuilt from scratch every
   * time anything moves.
   */
  it("fills only the tiles a travel actually claims", () => {
    const s = sinks();
    s.reveal.reduced = false;
    // Six tiles. The first two steps are already ours; only the last three are new.
    const path: Coord[] = [
      { c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 },
      { c: 3, r: 0 }, { c: 4, r: 0 }, { c: 5, r: 0 },
    ];
    animate([
      { type: "veinLaid", at: { c: 3, r: 0 }, owner: "you" },
      { type: "veinLaid", at: { c: 4, r: 0 }, owner: "you" },
      { type: "veinLaid", at: { c: 5, r: 0 }, owner: "you" },
      { type: "travel", path, owner: "you", count: 9 },
    ], s);

    expect(s.reveal.get(1, 0), "re-filled ground we already held").toBeUndefined();
    expect(s.reveal.get(2, 0), "re-filled ground we already held").toBeUndefined();
    expect(s.reveal.get(3, 0)).toBeDefined();

    // ...and the new ground still fills at its own place in the path, not immediately:
    // the front has five slots to cross and the first new tile sits at the third.
    const start = performance.now();
    const step = s.reveal.stepMs(5);
    s.reveal.step(start + step * 1.5);
    expect(s.reveal.progress(3, 0), "lit up before the troops got there").toBe(0);
    s.reveal.step(start + step * 3.5);
    expect(s.reveal.progress(3, 0)).toBe(1);
    expect(s.reveal.progress(4, 0)).toBeGreaterThan(0);
    expect(s.reveal.progress(4, 0)).toBeLessThan(1);
    expect(s.reveal.progress(5, 0)).toBe(0);
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
    // Palette-driven rather than a literal colour, so a recolour does not fail the test
    // but a missing rock still does.
    expect(rec.fills()).toContain(MAP.rock.toLowerCase());
    expect(rec.texts()).toHaveLength(0);          // no count pill on a rock
  });

  /**
   * Every raised object is a stack: a shade on the ground, a solid side, then the lit face.
   * Flattening one back to a single fill is the exact regression this catches.
   */
  it("builds a rock from its ground shade, its side and its top", () => {
    const state = blankGame("tiny");
    const t = put(state, 1, 1, { terrain: "blocked" });
    const fills = draw(state, t).fills();
    for (const layer of [MAP.groundShade, MAP.rockEdge, MAP.rock, MAP.rockTop]) {
      expect(fills, `rock is missing its ${layer} layer`).toContain(layer.toLowerCase());
    }
  });

  it("draws a resource as a gem with a facet, over a shaded base", () => {
    const state = blankGame("tiny");
    const t = put(state, 2, 2, { terrain: "resource" });
    const fills = draw(state, t).fills();
    for (const layer of [MAP.gemEdge, MAP.gem, MAP.gemTop]) {
      expect(fills, `gem is missing its ${layer} layer`).toContain(layer.toLowerCase());
    }
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

describe("the troop-count badge", () => {
  /**
   * Milan asked for a circle that stretches sideways as the number grows. The badge is
   * drawn with arcTo corners, so its shape is only checkable by the geometry recorded —
   * width against height, and a corner radius of exactly half the height.
   */
  /**
   * The badge is the last rounded rect in the frame — the tile body draws one too, so the
   * corners are collected backwards from the number being stamped.
   */
  const badgeCorners = (rec: Recorder): Call[] => {
    const end = rec.calls.map((c) => c.fn).lastIndexOf("fillText");
    if (end < 0) return [];
    const out: Call[] = [];
    for (let i = end; i >= 0 && out.length < 8; i--) {
      const call = rec.calls[i] as Call;
      if (call.fn === "arcTo") out.push(call);
    }
    return out;
  };

  const badgeBox = (rec: Recorder): { w: number; h: number } | null => {
    // rrect lays down moveTo + four arcTo; the box is the extent of those corner points.
    const pts = badgeCorners(rec).flatMap((c) => [
      { x: c.args[0] as number, y: c.args[1] as number },
      { x: c.args[2] as number, y: c.args[3] as number },
    ]);
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };

  const badgeFor = (count: number): { w: number; h: number } => {
    const s = blankGame("tiny");
    const t = put(s, 2, 2, { owner: "you", struct: "stable", soldiers: count });
    recomputeConnectivity(s);
    const box = badgeBox(draw(s, t));
    expect(box, `no badge drawn for ${count}`).toBeTruthy();
    return box as { w: number; h: number };
  };

  it("draws a single digit as a circle", () => {
    const { w, h } = badgeFor(7);
    expect(w).toBeCloseTo(h, 1);
  });

  it("stretches horizontally as the number grows, and never taller", () => {
    const one = badgeFor(7);
    const two = badgeFor(42);
    const three = badgeFor(128);
    expect(two.w).toBeGreaterThan(one.w);
    expect(three.w).toBeGreaterThan(two.w);
    expect(two.h).toBeCloseTo(one.h, 1);
    expect(three.h).toBeCloseTo(one.h, 1);
  });

  it("keeps the corner radius at half the height, so it stays a pill", () => {
    const s = blankGame("tiny");
    const t = put(s, 2, 2, { owner: "you", struct: "stable", soldiers: 128 });
    recomputeConnectivity(s);
    const rec = draw(s, t);
    const radii = badgeCorners(rec).map((c) => c.args[4] as number);
    const box = badgeBox(rec) as { w: number; h: number };
    for (const r of radii) expect(r).toBeCloseTo(box.h / 2, 1);
  });

  it("still shows the wild garrison's strength on an unowned tile", () => {
    const s = blankGame("tiny");
    const t = put(s, 2, 2, { owner: null, guard: 4 });
    const rec = draw(s, t);
    expect(rec.texts().join(" ")).toContain("4");
  });
});

describe("the reveal front", () => {
  /**
   * "Smooth and linear, extending from the point of attack": the front must cover equal
   * ground in equal time, and the first tile of a long push must not sprint ahead of the
   * last. An eased front fails both.
   */
  it("advances at a constant rate", () => {
    const reveal = new RevealTracker();
    reveal.reduced = false;
    reveal.begin([{ at: { c: 0, r: 0 }, edge: "L", prev: null }]);
    const start = performance.now();

    const at = (fraction: number): number => {
      reveal.step(start + REVEAL_MS_PER_TILE * fraction);
      return reveal.progress(0, 0);
    };
    // Quarter of the time, quarter of the tile — within a hair of exact.
    expect(at(0.25)).toBeCloseTo(0.25, 2);
    expect(at(0.5)).toBeCloseTo(0.5, 2);
    expect(at(0.75)).toBeCloseTo(0.75, 2);
  });

  it("crosses every tile of a long push at the same speed as a single one", () => {
    const one = new RevealTracker(); one.reduced = false;
    one.begin([{ at: { c: 0, r: 0 }, edge: "L", prev: null }]);

    const many = new RevealTracker(); many.reduced = false;
    many.begin([0, 1, 2, 3].map((c) => ({ at: { c, r: 0 }, edge: "L" as const, prev: null })));

    const t0 = performance.now();
    one.step(t0 + REVEAL_MS_PER_TILE * 0.5);
    many.step(t0 + REVEAL_MS_PER_TILE * 0.5);
    // Half a tile-time in, both have filled half of their first tile.
    expect(many.progress(0, 0)).toBeCloseTo(one.progress(0, 0), 2);
    // ...and nothing beyond it has started.
    expect(many.progress(1, 0)).toBe(0);
  });

  it("fills from the edge the attack came from", () => {
    const reveal = new RevealTracker();
    reveal.reduced = false;
    // Troops moving right into (3,0) must fill it from its left edge.
    reveal.begin([{ at: { c: 3, r: 0 }, edge: edgeFor("R"), prev: "ai" }]);
    expect(reveal.get(3, 0)?.edge).toBe("L");
    expect(reveal.get(3, 0)?.prev).toBe("ai");
  });
});

describe("a batch of captures", () => {
  /**
   * An ability that claims several tiles at once (Weaver's Spread, Pharaoh's Bud) used to
   * start a separate reveal for each one, all on the same frame — so the tiles filled
   * together instead of one after another. They must run as a single ordered front.
   */
  const spread = (n: number): EngineEvent[] =>
    Array.from({ length: n }, (_, i): EngineEvent => ({
      type: "capture", at: { c: i, r: 3 }, owner: "you", from: "R", previous: null,
    }));

  it("fills the tiles one at a time, in the order they were claimed", () => {
    const reveal = new RevealTracker();
    reveal.reduced = false;
    const fx = new FxLayer();
    animate(spread(4), { reveal, fx });

    const start = performance.now();
    const step = reveal.stepMs(4);

    // A third of the way into the first tile's slot: it is filling, the rest have not begun.
    reveal.step(start + step * 0.33);
    expect(reveal.progress(0, 3)).toBeGreaterThan(0);
    expect(reveal.progress(0, 3)).toBeLessThan(1);
    expect(reveal.progress(1, 3)).toBe(0);
    expect(reveal.progress(2, 3)).toBe(0);
    expect(reveal.progress(3, 3)).toBe(0);

    // Into the third slot: the first two are done, the third is filling, the fourth waits.
    reveal.step(start + step * 2.5);
    expect(reveal.progress(0, 3)).toBe(1);
    expect(reveal.progress(1, 3)).toBe(1);
    expect(reveal.progress(2, 3)).toBeGreaterThan(0);
    expect(reveal.progress(2, 3)).toBeLessThan(1);
    expect(reveal.progress(3, 3)).toBe(0);
  });

  it("keeps a long run under a second and a half, still one tile at a time", () => {
    const reveal = new RevealTracker();
    reveal.reduced = false;
    animate(spread(12), { reveal, fx: new FxLayer() });

    const step = reveal.stepMs(12);
    expect(step * 12).toBeLessThanOrEqual(1600);

    const start = performance.now();
    reveal.step(start + step * 0.5);
    expect(reveal.progress(0, 3)).toBeGreaterThan(0);
    expect(reveal.progress(1, 3)).toBe(0);       // never two at once
  });

  it("leaves a single capture animating immediately", () => {
    const reveal = new RevealTracker();
    reveal.reduced = false;
    animate(spread(1), { reveal, fx: new FxLayer() });
    reveal.step(performance.now() + reveal.stepMs(1) * 0.5);
    expect(reveal.progress(0, 3)).toBeCloseTo(0.5, 1);
  });
});

describe("sending troops down a row", () => {
  /**
   * Milan's report, exactly: send troops from tile 1 to tile 6 and the fill must reach
   * tile 2, then 3, then 4, then 5, then 6 — never all at once.
   *
   * The bug was event ORDER, not the reveal. `travel()` emits one `veinLaid` per step and
   * only then the `travel` itself, so the animator met each vein before it knew a travel
   * was coming and opened a separate one-tile reveal for each. All of those start on the
   * same frame, so the whole trail flashed in together. The path has to be known before
   * the events are walked.
   */
  const sendAlongRow = (): { events: EngineEvent[]; reveal: RevealTracker } => {
    const s = blankGame("small");                        // 9x9; the hive sits mid-board
    put(s, 0, 0, { owner: "you", struct: "nest", soldiers: 20 });
    recomputeConnectivity(s);
    const events = travel(s, { c: 0, r: 0 }, { c: 4, r: 0 }) as EngineEvent[];
    const reveal = new RevealTracker();
    reveal.reduced = false;
    animate(events, { reveal, fx: new FxLayer() });
    return { events, reveal };
  };

  it("still emits its trail before the travel itself", () => {
    // If the engine ever emits `travel` first this test fails loudly rather than the
    // animation quietly regressing — the fix above exists because of this ordering.
    const { events } = sendAlongRow();
    const kinds = events.map((e) => e.type);
    expect(kinds.filter((k) => k === "veinLaid").length).toBe(4);   // the far end too
    expect(kinds.indexOf("travel")).toBeGreaterThan(kinds.lastIndexOf("veinLaid"));
  });

  it("fills the trail one tile at a time, in path order", () => {
    const { reveal } = sendAlongRow();
    const start = performance.now();
    const step = reveal.stepMs(4);

    // Mid-way through the first step: tile 2 is filling and NOTHING else has started.
    reveal.step(start + step * 0.5);
    expect(reveal.progress(1, 0)).toBeGreaterThan(0);
    expect(reveal.progress(1, 0)).toBeLessThan(1);
    expect(reveal.progress(2, 0)).toBe(0);
    expect(reveal.progress(3, 0)).toBe(0);
    expect(reveal.progress(4, 0)).toBe(0);

    // Mid-way through the third step: two are settled, the third is filling, the last waits.
    reveal.step(start + step * 2.5);
    expect(reveal.progress(1, 0)).toBe(1);
    expect(reveal.progress(2, 0)).toBe(1);
    expect(reveal.progress(3, 0)).toBeGreaterThan(0);
    expect(reveal.progress(3, 0)).toBeLessThan(1);
    expect(reveal.progress(4, 0)).toBe(0);

    // The far end only lands at the very end of the run.
    reveal.step(start + step * 3.5);
    expect(reveal.progress(4, 0)).toBeGreaterThan(0);
    expect(reveal.progress(4, 0)).toBeLessThan(1);
  });

  it("opens exactly one reveal for the whole path", () => {
    // Each extra group is a second front racing the first — that was the visible symptom.
    const { reveal } = sendAlongRow();
    const step = reveal.stepMs(4);
    const start = performance.now();
    // Just past the end of the FIRST tile's slot. With per-vein groups every trail tile
    // would already be settled here; with one front only tile 2 is.
    reveal.step(start + step * 1.1);
    expect(reveal.progress(1, 0)).toBe(1);
    expect(reveal.progress(2, 0)).toBeLessThan(1);
    expect(reveal.progress(3, 0)).toBe(0);
  });
});

describe("capturing the Hive", () => {
  /**
   * Taking the queen hands over all five hive tiles in one action and emits no `capture`
   * event for any of them — only `hiveCaptured`. The animator used to treat that as a
   * toast and nothing else, so the whole hive snapped to its new colour while every other
   * capture in the game fills tile by tile.
   */
  const captured = (): { reveal: RevealTracker; cells: Coord[] } => {
    // The plus-shape the engine builds: queen at the centre, four guards around her.
    const cells: Coord[] = [
      { c: 4, r: 3 }, { c: 3, r: 4 }, { c: 4, r: 4 }, { c: 5, r: 4 }, { c: 4, r: 5 },
    ];
    const reveal = new RevealTracker();
    reveal.reduced = false;
    animate([{ type: "hiveCaptured", owner: "you", level: 1, cells }], { reveal, fx: new FxLayer() });
    return { reveal, cells };
  };

  it("fills the five tiles one at a time, starting at the queen", () => {
    const { reveal } = captured();
    const start = performance.now();
    const step = reveal.stepMs(5);

    // Mid-way through the first slot: the queen is filling, the guards have not begun.
    reveal.step(start + step * 0.5);
    expect(reveal.progress(4, 4)).toBeGreaterThan(0);
    expect(reveal.progress(4, 4)).toBeLessThan(1);
    expect(reveal.progress(4, 3)).toBe(0);
    expect(reveal.progress(3, 4)).toBe(0);

    // ...and the last guard only lands at the end of the run.
    reveal.step(start + step * 4.5);
    const guards = [[4, 3], [3, 4], [5, 4], [4, 5]] as const;
    expect(guards.filter(([c, r]) => reveal.progress(c, r) < 1).length).toBe(1);
  });

  it("still passes the event on as a notice", () => {
    const seen: EngineEvent[] = [];
    const reveal = new RevealTracker(); reveal.reduced = false;
    animate(
      [{ type: "hiveCaptured", owner: "you", level: 1, cells: [{ c: 4, r: 4 }] }],
      { reveal, fx: new FxLayer(), onNotice: (e) => seen.push(e) },
    );
    expect(seen.map((e) => e.type)).toContain("hiveCaptured");
  });
});

/**
 * INNER CORNERS.
 *
 * A cell drops its corner radius wherever a same-owner neighbour touches, which is what
 * fuses the cells into one slab — but three cells wrapped round an empty one leave a sharp
 * reflex vertex that no per-cell radius can reach. The fillet pass fills that notch.
 */
describe("rounding a colony's inner corners", () => {
  /** An L: (3,3), (4,3), (3,4) captured, so (4,4) is the notch. The corner is the nest,
   *  so the arm counts as connected and keeps its colour. */
  const ell = (): GameState => {
    const s = blankGame();
    put(s, 3, 3, { owner: "you", struct: "nest", soldiers: 2 });
    put(s, 4, 3, { owner: "you", struct: "stable", soldiers: 2 });
    put(s, 3, 4, { owner: "you", struct: "stable", soldiers: 2 });
    recomputeConnectivity(s);
    return s;
  };

  it("finds the notch three cells leave round an empty one", () => {
    expect(innerCorners(ell(), "you")).toEqual([{ c: 4, r: 4, sx: 1, sy: 1 }]);
  });

  it("finds nothing along a straight edge", () => {
    const s = blankGame();
    for (let c = 2; c <= 5; c++) put(s, c, 3, { owner: "you", struct: "stable", soldiers: 2 });
    recomputeConnectivity(s);
    expect(innerCorners(s, "you")).toHaveLength(0);
  });

  /** Filling into an occupied cell would paint over whatever is drawn there. */
  it("refuses to fillet into a cell that is not open ground", () => {
    const s = ell();
    put(s, 4, 4, { owner: "ai", struct: "stable", soldiers: 2 });
    recomputeConnectivity(s);
    expect(innerCorners(s, "you")).toHaveLength(0);

    const rock = ell();
    tile(rock, 4, 4).terrain = "blocked";
    expect(innerCorners(rock, "you")).toHaveLength(0);
  });

  /**
   * A vein is a bar through the MIDDLE of its tile, so its corners are bare ground. Skipping
   * them left sharp notches all over a colony grown by travel, which threads its own veins
   * through its territory.
   */
  it("fillets into the corner of a vein tile", () => {
    const s = ell();
    put(s, 4, 4, { owner: "you", struct: "vein", soldiers: 0 });
    recomputeConnectivity(s);
    expect(innerCorners(s, "you")).toEqual([{ c: 4, r: 4, sx: 1, sy: 1 }]);
  });

  it("draws the fillet as an arc, not a mitre", () => {
    const { s, rec } = scene(ell());
    drawFillets(s);
    expect(rec.of("arc")).toHaveLength(1);
    // Swept about a centre inside the empty cell, one radius in along both axes.
    const [cx, cy] = (rec.of("arc")[0] as Call).args as number[];
    expect(cx).toBeGreaterThan(4 * 40);
    expect(cy).toBeGreaterThan(4 * 40);
    expect(rec.fills()).toContain(ownerCol("you").toLowerCase());
  });

  /** A fillet across a cell that is still filling in paints colour the reveal has not reached. */
  it("waits for the three cells to finish revealing", () => {
    const st = ell();
    const { s, rec } = scene(st);
    s.reveal.begin([{ at: { c: 4, r: 3 }, edge: "L", prev: null }]);
    drawFillets(s);
    expect(rec.of("arc")).toHaveLength(0);
  });

  it("greys the fillet out with the arm it belongs to", () => {
    const s = blankGame();
    // A detached L — no nest anywhere, so nothing is connected.
    put(s, 3, 3, { owner: "you", struct: "stable", soldiers: 2 });
    put(s, 4, 3, { owner: "you", struct: "stable", soldiers: 2 });
    put(s, 3, 4, { owner: "you", struct: "stable", soldiers: 2 });
    recomputeConnectivity(s);
    const { s: sc, rec } = scene(s);
    drawFillets(sc);
    expect(rec.fills()).not.toContain(ownerCol("you").toLowerCase());
  });
});

/**
 * LOSING GROUND.
 *
 * The engine clears a destroyed tile the instant it dies, so without this the ground simply
 * is not there the next time you look — a venom hit that eats a four-tile trail is the
 * biggest thing that can happen on a turn and had no animation at all. The tile gets a stay
 * of execution: it holds, whites out, and shatters.
 */
describe("destroying a tile", () => {
  const clock = () => vi.useFakeTimers({ toFake: ["performance", "Date"] });

  const frame = (fx: FxLayer): Recorder => {
    const rec = makeRecorder();
    const l = new Layout(13);
    l.ts = 40; l.ox = 0; l.oy = 0; l.width = 520; l.height = 520;
    fx.draw(rec.ctx, l);
    return rec;
  };

  /** The cell shape is built with `rrect`, which is the only thing here using `arcTo`. */
  const cells = (rec: Recorder): number => rec.of("arcTo").length / 4;

  const pruned = (at: { c: number; r: number }): EngineEvent =>
    ({ type: "veinPruned", at, owner: "you" });

  it("holds the tile on screen after the engine has cleared it", () => {
    clock();
    const fx = new FxLayer();
    animate([pruned({ c: 3, r: 3 })], { reveal: new RevealTracker(), fx });
    const rec = frame(fx);
    expect(cells(rec), "nothing was drawn where the tile used to be").toBe(1);
    expect(rec.fills()).toContain(ownerCol("you").toLowerCase());
    vi.useRealTimers();
  });

  it("whites the tile out before it goes", () => {
    clock();
    const fx = new FxLayer();
    animate([pruned({ c: 3, r: 3 })], { reveal: new RevealTracker(), fx });
    const early = frame(fx).fills().filter((f) => f.startsWith("rgba(255,255,255"));
    vi.advanceTimersByTime(CRUMBLE_MS * 0.35);
    const late = frame(fx).fills().filter((f) => f.startsWith("rgba(255,255,255"));
    const alpha = (f: string): number => Number(/,([\d.]+)\)$/.exec(f)?.[1] ?? 0);
    expect(alpha(late[0] as string)).toBeGreaterThan(alpha(early[0] as string));
    vi.useRealTimers();
  });

  it("is gone once the destruction has run", () => {
    clock();
    const fx = new FxLayer();
    animate([pruned({ c: 3, r: 3 })], { reveal: new RevealTracker(), fx });
    vi.advanceTimersByTime(CRUMBLE_MS + 50);
    expect(frame(fx).calls).toHaveLength(0);
    vi.useRealTimers();
  });

  /** A collapse travels; a row of tiles blinking out at once reads as a glitch. */
  it("staggers a whole trail collapsing", () => {
    clock();
    const fx = new FxLayer();
    animate([pruned({ c: 3, r: 3 }), pruned({ c: 4, r: 3 }), pruned({ c: 5, r: 3 })],
      { reveal: new RevealTracker(), fx });
    expect(cells(frame(fx)), "all three started on the same frame").toBe(1);
    vi.advanceTimersByTime(150);
    expect(cells(frame(fx))).toBe(3);
    vi.useRealTimers();
  });

  it("destroys a tile an effect wiped out, and only clashes on one it merely hurt", () => {
    clock();
    const killed = new FxLayer();
    animate([{ type: "effectDamage", at: { c: 2, r: 2 }, kind: "venom", lost: 9, wiped: true, owner: "ai" }],
      { reveal: new RevealTracker(), fx: killed });
    expect(cells(frame(killed))).toBe(1);

    const hurt = new FxLayer();
    animate([{ type: "effectDamage", at: { c: 2, r: 2 }, kind: "venom", lost: 4, wiped: false, owner: "ai" }],
      { reveal: new RevealTracker(), fx: hurt });
    expect(cells(frame(hurt)), "a survivor must not be destroyed").toBe(0);
    expect(frame(hurt).has("stroke"), "a survivor still takes a hit").toBe(true);
    vi.useRealTimers();
  });
});

/**
 * LEAF ARMOUR IS NOT A COLONY OUTLINE.
 *
 * It used to draw as a dashed rounded rect in the owner's colour, which is now exactly what
 * the marching ants are. Fungal Growth armours every frontline tile at once, so one cast
 * filled the board with dashed rings that read as broken colony outlines. Nothing that is
 * not the trail may draw a dashed border.
 */
describe("the leaf after-armour marker", () => {
  const armoured = (): GameState => {
    const s = blankGame();
    put(s, 3, 3, { owner: "you", struct: "stable", soldiers: 4 });
    recomputeConnectivity(s);
    addEffect(s, 3, 3, "armor", "you", 4);
    return s;
  };

  it("does not draw a dashed line", () => {
    const s = armoured();
    const { s: sc, rec } = scene(s);
    drawTileEffects(sc, tile(s, 3, 3));
    const dashes = rec.of("setLineDash").filter((c) => (c.args[0] as number[]).length > 0);
    expect(dashes, "a dashed border is the ants' language, not armour's").toHaveLength(0);
  });

  it("still marks the tile in the owner's colour", () => {
    const s = armoured();
    const { s: sc, rec } = scene(s);
    drawTileEffects(sc, tile(s, 3, 3));
    expect(rec.calls.length).toBeGreaterThan(0);
    const glow = hexA(ownerCol("you", "glow"), 1).slice(0, -3);   // "rgba(r,g,b,"
    expect(rec.fills().some((f) => f.startsWith(glow.toLowerCase()))).toBe(true);
  });

  it("draws nothing on a tile with no effect on it", () => {
    const s = blankGame();
    put(s, 3, 3, { owner: "you", struct: "stable", soldiers: 4 });
    const { s: sc, rec } = scene(s);
    drawTileEffects(sc, tile(s, 3, 3));
    expect(rec.calls).toHaveLength(0);
  });
});

/**
 * TAKING GROUND OFF SOMEBODY.
 *
 * A tile that had to be beaten blanks out the way a destroyed one does, and the colony that
 * beat it is filling underneath as the flash clears. Walking onto empty ground destroys
 * nothing, so it just fills.
 */
describe("a tile changing hands", () => {
  const clock = () => vi.useFakeTimers({ toFake: ["performance", "Date"] });

  const frame = (fx: FxLayer): Recorder => {
    const rec = makeRecorder();
    const l = new Layout(13);
    l.ts = 40; l.ox = 0; l.oy = 0; l.width = 520; l.height = 520;
    fx.draw(rec.ctx, l);
    return rec;
  };
  /** The blink paints the whole cell; nothing else in this batch fills a rounded cell. */
  const whites = (rec: Recorder): string[] =>
    rec.fills().filter((f) => f.startsWith("rgba(255,255,255"));

  const run = (events: EngineEvent[]): FxLayer => {
    const fx = new FxLayer();
    const reveal = new RevealTracker();
    reveal.reduced = false;
    animate(events, { reveal, fx });
    return fx;
  };

  it("blanks a tile taken off the enemy", () => {
    clock();
    const fx = run([{ type: "capture", at: { c: 2, r: 2 }, owner: "you", from: "R", previous: "ai" }]);
    vi.advanceTimersByTime(90);
    expect(whites(frame(fx)).length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("clears again so the new owner shows through", () => {
    clock();
    const fx = run([{ type: "capture", at: { c: 2, r: 2 }, owner: "you", from: "R", previous: "ai" }]);
    const alpha = (): number => Number(/,([\d.]+)\)$/.exec(whites(frame(fx))[0] ?? "rgba(0,0,0,0)")?.[1] ?? 0);
    vi.advanceTimersByTime(90);
    const peak = alpha();
    vi.advanceTimersByTime(150);
    expect(alpha(), "the flash has to fade off the tile").toBeLessThan(peak);
    vi.useRealTimers();
  });

  it("does not blank plain expansion onto empty ground", () => {
    clock();
    const fx = run([{ type: "capture", at: { c: 2, r: 2 }, owner: "you", from: "R", previous: null }]);
    vi.advanceTimersByTime(90);
    expect(whites(frame(fx)), "nothing was beaten there").toHaveLength(0);
    vi.useRealTimers();
  });

  /** A wild garrison has no owner, but it still had to be fought through. */
  it("blanks a wild garrison that was fought off", () => {
    clock();
    const fx = run([
      { type: "combat", at: { c: 2, r: 2 }, attacker: "you", from: "R", won: true, survivors: 4 },
      { type: "capture", at: { c: 2, r: 2 }, owner: "you", from: "R", previous: null },
    ]);
    vi.advanceTimersByTime(90);
    expect(whites(frame(fx)).length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  /** Each tile blanks as its own turn in the run comes round, not all on frame one. */
  it("waits its turn in a multi-tile run", () => {
    clock();
    const fx = run([
      { type: "capture", at: { c: 2, r: 2 }, owner: "you", from: "R", previous: "ai" },
      { type: "capture", at: { c: 3, r: 2 }, owner: "you", from: "R", previous: "ai" },
      { type: "capture", at: { c: 4, r: 2 }, owner: "you", from: "R", previous: "ai" },
    ]);
    expect(whites(frame(fx))).toHaveLength(1);
    vi.advanceTimersByTime(REVEAL_MS_PER_TILE);
    expect(whites(frame(fx)).length).toBeGreaterThan(1);
    vi.useRealTimers();
  });
});

/**
 * A held resource pays three a turn where a plain stable pays one, and nothing on the board
 * said so. Under a colony the stone breathes; unowned it sits still, because an idle seam
 * is not producing anything.
 */
describe("a worked resource seam", () => {
  /**
   * The gem is drawn as diamonds: a moveTo, three lineTo, a closePath. The cell fill under
   * an owned tile rounds its corners with arcTo, so it cannot be mistaken for one.
   */
  const firstDiamondRadius = (rec: Recorder): number => {
    const c = rec.calls;
    for (let i = 0; i + 4 < c.length; i++) {
      if ((c[i] as Call).fn !== "moveTo") continue;
      if ((c[i + 1] as Call).fn !== "lineTo" || (c[i + 2] as Call).fn !== "lineTo") continue;
      if ((c[i + 3] as Call).fn !== "lineTo" || (c[i + 4] as Call).fn !== "closePath") continue;
      return ((c[i + 1] as Call).args[0] as number) - ((c[i] as Call).args[0] as number);
    }
    return 0;
  };

  const gemOverTime = (owner: "you" | null): number[] => {
    const s = blankGame();
    put(s, 3, 3, { terrain: "resource", owner, struct: owner ? "stable" : null, soldiers: owner ? 3 : 0 });
    recomputeConnectivity(s);
    const sizes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { s: sc, rec } = scene(s);
      drawTile(sc, tile(s, 3, 3));
      sizes.push(Number(firstDiamondRadius(rec).toFixed(4)));
      vi.advanceTimersByTime(700);
    }
    return sizes;
  };

  it("breathes while a colony holds it", () => {
    vi.useFakeTimers({ toFake: ["performance", "Date"] });
    const sizes = gemOverTime("you");
    expect(sizes[0], "no gem was drawn at all").not.toBe(0);
    expect(new Set(sizes).size, "the stone must change size over time").toBeGreaterThan(1);
    vi.useRealTimers();
  });

  it("sits still while nobody does", () => {
    vi.useFakeTimers({ toFake: ["performance", "Date"] });
    const sizes = gemOverTime(null);
    expect(sizes[0]).not.toBe(0);
    expect(new Set(sizes).size, "an idle seam is not producing anything").toBe(1);
    vi.useRealTimers();
  });
});

/** The board layer has to hand its reveal state to the tracer, or none of that reaches the screen. */
describe("drawing the trail against a live reveal", () => {
  const twoTiles = (): GameState => {
    const s = blankGame();
    put(s, 3, 3, { owner: "you", struct: "stable", soldiers: 2 });
    put(s, 4, 3, { owner: "you", struct: "stable", soldiers: 2 });
    recomputeConnectivity(s);
    return s;
  };

  it("draws only the ground that has finished filling", () => {
    const settled = scene(twoTiles());
    drawTrails(settled.s);

    const filling = scene(twoTiles());
    filling.s.reveal.reduced = false;
    filling.s.reveal.begin([{ at: { c: 4, r: 3 }, edge: "L", prev: null }]);
    drawTrails(filling.s);

    // How far right the traced path reaches: one tile ends at x=160, two at x=200.
    const reach = (rec: Recorder): number => Math.max(
      ...rec.calls.filter((c) => c.fn === "moveTo" || c.fn === "arcTo")
        .map((c) => c.args[0] as number),
    );
    expect(reach(filling.rec), "the outline ran ahead of the fill")
      .toBeLessThan(reach(settled.rec));
  });
});
