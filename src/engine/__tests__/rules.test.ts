/**
 * The rules as the design document states them (docs/GDD.html).
 *
 * Combat, the defender-bonus table and the special resolutions are what a player counts out
 * before committing (CLAUDE.md §4.1), so each row of those tables gets an assertion. Where
 * the GDD summarises and the legacy build is more specific, the legacy build wins — it is
 * the behavioural source of truth, and the wild-garrison bonus is exactly such a case.
 */
import { describe, expect, it } from "vitest";
import { blankGame, put } from "./helpers";
import {
  DEF, NEUTRAL_MODS, TRAVEL_RANGE, allTiles, createGame, endTurn, flatDefence, guardDefence,
  moveOrAttack, recomputeConnectivity, tile, travel,
} from "../index";
import type { GameState, PlayerMods } from "../index";

const ctx = { mods: { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } } };
const mods: PlayerMods = { ...NEUTRAL_MODS };

describe("the defender bonus table", () => {
  const bonusOn = (s: GameState, c: number, r: number): number =>
    flatDefence(s, tile(s, c, r)!, mods);

  it("matches the GDD row for row", () => {
    const s = blankGame("mid");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 3 });
    put(s, 3, 1, { owner: "you", struct: "stable", soldiers: 3, terrain: "resource" });
    put(s, 4, 1, { owner: "you", struct: "vein", soldiers: 1 });

    expect(bonusOn(s, 1, 1)).toBe(DEF.nest);            // nest +6
    expect(bonusOn(s, 2, 1)).toBe(DEF.stable);          // stable +1
    expect(bonusOn(s, 3, 1)).toBe(DEF.resourceOwned);   // stable on a resource +2
    expect(bonusOn(s, 4, 1)).toBe(0);                   // vein: none at all
  });

  it("gives the hive queen and her guards no bonus — they defend with their garrison", () => {
    const s = blankGame("mid");
    const mid = Math.floor(s.size / 2);
    expect(bonusOn(s, mid, mid)).toBe(0);
    expect(bonusOn(s, mid + 1, mid)).toBe(0);
  });

  /** A garrison on a resource is the one worth fighting for; open ground is a speed bump. */
  it("digs a wild garrison in harder when it sits on a resource", () => {
    const s = blankGame("mid");
    const ground = put(s, 2, 2, { owner: null, guard: 4 });
    const rich = put(s, 3, 2, { owner: null, guard: 4, terrain: "resource" });
    expect(guardDefence(ground)).toBe(2);
    expect(guardDefence(rich)).toBe(5);
    expect(guardDefence(rich)).toBeGreaterThan(guardDefence(ground));
  });

  it("multiplies the nest bonus by Soldier Caste, and only the nest", () => {
    const s = blankGame("mid");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 3 });
    const caste: PlayerMods = { ...NEUTRAL_MODS, soldierCaste: 4 };   // +20%
    expect(flatDefence(s, tile(s, 1, 1)!, caste)).toBe(Math.round(DEF.nest * 1.2));
    expect(flatDefence(s, tile(s, 2, 1)!, caste)).toBe(DEF.stable);
  });

  it("multiplies by Fortify's shield while it is up", () => {
    const s = blankGame("mid");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    const plain = flatDefence(s, tile(s, 1, 1)!, mods);
    s.shield.you = 3;
    expect(flatDefence(s, tile(s, 1, 1)!, mods)).toBe(Math.round(plain * 1.7));
  });
});

describe("special resolutions", () => {
  it("takes an enemy vein instantly, with no losses, and makes it a stable", () => {
    const s = blankGame("mid");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 9 });
    put(s, 2, 1, { owner: "ai", struct: "vein", soldiers: 40 });   // no defence whatsoever
    recomputeConnectivity(s);
    s.current = "you";

    moveOrAttack(s, { c: 1, r: 1 }, { c: 2, r: 1 }, ctx);
    const taken = tile(s, 2, 1)!;
    expect(taken.owner).toBe("you");
    expect(taken.struct).toBe("stable");
    expect(taken.soldiers).toBe(8);          // the whole committed force arrives intact
    expect(tile(s, 1, 1)!.soldiers).toBe(1); // and the source keeps its floor
  });

  it("claims empty ground directly and promotes it to a stable", () => {
    const s = blankGame("mid");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 5 });
    recomputeConnectivity(s);
    s.current = "you";
    moveOrAttack(s, { c: 1, r: 1 }, { c: 2, r: 1 }, ctx);
    expect(tile(s, 2, 1)!.struct).toBe("stable");
    expect(tile(s, 2, 1)!.owner).toBe("you");
  });

  it("leaves a beaten wild garrison weakened, never regenerated", () => {
    const s = blankGame("mid");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 4 });
    put(s, 2, 1, { owner: null, guard: 20 });
    recomputeConnectivity(s);
    s.current = "you";
    moveOrAttack(s, { c: 1, r: 1 }, { c: 2, r: 1 }, ctx);
    const held = tile(s, 2, 1)!;
    expect(held.owner).toBeNull();
    expect(held.guard).toBeGreaterThan(0);
    expect(held.guard).toBeLessThan(20);
  });
});

describe("long sends", () => {
  it("reaches exactly the range the GDD states, and no further", () => {
    const s = blankGame("mid");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 30 });
    recomputeConnectivity(s);
    s.current = "you";
    const far = { c: 1 + TRAVEL_RANGE, r: 1 };
    const tooFar = { c: 1 + TRAVEL_RANGE + 1, r: 1 };
    expect(travel(s, { c: 1, r: 1 }, tooFar)).toEqual([]);
    expect(travel(s, { c: 1, r: 1 }, far).length).toBeGreaterThan(0);
    expect(tile(s, far.c, far.r)!.owner).toBe("you");
  });

  it("lays the trail behind it as veins, not as territory", () => {
    const s = blankGame("mid");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 30 });
    recomputeConnectivity(s);
    s.current = "you";
    travel(s, { c: 1, r: 1 }, { c: 4, r: 1 });
    expect(tile(s, 2, 1)!.struct).toBe("vein");
    expect(tile(s, 3, 1)!.struct).toBe("vein");
    expect(tile(s, 4, 1)!.struct).toBe("stable");     // only the destination is territory
    const veins = allTiles(s).filter((t) => t.struct === "vein");
    for (const v of veins) expect(flatDefence(s, v, mods)).toBe(0);
  });
});

/**
 * THE MATCH ENDS WHEN A QUEEN FALLS, AND ONLY THEN (CLAUDE.md §4.8).
 *
 * The clock used to run out and award the match to whoever held more ground. That decided
 * games nobody had won: a player ahead on territory could simply stop playing, and one
 * behind had no route back however the position stood. `limits.turnLimit` survives as the
 * length a match is EXPECTED to run — the AI prices income against it and the measurement
 * tools adjudicate there — but it is not a rule of the game.
 */
describe("how a match ends", () => {
  const both = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };

  it("keeps playing past the map's expected length", () => {
    const s = createGame({ map: "small", species: { you: "fire", ai: "fire" } });
    s.turn = s.limits.turnLimit;
    s.current = "ai";
    endTurn(s, both);                       // rolls the counter past the limit
    expect(s.turn).toBeGreaterThan(s.limits.turnLimit);
    expect(s.over, "the clock is not a result").toBe(false);
    expect(s.winner).toBeNull();
  });

  it("still runs turns long after it", () => {
    const s = createGame({ map: "tiny", species: { you: "fire", ai: "fire" } });
    for (let i = 0; i < s.limits.turnLimit * 4; i++) endTurn(s, both);
    expect(s.over).toBe(false);
    expect(s.turn).toBeGreaterThan(s.limits.turnLimit * 1.5);
  });

  it("ends the moment a nest changes hands", () => {
    const s = blankGame("small");
    s.turn = s.limits.turnLimit + 20;       // well past the old limit: irrelevant either way
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 400 });
    put(s, 2, 1, { owner: "ai", struct: "nest", soldiers: 1 });
    recomputeConnectivity(s);
    s.current = "you";
    const events = moveOrAttack(s, { c: 1, r: 1 }, { c: 2, r: 1 }, ctx);
    expect(s.over).toBe(true);
    expect(s.winner).toBe("you");
    expect(events.find((e) => e.type === "gameOver")).toMatchObject({ reason: "nest" });
  });
});
