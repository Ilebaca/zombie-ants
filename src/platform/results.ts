/**
 * WHO DECIDES WHO WON.
 *
 * Today the client does, and for a match against a bot that is fine — the only person a
 * player can cheat is themselves. The moment two people play each other for a place on a
 * ladder it stops being fine: everything the result touches (the colony, the currencies,
 * the career) lives in `localStorage`, where anybody can edit it.
 *
 * This is the seam for moving that decision to a server, and it is built now for one
 * reason: the shape of what gets SENT is decided by the engine, not the backend. A match
 * is its setup plus its moves (`engine/protocol.ts`), and a server replays them to see the
 * same board both players saw — so it never has to be told who won, it works it out.
 *
 * `LocalResults` is the offline one: it believes the client, exactly as the game does
 * today, and records the same thing it always did. Nothing changes for a single-player
 * match. What changes is that the call now goes through a door.
 */
import type { MatchRecord, Player } from "../engine";
import { replayMatch } from "../engine";

/** What a finished match reports. The facts, not the consequences. */
export interface MatchOutcome {
  /** Null is a draw or an abandoned match — neither pays out. */
  winner: Player | null;
  turns: number;
  playedMs: number;
  /** Hive queens taken, and whether the win came from cracking the nest. */
  queens: number;
  byNest: boolean;
  /**
   * The match as data, when it was recorded.
   *
   * Optional because most matches will not carry one: a tutorial or a challenge has nobody
   * to prove anything to. A ranked match against a person always should.
   */
  record?: MatchRecord;
}

/** What the authority said. `colony` is what the player's colony IS now, not a delta. */
export interface RecordedResult {
  accepted: boolean;
  /** Why it was refused, for the one case worth telling a player about. */
  why?: "disagrees" | "unverifiable";
}

export interface ResultsService {
  /** Report a finished match. The implementation decides whether to believe it. */
  submit(outcome: MatchOutcome): Promise<RecordedResult>;
}

/**
 * The offline one: it takes the client's word for it, because there is nobody else to ask.
 *
 * It does do the one check it CAN do without a server, and that check is the whole reason
 * this file is worth writing before there is one: if the match came with a record, replay
 * it and see whether the moves really produce the result being claimed. That is exactly
 * what a server will run, so the verification is written and tested now rather than
 * guessed at later — and a bug in it shows up here rather than in production.
 */
export class LocalResults implements ResultsService {
  submit(outcome: MatchOutcome): Promise<RecordedResult> {
    if (!outcome.record) return Promise.resolve({ accepted: true });
    return Promise.resolve(verify(outcome));
  }
}

/**
 * Replay a match and check it says what it is claimed to say.
 *
 * THIS IS THE SERVER'S JOB, written here because it is pure and belongs to the game rather
 * than to a backend. Given the setup and the moves it rebuilds the board — the engine is
 * seeded, so it lands exactly where both players landed (CLAUDE.md §4.1) — and compares
 * the winner it finds with the winner being claimed.
 */
export function verify(outcome: MatchOutcome): RecordedResult {
  if (!outcome.record) return { accepted: false, why: "unverifiable" };
  const replay = replayMatch(outcome.record);
  // A MOVE THAT COULD NOT HAVE HAPPENED means the record is not of a real match — and this
  // check is not covered by the comparison below, which is the reason it is here. A record
  // of a genuine win with one junk move appended replays to the right winner; without this
  // it would be accepted, and a record that can carry arbitrary extra moves is a record
  // that can carry anything.
  if (replay.refused !== null) return { accepted: false, why: "disagrees" };
  // An unfinished match has no winner, so a claimed one simply disagrees with it. There is
  // deliberately no separate branch for that: it would only restate what the comparison
  // already says, and a redundant guard reads as a rule somebody has to maintain.
  return replay.state.winner === outcome.winner
    ? { accepted: true }
    : { accepted: false, why: "disagrees" };
}
