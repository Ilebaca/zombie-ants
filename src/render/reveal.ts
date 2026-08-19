/**
 * The "territory flows in" reveal.
 *
 * A growth — a single move, or a whole long-send path — is ONE group revealed by a single
 * front sweeping along the tiles in order, so it reads as one body extending rather than
 * each tile filling separately.
 *
 * The legacy build stored this progress on the tile itself (`t.rv`, `t.rvDir`, `t.rvPrev`).
 * That put view state inside the engine, where the AI's snapshot/restore would copy it
 * around. Here it lives in a map keyed by coordinate, and the engine stays pure.
 */
import { key } from "../engine";
import type { Coord, Direction, Player } from "../engine";

/**
 * How long the fill front takes to cross ONE tile.
 *
 * The front moves at this speed whatever the length of the group, so a single capture and
 * the tenth step of a long Travel extend at exactly the same rate — that constant speed is
 * what makes the growth read as one body moving rather than tiles popping.
 */
export const REVEAL_MS_PER_TILE = 260;

/**
 * A long run would otherwise hold the player up: ten tiles at full speed is two and a half
 * seconds of watching. Past six tiles the per-tile time shortens so the whole run lands
 * within about a second and a half, still strictly one tile after another.
 */
export const REVEAL_MAX_MS = 1560;

export function revealStepMs(tiles: number): number {
  if (tiles <= 6) return REVEAL_MS_PER_TILE;
  return Math.max(110, REVEAL_MAX_MS / tiles);
}

/** Which edge of the cell the fill grows FROM. */
export type RevealEdge = "L" | "R" | "U" | "D";

/**
 * Engine directions describe where the troops moved TO. The fill has to grow from the
 * opposite edge — troops arriving from the west fill the cell starting at its west side.
 */
export function edgeFor(movement: Direction): RevealEdge {
  switch (movement) {
    case "R": return "L";
    case "L": return "R";
    case "D": return "U";
    default:  return "D";
  }
}

export interface RevealState {
  /** 0..1 fill progress; 1 = settled. */
  rv: number;
  edge: RevealEdge;
  /** Who held the tile before, so it can fade out underneath. */
  prev: Player | null;
}

interface Group {
  keys: string[];
  start: number;
  dur: number;
  n: number;
}

export class RevealTracker {
  private states = new Map<string, RevealState>();
  private groups: Group[] = [];

  /** Honour the OS reduced-motion setting: reveals snap to finished. */
  reduced = typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  begin(tiles: ReadonlyArray<{ at: Coord; edge: RevealEdge; prev: Player | null }>): void {
    if (!tiles.length) return;
    if (this.reduced) return;                       // nothing to animate; tiles draw settled

    const keys: string[] = [];
    for (const t of tiles) {
      const k = key(t.at.c, t.at.r);
      keys.push(k);
      this.states.set(k, { rv: 0, edge: t.edge, prev: t.prev });
    }
    const n = keys.length;
    this.groups.push({ keys, start: performance.now(), dur: revealStepMs(n) * n, n });
  }

  step(now: number): void {
    if (!this.groups.length) return;
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const g = this.groups[i] as Group;
      const raw = (now - g.start) / g.dur;
      const p = raw <= 0 ? 0 : (raw >= 1 ? 1 : raw);
      // Linear: one front advancing along the path at a constant tile-per-second rate.
      const front = p * g.n;

      for (let j = 0; j < g.n; j++) {
        const st = this.states.get(g.keys[j] as string);
        if (!st) continue;
        const d = front - j;
        st.rv = d <= 0 ? 0 : (d >= 1 ? 1 : d);
      }
      if (p >= 1) {
        for (const k of g.keys) this.states.delete(k);   // settled tiles need no entry
        this.groups.splice(i, 1);
      }
    }
  }

  /** How long one tile of a run of `n` takes to fill — the caller's cue for its flourishes. */
  stepMs(tiles: number): number { return revealStepMs(tiles); }

  /** Reveal state for a tile, or undefined when it is settled (draw at full opacity). */
  get(c: number, r: number): RevealState | undefined {
    return this.states.get(key(c, r));
  }

  /** Progress 0..1 for a tile; 1 when settled. */
  progress(c: number, r: number): number {
    return this.states.get(key(c, r))?.rv ?? 1;
  }

  get animating(): boolean {
    return this.groups.length > 0;
  }

  clear(): void {
    this.states.clear();
    this.groups.length = 0;
  }
}
