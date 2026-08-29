import { PROD } from "./config";
import { allTiles, nestTile } from "./board";
import { isConnected } from "./connectivity";
import { hiveBuffMultiplier } from "./hive";
import { speciesOf } from "./species";
import type { EngineEvent, GameState, Player, PlayerMods, Tile } from "./types";

/** Tiles that generate soldiers. Veins are infrastructure and produce NOTHING. */
function producers(state: GameState, p: Player): Tile[] {
  return allTiles(state).filter((t) => t.owner === p && (t.struct === "stable" || t.struct === "nest"));
}

/** Base output of a single tile, before species/hive multipliers. */
function tileOutput(t: Tile, mods: PlayerMods): number {
  if (t.struct === "nest") return PROD.nest;
  if (t.terrain === "resource") return PROD.resourceStable + mods.cultivate;  // Fungal Cultivation
  return PROD.stable;
}

/**
 * Income shown in the HUD. Detached tiles contribute nothing — being cut off from the
 * queen is the real cost of overextending (CLAUDE.md §4.2).
 */
export function incomeOf(state: GameState, p: Player, mods: PlayerMods): number {
  let income = 0;
  for (const t of producers(state, p)) {
    if (!isConnected(state, t)) continue;
    income += tileOutput(t, mods);
  }
  if (state.hive.phase === "buff" && state.hive.owner === p) income *= hiveBuffMultiplier(state);
  income *= speciesOf(state.species[p]).prod;
  return Math.round(income);
}

/**
 * Apply a turn of growth. Fractional output accumulates on the tile so slow economies
 * still tick forward rather than rounding away to nothing.
 */
export function runProduction(
  state: GameState, p: Player, mods: PlayerMods, events: EngineEvent[] = [],
): EngineEvent[] {
  const rate = speciesOf(state.species[p]).prod;
  const surge = state.hive.phase === "buff" && state.hive.owner === p ? hiveBuffMultiplier(state) : 1;
  let gained = 0;

  for (const t of producers(state, p)) {
    if (!isConnected(state, t)) continue;
    const growth = tileOutput(t, mods) * surge * rate;
    t.prodAcc += growth;
    const whole = Math.floor(t.prodAcc);
    if (whole > 0) { t.prodAcc -= whole; t.soldiers += whole; gained += whole; }
  }

  // Brood Nursery hatches replacements straight into the queen's chamber.
  if (mods.brood > 0) {
    const nest = nestTile(state, p);
    if (nest) { nest.soldiers += mods.brood; gained += mods.brood; }
  }

  if (gained > 0) events.push({ type: "production", owner: p, gained });
  return events;
}
