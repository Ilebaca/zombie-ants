/**
 * Engine events → animations.
 *
 * This is the whole point of the event channel. The legacy build called `beginReveal()` and
 * `fxPop()` from inside the rules, which meant AI search animated thousands of imagined
 * futures — patched over with a global `G.searching` flag that suppressed effects. Here the
 * rules emit a description and this module decides how to dramatise it, so search is silent
 * for free and animation work can never reach the rules (CLAUDE.md §3).
 */
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

export interface AnimationSinks {
  reveal: RevealTracker;
  fx: FxLayer;
  /** Called for events the match screen surfaces as a toast or HUD change. */
  onNotice?: (event: EngineEvent) => void;
}

/**
 * Translate one action's events into reveals and flourishes.
 *
 * A `travel` is deliberately handled as a single reveal group covering the whole path, so
 * the trail reads as one body extending rather than each tile popping in separately.
 */
export function animate(events: readonly EngineEvent[], sinks: AnimationSinks): void {
  const { reveal, fx } = sinks;

  // Tiles laid by the travel currently being processed, in path order.
  let pendingTravelPath: Coord[] | null = null;

  for (const e of events) {
    switch (e.type) {
      case "move":
        // Reinforcing our own tile: troops surge across, but nothing changes hands.
        fx.flow([e.from, e.to], e.owner);
        break;

      case "travel": {
        // The path includes the source at index 0; only the steps beyond it are revealed.
        const steps = e.path.slice(1);
        reveal.begin(steps.map((at, i) => ({
          at,
          edge: edgeAlongPath(e.path, i + 1),
          prev: null,
        })));
        fx.flow(e.path, e.owner);
        fx.pop(e.path[e.path.length - 1] as Coord, e.owner);
        pendingTravelPath = steps;
        break;
      }

      case "veinLaid":
        // Covered by the travel reveal group above; a lone vein would break the single front.
        if (!pendingTravelPath) {
          reveal.begin([{ at: e.at, edge: "L", prev: null }]);
        }
        break;

      case "combat":
        // Flow in, then clash. A won fight also emits `capture`, which adds the reveal.
        fx.flow([sourceOf(e.at, e.from), e.at], e.attacker);
        fx.clash(e.at);
        break;

      case "capture": {
        const src = sourceOf(e.at, e.from);
        // A capture that is part of a travel is already inside the group's sweep.
        const inTravel = pendingTravelPath?.some((p) => p.c === e.at.c && p.r === e.at.r);
        if (!inTravel) {
          reveal.begin([{ at: e.at, edge: edgeFor(e.from), prev: e.previous }]);
          fx.flow([src, e.at], e.owner);
        }
        fx.pop(e.at, e.owner);
        break;
      }

      case "rally": {
        for (const s of e.sources.slice(0, MAX_RALLY_FLOWS)) fx.flow([s, e.to], e.owner);
        fx.pop(e.to, e.owner);
        break;
      }

      case "effectDamage":
        fx.clash(e.at);
        sinks.onNotice?.(e);
        break;

      case "veinPruned":
      case "effectApplied":
      case "effectExpired":
        break;

      case "hiveAwake":
      case "hiveCaptured":
      case "hiveRespawn":
      case "production":
      case "gameOver":
        sinks.onNotice?.(e);
        break;
    }
  }
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
