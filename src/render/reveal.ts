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
 * How long the fill front takes to cross ONE tile, ON AVERAGE.
 *
 * Every run takes this long per tile whatever its length, so a single capture and a ten-step
 * Travel are paced the same way — but WITHIN a run the front is not steady (see `frontEase`).
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

/**
 * THE FRONT LEAVES FAST AND SETTLES — it does not run at a constant rate.
 *
 * It used to, and there was a test insisting on it: equal ground in equal time, so a single
 * capture and the tenth step of a long send extended identically. That is the honest way to
 * animate a thing with no mass, and it is exactly what it looked like — a bar filling. What
 * is actually moving is a column of ants, and anything that moves under its own power
 * leaves quickly and arrives slowly.
 *
 * IT HAS TO BE STEEP TO BE SEEN AT ALL. The first version was a gentle four-to-one and the
 * honest report from the phone was "I don't see any difference" — which makes sense: most
 * of what a player does is a SINGLE tile, a quarter of a second end to end, and a mild
 * curve inside a quarter of a second is not something an eye picks up. At the numbers below
 * the front leaves at 2.6x its average and arrives at 0.2x: half the distance is covered in
 * the first quarter of the time.
 *
 * It is a BLEND of a straight line and an ease-out, and that is the whole of the tuning. A
 * pure ease-out arrives with ZERO speed, so the last tile of a send never quite lands — it
 * asymptotes, which reads as the animation stalling rather than settling. The line mixed
 * back in is what puts a floor under the final speed.
 *
 * Two dials. `FRONT_EASE` is how much of the curve is ease rather than line — 0 is the old
 * constant rate, 1 stalls at the end. `FRONT_POWER` is how sharply that ease falls away:
 * 2 is gentle, 3 is what a thrown thing does, higher is a lunge.
 */
export const FRONT_EASE = 0.8;
export const FRONT_POWER = 3;

/** Where the front is, 0..1 along the run, at fraction `p` of the run's time. */
export function frontEase(p: number): number {
  const t = p <= 0 ? 0 : (p >= 1 ? 1 : p);
  return (1 - FRONT_EASE) * t + FRONT_EASE * (1 - Math.pow(1 - t, FRONT_POWER));
}

/**
 * The inverse: what fraction of the time puts the front `e` of the way along.
 *
 * The animator needs it. Every flourish — the streak, the clash, the pop — is scheduled for
 * the moment the front reaches its tile, and multiplying an index by an average step only
 * answers that while the front is steady.
 *
 * SEARCHED RATHER THAN SOLVED, on purpose. The curve is a cubic and inverting one in closed
 * form is Cardano's formula — which would then have to be rewritten the day `FRONT_POWER`
 * moves, and the whole point of that constant is that it is a dial. `frontEase` rises
 * strictly, so forty halvings land within a millionth of a millionth either way, and this
 * runs once per tile of a batch rather than per frame.
 */
export function frontEaseAt(e: number): number {
  const want = e <= 0 ? 0 : (e >= 1 ? 1 : e);
  if (want === 0 || want === 1) return want;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (frontEase(mid) < want) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
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
  /** Where each key sits in the run. Usually 0,1,2… but see `begin`. */
  slots: number[];
  start: number;
  dur: number;
  /** Total slots the front crosses, which can exceed `keys.length`. */
  span: number;
}

export class RevealTracker {
  private states = new Map<string, RevealState>();
  private groups: Group[] = [];

  /** Honour the OS reduced-motion setting: reveals snap to finished. */
  reduced = typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  /**
   * Start one reveal front over a run of tiles.
   *
   * A tile may carry a `slot`: its position along the run, which is not always its
   * position in this list. A long send crosses ground the player ALREADY owns, and those
   * tiles must not fill again — they are already theirs. Only the newly claimed ones are
   * passed in, but the front still has to cross the whole distance at a constant rate, so
   * each keeps its true place in the path and the gaps are simply time in which nothing
   * lights up. Without that, a send over four owned tiles and one empty one would fill the
   * empty one instantly instead of when the troops actually reach it.
   */
  /**
   * `at` starts the front LATER than now. Every tile is registered at once either way, so
   * it draws unfilled from this moment — which is what the match opening needs: the
   * colonies must not be sitting there while the camera is still coming down through the
   * canopy, only to be revealed once it lands (render/intro.ts).
   */
  begin(
    tiles: ReadonlyArray<{ at: Coord; edge: RevealEdge; prev: Player | null; slot?: number }>,
    at = performance.now(),
  ): void {
    if (!tiles.length) return;
    if (this.reduced) return;                       // nothing to animate; tiles draw settled

    const keys: string[] = [];
    const slots: number[] = [];
    let span = 0;
    tiles.forEach((t, i) => {
      const k = key(t.at.c, t.at.r);
      const slot = t.slot ?? i;
      keys.push(k);
      slots.push(slot);
      if (slot + 1 > span) span = slot + 1;
      this.states.set(k, { rv: 0, edge: t.edge, prev: t.prev });
    });
    this.groups.push({ keys, slots, start: at, dur: revealStepMs(span) * span, span });
  }

  step(now: number): void {
    if (!this.groups.length) return;
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const g = this.groups[i] as Group;
      const raw = (now - g.start) / g.dur;
      const p = raw <= 0 ? 0 : (raw >= 1 ? 1 : raw);
      // ONE front along the path, leaving fast and settling at the far end (`frontEase`).
      const front = frontEase(p) * g.span;

      for (let j = 0; j < g.keys.length; j++) {
        const st = this.states.get(g.keys[j] as string);
        if (!st) continue;
        const d = front - (g.slots[j] as number);
        st.rv = d <= 0 ? 0 : (d >= 1 ? 1 : d);
      }
      if (p >= 1) {
        for (const k of g.keys) this.states.delete(k);   // settled tiles need no entry
        this.groups.splice(i, 1);
      }
    }
  }

  /** The AVERAGE time one tile of a run of `n` takes to fill. */
  stepMs(tiles: number): number { return revealStepMs(tiles); }

  /** How long the whole run takes, front to back. */
  runMs(tiles: number): number {
    const span = Math.max(1, tiles);
    return revealStepMs(span) * span;
  }

  /**
   * When the front reaches `slot`, in milliseconds from the run's start.
   *
   * This is what a flourish is scheduled against. Multiplying the slot by `stepMs` was the
   * same answer while the front ran at a constant rate and is wrong now — the streak would
   * set off after the ground under it had already filled.
   */
  slotMs(slot: number, tiles: number): number {
    const span = Math.max(1, tiles);
    return frontEaseAt(slot / span) * this.runMs(span);
  }

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
