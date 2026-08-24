/**
 * STATES THE RULES SHOULD NEVER PRODUCE.
 *
 * Every rule in §4 has its own test on a board built to exercise it. This is the other half:
 * play real games and check the whole board after every single thing that happens, so a
 * state nothing is looking for is caught where it is created rather than noticed later on a
 * screenshot. Three found this way, all invisible in ordinary play until they were not:
 *
 *  - a trail whose anchor an ability took away stood until somebody happened to move,
 *  - claiming a dead queen's tile gave a tile with an owner and no structure,
 *  - the supply lines went stale whenever the hive handed its five tiles back.
 */
import { describe, expect, it } from "vitest";
import {
  abilityReady, activateAbility, allTiles, connectedSet, createGame, defaultContext, endTurn,
  isHiveTerrain, NEUTRAL_MODS, neighbours,
} from "../index";
import type { GameState, Player, SpeciesId, Tile } from "../index";
import { aiTurn } from "../../ai/search";

const mods = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };
const ctx = defaultContext();

/** Every way the board can be in a shape the rules have no meaning for. */
function faults(s: GameState): string[] {
  const bad: string[] = [];
  for (const t of allTiles(s)) {
    const at = `${t.c},${t.r}`;
    if (t.owner && t.guard > 0) bad.push(`${at} is owned and still holds a wild garrison`);
    if (t.owner && t.struct === null) bad.push(`${at} is owned with no structure`);
    if (!t.owner && t.struct !== null) bad.push(`${at} is unowned with a ${t.struct}`);
    if (t.owner && t.struct !== "vein" && t.soldiers < 1) bad.push(`${at} is owned below the one-soldier floor`);
    if (!t.owner && t.soldiers > 0 && !isHiveTerrain(t)) bad.push(`${at} is unowned but garrisoned`);
    if (t.terrain === "blocked" && t.owner) bad.push(`${at} is a rock somebody owns`);
    if (t.struct === "vein" && t.owner && anchors(s, t) < 2) bad.push(`${at} is a vein standing on nothing`);
  }
  for (const p of ["you", "ai"] as const) {
    const fresh = connectedSet(s, p);
    if (fresh.size !== s.conn[p].size || [...fresh].some((k) => !s.conn[p].has(k))) {
      bad.push(`${p}'s supply lines are stale`);
    }
  }
  if (s.hive.phase === "buff" && !s.hive.owner) bad.push("a surge with no owner");
  if (s.hive.phase === "cooling" && allTiles(s).some((t) => isHiveTerrain(t) && !t.owner && t.soldiers > 0)) {
    bad.push("a dead queen still has a garrison");
  }
  return bad;
}

/** §4.5: a vein needs two same-owner colony neighbours or the trail prunes. */
function anchors(s: GameState, t: Tile): number {
  let n = 0;
  for (const nb of neighbours(s, t)) {
    if (nb.owner === t.owner && (nb.struct === "vein" || nb.struct === "stable" || nb.struct === "nest")) n++;
  }
  return n;
}

const SPECIES: SpeciesId[] = [
  "fire", "leafcutter", "carpenter", "weaver", "army", "bullet", "demon", "ghost", "pharaoh",
];

describe("a real game never reaches a state the rules cannot read", () => {
  // One game per species as the caster, so all nine abilities are fired many times over.
  for (let i = 0; i < SPECIES.length; i++) {
    const you = SPECIES[i] as SpeciesId;
    const ai = SPECIES[(i * 4 + 3) % SPECIES.length] as SpeciesId;
    const map = (["tiny", "small", "mid"] as const)[i % 3] as "tiny" | "small" | "mid";

    it(`holds through a ${map} game as ${you} against ${ai}`, () => {
      const s = createGame({ map, species: { you, ai }, seed: 400 + i });
      expect(faults(s), "the opening position is already wrong").toEqual([]);

      for (let turn = 0; turn < 70 && !s.over; turn++) {
        const p: Player = s.current;
        // Force the ability out whenever it is up, so the rare ones are not left untested.
        if (abilityReady(s, p)) {
          activateAbility(s, p, mods[p], { target: openGround(s) });
          expect(faults(s), `after ${s.species[p]}'s ability on turn ${s.turn}`).toEqual([]);
        }
        if (s.over) break;
        aiTurn(s, p, "easy", ctx);
        expect(faults(s), `after ${p} moved on turn ${s.turn}`).toEqual([]);
        if (s.over) break;
        endTurn(s, mods);
        expect(faults(s), `after turn ${s.turn} was handed over`).toEqual([]);
      }
    });
  }
});

/** Somewhere for a Ghost to dig; every other ability ignores the target. */
function openGround(s: GameState): { c: number; r: number } | null {
  const free = allTiles(s).find((t) => !t.owner && t.guard === 0 && t.terrain === "ground");
  return free ? { c: free.c, r: free.r } : null;
}
