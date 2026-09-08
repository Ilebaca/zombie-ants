/**
 * THE REACH AUDIT — does any action ever touch ground it cannot reach?
 *
 * Written after a real match came back as "the enemy played his tile across mine, through
 * my line of tiles, destroying one in the process". Every rule test in the suite builds the
 * one board it is about; nothing played whole games and watched the WHOLE grid. This does,
 * against two rules, after every single action:
 *
 *  1. EVERY TILE THAT CHANGED HANDS WAS NAMED BY AN EVENT. The renderer draws from events
 *     and nothing else (CLAUDE.md §3), so a tile that changes owner with no event naming it
 *     changes on screen with no animation — which is what "it just happened" looks like.
 *  2. AN ACTION ONLY REACHES WHERE ITS KIND CAN. A move touches two ADJACENT tiles. A
 *     travel's path is orthogonal steps, no longer than the range, over ground that is
 *     empty or already its own.
 *
 * OWNERSHIP IS CARRIED FORWARD EVENT BY EVENT, never read off a snapshot from the start of
 * the turn — and that is the first thing this found. An ability is a free extra action
 * (§4.10), so a colony can EAT a tile out of the middle of a line and then send a column
 * along the ground it just took. Read against a stale snapshot that is a false alarm; it is
 * also, exactly, what the report looked like from the outside, and the real fault was in
 * how the animator drew it (`render/animate.ts`, `inTravelRun`).
 *
 * Run with:  npm run reach [games-per-pairing] [difficulty]
 *
 * THE DIFFICULTY IS NOT COSMETIC HERE — it decides which ACTIONS get played at all, so it
 * decides what is audited. `easy` generates no travel; `normal` generates no rally and does
 * not search its ability; only `hard` plays the whole action set. Run it at hard before
 * concluding anything about rally. The engine came back clean over 81 games and 8,362 turns
 * at normal.
 *
 * `src/engine/__tests__/reach.test.ts` is the tripwire version — one short game per map, so
 * the suite carries it without spending a minute on it. This is where to come when
 * something like that is reported again.
 */
import { allTiles, createGame, defaultContext, endTurn, key, TRAVEL_RANGE } from "../src/engine";
import type { Coord, EngineEvent, GameState, MapId, SpeciesId } from "../src/engine";
import { aiTurn } from "../src/ai/search";

const SPECIES: SpeciesId[] = ["fire","leafcutter","army","ghost","weaver","carpenter","bullet","pharaoh","demon"];
const orth = (a: Coord, b: Coord) => Math.abs(a.c-b.c)+Math.abs(a.r-b.r) === 1;
const held = (s: GameState) => new Map(allTiles(s).map(t => [key(t.c,t.r), `${t.owner ?? "-"}/${t.struct ?? "-"}`]));

function names(events: readonly EngineEvent[]): Set<string> {
  const out = new Set<string>();
  const add = (c?: Coord | null) => { if (c) out.add(key(c.c, c.r)); };
  for (const e of events) {
    switch (e.type) {
      case "move": add(e.from); add(e.to); break;
      case "travel": for (const s of e.path) add(s); break;
      case "rally": add(e.to); for (const s of e.sources) add(s); break;
      case "fled": add(e.from); add(e.to); break;
      case "devoured": add(e.at); add(e.into); break;
      case "hiveCaptured": for (const c of e.cells) add(c); break;
      case "capture": case "combat": case "veinLaid": case "veinPruned":
      case "effectApplied": case "effectExpired": case "effectDamage":
      case "budded": case "fortified": case "tunnelDug": add(e.at); break;
      default: break;
    }
  }
  return out;
}

let problems = 0;
function check(events: readonly EngineEvent[], was: Map<string,string>, where: string): void {
  const own = new Map<string,string>();
  for (const [k,v] of was) own.set(k, v.split("/")[0] as string);
  const set = (c: Coord, to: string) => own.set(key(c.c,c.r), to);
  const at = (c: Coord) => own.get(key(c.c,c.r)) ?? "-";
  for (const e of events) {
    if (e.type === "move" && !orth(e.from, e.to)) {
      console.log(`${where}: MOVE crossed more than one tile`, JSON.stringify(e)); problems++;
    }
    switch (e.type) {
      case "capture": case "veinLaid": case "budded": case "tunnelDug": set(e.at, e.owner); break;
      case "veinPruned": set(e.at, "-"); break;
      case "effectDamage": if (e.wiped) set(e.at, "-"); break;
      case "hiveCaptured": for (const c of e.cells) set(c, e.owner); break;
      case "fled": if (e.to) { if (at(e.from) === e.owner) set(e.from, "-"); set(e.to, e.owner); } break;
      default: break;
    }
    if (e.type !== "travel") continue;
    for (let i = 1; i < e.path.length; i++) {
      const a = e.path[i-1] as Coord, b = e.path[i] as Coord;
      if (!orth(a,b)) { console.log(`${where}: TRAVEL JUMPED`, JSON.stringify(e.path)); problems++; }
    }
    if (e.path.length - 1 > TRAVEL_RANGE) { console.log(`${where}: TRAVEL TOO FAR`, e.path.length-1); problems++; }
    for (let i = 1; i < e.path.length - 1; i++) {
      const s = e.path[i] as Coord, h = at(s);
      if (h !== "-" && h !== e.owner) {
        console.log(`${where}: TRAVEL CROSSED ${s.c},${s.r} held by ${h}`);
        console.log("   batch:", events.map(x => x.type).join(" "));
        problems++;
      }
    }
    for (const s of e.path) set(s, e.owner);
  }
}

const [, , gamesArg, diffArg] = process.argv;
const perPair = Number(gamesArg ?? 3);
const diff = (diffArg ?? "normal") as "easy" | "normal" | "hard";
const ctx = defaultContext();
let games = 0, turns = 0, unnamed = 0;
const t0 = Date.now();

for (const map of ["tiny","small","mid"] as MapId[]) {
  for (let i = 0; i < SPECIES.length; i++) {
    for (let g = 0; g < perPair; g++) {
      const you = SPECIES[i] as SpeciesId, ai = SPECIES[(i+4+g) % SPECIES.length] as SpeciesId;
      const seed = 7000 + i*131 + g*17 + map.length;
      const state = createGame({ map, seed, first: g % 2 === 0 ? "you" : "ai", species: { you, ai } });
      let guard = 0;
      while (!state.over && state.turn <= state.limits.turnLimit && guard++ < 400) {
        const p = state.current;
        const was = held(state);
        const evs = aiTurn(state, p, diff, ctx);
        const where = `${map} seed ${seed} turn ${state.turn} ${p} (${p === "you" ? you : ai})`;
        const allowed = names(evs);
        for (const [k, now] of held(state)) {
          if (was.get(k) === now) continue;
          if (!allowed.has(k)) {
            console.log(`${where}: ${k} changed to ${now} with NO event naming it`);
            console.log("   batch:", evs.map(x => x.type).join(" "));
            unnamed++; problems++;
          }
        }
        check(evs, was, where);
        turns++;
        if (state.over) break;
        endTurn(state, ctx.mods);
      }
      games++;
    }
  }
}
console.log(`\n${games} games, ${turns} turns, ${diff}, ${((Date.now()-t0)/1000).toFixed(0)}s`);
console.log(`problems: ${problems} (unnamed changes: ${unnamed})`);
