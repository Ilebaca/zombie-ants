/**
 * THE TUTORIAL BOARD MUST BE ABLE TO TEACH.
 *
 * The walkthrough asks for five specific things — a move, a long send, a rally, an attack
 * and the queen — each on its own turn with the enemy replying in between. A step that asks
 * for something the board cannot deliver leaves the tutorial stuck with nothing but Skip.
 * Combat is deterministic (CLAUDE.md §4.1), so this is not a matter of odds: either the
 * arrangement makes every lesson available on every map, for every colony, or it does not.
 *
 * This plays the whole thing in the order the tour plays it, taking the same tiles the
 * tour's own helpers pick, and it plays it as ALL NINE species — the fist has to beat the
 * enemy and then the queen with whatever attack multiplier the player chose.
 */
import { describe, expect, it } from "vitest";
import {
  MAPS, NEUTRAL_MODS, SPECIES, actionTargets, allTiles, arrangeTutorial, canActFrom,
  createGame, defaultContext, distance, endTurn, isConnected, moveOrAttack, nestTile, rally,
  furthestTravel, tileAt, tilesOwnedBy, travel, tutorialAiMove,
} from "../index";
import type { Coord, GameState, MapId, SpeciesId, Tile } from "../index";

const MAPS_UNDER_TEST = Object.keys(MAPS) as MapId[];

const board = (map: MapId, you: SpeciesId): GameState => {
  const state = createGame({ map, species: { you, ai: "fire" }, seed: 5 });
  arrangeTutorial(state);
  return state;
};

const mods = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };

/* The tour's own choices, kept in one place so the test asks for exactly what it asks for.
   Anything that changes here has to change in `MatchScreen`'s helpers too. */
const home = (s: GameState): Tile => nestTile(s, "you") as Tile;
const door = (s: GameState): Tile =>
  allTiles(s).find((t) => t.owner === "ai" && t.terrain === "hiveG") as Tile;
const camp = (s: GameState): Tile =>
  allTiles(s).find((t) => t.owner === "you"
    && allTiles(s).some((d) => d.owner === "ai" && d.terrain === "hiveG"
      && distance(d, t) === 1)) as Tile;
const queen = (s: GameState): Tile => allTiles(s).find((t) => t.terrain === "hiveQ") as Tile;

const spare = (s: GameState, t: Tile): boolean => t !== home(s) && t !== camp(s);

const freeNeighbour = (s: GameState, from: Tile): Coord | null =>
  actionTargets(s, from).find((at) => {
    const t = tileAt(s, at.c, at.r);
    return distance(from, at) === 1 && t && !t.owner && t.guard === 0 && t.terrain === "ground";
  }) ?? null;

/** The step's own target, so the test asks for exactly what the screen asks for. */
const farTarget = (s: GameState, from: Tile): Coord | null => furthestTravel(s, from);

/** Hand the turn over the way the walkthrough does: the enemy answers, then it is ours. */
function enemyReplies(s: GameState): void {
  endTurn(s, mods);
  expect(s.current, "the turn did not pass to the enemy").toBe("ai");
  tutorialAiMove(s, defaultContext());
  endTurn(s, mods);
  expect(s.current, "the turn did not come back").toBe("you");
}

describe("the tutorial arrangement", () => {
  for (const map of MAPS_UNDER_TEST) {
    for (const you of Object.keys(SPECIES) as SpeciesId[]) {
      it(`walks move, send, rally, attack and queen on ${map} as ${you}`, () => {
        const s = board(map, you);
        const ctx = defaultContext();

        expect(camp(s), "no camp beside the enemy").toBeTruthy();
        expect(isConnected(s, camp(s)), "the camp is cut off").toBe(true);
        expect(door(s), "no enemy tile to attack").toBeTruthy();

        // 1. A plain move onto empty ground, from a tile that is neither of the two the
        //    later steps need.
        const mover = tilesOwnedBy(s, "you").find(
          (t) => spare(s, t) && canActFrom(s, t) && freeNeighbour(s, t) !== null,
        );
        expect(mover, "nowhere to teach a move from").toBeTruthy();
        const onto = freeNeighbour(s, mover as Tile) as Coord;
        expect(moveOrAttack(s, mover as Tile, onto, ctx).length).toBeGreaterThan(0);
        expect(tileAt(s, onto.c, onto.r)?.owner).toBe("you");
        enemyReplies(s);

        // 2. The long send: further than a neighbour, and it lays a vein behind it.
        const sender = tilesOwnedBy(s, "you").find(
          (t) => spare(s, t) && canActFrom(s, t) && farTarget(s, t) !== null,
        );
        expect(sender, "nowhere to teach a long send from").toBeTruthy();
        const far = farTarget(s, sender as Tile) as Coord;
        // The FURTHEST, not merely a long one: a two-tile hop lays a single vein and
        // reads as a move that went slightly wrong.
        const reach = actionTargets(s, sender as Tile)
          .map((at) => distance(sender as Tile, at));
        expect(distance(sender as Tile, far), "the send was not the longest one available")
          .toBe(Math.max(...reach));
        expect(distance(sender as Tile, far), "the send was not a long one")
          .toBeGreaterThan(1);
        const sent = travel(s, sender as Tile, far);
        expect(sent.length, "the long send did nothing").toBeGreaterThan(0);
        expect(sent.some((e) => e.type === "veinLaid"), "no vein was laid").toBe(true);
        enemyReplies(s);

        // 3. Rally the whole colony onto the camp.
        const gathered = rally(s, { c: camp(s).c, r: camp(s).r });
        expect(gathered.length, "the rally did nothing").toBeGreaterThan(0);
        enemyReplies(s);

        // 4. Attack the enemy tile. The camp is beside it, and the fist has to win.
        const fist = camp(s);
        const foe = door(s);
        expect(distance(fist, foe), "the camp is not beside the enemy").toBe(1);
        expect(moveOrAttack(s, fist, { c: foe.c, r: foe.r }, ctx).length).toBeGreaterThan(0);
        expect(tileAt(s, foe.c, foe.r)?.owner, "the attack was lost").toBe("you");
        enemyReplies(s);

        // 5. ...and the queen is next door, because the enemy was standing on her guard.
        const her = queen(s);
        const doorstep = tileAt(s, foe.c, foe.r) as Tile;
        expect(distance(doorstep, her), "the queen is not next door").toBe(1);
        expect(canActFrom(s, doorstep), "nothing left to take her with").toBe(true);
        const taken = moveOrAttack(s, doorstep, { c: her.c, r: her.r }, ctx);
        expect(taken.some((e) => e.type === "hiveCaptured"), "the queen held").toBe(true);
        expect(s.hive.owner, "the surge did not run").toBe("you");
      });
    }
  }

  /**
   * The arrangement decides where things START and nothing else. A tutorial that quietly
   * changed a rule would teach a game the player is not about to play.
   */
  it("leaves the rules alone", () => {
    const plain = createGame({ map: "small", species: { you: "fire", ai: "fire" }, seed: 5 });
    const taught = board("small", "fire");
    expect(taught.limits.turnLimit).toBe(plain.limits.turnLimit);
    expect(taught.limits.buffTurns).toBe(plain.limits.buffTurns);
    expect(taught.size).toBe(plain.size);
  });

  /**
   * The enemy's reply is decided, not searched: a tutorial whose next step depends on what
   * the opponent felt like doing is one that can strand itself.
   */
  it("plays the same enemy reply every time", () => {
    const a = board("small", "fire");
    const b = board("small", "fire");
    endTurn(a, mods); endTurn(b, mods);
    const one = tutorialAiMove(a, defaultContext());
    const two = tutorialAiMove(b, defaultContext());
    expect(one.length, "the enemy did nothing at all").toBeGreaterThan(0);
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
  });

  /** And it never picks a fight: the lesson is the hand-over, not a battle nobody saw. */
  it("takes empty ground rather than attacking", () => {
    const s = board("small", "fire");
    endTurn(s, mods);
    const events = tutorialAiMove(s, defaultContext());
    expect(events.some((e) => e.type === "combat"), "the enemy started a fight").toBe(false);
  });
});
