import { otherPlayer, tileAt } from "./board";
import { recomputeConnectivity } from "./connectivity";
import { PERMANENT } from "./types";
import type { EngineEvent, GameState, Player, PlayerMods, TileEffect } from "./types";

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

    // Enemy fire burns p's garrison; small garrisons are wiped out entirely.
    if (e.kind === "fire" && e.owner !== p && t.owner === p && t.soldiers > 0) {
      if (t.soldiers <= 5) {
        events.push({ type: "effectDamage", at: { c: t.c, r: t.r }, kind: "fire", lost: t.soldiers, wiped: true });
        t.soldiers = 0; t.owner = null; t.struct = null;
      } else {
        const keepRatio = 1 - 0.30 * glandCut(mods);
        const before = t.soldiers;
        t.soldiers = Math.round(t.soldiers * keepRatio);
        events.push({ type: "effectDamage", at: { c: t.c, r: t.r }, kind: "fire", lost: before - t.soldiers, wiped: false });
      }
    }

    if (e.kind === "venom" && e.owner !== p && t.owner === p && t.soldiers > 0) {
      const loss = Math.round(7 * glandCut(mods));
      const before = t.soldiers;
      t.soldiers = Math.max(0, t.soldiers - loss);
      const wiped = t.soldiers <= 0;
      if (wiped) { t.owner = null; t.struct = null; }
      events.push({ type: "effectDamage", at: { c: t.c, r: t.r }, kind: "venom", lost: before - t.soldiers, wiped });
    }
  }

  // Age effects owned by p; permanent leaf walls never expire.
  for (const e of [...state.effects]) {
    if (e.owner !== p || e.left >= PERMANENT) continue;
    e.left--;
    if (e.left <= 0) {
      // A withered leaf wall leaves defensive armour behind on the tile.
      if (e.kind === "leaf") addEffect(state, e.c, e.r, "armor", e.owner, 3);
      state.effects = state.effects.filter((x) => x !== e);
      events.push({ type: "effectExpired", at: { c: e.c, r: e.r }, kind: e.kind });
    }
  }

  recomputeConnectivity(state);
  return events;
}

export const otherOf = otherPlayer;
