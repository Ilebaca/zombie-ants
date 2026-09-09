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

/**
 * TWO ACTIONS IN ONE TURN HAVE TO READ AS TWO THINGS.
 *
 * An ability is a free extra action (§4.10), so one enemy turn can destroy a tile out of
 * the middle of a line and then march a column along the ground that opened. Both halves
 * are legal, they arrive as ONE batch, and played on the same frame the destruction
 * happens under the comet — which from the sofa is the long move doing the destroying.
 * Reported twice from real matches in exactly those words.
 *
 * So the march waits. The cast resolves, the tile is seen to go, and only then do the
 * troops set off. It is a delay on the FLOURISHES and the fill, never on the board: the
 * engine has already finished the turn and the searched board lands whole (§ the AI's move
 * lands in the same tick as the events).
 */
const SECOND_ACT_MS = 420;

/** The verbs an ARMY plays. Everything before the first of them in a batch is the cast. */
const MARCH = new Set<EngineEvent["type"]>(["move", "travel", "rally"]);

/**
 * How long the march in this batch waits for the cast in front of it.
 *
 * Exported because the SCREEN has to know too: it holds the turn open for the animation to
 * finish, and a batch that plays for a beat longer needs that beat before the board is
 * handed back (`ui/match.ts`).
 */
export function actGapOf(events: readonly EngineEvent[]): number {
  const march = events.findIndex((e) => MARCH.has(e.type));
  if (march <= 0) return 0;
  // A TRAVEL'S OWN TRAIL DOES NOT COUNT AS A CAST. `travel()` pushes one `veinLaid` per
  // step and only then the travel itself, so those always sit in front of the march and
  // belong to it — counted as a first act, every long send would wait for itself.
  return events.slice(0, march).some((e) => e.type !== "veinLaid") ? SECOND_ACT_MS : 0;
}


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
  /**
   * Is this tile inside a travel's OWN reveal run?
   *
   * Being on the path is not enough, and reading it that way was a real bug. The travel's
   * run is filtered to the tiles it CLAIMED — the ones that got a `veinLaid`, which only
   * fires over ground that was empty. A tile the same turn had already taken off the other
   * colony (an ability is a free extra action, §4.10) is on the path and NOT in that run,
   * so skipping its capture left it with no fill and no white-out: it was simply the other
   * colour on the next frame, under a comet flying across it. From the sofa that reads as
   * the enemy moving straight through your line, which is exactly how it was reported.
   */
  const inTravelRun = (at: Coord): boolean => {
    const k = key(at.c, at.r);
    return onTravelPath.has(k) && claimed.has(k);
  };

  /**
   * Where the army's half of the turn starts.
   *
   * `aiTurn` casts first and moves second, so everything before the first march verb is
   * what the ability did. A turn that only moves has its march at index 0 and waits for
   * nothing; a turn that only casts has no march at all.
   */
  const march = events.findIndex((e) => MARCH.has(e.type));
  const actGap = actGapOf(events);
  /**
   * The march's half of the batch starts at the first march verb — but a travel's own
   * `veinLaid` trail is emitted just before it and belongs with it, so the boundary walks
   * back over those.
   */
  const secondAct = actGap ? backOverTrail(events, march) : -1;
  /** How long this event waits: nothing for the cast, a beat for the march after it. */
  const waitAt = (i: number): number => (secondAct >= 0 && i >= secondAct ? actGap : 0);

  // Captures outside a travel are gathered so they can be revealed as one ordered run.
  const captures: Array<{
    at: Coord; edge: RevealEdge; prev: Player | null; src: Coord; owner: Player; late: number;
  }> = [];
  /** Tiles a fight was won on, so a wild garrison beaten off blanks out like an enemy tile. */
  const beaten = new Set<string>();
  /** Garrisons routed by a terror pheromone, gathered so the whole rout moves as one run. */
  const routed: Array<{ from: Coord; to: Coord; owner: Player; claimed: boolean }> = [];
  // A won fight emits `combat` then `capture` for the same tile. The clash has to wait for
  // that tile's turn in the run, so it is held here and released with the capture.
  const clashes = new Map<string, { at: Coord; src: Coord; attacker: Player; late: number }>();
  /** How many tiles have already been destroyed in this batch, for the collapse stagger. */
  let ruins = 0;

  for (const [i, e] of events.entries()) {
    const late = waitAt(i);
    switch (e.type) {
      case "move":
        // Reinforcing our own tile: troops surge across, but nothing changes hands.
        fx.flow([e.from, e.to], e.owner, late);
        break;

      case "travel": {
        // The path includes the source at index 0; only the steps beyond it can be new.
        // Each keeps its place along the path, so the front crosses already-owned ground
        // at the same rate it crosses new ground — it just has nothing to light up there.
        const steps = e.path.slice(1);
        reveal.begin(
          steps
            .map((at, n) => ({ at, edge: edgeAlongPath(e.path, n + 1), prev: null, slot: n }))
            .filter((t) => claimed.has(key(t.at.c, t.at.r))),
          performance.now() + late,
        );
        fx.flow(e.path, e.owner, late);
        // The troops land when the front reaches the far end, not when the send is ordered.
        fx.pop(e.path[e.path.length - 1] as Coord, e.owner, late + reveal.runMs(steps.length));
        break;
      }

      case "veinLaid":
        // Part of a travel's trail: already inside that group's single sweep.
        if (!inTravelRun(e.at)) {
          reveal.begin([{ at: e.at, edge: "L", prev: null }], performance.now() + late);
        }
        break;

      case "combat":
        // Held until the capture that follows gives it a place in the run. A fight that
        // did not take the tile has no capture, so it is released at the end.
        if (e.won) beaten.add(key(e.at.c, e.at.r));
        clashes.set(key(e.at.c, e.at.r), {
          at: e.at, src: sourceOf(e.at, e.from), attacker: e.attacker, late,
        });
        break;

      case "capture": {
        if (inTravelRun(e.at)) { fx.pop(e.at, e.owner, late); break; }
        captures.push({
          at: e.at, edge: edgeFor(e.from), prev: e.previous,
          src: sourceOf(e.at, e.from), owner: e.owner, late,
        });
        break;
      }

      case "rally": {
        for (const s of e.sources.slice(0, MAX_RALLY_FLOWS)) fx.flow([s, e.to], e.owner, late);
        fx.pop(e.to, e.owner, late);
        break;
      }

      case "effectDamage":
        // A hit that killed the tile gets the destruction, not the clash: the tile has
        // already gone from the board and this is the only thing that says it was there.
        if (e.wiped) fx.crumble(e.at, e.owner, false, late + ruin(ruins++));
        else fx.clash(e.at, late);
        break;

      case "fled":
        // Nowhere to run: the garrison stayed where it was, and nothing happened to draw.
        if (e.to) routed.push({ from: e.from, to: e.to, owner: e.owner, claimed: e.claimed });
        break;

      case "veinPruned":
        // A trail losing an anchor collapses back to the nearest held tile, and the pruner
        // emits one pass at a time — so staggering by arrival makes the chain reaction read
        // as one thing unravelling rather than a row of tiles blinking out together.
        fx.crumble(e.at, e.owner, true, late + ruin(ruins++));
        break;

      case "effectApplied":
      case "effectExpired":
        break;

      case "hiveCaptured": {
        // Taking the queen hands over all five hive tiles at once and emits no `capture`
        // for any of them. Reveal them as one ordered group, queen first, so the hive
        // fills the same way every other capture does instead of snapping over.
        const cells = orderedFromQueen(e.cells);
        reveal.begin(
          cells.map((at) => ({ at, edge: "L" as RevealEdge, prev: null })),
          performance.now() + late,
        );
        cells.forEach((at, n) => fx.pop(at, e.owner, late + reveal.slotMs(n + 1, cells.length)));
        break;
      }

      case "hiveAwake":
      case "hiveSurgeEnded":
      case "hiveRespawn":
      case "production":
      case "gameOver":
        break;
    }
  }

  /**
   * One ordered run of captures, filling tile after tile.
   *
   * The two ACTS run separately: ground the ability took fills at once, and ground the
   * march took fills a beat later, so a turn that did both is two things rather than one.
   * One group carrying both would have to fill them in one sweep, which is the very thing
   * that made a cast and a march look like a single move.
   */
  const fillRun = (run: typeof captures, late: number): void => {
    if (!run.length) return;
    reveal.begin(
      run.map(({ at, edge, prev }) => ({ at, edge, prev })),
      performance.now() + late,
    );
    // Each flourish leaves as its tile's turn comes round, so they stay in step with the
    // fill rather than all firing on the first frame.
    // WHEN the front reaches each tile, not the index times an average: the front leaves
    // fast and settles (reveal.ts), so an evenly-spaced flourish drifts off the fill it is
    // supposed to be part of — a streak setting off over ground already filled in.
    const arrives = (slot: number): number => late + reveal.slotMs(slot, run.length);
    run.forEach(({ src, at, owner, prev }, i) => {
      const k = key(at.c, at.r);
      const fight = clashes.get(k);
      if (fight) {
        clashes.delete(k);
        fx.flow([fight.src, fight.at], fight.attacker, arrives(i));
        fx.clash(fight.at, arrives(i + 1));
      } else {
        fx.flow([src, at], owner, arrives(i));
      }
      // Ground that had to be beaten blanks out the way a destroyed tile does, and the
      // colony that beat it is filling underneath as the flash clears. Empty ground
      // destroys nothing, so it simply fills.
      if (prev || beaten.has(k)) fx.blink(at, prev, arrives(i));
      fx.pop(at, owner, arrives(i + 1));
    });
  };
  fillRun(captures.filter((c) => !c.late), 0);
  fillRun(captures.filter((c) => c.late > 0), actGap);

  /*
   * THE ROUT.
   *
   * Flee emitted nothing the renderer understood, so garrisons vanished off one tile and
   * appeared on another with no streak, no fill and no sign they had run — the single
   * biggest reason the ability read as broken rather than dramatic.
   *
   * Each runner streaks to where it ends up, the ground it takes fills like any other
   * capture, and the tile it abandoned whites out — unless somebody else was pushed onto
   * that same tile, in which case it never emptied.
   */
  if (routed.length) {
    const landed = new Set(routed.map((r) => key(r.to.c, r.to.r)));
    reveal.begin(routed.filter((r) => r.claimed).map((r) => ({
      at: r.to, edge: edgeAlongPath([r.from, r.to], 1), prev: null,
    })));
    routed.forEach(({ from, to, owner }, i) => {
      const at = reveal.slotMs(i, routed.length);
      fx.flow([from, to], owner, at);
      if (!landed.has(key(from.c, from.r))) fx.blink(from, owner, at);
      fx.pop(to, owner, reveal.slotMs(i + 1, routed.length));
    });
  }

  // Fights that took no ground still have to be seen.
  for (const fight of clashes.values()) {
    fx.flow([fight.src, fight.at], fight.attacker, fight.late);
    fx.clash(fight.at, fight.late + reveal.runMs(1));
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

/** The first event of the march, counting a travel's trail as part of the travel. */
function backOverTrail(events: readonly EngineEvent[], march: number): number {
  let i = march;
  while (i > 0 && events[i - 1]?.type === "veinLaid") i--;
  return i;
}

/** Direction of travel into `path[i]`, as a fill edge. */
function edgeAlongPath(path: readonly Coord[], i: number): RevealEdge {
  const prev = path[i - 1] as Coord;
  const cur = path[i] as Coord;
  const movement: Direction =
    cur.c > prev.c ? "R" : cur.c < prev.c ? "L" : cur.r > prev.r ? "D" : "U";
  return edgeFor(movement);
}
