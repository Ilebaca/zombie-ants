/**
 * Engine events → animations.
 *
 * This is the whole point of the event channel. The legacy build called `beginReveal()` and
 * `fxPop()` from inside the rules, which meant AI search animated thousands of imagined
 * futures — patched over with a global `G.searching` flag that suppressed effects. Here the
 * rules emit a description and this module decides how to dramatise it, so search is silent
 * for free and animation work can never reach the rules (CLAUDE.md §3).
 */
import { key } from "../engine";
import type { Coord, Direction, EngineEvent, Player } from "../engine";
import type { FxLayer } from "./fx";
import type { RevealTracker, RevealEdge } from "./reveal";
import { edgeFor } from "./reveal";

/** The tile an attack came from: the neighbour opposite the direction it travelled. */
export function sourceOf(at: Coord, movement: Direction): Coord {
  switch (movement) {
    case "R": return { c: at.c - 1, r: at.r };
    case "L": return { c: at.c + 1, r: at.r };
    case "D": return { c: at.c, r: at.r - 1 };
    default:  return { c: at.c, r: at.r + 1 };
  }
}

/** How many rally source lines to draw before it becomes visual noise. */
const MAX_RALLY_FLOWS = 14;

/** One streak step, matching FLOW_MS_PER_STEP in fx.ts. */
const FLOW_MS_PER_STEP = 260;

/**
 * Stagger between tiles dying in the same batch, and the point it stops growing.
 *
 * A venom hit that severs a long trail can destroy a dozen tiles at once. Spacing them
 * makes the collapse travel; letting the spacing run unbounded would leave the last tile
 * of a big collapse standing for seconds after the rest.
 */
const RUIN_STAGGER_MS = 70;
const RUIN_STAGGER_MAX = 6;
const ruin = (i: number): number => Math.min(i, RUIN_STAGGER_MAX) * RUIN_STAGGER_MS;

export interface AnimationSinks {
  reveal: RevealTracker;
  fx: FxLayer;
  /** Called for events the match screen surfaces as a toast or HUD change. */
  onNotice?: (event: EngineEvent) => void;
}

/**
 * Translate one action's events into reveals and flourishes.
 *
 * Tiles fill ONE AT A TIME, always. A `travel` is one reveal group covering its whole
 * path, and every other capture in the same batch joins a single ordered group too — so
 * sending troops four tiles down a row fills tile 2, then 3, then 4, then 5, and an
 * ability that claims six tiles fills them one after another. Every flourish (streak,
 * clash, pop) is delayed to meet its own tile's fill instead of firing on frame one.
 */
export function animate(events: readonly EngineEvent[], sinks: AnimationSinks): void {
  const { reveal, fx } = sinks;

  // A travel's trail is laid BEFORE its own event: `travel()` pushes one `veinLaid` per
  // step and only then the `travel` itself. So the path has to be known before the loop
  // starts — reacting to it when it arrives is too late, and every vein would already have
  // opened its own one-tile reveal. Those all start on the same frame, so the whole trail
  // flashed in at once instead of one tile after another.
  const onTravelPath = new Set<string>();
  /**
   * Which tiles a travel actually CLAIMED.
   *
   * `travel()` emits one `veinLaid` per step that was previously unowned, so this set is
   * exactly the new ground. The rest of the path is territory the player already held, and
   * re-filling it looks like the colony is being rebuilt from scratch every time troops
   * walk over it. Only the new tiles animate.
   */
  const claimed = new Set<string>();
  for (const e of events) {
    if (e.type === "travel") for (const p of e.path) onTravelPath.add(key(p.c, p.r));
    if (e.type === "veinLaid") claimed.add(key(e.at.c, e.at.r));
  }
  const covered = (at: Coord): boolean => onTravelPath.has(key(at.c, at.r));

  // Captures outside a travel are gathered so they can be revealed as one ordered run.
  const captures: Array<{
    at: Coord; edge: RevealEdge; prev: Player | null; src: Coord; owner: Player;
  }> = [];
  /** Tiles a fight was won on, so a wild garrison beaten off blanks out like an enemy tile. */
  const beaten = new Set<string>();
  // A won fight emits `combat` then `capture` for the same tile. The clash has to wait for
  // that tile's turn in the run, so it is held here and released with the capture.
  const clashes = new Map<string, { at: Coord; src: Coord; attacker: Player }>();
  /** How many tiles have already been destroyed in this batch, for the collapse stagger. */
  let ruins = 0;

  for (const e of events) {
    switch (e.type) {
      case "move":
        // Reinforcing our own tile: troops surge across, but nothing changes hands.
        fx.flow([e.from, e.to], e.owner);
        break;

      case "travel": {
        // The path includes the source at index 0; only the steps beyond it can be new.
        // Each keeps its place along the path, so the front crosses already-owned ground
        // at the same rate it crosses new ground — it just has nothing to light up there.
        const steps = e.path.slice(1);
        reveal.begin(
          steps
            .map((at, i) => ({ at, edge: edgeAlongPath(e.path, i + 1), prev: null, slot: i }))
            .filter((t) => claimed.has(key(t.at.c, t.at.r))),
        );
        fx.flow(e.path, e.owner);
        // The troops land when the front reaches the far end, not when the send is ordered.
        fx.pop(e.path[e.path.length - 1] as Coord, e.owner, reveal.stepMs(steps.length) * steps.length);
        break;
      }

      case "veinLaid":
        // Part of a travel's trail: already inside that group's single sweep.
        if (!covered(e.at)) reveal.begin([{ at: e.at, edge: "L", prev: null }]);
        break;

      case "combat":
        // Held until the capture that follows gives it a place in the run. A fight that
        // did not take the tile has no capture, so it is released at the end.
        if (e.won) beaten.add(key(e.at.c, e.at.r));
        clashes.set(key(e.at.c, e.at.r), {
          at: e.at, src: sourceOf(e.at, e.from), attacker: e.attacker,
        });
        break;

      case "capture": {
        if (covered(e.at)) { fx.pop(e.at, e.owner); break; }
        captures.push({
          at: e.at, edge: edgeFor(e.from), prev: e.previous,
          src: sourceOf(e.at, e.from), owner: e.owner,
        });
        break;
      }

      case "rally": {
        for (const s of e.sources.slice(0, MAX_RALLY_FLOWS)) fx.flow([s, e.to], e.owner);
        fx.pop(e.to, e.owner);
        break;
      }

      case "effectDamage":
        // A hit that killed the tile gets the destruction, not the clash: the tile has
        // already gone from the board and this is the only thing that says it was there.
        if (e.wiped) fx.crumble(e.at, e.owner, false, ruin(ruins++));
        else fx.clash(e.at);
        sinks.onNotice?.(e);
        break;

      case "veinPruned":
        // A trail losing an anchor collapses back to the nearest held tile, and the pruner
        // emits one pass at a time — so staggering by arrival makes the chain reaction read
        // as one thing unravelling rather than a row of tiles blinking out together.
        fx.crumble(e.at, e.owner, true, ruin(ruins++));
        break;

      case "effectApplied":
      case "effectExpired":
        break;

      case "hiveCaptured": {
        // Taking the queen hands over all five hive tiles at once and emits no `capture`
        // for any of them. Reveal them as one ordered group, queen first, so the hive
        // fills the same way every other capture does instead of snapping over.
        const cells = orderedFromQueen(e.cells);
        reveal.begin(cells.map((at) => ({ at, edge: "L" as RevealEdge, prev: null })));
        const step = reveal.stepMs(cells.length);
        cells.forEach((at, i) => fx.pop(at, e.owner, i * step + step));
        sinks.onNotice?.(e);
        break;
      }

      case "hiveAwake":
      case "hiveSurgeEnded":
      case "hiveRespawn":
      case "production":
      case "gameOver":
        sinks.onNotice?.(e);
        break;
    }
  }

  if (captures.length) {
    reveal.begin(captures.map(({ at, edge, prev }) => ({ at, edge, prev })));
    // Each flourish leaves as its tile's turn comes round, so they stay in step with the
    // fill rather than all firing on the first frame.
    const step = reveal.stepMs(captures.length);
    captures.forEach(({ src, at, owner, prev }, i) => {
      const k = key(at.c, at.r);
      const fight = clashes.get(k);
      if (fight) {
        clashes.delete(k);
        fx.flow([fight.src, fight.at], fight.attacker, i * step);
        fx.clash(fight.at, i * step + step);
      } else {
        fx.flow([src, at], owner, i * step);
      }
      // Ground that had to be beaten blanks out the way a destroyed tile does, and the
      // colony that beat it is filling underneath as the flash clears. Empty ground
      // destroys nothing, so it simply fills.
      if (prev || beaten.has(k)) fx.blink(at, prev, i * step);
      fx.pop(at, owner, i * step + step);
    });
  }

  // Fights that took no ground still have to be seen.
  for (const fight of clashes.values()) {
    fx.flow([fight.src, fight.at], fight.attacker);
    fx.clash(fight.at, FLOW_MS_PER_STEP);
  }
}

/**
 * The hive is a plus-shape: the queen at the centre and four guards around her. Filling
 * from the middle outwards reads as the colony taking her and spreading, which is what
 * happened; the grid order the engine hands over would fill it top to bottom.
 */
function orderedFromQueen(cells: readonly Coord[]): Coord[] {
  if (cells.length < 2) return cells.slice();
  const cx = cells.reduce((n, p) => n + p.c, 0) / cells.length;
  const cy = cells.reduce((n, p) => n + p.r, 0) / cells.length;
  return cells.slice().sort((a, b) =>
    (Math.abs(a.c - cx) + Math.abs(a.r - cy)) - (Math.abs(b.c - cx) + Math.abs(b.r - cy)));
}

/** Direction of travel into `path[i]`, as a fill edge. */
function edgeAlongPath(path: readonly Coord[], i: number): RevealEdge {
  const prev = path[i - 1] as Coord;
  const cur = path[i] as Coord;
  const movement: Direction =
    cur.c > prev.c ? "R" : cur.c < prev.c ? "L" : cur.r > prev.r ? "D" : "U";
  return edgeFor(movement);
}

/** Owners a set of events hands a tile to — used by the match screen for toasts. */
export function capturesBy(events: readonly EngineEvent[], p: Player): number {
  return events.filter((e) => e.type === "capture" && e.owner === p).length;
}
