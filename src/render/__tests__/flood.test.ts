/**
 * THE FINALE: the winner takes the whole board.
 *
 * What is worth holding here is not the pixels but the promise: everything goes over —
 * enemy ground, veins, wild garrisons, the Hive — the board it draws over is NOT changed,
 * and the front crosses at a constant rate whatever the size of the map.
 */
import { describe, expect, it, vi } from "vitest";
import { blankGame, put } from "../../engine/__tests__/helpers";
import { hiveCells, nestTile, recomputeConnectivity, snapshot, tile } from "../../engine";
import type { GameState, Tile } from "../../engine";
import { Layout } from "../layout";
import { RevealTracker } from "../reveal";
import { basicLook } from "../art";
import { drawFlood, drawTile, type Scene } from "../board";
import {
  FLOOD_MAX_MS, FLOOD_MIN_MS, floodAt, floodDuration, floodFade, planFlood,
} from "../flood";
import { ownerCol } from "../palette";
import { makeRecorder, type Recorder } from "./recorder";

/** A board with something of every kind on it, so "everything" can be checked. */
function busyBoard(): GameState {
  const state = blankGame("small");
  put(state, 1, 1, { owner: "you", struct: "nest", soldiers: 12 });
  put(state, 2, 1, { owner: "you", struct: "stable", soldiers: 4 });
  put(state, 3, 1, { owner: "you", struct: "vein", soldiers: 0 });
  put(state, 5, 5, { owner: "ai", struct: "nest", soldiers: 9 });
  put(state, 4, 5, { owner: "ai", struct: "vein", soldiers: 0 });
  put(state, 1, 4, { owner: null, guard: 7 });
  put(state, 5, 1, { terrain: "blocked" });
  put(state, 2, 4, { terrain: "resource" });
  state.hive.phase = "awake";
  recomputeConnectivity(state);
  return state;
}

function frame(state: GameState, at: number): Recorder {
  const rec = makeRecorder();
  const layout = new Layout(state.size);
  layout.ts = 40; layout.ox = 0; layout.oy = 0; layout.width = 400; layout.height = 400;
  const flood = planFlood(state, "you", 0);
  vi.spyOn(performance, "now").mockReturnValue(at);
  const scene: Scene = {
    ctx: rec.ctx, layout, state, reveal: new RevealTracker(),
    looks: { you: basicLook("fire"), ai: basicLook("leafcutter") },
    hideCounts: true, flood, selection: null, valid: [], current: "you",
  };
  drawFlood(scene);
  vi.restoreAllMocks();
  return rec;
}

/** One tile drawn on its own, with the finale's flag on or off. */
function paint(state: GameState, t: Tile, hideCounts: boolean): Recorder {
  const rec = makeRecorder();
  const layout = new Layout(state.size);
  layout.ts = 40; layout.ox = 0; layout.oy = 0; layout.width = 400; layout.height = 400;
  drawTile({
    ctx: rec.ctx, layout, state, reveal: new RevealTracker(),
    looks: { you: basicLook("fire"), ai: basicLook("leafcutter") },
    hideCounts, flood: null, selection: null, valid: [], current: "you",
  }, t);
  return rec;
}

describe("planning the wash", () => {
  it("reaches every tile on the board, rocks included", () => {
    const state = busyBoard();
    const flood = planFlood(state, "you", 0);
    expect(flood.rings.size).toBe(state.size * state.size);
    // Stopping at the boulders left grey holes in the finished board, which read as the
    // colour failing to paint rather than as a colony overrunning the map.
    expect(floodAt(flood, 5, 1, flood.dur)).toBe(1);
  });

  it("starts at the winner's nest and spreads outward", () => {
    const flood = planFlood(busyBoard(), "you", 0);
    const half = flood.dur / 2;
    const near = floodAt(flood, 2, 1, half);          // next to the nest at 1,1
    const far = floodAt(flood, 5, 5, half);           // the far corner
    expect(near).toBeGreaterThan(far);
    expect(near).toBe(1);
  });

  it("finishes with the whole board taken", () => {
    const state = busyBoard();
    const flood = planFlood(state, "you", 0);
    const end = flood.dur;
    for (const row of state.grid) {
      for (const t of row) {
        expect(floodAt(flood, t.c, t.r, end), `${t.c},${t.r} was left behind`).toBe(1);
      }
    }
  });

  /**
   * The same rule the reveal and the Hive's surge use: a constant tiles-per-second front,
   * so a 7×7 skirmish and a 13×13 gauntlet look the same rather than one crawling and the
   * other streaking — with a clamp, because nobody sits through three seconds of it.
   */
  it("takes longer on a bigger board, within a beat the player will sit through", () => {
    const small = planFlood(blankGame("tiny"), "you", 0);
    const big = planFlood(blankGame("mid"), "you", 0);
    expect(big.dur).toBeGreaterThanOrEqual(small.dur);
    for (const f of [small, big]) {
      expect(f.dur).toBeGreaterThanOrEqual(FLOOD_MIN_MS);
      expect(f.dur).toBeLessThanOrEqual(FLOOD_MAX_MS);
    }
    // The card waits for the wash AND for it to land.
    expect(floodDuration(small)).toBeGreaterThan(small.dur);
  });

  /** Reduced motion asks for the end state, not for the journey to it. */
  it("collapses to the finished board when motion is reduced", () => {
    const flood = planFlood(busyBoard(), "you", 0, true);
    expect(floodAt(flood, 5, 5, 1)).toBe(1);
  });

  /**
   * THE WASH STARTS FROM THE WINNER'S OWN BASE. A match is usually won by TAKING the
   * loser's nest, and at that moment the winner owns two — so a search of the board finds
   * whichever comes first in grid order, which may well be the nest that just fell. The
   * colour spreading out from the ground you lost is exactly backwards, so the caller
   * (which remembers where each colony started) says where it begins.
   */
  it("washes out from the base it is told to, whoever owns what by then", () => {
    const state = busyBoard();
    // 5,5 was the enemy nest and has just been captured: both nests are "you" now.
    put(state, 5, 5, { owner: "you", struct: "nest", soldiers: 9 });
    recomputeConnectivity(state);

    const mine = planFlood(state, "you", 0, false, { c: 1, r: 1 });
    expect(mine.rings.get("1,1"), "the front did not start where it was told").toBe(0);
    expect(mine.rings.get("5,5")).toBe(8);

    // The other way round, to prove it is the instruction doing the work.
    const theirs = planFlood(state, "you", 0, false, { c: 5, r: 5 });
    expect(theirs.rings.get("5,5")).toBe(0);
    expect(theirs.rings.get("1,1")).toBe(8);
  });

  it("falls back to a nest on the board when nobody says where", () => {
    const state = busyBoard();
    const home = nestTile(state, "you");
    const flood = planFlood(state, "you", 0);
    expect(flood.rings.get(`${home?.c},${home?.r}`)).toBe(0);
  });

  it("still runs when the winner's nest is gone", () => {
    const state = blankGame("small");
    put(state, 3, 3, { owner: "you", struct: "stable", soldiers: 3 });
    recomputeConnectivity(state);
    const flood = planFlood(state, "you", 0);
    expect(flood.rings.size).toBeGreaterThan(0);
    expect(floodAt(flood, 0, 0, flood.dur)).toBe(1);
  });
});

describe("drawing the wash", () => {
  it("covers the enemy's ground, their trail, a wild garrison and the Hive", () => {
    const state = busyBoard();
    const queen = hiveCells(state).find((t) => t.terrain === "hiveQ");
    const flood = planFlood(state, "you", 0);
    const end = flood.dur;
    for (const at of [[5, 5], [4, 5], [1, 4], [2, 4], [queen?.c ?? 3, queen?.r ?? 3]]) {
      expect(floodAt(flood, at[0] as number, at[1] as number, end),
        `${at} was not consumed`).toBe(1);
    }
  });

  it("paints in the winner's colour", () => {
    const rec = frame(busyBoard(), 5000);
    expect(rec.fills()).toContain(ownerCol("you").toLowerCase());
  });

  it("draws nothing before the front arrives", () => {
    expect(frame(busyBoard(), 0).of("fill").length).toBe(0);
  });

  /**
   * It is a VIEW. Drawing the finale must not change the board the result card is about to
   * report — that is the whole reason it is a pass over the top rather than a set of moves.
   */
  it("leaves the board exactly as it found it", () => {
    const state = busyBoard();
    const before = JSON.stringify(snapshot(state));
    frame(state, 5000);
    expect(JSON.stringify(snapshot(state))).toBe(before);
    expect(tile(state, 5, 5).owner, "the loser's nest changed hands").toBe("ai");
  });

  /** The two colonies' outlines dissolve rather than popping out on the winning frame. */
  it("dissolves the colonies' own markings as the wash starts", () => {
    const flood = planFlood(busyBoard(), "you", 0);
    expect(floodFade(flood, 0)).toBe(1);
    expect(floodFade(flood, flood.dur * 0.2)).toBeLessThan(1);
    expect(floodFade(flood, flood.dur)).toBe(0);
  });

  /**
   * "No numbers" means all of them. Only the colonies' own counts were gated on the flag;
   * a wild garrison's shield and the Hive's guard sat there through the whole finale.
   */
  it("takes every number off the board, wild and hive alike", () => {
    const state = busyBoard();
    const wild = tile(state, 1, 4);
    const queen = hiveCells(state).find((t) => t.terrain === "hiveQ") as Tile;
    for (const t of [wild, queen]) {
      expect(paint(state, t, false).texts().join(""), "nothing was drawn to hide").not.toBe("");
      expect(paint(state, t, true).texts().join(""), "a count survived the finale").toBe("");
    }
  });
});
