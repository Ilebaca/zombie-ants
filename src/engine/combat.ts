import { DEF } from "./config";
import { isHiveTerrain } from "./board";
import { speciesOf } from "./species";
import type { GameState, Player, PlayerMods, Tile } from "./types";

/**
 * COMBAT IS FULLY DETERMINISTIC. There is no randomness here and none may be added.
 * Players count these numbers out before committing; that predictability is the game.
 */

export interface FightResult {
  winner: "atk" | "def";
  survivors: number;
}

export function fight(
  attackers: number, attackMod: number,
  defenders: number, defenceMod: number, flatDefence: number,
): FightResult {
  const attackPower = attackers * attackMod;
  const defencePower = defenders * defenceMod + flatDefence;

  if (attackPower > defencePower) {
    // A crushing attack keeps nearly everything; a narrow win arrives almost spent.
    return { winner: "atk", survivors: Math.max(1, Math.round(attackers * (1 - defencePower / attackPower))) };
  }
  const survivors = defencePower > 0
    ? Math.max(1, Math.round(defenders * (1 - attackPower / defencePower)))
    : Math.max(1, defenders);
  return { winner: "def", survivors };
}

/**
 * Flat defence bonus for a tile.
 * Veins get ZERO — they are infrastructure and always lose (see CLAUDE.md §4.3).
 * Hive tiles get zero too: they defend purely with their garrison.
 */
export function flatDefence(state: GameState, t: Tile, mods: PlayerMods): number {
  if (isHiveTerrain(t)) return 0;
  if (t.struct === "vein") return 0;

  let base = 0;
  if (t.struct === "nest") base = DEF.nest;
  else if (t.struct === "stable") base = t.terrain === "resource" ? DEF.resourceOwned : DEF.stable;

  let mult = 1;
  if (t.struct === "nest") mult *= 1 + mods.soldierCaste * 0.05;      // Soldier Caste
  if (t.owner && state.shield[t.owner] > 0) mult *= 1.7;              // Carpenter Fortify
  if (hasArmour(state, t)) mult *= 1.4;                               // withered leaf wall
  return Math.round(base * mult);
}

function hasArmour(state: GameState, t: Tile): boolean {
  return state.effects.some((e) => e.c === t.c && e.r === t.r && e.kind === "armor" && e.owner === t.owner);
}

/**
 * Flat bonus a neutral wild garrison defends with.
 *
 * A garrison squatting on a RESOURCE digs in far harder than one on open ground — that is
 * what makes a defended resource a real objective rather than a free pickup, and why the
 * map design bothers to guard some and leave others open.
 */
export function guardDefence(t: Tile): number {
  return (t.terrain === "resource" ? DEF.guardResource : DEF.guardGround) + DEF.guard;
}

/** Queen surge: +50% attack and defence while a player holds the Hive. */
export function surgeMultiplier(state: GameState, p: Player): number {
  return state.hive.phase === "buff" && state.hive.owner === p ? 1.5 : 1;
}

export function attackMultiplier(state: GameState, p: Player, mods: PlayerMods): number {
  return speciesOf(state.species[p]).atk * surgeMultiplier(state, p) * (1 + mods.mandible * 0.05);
}

export function defenceMultiplier(state: GameState, p: Player, mods: PlayerMods): number {
  return speciesOf(state.species[p]).def * surgeMultiplier(state, p) * (1 + mods.cuticle * 0.05);
}
