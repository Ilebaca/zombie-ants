import { isHiveTerrain, otherPlayer, razeTile, tileAt } from "./board";
import { recomputeConnectivity } from "./connectivity";
import { PERMANENT } from "./types";
import type { EngineEvent, GameState, Player, PlayerMods, Tile, TileEffect } from "./types";

/** Soldiers a venom cloud takes off a tile each turn, before the victim's research. */
export const VENOM_BITE = 7;

/** The share of a garrison Wildfire takes each turn, before the victim's research. */
export const FIRE_BITE = 0.20;

/** Metapleural Gland softens fire, venom and hive damage by 5% per level. */
export const glandCut = (mods: PlayerMods): number => Math.max(0.25, 1 - mods.gland * 0.05);

export function addEffect(
  state: GameState, c: number, r: number, kind: TileEffect["kind"], owner: Player, turns: number,
): TileEffect {
  const existing = state.effects.find((e) => e.c === c && e.r === r && e.kind === kind);
  if (existing) { existing.left = Math.max(existing.left, turns); return existing; }
  const effect: TileEffect = { c, r, kind, owner, left: turns };
  state.effects.push(effect);
  return effect;
}

export function effectAt(state: GameState, c: number, r: number, kind: TileEffect["kind"]): TileEffect | undefined {
  return state.effects.find((e) => e.c === c && e.r === r && e.kind === kind);
}

export interface Hit {
  /** Soldiers actually taken off the tile. */
  lost: number;
  /** The tile lost everything it had: a colony gave it up, a garrison is gone. */
  wiped: boolean;
}

/**
 * WHERE DAMAGE LANDS. Every ability that hurts a tile comes through here.
 *
 * One function because the tile can be four different things, and each of them was getting
 * its own arithmetic somewhere else in the file — which is how veins ended up immune to
 * everything, and how a wild garrison of one soldier ended up immortal.
 *
 *  - A VEIN dies outright. It holds no garrison at all, so a percentage of it is a
 *    percentage of nothing and the hit fell straight through the one thing on the board
 *    that cannot defend itself (CLAUDE.md §4.4).
 *  - A tile somebody HOLDS loses soldiers, and is given up when they run out. The
 *    one-soldier floor is about what you may spend (§4.9), not about what can be killed.
 *  - A WILD GARRISON loses guards the same way, and the tile goes back to bare ground.
 *  - The NEUTRAL HIVE loses its garrison the same way. `!t.owner` is what keeps this off
 *    hive tiles a colony is holding — that terrain outlives its ownership (§5a), and a
 *    held tile takes damage through the ordinary path.
 *
 * Nothing here stops at one. A rounding rule that could never take the last soldier left
 * wild guards and hive tiles sitting at 1 forever, which is not a floor anyone designed.
 */
export function strike(t: Tile, amount: number): Hit {
  if (t.owner && t.struct === "vein") {
    razeTile(t);
    return { lost: 0, wiped: true };
  }
  if (amount <= 0) return { lost: 0, wiped: false };

  if (t.owner) {
    const before = t.soldiers;
    t.soldiers = Math.max(0, t.soldiers - amount);
    const wiped = t.soldiers <= 0;
    if (wiped) razeTile(t);
    return { lost: before - t.soldiers, wiped };
  }
  if (t.guard > 0) {
    const before = t.guard;
    t.guard = Math.max(0, t.guard - amount);
    return { lost: before - t.guard, wiped: t.guard === 0 };
  }
  if (isHiveTerrain(t) && t.soldiers > 0) {
    const before = t.soldiers;
    t.soldiers = Math.max(0, t.soldiers - amount);
    // Never "wiped": the queen's tile is still there when her garrison is gone, and the
    // renderer crumbles a wiped tile. Emptying her makes her takeable, not destroyed.
    return { lost: before - t.soldiers, wiped: false };
  }
  return { lost: 0, wiped: false };
}

/** What a tile has standing on it, whoever it belongs to. */
export const garrisonOf = (t: Tile): number => (t.owner ? t.soldiers : t.guard > 0 ? t.guard : t.soldiers);

/**
 * Resolve damage and age effects at the start of `p`'s turn.
 *
 * Connectivity is rebuilt at the end: an effect that destroys a connector must deactivate
 * everything behind it immediately, not next turn (CLAUDE.md §4.2).
 */
export function tickEffects(
  state: GameState, p: Player, mods: PlayerMods, events: EngineEvent[] = [],
): EngineEvent[] {
  for (const e of [...state.effects]) {
    const t = tileAt(state, e.c, e.r);
    if (!t) continue;

    const hurt = (kind: "fire" | "venom", amount: number): void => {
      const hit = strike(t, amount);
      if (!hit.lost && !hit.wiped) return;
      events.push({
        type: "effectDamage", at: { c: t.c, r: t.r }, kind,
        lost: hit.lost, wiped: hit.wiped, owner: t.owner ?? null,
      });
    };

    // Enemy fire burns p's garrison; small garrisons are wiped out entirely.
    if (e.kind === "fire" && e.owner !== p && t.owner === p) {
      const soft = glandCut(mods);
      hurt("fire", t.struct === "vein" ? 0
        : t.soldiers <= 5 ? t.soldiers
        : Math.max(1, Math.round(t.soldiers * FIRE_BITE * soft)));
    }

    /*
     * Your OWN fire still burns what isn't YOURS: wild garrisons and the neutral hive.
     * Without this, Wildfire would be purely anti-player and could never soften the hive
     * for a run at it.
     *
     * `!t.owner` matters. Hive terrain stays hive terrain after somebody captures it, so
     * without it a colony's own fire burned the hive tiles it was holding — down past the
     * one-soldier floor and on to zero, leaving a tile with an owner and no garrison, which
     * nothing else in the rules can produce. A tile somebody holds takes damage through the
     * ordinary path above, which knows how to give it up when it is wiped out.
     *
     * No gland softening here: that is the VICTIM's research, and neither a wild garrison
     * nor the hive has any.
     */
    if (e.kind === "fire" && e.owner === p && !t.owner) {
      hurt("fire", Math.max(1, Math.round(garrisonOf(t) * FIRE_BITE)));
    }

    if (e.kind === "venom" && e.owner !== p && t.owner === p) {
      hurt("venom", Math.round(VENOM_BITE * glandCut(mods)));
    }

    // ...and venom lands on whatever else it was scattered over. The barrage does not
    // choose its targets (§4.1), so it hits the hive and the wild garrisons it falls on
    // exactly as hard as it hits a colony.
    if (e.kind === "venom" && e.owner === p && !t.owner) {
      hurt("venom", VENOM_BITE);
    }
  }

  // Age effects owned by p; permanent leaf walls never expire.
  for (const e of [...state.effects]) {
    if (e.owner !== p || e.left >= PERMANENT) continue;
    e.left--;
    if (e.left <= 0) {
      // A withered leaf wall leaves defensive armour behind on the tile.
      if (e.kind === "leaf") addEffect(state, e.c, e.r, "armor", e.owner, 4);
      state.effects = state.effects.filter((x) => x !== e);
      events.push({ type: "effectExpired", at: { c: e.c, r: e.r }, kind: e.kind });
    }
  }

  recomputeConnectivity(state);
  return events;
}

export const otherOf = otherPlayer;
