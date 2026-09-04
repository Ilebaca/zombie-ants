/**
 * THE MATCH THAT WAS INTERRUPTED.
 *
 * A phone call, a low battery, a swipe away from the app — and twenty minutes of play was
 * gone, with the colony unpaid for it. That was the single worst thing the game could do
 * to somebody, and it was doing it silently: nothing anywhere kept a match that had not
 * finished.
 *
 * IT IS NEARLY FREE, AND ONLY BECAUSE THE ENGINE IS PURE AND SEEDED (CLAUDE.md §4.1). A
 * match in progress is the same twenty bytes a finished one is remembered as: the SETUP
 * and the MOVES so far (engine/protocol.ts). `resume()` hands them to `replayMatch` and
 * gets the exact board back — no board is ever stored, so nothing here can go stale
 * against a balance change, and a saved match is a saved match on any device.
 *
 * WHAT ELSE IT HAS TO CARRY is the small amount that is NOT in the engine, because it is a
 * fact about the SCREEN rather than about the game: the wall clock the result card
 * reports, how many queens have fallen (the surge lapses, so the board can no longer say),
 * who is across the board, and which challenge is being attempted. Every one of those is
 * something the match would have counted as it ran and cannot recount from the position.
 *
 * IT SITS BESIDE THE SAVE, NEVER INSIDE IT. A record runs to hundreds of moves, and the
 * backup code is a string a person copies into a message — that is exactly why the history
 * records were taken out of it (platform/backup.ts). Its key is the profile's key with a
 * suffix, so each account suspends its own match and two colonies on one phone can never
 * resume into each other.
 */
import type { MatchRecord, MatchSetup, Move, SpeciesId } from "../engine";
import { replayMatch } from "../engine";
import type { GameState } from "../engine";
import type { KeyValueStore } from "./storage";

/**
 * Mirrors `Difficulty` in `ai/search.ts`, spelled out rather than imported: `platform/`
 * may not reach into `ai/` (CLAUDE.md §3), and a suspended match has to remember which of
 * the three opponents it was being played against. `suspend.test.ts` holds the two lists
 * together, so a fourth level cannot be added to one and not the other.
 */
export type SuspendDifficulty = "easy" | "normal" | "hard";

/** Who was across the board. Absent for a match with nobody found — a challenge. */
export interface SuspendFoe {
  name: string;
  species: SpeciesId;
  colony: number;
  human: boolean;
}

/** A match that was left unfinished, as data. */
export interface Suspended {
  setup: MatchSetup;
  moves: Move[];
  /** Wall time already played, in milliseconds. The clock carries on from here. */
  playedMs: number;
  /** Hive queens the player has taken. Counted as it happened; the board forgets. */
  queens: number;
  difficulty: SuspendDifficulty;
  foe?: SuspendFoe;
  /** The scenario being attempted, if any, and whether its reward has already been paid. */
  challenge?: { index: number; daily: boolean; done: boolean };
  /**
   * Which turn it was left on, read off the live board rather than counted from the moves.
   *
   * The home screen offers a waiting match without rebuilding it (`peek`), so there is no
   * board there to ask — and deriving it from the record would be this file keeping its own
   * copy of a rule the engine owns (a round is one hand-over each, and the counter moves
   * when the PLAYER's turn begins). Two answers to "which turn is it" is one too many.
   */
  turn: number;
  /** When it was put down. Shown to the player, never used to expire it. */
  at: number;
}

/** A suspended match, rebuilt: the board it left off on, plus what the screen must know. */
export interface Resumed extends Suspended {
  state: GameState;
}

/** The key a suspension sits at, given the save it belongs to. */
export function suspendKey(profileKey: string): string {
  return `${profileKey}.match`;
}

export class SuspendStore {
  private readonly key: string;

  constructor(private store: KeyValueStore, profileKey: string) {
    this.key = suspendKey(profileKey);
  }

  /**
   * The match that is waiting, REBUILT — or null.
   *
   * The replay is the validation, and there is no cheaper one: a record that will not
   * replay cannot be resumed onto anything, so it is dropped rather than half-applied.
   * Playing on from a board the match never actually reached is worse than losing it,
   * because the player cannot tell that is what happened. This is the same rule the
   * history replay follows when a move is refused (platform/history.ts): stop, do not
   * skip. Here there is nothing to show, so it stops by giving nothing back.
   */
  resume(): Resumed | null {
    const saved = this.read();
    if (!saved) return null;
    const record: MatchRecord = { setup: saved.setup, moves: saved.moves };
    let replay;
    try {
      replay = replayMatch(record);
    } catch {
      this.clear();
      return null;
    }
    // A finished match is not a suspended one: it was settled when it ended, and offering
    // it again would pay for it twice.
    if (replay.refused !== null || replay.state.over) {
      this.clear();
      return null;
    }
    return { ...saved, state: replay.state };
  }

  /** What is waiting, WITHOUT rebuilding it — enough to offer it on the home screen. */
  peek(): Suspended | null {
    return this.read();
  }

  /**
   * Put the match down. One at a time, by design: a second suspension would be a list, and
   * a list of half-played matches is a screen this game does not have.
   */
  save(match: Suspended): void {
    try {
      this.store.set(this.key, JSON.stringify(match));
    } catch {
      // A quota error must never take the match down with it — the player is mid-turn.
    }
  }

  clear(): void {
    this.store.remove(this.key);
  }

  private read(): Suspended | null {
    const raw = this.store.get(this.key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<Suspended> | null;
      if (!parsed || typeof parsed !== "object") return null;
      if (!parsed.setup || !Array.isArray(parsed.moves)) return null;
      return {
        setup: parsed.setup,
        moves: parsed.moves,
        playedMs: Number(parsed.playedMs) || 0,
        queens: Number(parsed.queens) || 0,
        difficulty: DIFFICULTIES.includes(parsed.difficulty as SuspendDifficulty)
          ? parsed.difficulty as SuspendDifficulty
          : "normal",
        ...(parsed.foe ? { foe: parsed.foe } : {}),
        ...(parsed.challenge ? { challenge: parsed.challenge } : {}),
        turn: Number(parsed.turn) || 1,
        at: Number(parsed.at) || 0,
      };
    } catch {
      // A save outlives the code that wrote it, so a record from a build that spelled this
      // differently is refused rather than trusted (CLAUDE.md §12).
      return null;
    }
  }
}

const DIFFICULTIES: readonly SuspendDifficulty[] = ["easy", "normal", "hard"];
