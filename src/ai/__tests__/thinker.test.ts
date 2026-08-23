/**
 * The AI runs off the main thread now. This covers the half of that which is testable in
 * Node: the inline fallback (a platform with no Worker, which is also every test here) and
 * the adoption of a board searched somewhere else.
 */
import { describe, expect, it } from "vitest";
import { createGame, defaultContext, snapshot, tile } from "../../engine";
import type { GameState } from "../../engine";
import { Thinker, adopt } from "../thinker";

const ctx = defaultContext();
const game = (): GameState =>
  createGame({ map: "small", species: { you: "fire", ai: "fire" }, seed: 5 });

const sig = (s: GameState): string => JSON.stringify(snapshot(s).tiles);

describe("thinking without a worker", () => {
  it("still takes the turn inline", async () => {
    const s = game();
    s.current = "ai";
    const thinker = new Thinker();
    const thought = await thinker.think(s, "ai", "normal", ctx);
    thinker.dispose();
    expect(thought.events.length).toBeGreaterThan(0);
  });

  /**
   * The caller decides both whether to take the answer and WHEN. Mutating the live board
   * inside `think` put the AI's finished move on screen a beat before the animation that
   * was supposed to be showing it happening.
   */
  it("leaves the caller's board exactly as it was", async () => {
    const s = game();
    s.current = "ai";
    const before = sig(s);
    const thinker = new Thinker();
    const thought = await thinker.think(s, "ai", "normal", ctx);
    thinker.dispose();

    expect(sig(s), "the board moved before anybody adopted the answer").toBe(before);
    expect(sig(thought.next), "the search did not actually play a move").not.toBe(before);
  });

  it("reaches the same board every time", async () => {
    const a = game(); a.current = "ai";
    const b = game(); b.current = "ai";
    const thinker = new Thinker();
    const one = await thinker.think(a, "ai", "normal", ctx);
    const two = await thinker.think(b, "ai", "normal", ctx);
    thinker.dispose();
    expect(sig(one.next)).toBe(sig(two.next));
  });
});

/**
 * A worker hands back a COPY of the board. Folding it onto the live one has to keep the
 * caller's object — the renderer and the match screen hold a reference to it.
 */
describe("adopting a board searched elsewhere", () => {
  it("copies the result in without swapping the object", () => {
    const live = game();
    const elsewhere = structuredClone(live) as GameState;
    elsewhere.turn = 42;
    tile(elsewhere, 3, 3).owner = "ai";
    tile(elsewhere, 3, 3).soldiers = 9;
    elsewhere.conn.ai.add("3,3");

    const grid = live.grid;
    adopt(live, elsewhere);

    expect(live.grid, "the board object must survive").toBe(grid);
    expect(live.turn).toBe(42);
    expect(tile(live, 3, 3).owner).toBe("ai");
    expect(tile(live, 3, 3).soldiers).toBe(9);
    expect(live.conn.ai.has("3,3")).toBe(true);
    expect(sig(live)).toBe(sig(elsewhere));
  });

  it("leaves the board alone when it searched it in place", () => {
    const live = game();
    const before = sig(live);
    adopt(live, live);
    expect(sig(live)).toBe(before);
  });

  it("carries the scatter stream back, so the match stays reproducible", () => {
    const live = game();
    const elsewhere = structuredClone(live) as GameState;
    elsewhere.rng = 123456;
    adopt(live, elsewhere);
    expect(live.rng).toBe(123456);
  });
});
