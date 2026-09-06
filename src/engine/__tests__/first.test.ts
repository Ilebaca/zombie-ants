/**
 * WHO MOVES FIRST.
 *
 * Moving first is worth roughly two to one (CLAUDE.md §8) and the player had it in every
 * match this game had ever played. Against a bot that is a habit; between two people it is
 * the match decided before either of them touches the board.
 */
import { describe, expect, it } from "vitest";
import { createGame, openingBoard, startsFirst } from "../index";
import type { MatchSetup, Player } from "../index";

const setup = (extra: Partial<MatchSetup> = {}): MatchSetup => ({
  map: "small", species: { you: "fire", ai: "leafcutter" }, seed: 12345, ...extra,
});

describe("the coin", () => {
  it("comes out roughly even over many seeds", () => {
    let you = 0;
    const runs = 4000;
    for (let i = 0; i < runs; i++) if (startsFirst((i * 2654435761) | 0) === "you") you += 1;
    expect(you / runs).toBeGreaterThan(0.45);
    expect(you / runs).toBeLessThan(0.55);
  });

  it("is the same answer every time for one seed", () => {
    for (const seed of [0, 1, -7, 12345, 0x7fffffff]) {
      expect(startsFirst(seed)).toBe(startsFirst(seed));
      expect(createGame({ map: "small", species: { you: "fire", ai: "fire" }, seed }).current)
        .toBe(startsFirst(seed));
    }
  });

  it("does not follow the board's own stream", () => {
    // Drawn off `state.rng` instead, one number would come out of the sequence ability
    // scatter uses — so every match already recorded would replay as a different game.
    // Holding the scatter stream still is the whole reason it is derived from the seed.
    const a = createGame({ map: "small", species: { you: "fire", ai: "fire" }, seed: 99 });
    const b = createGame({ map: "small", species: { you: "fire", ai: "fire" }, seed: 99, first: "you" });
    const c = createGame({ map: "small", species: { you: "fire", ai: "fire" }, seed: 99, first: "ai" });
    expect(a.rng).toBe(b.rng);
    expect(a.rng).toBe(c.rng);
    expect(a.boon).toEqual(b.boon);
  });

  it("is overridden when it is asked to be", () => {
    for (const first of ["you", "ai"] as Player[]) {
      expect(createGame({ map: "small", species: { you: "fire", ai: "fire" }, seed: 4, first }).current)
        .toBe(first);
    }
  });
});

describe("a record replays to the board it was played on", () => {
  it("carries the starter rather than deriving it", () => {
    for (const first of ["you", "ai"] as Player[]) {
      expect(openingBoard(setup({ first })).current).toBe(first);
    }
  });

  it("reads a record with no starter as the player's move", () => {
    // Every match stored before there was a coin was played with the player first, so an
    // absent field has to replay as that — never as a fresh draw.
    const old = setup();
    delete old.first;
    expect(openingBoard(old).current).toBe("you");
    // ...and this is only interesting because the coin says otherwise for this seed.
    expect(startsFirst(old.seed)).toBe("ai");
  });
});
