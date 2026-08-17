/**
 * The nine species abilities.
 *
 * An ability is a free extra action: it does NOT consume the turn (except Tunnelling, which
 * the UI ends the turn on deliberately), and it goes on cooldown only if it actually fired.
 * Every one returns EngineEvent[] like any other action — the engine still never animates.
 *
 * Scatter effects use the seeded generator on GameState, never `Math.random()`, so search
 * and replays stay deterministic (see random.ts).
 */
import { RESEARCH_MAX } from "./config";
import {
  allTiles, isHiveTerrain, neighbours, nestTile, otherPlayer, tileAt,
} from "./board";
import { isConnected, recomputeConnectivity } from "./connectivity";
import { addEffect, effectAt } from "./effects";
import { speciesOf } from "./species";
import { shuffle } from "./random";
import { PERMANENT } from "./types";
import type {
  Ability, Coord, EngineEvent, GameState, Player, PlayerMods, Tile,
} from "./types";
import { blockedByEnemyLeaf, checkWipe, keepOn } from "./actions";

/* ------------------------------------------------------- RESEARCH SCALING */

/** Exocrine Reservoir level. The AI always passes NEUTRAL_MODS, so it scales at zero. */
const abilityLevel = (mods: PlayerMods): number => mods.reservoir;

/** Cooldown, shortened by exactly one turn and only at max research. */
export function abilityCooldown(ability: Ability, mods: PlayerMods): number {
  return Math.max(2, ability.cooldown - (abilityLevel(mods) >= RESEARCH_MAX ? 1 : 0));
}

/** Each level hits slightly harder. */
const power = (mods: PlayerMods): number => 1 + 0.06 * abilityLevel(mods);

/** At most +1 turn of duration or +1 tile of reach. */
const bonus = (mods: PlayerMods): number => Math.floor(abilityLevel(mods) / 3);

/**
 * TOTAL permanent leaf walls this player may ever hold — not per cast (CLAUDE.md §5).
 * Leafcutter only, and only from Reservoir level 2 upward: 1/2/3.
 */
export function permanentLeafCap(state: GameState, p: Player, mods: PlayerMods): number {
  if (speciesOf(state.species[p]).ability.kind !== "leaf") return 0;
  return Math.min(3, Math.max(0, abilityLevel(mods) - 1));
}

export const abilityOf = (state: GameState, p: Player): Ability =>
  speciesOf(state.species[p]).ability;

export function abilityReady(state: GameState, p: Player): boolean {
  return state.cooldown[p] <= 0 && !state.over;
}

/* --------------------------------------------------------------- HELPERS */

/** Your connected tiles that touch an enemy, a wild tile or the hive. */
export function frontline(state: GameState, p: Player): Tile[] {
  const enemy = otherPlayer(p);
  return allTiles(state).filter((t) => {
    if (t.owner !== p || !isConnected(state, t)) return false;
    return neighbours(state, t).some(
      (n) => n.owner === enemy || (n.owner === null && n.terrain !== "blocked"),
    );
  });
}

/** The enemy's side of the diagonal. */
export function onEnemyHalf(c: number, r: number, owner: Player): boolean {
  return owner === "ai" ? c < r : c > r;
}

/** Soldiers that could leave their tile without emptying it. */
export function sparePool(state: GameState, p: Player): number {
  let n = 0;
  for (const t of allTiles(state)) {
    if (t.owner === p && isConnected(state, t)) n += Math.max(0, t.soldiers - keepOn(t));
  }
  return n;
}

/**
 * Muster `n` workers from the colony, largest garrisons first.
 * Nothing is created from nothing: if the colony cannot pay, nothing is taken.
 */
export function payWorkers(state: GameState, p: Player, n: number): boolean {
  if (sparePool(state, p) < n) return false;
  const tiles = allTiles(state).filter((t) => t.owner === p && isConnected(state, t));
  let need = n;
  let guard = 0;
  while (need > 0 && guard++ < 9999) {
    tiles.sort((a, b) => b.soldiers - a.soldiers);
    const t = tiles[0];
    if (!t || t.soldiers <= keepOn(t)) break;
    t.soldiers--;
    need--;
  }
  return need === 0;
}

/** Empty, unguarded ground a gallery may be dug to. */
export function tunnelTargets(state: GameState): Coord[] {
  return allTiles(state)
    .filter((t) => t.owner === null && t.guard === 0 && (t.terrain === "ground" || t.terrain === "resource"))
    .map((t) => ({ c: t.c, r: t.r }));
}

/** Any captured ground/resource tile becomes a producing stable. Nests keep their role. */
function promote(t: Tile): void {
  if (t.struct !== "nest" && (t.terrain === "ground" || t.terrain === "resource")) t.struct = "stable";
}

export interface AbilityOptions {
  /** Tunnelling only: the tile the player tapped. The AI picks its own if omitted. */
  target?: Coord | null;
}

/* ------------------------------------------------------------ ACTIVATION */

/**
 * Fire `p`'s ability. Returns [] if it had no legal effect — the caller should treat that
 * as "nothing happened" and leave the cooldown alone.
 */
export function activateAbility(
  state: GameState, p: Player, mods: PlayerMods, opts: AbilityOptions = {},
): EngineEvent[] {
  if (!abilityReady(state, p)) return [];
  const ability = abilityOf(state, p);
  const events: EngineEvent[] = [];

  let fired = false;
  switch (ability.kind) {
    case "bud":     fired = castBud(state, p, mods, events); break;
    case "leaf":    fired = castLeaf(state, p, mods, events); break;
    case "fire":    fired = castFire(state, p, mods, events); break;
    case "swarm":   fired = castSwarm(state, p, mods, events); break;
    case "spread":  fired = castSpread(state, p, events); break;
    case "fortify": fired = castFortify(state, p, mods, events); break;
    case "venom":   fired = castVenom(state, p, mods, events); break;
    case "flee":    fired = castFlee(state, p, mods, events); break;
    case "tunnel":  fired = castTunnel(state, p, opts.target ?? null, events); break;
  }
  if (!fired) return [];

  state.cooldown[p] = abilityCooldown(ability, mods);
  events.unshift({ type: "abilityCast", owner: p, kind: ability.kind, name: ability.name });

  recomputeConnectivity(state);
  checkWipe(state, events);
  return events;
}

/* ------------------------------------------------------------- THE NINE */

/** Pharaoh — every tile with 40+ troops seeds a new colony next door, for free. */
function castBud(state: GameState, p: Player, mods: PlayerMods, events: EngineEvent[]): boolean {
  const buds: Array<{ spot: Tile; count: number }> = [];
  for (const t of allTiles(state)) {
    if (t.owner !== p || t.soldiers < 40) continue;
    const spot = neighbours(state, t).find(
      (n) => n.owner === null && n.guard === 0 && n.terrain === "ground" && !blockedByEnemyLeaf(state, n, p),
    );
    if (spot) buds.push({ spot, count: Math.max(2, Math.round(t.soldiers * 0.30 * power(mods))) });
  }
  for (const b of buds) {
    b.spot.owner = p;                     // the parent loses nothing — this is budding, not splitting
    b.spot.soldiers = b.count;
    promote(b.spot);
    events.push({ type: "budded", at: { c: b.spot.c, r: b.spot.r }, owner: p, count: b.count });
  }
  return buds.length > 0;
}

/**
 * Leafcutter — walls the border with leaves and armours the tiles behind them.
 *
 * At most ONE fresh leaf per cast becomes permanent, and only while the player's running
 * total is under their cap (CLAUDE.md §5). Permanent leaves may pair but never cluster 3+.
 */
function castLeaf(state: GameState, p: Player, mods: PlayerMods, events: EngineEvent[]): boolean {
  const cap = permanentLeafCap(state, p, mods);
  let permanentHeld = state.effects.filter(
    (e) => e.kind === "leaf" && e.owner === p && e.left >= PERMANENT,
  ).length;

  const turns = 4 + bonus(mods);
  const seen = new Set<string>();
  const fresh: Tile[] = [];

  for (const t of frontline(state, p)) {
    for (const n of neighbours(state, t)) {
      if (n.owner === null && n.terrain === "ground" && !effectAt(state, n.c, n.r, "leaf")) {
        const k = `${n.c},${n.r}`;
        if (!seen.has(k)) {
          seen.add(k);
          addEffect(state, n.c, n.r, "leaf", p, turns);
          fresh.push(n);
          events.push({ type: "effectApplied", at: { c: n.c, r: n.r }, kind: "leaf", owner: p, turns });
        }
      }
    }
    // the garden armours the border immediately, not only once the walls wither
    if (!effectAt(state, t.c, t.r, "armor")) {
      addEffect(state, t.c, t.r, "armor", p, turns);
      events.push({ type: "effectApplied", at: { c: t.c, r: t.r }, kind: "armor", owner: p, turns });
    }
  }

  if (permanentHeld < cap && fresh.length) {
    const isPermanent = (c: number, r: number): boolean => {
      const e = effectAt(state, c, r, "leaf");
      return !!e && e.left >= PERMANENT;
    };
    for (const n of shuffle(state, [...fresh])) {
      const touching = neighbours(state, n).filter((nb) => isPermanent(nb.c, nb.r)).length;
      if (touching >= 2) continue;                        // would make a cluster of 3+
      const e = effectAt(state, n.c, n.r, "leaf");
      if (!e) continue;
      e.left = PERMANENT;
      permanentHeld++;
      break;                                              // exactly one new permanent leaf per cast
    }
  }
  return seen.size > 0;
}

/** Fire Ant — the border ignites. Burns enemies, wild garrisons and the hive alike. */
function castFire(state: GameState, p: Player, mods: PlayerMods, events: EngineEvent[]): boolean {
  const turns = 3 + bonus(mods);
  const seen = new Set<string>();
  for (const t of allTiles(state)) {
    if (t.owner !== p || !isConnected(state, t)) continue;
    for (const n of neighbours(state, t)) {
      if (n.terrain === "blocked") continue;
      if (n.struct === "nest") continue;                  // bases are immune to abilities
      if (n.owner === p) continue;
      const k = `${n.c},${n.r}`;
      if (seen.has(k)) continue;
      seen.add(k);
      addEffect(state, n.c, n.r, "fire", p, turns);
      events.push({ type: "effectApplied", at: { c: n.c, r: n.r }, kind: "fire", owner: p, turns });
    }
  }
  return seen.size > 0;
}

/**
 * Army Ant — bordering enemy garrisons are devoured into the colony.
 *
 * Targets are snapshotted at cast time. Resolving while mutating let a tile captured by
 * the bite seed new targets, and the swarm cascaded across the whole map (CLAUDE.md §5).
 */
function castSwarm(state: GameState, p: Player, mods: PlayerMods, events: EngineEvent[]): boolean {
  const enemy = otherPlayer(p);
  const targets: Array<{ from: Tile; into: Tile }> = [];

  for (const t of allTiles(state)) {
    if (t.owner !== enemy || t.struct === "nest" || t.soldiers <= 0) continue;
    const into = neighbours(state, t).find((n) => n.owner === p && n.struct !== "nest");
    if (into) targets.push({ from: t, into });
  }

  for (const { from, into } of targets) {
    const bite = Math.max(1, Math.round(from.soldiers * Math.min(0.50, 0.15 * power(mods))));
    from.soldiers -= bite;
    into.soldiers += bite;
    events.push({
      type: "devoured",
      at: { c: from.c, r: from.r }, into: { c: into.c, r: into.r }, owner: p, count: bite,
    });
    if (from.soldiers <= 0) {
      from.owner = p;
      from.soldiers = 1;
      promote(from);
      events.push({ type: "capture", at: { c: from.c, r: from.r }, owner: p, from: "R", previous: enemy });
    }
  }
  return targets.length > 0;
}

/** Weaver — claim every bordering empty tile on the enemy's half of the map. */
function castSpread(state: GameState, p: Player, events: EngineEvent[]): boolean {
  const seen = new Set<string>();
  const claims: Tile[] = [];
  for (const t of allTiles(state)) {
    if (t.owner !== p) continue;
    for (const n of neighbours(state, t)) {
      if (n.owner !== null || n.guard !== 0 || n.terrain !== "ground") continue;
      if (!onEnemyHalf(n.c, n.r, p) || blockedByEnemyLeaf(state, n, p)) continue;
      const k = `${n.c},${n.r}`;
      if (seen.has(k)) continue;
      seen.add(k);
      claims.push(n);
    }
  }
  for (const n of claims) {
    n.owner = p;
    n.soldiers = 1;
    promote(n);
    events.push({ type: "capture", at: { c: n.c, r: n.r }, owner: p, from: "R", previous: null });
  }
  return claims.length > 0;
}

/** Carpenter — the whole colony braces, and the frontline thickens. Veins are skipped. */
function castFortify(state: GameState, p: Player, mods: PlayerMods, events: EngineEvent[]): boolean {
  state.shield[p] = 3 + bonus(mods);
  for (const t of frontline(state, p)) {
    if (t.struct !== "stable" && t.struct !== "nest") continue;    // never a vein (CLAUDE.md §4.5)
    const gained = Math.max(2, Math.round(t.soldiers * 0.12 * power(mods)));
    t.soldiers += gained;
    events.push({ type: "fortified", at: { c: t.c, r: t.r }, owner: p, gained });
  }
  return true;
}

/**
 * Bullet Ant — a scattershot barrage over the whole board, unreliable on purpose.
 * Your own tiles are immune and no nest can be hit.
 */
function castVenom(state: GameState, p: Player, mods: PlayerMods, events: EngineEvent[]): boolean {
  const pool = allTiles(state).filter((t) => t.terrain !== "blocked" && t.struct !== "nest");
  shuffle(state, pool);
  const hits = Math.max(8, Math.min(20, Math.round(pool.length * 0.10)));
  const turns = 3 + bonus(mods);

  for (const t of pool.slice(0, hits)) {
    if (t.owner === p) continue;                                    // never your own colony
    addEffect(state, t.c, t.r, "venom", p, turns);
    events.push({ type: "effectApplied", at: { c: t.c, r: t.r }, kind: "venom", owner: p, turns });
  }
  return true;                                                      // the barrage always launches
}

/**
 * Demon — terror pheromone. Mobile enemy garrisons within reach flee directly away.
 *
 * Flee relocates garrisons ONLY. It must never prune veins or break structure: doing so
 * destroyed trails and detached units (CLAUDE.md §5). Veins, tunnels, resources, nests and
 * hive tiles cannot be pushed.
 */
function castFlee(state: GameState, p: Player, mods: PlayerMods, events: EngineEvent[]): boolean {
  const enemy = otherPlayer(p);
  const reach = 3 + bonus(mods);
  const mine = allTiles(state).filter((t) => t.owner === p);
  if (!mine.length) return false;

  const distanceToMe = (c: number, r: number): number => {
    let best = 99;
    for (const t of mine) best = Math.min(best, Math.abs(c - t.c) + Math.abs(r - t.r));
    return best;
  };
  const canLandOn = (c: number, r: number): boolean => {
    const t = tileAt(state, c, r);
    if (!t) return false;
    if (t.terrain === "blocked" || isHiveTerrain(t)) return false;
    if (t.owner === p || t.struct === "nest") return false;
    return true;
  };

  const fleers = allTiles(state).filter((t) => {
    if (t.owner !== enemy || t.struct === "nest") return false;
    if (t.struct === "vein" || t.tunnel) return false;              // trails and galleries stay put
    if (isHiveTerrain(t) || t.terrain === "blocked") return false;
    if (t.terrain === "resource") return false;                     // dug-in resources can't be pushed
    return distanceToMe(t.c, t.r) <= reach;
  });
  if (!fleers.length) return false;

  const sources = new Set(fleers.map((t) => `${t.c},${t.r}`));
  const placements = new Map<string, number>();

  for (const e of fleers) {
    // run directly away from the nearest tile of mine, until beyond reach or off the board
    let nearest = mine[0] as Tile;
    let best = 99;
    for (const t of mine) {
      const d = Math.abs(e.c - t.c) + Math.abs(e.r - t.r);
      if (d < best) { best = d; nearest = t; }
    }
    let dx = Math.sign(e.c - nearest.c), dy = Math.sign(e.r - nearest.r);
    if (dx === 0 && dy === 0) dx = 1;

    let cc = e.c, cr = e.r, tc = e.c, tr = e.r, steps = 0;
    while (steps < state.size * 2) {
      const nc = cc + dx, nr = cr + dy;
      if (nc < 0 || nr < 0 || nc >= state.size || nr >= state.size) break;
      cc = nc; cr = nr; steps++;
      if (canLandOn(cc, cr)) {
        tc = cc; tr = cr;
        if (distanceToMe(cc, cr) > reach) break;
      }
    }
    const k = `${tc},${tr}`;
    placements.set(k, (placements.get(k) ?? 0) + e.soldiers);
    events.push({
      type: "fled",
      from: { c: e.c, r: e.r },
      to: tc === e.c && tr === e.r ? null : { c: tc, r: tr },
      owner: enemy,
      count: e.soldiers,
    });
  }

  // vacate every tile that actually emptied — but only garrisons, never structure
  for (const e of fleers) {
    if (placements.has(`${e.c},${e.r}`)) continue;
    e.owner = null; e.soldiers = 0; e.struct = null; e.guard = 0; e.hidden = false;
  }

  for (const [k, soldiers] of placements) {
    const parts = k.split(",");
    const t = tileAt(state, Number(parts[0]), Number(parts[1]));
    if (!t) continue;
    const base = t.owner === enemy && !sources.has(k) ? t.soldiers : 0;
    t.owner = enemy;
    t.soldiers = base + soldiers;
    promote(t);
    t.hidden = false;
  }
  return true;
}

/** Ghost — dig a gallery anywhere. The mouth is always connected and must hold 5 workers. */
function castTunnel(state: GameState, p: Player, target: Coord | null, events: EngineEvent[]): boolean {
  let best: Tile | null = target ? tileAt(state, target.c, target.r) ?? null : null;

  if (!best) {
    // AI: a beachhead as close to the enemy nest as possible, but never on top of it.
    const foe = nestTile(state, otherPlayer(p));
    let bestDistance = Infinity;
    for (const v of tunnelTargets(state)) {
      const t = tileAt(state, v.c, v.r);
      if (!t) continue;
      if (!foe) { best ??= t; continue; }
      const d = Math.abs(t.c - foe.c) + Math.abs(t.r - foe.r);
      if (d < 1) continue;
      if (d < bestDistance) { bestDistance = d; best = t; }
    }
  }

  if (!best || best.owner !== null || best.guard > 0) return false;
  if (best.terrain !== "ground" && best.terrain !== "resource") return false;
  if (!payWorkers(state, p, 5)) return false;                      // the diggers march from your own tiles

  best.owner = p;
  best.tunnel = true;
  best.struct = "stable";
  best.soldiers = 5;
  best.hidden = false;
  events.push({ type: "tunnelDug", at: { c: best.c, r: best.r }, owner: p });
  return true;
}
