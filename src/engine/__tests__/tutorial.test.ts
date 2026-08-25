/**
 * THE TUTORIAL BOARD MUST BE ABLE TO TEACH.
 *
 * The walkthrough asks the player to do seven specific things on turn one, and a step that
 * asks for something the board cannot deliver leaves the tutorial stuck with nothing but
 * Skip. Combat here is deterministic (CLAUDE.md §4.1), so this is not a matter of odds:
 * either the arrangement makes every lesson available or it does not.
 *
 * This plays the whole walkthrough on every map and a species of each ability shape, in
 * the same order and with the same choices the tour makes.
 */
import { describe, expect, it } from "vitest";
import {
  NEUTRAL_MODS, actionTargets, activateAbility, allTiles, arrangeTutorial, canActFrom,
  createGame, defaultContext, distance, isConnected, moveOrAttack, neighbours, rally,
  tileAt, tilesOwnedBy, travel,
} from "../index";
import type { Coord, GameState, MapId, SpeciesId, Tile } from "../index";

const MAPS_UNDER_TEST: MapId[] = ["tiny", "small", "mid"];
/** One of each ability shape: a board effect, an attack, and the two-tap tunnel. */
const SPECIES_UNDER_TEST: SpeciesId[] = ["leafcutter", "fire", "carpenter"];

const board = (map: MapId, you: SpeciesId): GameState => {
  const state = createGame({ map, species: { you, ai: "fire" }, seed: 5 });
  arrangeTutorial(state);
  return state;
};

/** The fat garrison the arrangement puts beside the Hive. Every other step avoids it. */
const spear = (s: GameState): Tile =>
  tilesOwnedBy(s, "you").reduce((best, t) => (t.soldiers > best.soldiers ? t : best));

const freeNeighbour = (s: GameState, from: Tile): Coord | null =>
  actionTargets(s, from).find((at) => {
    const t = tileAt(s, at.c, at.r);
    return distance(from, at) === 1 && t && !t.owner && t.guard === 0 && t.terrain === "ground";
  }) ?? null;

describe("the tutorial arrangement", () => {
  for (const map of MAPS_UNDER_TEST) {
    for (const you of SPECIES_UNDER_TEST) {
      it(`can be walked all the way to the queen on ${map} as ${you}`, () => {
        const s = board(map, you);
        const ctx = defaultContext();
        const fist = spear(s);

        // The spearhead is supplied. A cut-off stack produces nothing and would teach the
        // opposite of the rule it stands on (§4.2).
        expect(isConnected(s, fist), "the spearhead is cut off").toBe(true);

        // 1. A plain move onto empty ground.
        const mover = tilesOwnedBy(s, "you").find(
          (t) => t !== fist && canActFrom(s, t) && freeNeighbour(s, t) !== null,
        );
        expect(mover, "nowhere to teach a move from").toBeTruthy();
        const step = freeNeighbour(s, mover as Tile) as Coord;
        expect(moveOrAttack(s, mover as Tile, step, ctx).length).toBeGreaterThan(0);
        expect(tileAt(s, step.c, step.r)?.owner).toBe("you");

        // 2. An enemy tile within reach, and a garrison that actually takes it.
        const foe = tilesOwnedBy(s, "ai").find(
          (t) => neighbours(s, t).some((n) => n.owner === "you" && n !== fist && canActFrom(s, n)),
        );
        expect(foe, "no enemy outpost to attack").toBeTruthy();
        const assault = neighbours(s, foe as Tile).find(
          (n) => n.owner === "you" && n !== fist && canActFrom(s, n),
        ) as Tile;
        moveOrAttack(s, assault, { c: (foe as Tile).c, r: (foe as Tile).r }, ctx);
        expect((foe as Tile).owner, "the attack the tutorial asks for loses").toBe("you");

        // 3. A long send, which lays a vein behind it.
        const traveller = tilesOwnedBy(s, "you").find(
          (t) => t !== fist && canActFrom(s, t)
            && actionTargets(s, t).some((a) => distance(t, a) > 1),
        );
        expect(traveller, "nowhere to teach a travel from").toBeTruthy();
        const far = actionTargets(s, traveller as Tile).find((a) => distance(traveller as Tile, a) > 1) as Coord;
        expect(travel(s, traveller as Tile, far).length).toBeGreaterThan(0);

        // 4. Rally onto the spearhead.
        expect(rally(s, { c: fist.c, r: fist.r }).length).toBeGreaterThan(0);

        // 5. The ability fires. An ability that returns nothing did not fire at all (§5).
        const dig = allTiles(s).find((t) => !t.owner && t.guard === 0 && t.terrain === "ground");
        const cast = activateAbility(s, "you", NEUTRAL_MODS, dig ? { target: { c: dig.c, r: dig.r } } : undefined);
        expect(cast.length, "the ability had no target on the tutorial board").toBeGreaterThan(0);

        // 6. A guard falls...
        const guard = neighbours(s, spear(s)).find((n) => n.terrain === "hiveG" && n.owner !== "you");
        expect(guard, "the spearhead is not beside a hive guard").toBeTruthy();
        moveOrAttack(s, spear(s), { c: (guard as Tile).c, r: (guard as Tile).r }, ctx);
        expect((guard as Tile).owner, "the spearhead lost to a guard").toBe("you");

        // 7. ...and the queen behind it. Her tile is the surge (§4.7).
        const queen = allTiles(s).find((t) => t.terrain === "hiveQ") as Tile;
        const doorstep = neighbours(s, queen).find((n) => n.owner === "you" && canActFrom(s, n)) as Tile;
        moveOrAttack(s, doorstep, { c: queen.c, r: queen.r }, ctx);
        expect(queen.owner, "the queen survived the whole tutorial stack").toBe("you");
        expect(s.hive.phase).toBe("buff");
        expect(s.hive.owner).toBe("you");
      });
    }
  }

  it("leaves the rules alone", () => {
    const s = board("small", "fire");
    // Every owned tile still has a structure and a garrison, and the hive is untouched
    // terrain — the arrangement only decides where things start.
    for (const t of allTiles(s)) {
      if (!t.owner) continue;
      expect(t.struct, `${t.c},${t.r} has an owner and no structure`).not.toBe(undefined);
      expect(t.soldiers).toBeGreaterThanOrEqual(1);
      expect(t.guard).toBe(0);
      expect(t.terrain === "hiveQ" || t.terrain === "hiveG").toBe(false);
    }
    expect(s.turn).toBe(1);
    expect(s.current).toBe("you");
    // She is up from the first turn. The walk ends on taking her, and the HUD chip has to
    // agree with the step that says so — takeable-while-dormant is not the same thing.
    expect(s.hive.phase).toBe("awake");
    expect(s.limits.awakenTurn).toBe(1);
  });
});
