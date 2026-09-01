/**
 * THE WIRE FORMAT: what one player did, and how a whole match is rebuilt from a list of it.
 *
 * This file exists because of one property the engine already has and must keep: it is
 * PURE and SEEDED (CLAUDE.md §4.1). The same opening plus the same moves always produces
 * the same board, on any machine. That is what makes async multiplayer cheap here —
 * nothing has to send a board. Only MOVES cross the wire, and either end can rebuild the
 * position from them.
 *
 * Three jobs, and they are all testable with no server anywhere:
 *
 *  1. `Move` — one action, as plain data. Five verbs, which is the whole game.
 *  2. `applyMove` — do it, and REFUSE it if it was not legal. The UI only ever offers legal
 *     taps, so the action functions were written to trust their caller; a server cannot,
 *     and neither can this. See the note on validation below — it is the reason this
 *     function exists at all rather than a switch at the call site.
 *  3. `replayMatch` — an opening plus a list of moves, rebuilt into a board. This is how a
 *     server verifies a result it did not watch, and how a replay is played back.
 *
 * It is in the ENGINE, so it imports nothing outside it and knows nothing about transport.
 * How the bytes travel is `platform/`'s business; what a legal move IS belongs here.
 */
import { activateAbility } from "./abilities";
import {
  actionTargets, canActFrom, defaultContext, moveOrAttack, rally, rallyTargets, travel,
  travelTargets,
} from "./actions";
import type { ActionContext } from "./actions";
import { tileAt } from "./board";
import type { MapId } from "./config";
import { createGame, endTurn } from "./state";
import { NEUTRAL_MODS } from "./types";
import type { Coord, EngineEvent, GameState, Player, PlayerMods, SpeciesId } from "./types";

/**
 * One thing a player did.
 *
 * Deliberately the smallest description that can be replayed: WHAT and WHERE, never the
 * outcome. A move that carried its result would be a client telling the server what
 * happened, which is the one thing a server must never take on trust — and it would go
 * stale the moment a balance number changed under a stored replay.
 */
export type Move =
  | { do: "move"; from: Coord; to: Coord }
  | { do: "travel"; from: Coord; to: Coord }
  | { do: "rally"; to: Coord }
  | { do: "ability"; at?: Coord }
  | { do: "end" };

/**
 * Everything needed to rebuild the opening position. No board, by design.
 *
 * The SEED is the load-bearing field: ability scatter draws from it (§4.1), so two clients
 * given the same seed and the same moves land on the same board, and a server can check
 * that without having watched.
 */
export interface MatchSetup {
  map: MapId;
  species: Record<Player, SpeciesId>;
  seed: number;
  shape?: ReadonlyArray<readonly [number, number]>;
  aiShape?: ReadonlyArray<readonly [number, number]>;
  /** Anthill and research, per side. Omitted means neither had any. */
  mods?: Record<Player, PlayerMods>;
}

/** A whole match, as data. Setup plus the moves, in the order they were played. */
export interface MatchRecord {
  setup: MatchSetup;
  moves: readonly Move[];
}

/** Why a move was refused. A server answers with one of these; the UI can show them. */
export type Refusal =
  | "not-your-turn"
  | "match-over"
  | "no-such-tile"
  | "not-your-tile"
  | "illegal-target"
  | "nothing-happened";

export type MoveResult =
  | { ok: true; events: EngineEvent[] }
  | { ok: false; why: Refusal };

/**
 * Do a move, or refuse it.
 *
 * EVERY GUARD HERE IS DELIBERATE, and none of them are duplicated from the action
 * functions — they are the checks those functions never had to make. `moveOrAttack` reads
 * the attacker off the SOURCE TILE rather than being told who is playing, and it never
 * asks whose turn it is: pass it an enemy tile and it will happily march the enemy's army,
 * because the only thing that ever called it was a screen that offered legal taps only.
 *
 * That is fine for a UI and unsafe for anything that takes a move from elsewhere. So the
 * turn, the ownership and the target are all checked here, against the same functions the
 * screen uses to decide what to offer — `actionTargets`, `travelTargets`, `rallyTargets` —
 * so there is one answer to "is this legal", not two that can drift apart.
 */
export function applyMove(
  state: GameState,
  player: Player,
  move: Move,
  mods: Record<Player, PlayerMods> = { you: NEUTRAL_MODS, ai: NEUTRAL_MODS },
  ctx: ActionContext = defaultContext(),
): MoveResult {
  if (state.over) return { ok: false, why: "match-over" };
  if (state.current !== player) return { ok: false, why: "not-your-turn" };

  if (move.do === "end") return { ok: true, events: endTurn(state, mods) };

  if (move.do === "rally") {
    const legal = rallyTargets(state, player).some((t) => t.c === move.to.c && t.r === move.to.r);
    if (!legal) return { ok: false, why: "illegal-target" };
    return done(rally(state, move.to));
  }

  if (move.do === "ability") {
    // An ability that had no legal target returns no events and must NOT spend the
    // cooldown (CLAUDE.md §5), so "nothing happened" is the honest answer rather than a
    // success with an empty list.
    const events = activateAbility(state, player, mods[player], move.at ? { target: move.at } : {});
    return done(events);
  }

  const src = tileAt(state, move.from.c, move.from.r);
  if (!src) return { ok: false, why: "no-such-tile" };
  if (src.owner !== player) return { ok: false, why: "not-your-tile" };
  if (!canActFrom(state, src)) return { ok: false, why: "illegal-target" };

  const reachable = move.do === "travel" ? travelTargets(state, src) : actionTargets(state, src);
  if (!reachable.some((c) => c.c === move.to.c && c.r === move.to.r)) {
    return { ok: false, why: "illegal-target" };
  }
  return done(move.do === "travel"
    ? travel(state, move.from, move.to)
    : moveOrAttack(state, move.from, move.to, ctx));
}

/**
 * An action that produced nothing did not happen.
 *
 * The engine's own way of saying "no" is an empty event list (§5), and passing that back as
 * a success would let a client burn its opponent's clock with moves that do nothing.
 */
function done(events: EngineEvent[]): MoveResult {
  return events.length > 0 ? { ok: true, events } : { ok: false, why: "nothing-happened" };
}

/** The opening board for a setup. The one place a match's first position is decided. */
export function openingBoard(setup: MatchSetup): GameState {
  return createGame({
    map: setup.map,
    species: setup.species,
    seed: setup.seed,
    ...(setup.shape ? { shape: setup.shape } : {}),
    ...(setup.aiShape ? { aiShape: setup.aiShape } : {}),
    ...(setup.mods ? { mods: setup.mods } : {}),
  });
}

export interface Replay {
  state: GameState;
  /** How many moves were applied before one was refused. Equal to the list when all were. */
  applied: number;
  /** Why it stopped early, if it did. */
  refused: Refusal | null;
}

/**
 * Rebuild a match from its record.
 *
 * THIS IS THE VERIFICATION. A server that stores setup + moves can run this and see the
 * same board both players saw, including who won — so it never has to take a result from a
 * client, and a client that sent an impossible move is caught at the move that was
 * impossible rather than at the end.
 *
 * Whose move each one is comes from the BOARD, not from the list: `state.current` already
 * says, and a record that carried a player per move could disagree with the board it is
 * being replayed onto.
 */
export function replayMatch(record: MatchRecord): Replay {
  const state = openingBoard(record.setup);
  const mods = record.setup.mods ?? { you: NEUTRAL_MODS, ai: NEUTRAL_MODS };
  let applied = 0;
  for (const move of record.moves) {
    const result = applyMove(state, state.current, move, mods);
    if (!result.ok) return { state, applied, refused: result.why };
    applied++;
  }
  return { state, applied, refused: null };
}
