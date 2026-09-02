/**
 * WHAT HAPPENED IN THE LAST TWENTY MATCHES.
 *
 * The game kept a career — games, wins, streaks, the fastest one — and not a single match.
 * A player could see that they had won 61 of 104 and never see one of them again: no idea
 * who they played last night, on what ground, or how it went.
 *
 * Each entry is the FACTS a list needs plus, where it fits, the match as DATA — the setup
 * and the moves (`engine/protocol.ts`). Those two things are doing different jobs and it
 * matters which is which. The facts are what the screen reads. The record is what a replay
 * plays back and what a server would verify, and it is optional: a very long match is kept
 * as facts alone rather than not kept at all.
 */
import type { MapId, MatchRecord, Player, SpeciesId } from "../engine";

/** How many matches are kept. A history, not an archive. */
export const HISTORY_MAX = 20;

/**
 * The longest match kept with its moves.
 *
 * A record is a few dozen bytes per move and `localStorage` is a few megabytes for
 * EVERYTHING — the profile, the career, the friends, the invitations. A marathon that ran
 * to a thousand moves is exactly the match least worth watching back and the one most
 * likely to push something else out, so past this the facts are kept and the moves are not.
 */
export const RECORD_MAX_MOVES = 500;

export interface MatchLog {
  /** Stable id, so a list can be keyed and an entry opened. */
  id: string;
  /** When it finished, epoch milliseconds. */
  at: number;
  map: MapId;
  /** What each side fielded. */
  you: SpeciesId;
  foe: SpeciesId;
  /** Who was across the board, and whether they were a person. */
  foeName: string;
  human: boolean;
  /** Null is a match nobody won — abandoned, or left. */
  winner: Player | null;
  /** How it ended, in the engine's own words. */
  reason: string | null;
  turns: number;
  playedMs: number;
  /** What the colony was worth before and after: the number the game is played for. */
  colonyBefore: number;
  colonyAfter: number;
  /** The moves, when they were short enough to keep. */
  record?: MatchRecord;
}

/** Is this entry one that can be watched back? */
export const canReplay = (log: MatchLog): boolean =>
  !!log.record && log.record.moves.length > 0;

/**
 * Trim a record down to what is worth storing.
 *
 * Returns the log unchanged when the record fits, and without it when it does not — never
 * a truncated one. A record with its tail cut off replays to the wrong board, which is
 * worse than no record: it would show a match ending in a way it did not.
 */
export function fitRecord(log: MatchLog): MatchLog {
  if (!log.record || log.record.moves.length <= RECORD_MAX_MOVES) return log;
  const { record: _dropped, ...rest } = log;
  return rest;
}

/** Newest first, capped. The one place the order and the cap are decided. */
export function addToHistory(history: readonly MatchLog[], log: MatchLog): MatchLog[] {
  return [fitRecord(log), ...history.filter((h) => h.id !== log.id)].slice(0, HISTORY_MAX);
}

/** A short line for the list: who, and how it went. */
export const outcomeOf = (log: MatchLog): "won" | "lost" | "drawn" =>
  log.winner === "you" ? "won" : log.winner === "ai" ? "lost" : "drawn";
