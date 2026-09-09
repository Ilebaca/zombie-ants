/**
 * NOTHING MAY CHANGE A TILE IT CANNOT REACH.
 *
 * Reported from a real match: "the enemy played his tile across mine, through my line of
 * tiles, destroying one in the process." That is a claim about REACH — an action touching
 * ground it has no business touching — and no rule test catches it, because every rule test
 * builds the one board it is about. This plays whole games instead and audits the WHOLE grid
 * after every single action, against two rules:
 *
 *  1. EVERY TILE THAT CHANGED HANDS WAS NAMED BY AN EVENT. The renderer draws from events
 *     and nothing else (§3), so a tile that changes owner with no event naming it is a tile
 *     that changes on screen with no animation — which is exactly what "it just happened"
 *     looks like from the outside. This is the general net, and it catches an ability with
 *     a footprint it does not report just as well as a move that reaches too far.
 *  2. AN ACTION ONLY REACHES WHERE ITS OWN KIND CAN. A move touches two ADJACENT tiles. A
 *     travel touches the path it emitted, and that path must be a chain of orthogonal steps
 *     no longer than the range, every crossed tile either empty or the traveller's own.
 *     This is the sharp one, and it is the shape of the report.
 *
 * The AI is what plays here, and that is deliberate: it applies engine functions DIRECTLY
 * rather than through `applyMove`'s legality checks (§9b), so a hole in its move generator
 * lands on the real board with nothing in between. This is the only thing looking.
 */
import { describe, expect, it } from "vitest";
import { allTiles, createGame, defaultContext, endTurn, key, TRAVEL_RANGE } from "../index";
import type { Coord, EngineEvent, GameState, MapId, Player, SpeciesId } from "../index";
import { aiTurn } from "../../ai/search";

/** Owner and structure of every tile, so a change of hands is a string comparison. */
function held(s: GameState): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of allTiles(s)) out.set(key(t.c, t.r), `${t.owner ?? "-"}/${t.struct ?? "-"}`);
  return out;
}

/** Every coordinate an event names. */
function named(events: readonly EngineEvent[]): Set<string> {
  const out = new Set<string>();
  const add = (c: Coord | null | undefined): void => { if (c) out.add(key(c.c, c.r)); };
  for (const e of events) {
    switch (e.type) {
      case "move": add(e.from); add(e.to); break;
      case "travel": for (const step of e.path) add(step); break;
      case "rally": add(e.to); for (const src of e.sources) add(src); break;
      case "fled": add(e.from); add(e.to); break;
      case "devoured": add(e.at); add(e.into); break;
      case "hiveCaptured": for (const cell of e.cells) add(cell); break;
      case "capture": case "combat": case "veinLaid": case "veinPruned":
      case "effectApplied": case "effectExpired": case "effectDamage":
      case "budded": case "fortified": case "tunnelDug":
        add(e.at); break;
      default: break;
    }
  }
  return out;
}

const orth = (a: Coord, b: Coord): boolean => Math.abs(a.c - b.c) + Math.abs(a.r - b.r) === 1;

/**
 * Check reach while WALKING the batch, never against the board as it stood at the start.
 *
 * A turn is not one action: an ability is a free extra action (§4.10), so a colony can eat
 * its way onto a tile and then send a column across the ground it just took — which is
 * legal, and read against a snapshot from before the cast looks exactly like a travel
 * crossing enemy ground. That false positive is the first thing this test found, and it is
 * worth stating plainly, because it is also what the report looked like from the outside.
 *
 * So ownership is carried forward event by event. A travel's own `veinLaid` events run
 * BEFORE its `travel` (§5) and only ever fire on EMPTY ground, so they cannot paper over a
 * tile the other colony was holding — which is the case this is actually looking for.
 */
function checkReach(events: readonly EngineEvent[], was: Map<string, string>, where: string): void {
  const owner = new Map<string, string>();
  for (const [k, v] of was) owner.set(k, v.split("/")[0] as string);
  const set = (at: Coord, to: string): void => { owner.set(key(at.c, at.r), to); };
  const at = (c: Coord): string => owner.get(key(c.c, c.r)) ?? "-";

  for (const e of events) {
    if (e.type === "move") {
      expect(orth(e.from, e.to), `${where}: a move crossed more than one tile`).toBe(true);
    }
    switch (e.type) {
      case "capture": case "veinLaid": case "budded": case "tunnelDug":
        set(e.at, e.owner); break;
      case "fortified": break;
      case "veinPruned": set(e.at, "-"); break;
      case "effectDamage": if (e.wiped) set(e.at, "-"); break;
      case "hiveCaptured": for (const cell of e.cells) set(cell, e.owner); break;
      case "fled":
        if (e.to) { if (at(e.from) === e.owner) set(e.from, "-"); set(e.to, e.owner); }
        break;
      default: break;
    }
    if (e.type !== "travel") continue;
    const path = e.path;
    // The path has to BE a path: orthogonal steps, no jumps, inside the range.
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1] as Coord, b = path[i] as Coord;
      expect(orth(a, b), `${where}: travel jumped ${a.c},${a.r} to ${b.c},${b.r}`).toBe(true);
    }
    expect(path.length - 1, `${where}: travel went further than the range`)
      .toBeLessThanOrEqual(TRAVEL_RANGE);
    // ...and every tile it crossed was empty, or already its own.
    for (let i = 1; i < path.length - 1; i++) {
      const step = path[i] as Coord;
      const holder = at(step);
      expect(holder === "-" || holder === e.owner,
        `${where}: travel crossed ${step.c},${step.r}, held by ${holder}`).toBe(true);
    }
    for (const step of path) set(step, e.owner);
  }
}

/**
 * An opening, audited after every action.
 *
 * `turns` is capped rather than played out, and that is a cost decision: the search is
 * synchronous and a full 13x13 game is most of a minute, which is most of vitest's RPC
 * budget (§4a) spent on the tail of a game where nothing new happens. Both colonies are
 * out of their corners, in contact, and off cooldown well inside this — and `npm run reach`
 * plays hundreds of games to the end for when that is not enough.
 */
function audit(seed: number, map: MapId, species: Record<Player, SpeciesId>, turns = 24): void {
  const ctx = defaultContext();
  const state = createGame({ map, seed, first: "you", species });
  let guard = 0;
  while (!state.over && state.turn <= turns && guard++ < 600) {
    const p = state.current;
    const was = held(state);
    const events = aiTurn(state, p, p === "you" ? "normal" : "hard", ctx);
    const where = `seed ${seed} ${map} turn ${state.turn} ${p}`;

    const allowed = named(events);
    for (const [k, now] of held(state)) {
      if (was.get(k) === now) continue;
      expect(allowed.has(k), `${where}: ${k} changed to ${now} and no event named it`).toBe(true);
    }
    checkReach(events, was, where);
    if (state.over) break;
    endTurn(state, ctx.mods);
  }
}

const SPECIES: SpeciesId[] = [
  "fire", "leafcutter", "army", "ghost", "weaver", "carpenter", "bullet", "pharaoh", "demon",
];

/**
 * THREE GAMES, one `it` each — never a loop over all of them in a single test.
 *
 * The search is synchronous, so while a game runs the worker cannot answer the reporter and
 * vitest's RPC gives up at sixty seconds (§4a). A game is about five of those, so three of
 * them in one block is most of the budget spent for no extra coverage; three blocks hand the
 * loop back in between. The WIDE sweep — every colony, hundreds of games — is
 * `npm run reach`, which is where to go when something like this is reported again.
 */
for (const [map, i] of [["small", 2], ["small", 5], ["small", 7]] as const) {
  describe(`a full game (${map}, colony ${i})`, () => {
    it("never lets an action reach ground it cannot", () => {
      audit(9000 + i, map, {
        you: SPECIES[i] as SpeciesId,
        ai: SPECIES[(i + 4) % SPECIES.length] as SpeciesId,
      });
    });
  });
}
