/**
 * WHAT A FINISHED MATCH DOES TO THE SAVE.
 *
 * This was a hundred and twenty lines inside `App.startMatch`'s `onExit` handler — the
 * career, the match record, four kinds of quest progress and the challenge reward, all
 * written out in the middle of the router. `app.ts` is meant to be the shell and the
 * router and nothing else (CLAUDE.md §3), and this is the one subject that had grown
 * inside it: "what a match PAYS" is a thing in its own right, and it is also the least
 * tested path in the game despite being the one that moves every number a player has.
 *
 * It is one function because the order matters and is not obvious. The colony, the
 * mycelium and the XP all move inside `recordResult`, so the figures the result card
 * reports have to be read BEFORE it and again after — a card that reported the totals
 * rather than the deltas would say "18K troops" where it means "+40".
 */
import { armyOf } from "../engine";
import type { GameOverReason, MapId, Player, SpeciesId } from "../engine";
import type { GameState, MatchRecord } from "../engine";
import { WIN_LARVA } from "../platform";
import type { ProfileStore } from "../platform";
import { CHALLENGES, CHALLENGE_REWARD, DAILY_BONUS_PHEROMONE, dayNumber } from "./challenges";
import type { Recap } from "./result";

export interface Settlement {
  store: ProfileStore;
  /** The board as it stood when the match was decided. */
  state: GameState;
  winner: Player | null;
  reason: GameOverReason | null;
  /** The SCREEN's clock, never the engine's (CLAUDE.md §8a). */
  playedMs: number;
  /** Hive queens taken, counted as they happened rather than read off the end. */
  queens: number;
  map: MapId;
  species: SpeciesId;
  foe: { species: SpeciesId; name: string; human: boolean };
  /** The setup and the moves, so the match can be watched back (platform/history.ts). */
  record: MatchRecord;
  /** The challenge this match was, if it has not already paid out. */
  challenge: { index: number; daily: boolean } | null;
}

export function settleMatch(s: Settlement): Recap {
  const { store } = s;
  const won = s.winner === "you";

  // Read BEFORE anything moves: the card reports what this match paid, not what is held.
  const before = store.get();
  const beforeXp = before.xp;
  const beforeColony = before.colony;
  const beforeMycel = before.mycel;
  // Scalars, not the object: `update` mutates the profile in place, so a field read
  // off `before` afterwards is the AFTER value and every delta comes out zero.
  const beforeLarva = before.larva;
  const beforeLevel = store.level().level;

  store.recordResult(won, s.species, s.state.turn, {
    playedMs: s.playedMs,
    queens: s.queens,
    byNest: s.reason === "nest",
  });

  // REMEMBER THE MATCH ITSELF, not just what it added up to. The career counts games and
  // wins; this is which ones. The record travels with it where it fits.
  store.rememberMatch({
    id: `m:${Date.now()}:${s.record.setup.seed}`,
    at: Date.now(),
    map: s.map,
    you: s.species,
    foe: s.foe.species,
    foeName: s.foe.name,
    human: s.foe.human,
    winner: s.winner,
    reason: s.reason,
    turns: s.state.turn,
    playedMs: s.playedMs,
    colonyBefore: beforeColony,
    colonyAfter: store.get().colony,
    record: s.record,
  });

  /*
   * EVERY KIND THE POOL CAN ASK FOR IS FED FROM HERE.
   *
   * Queens, nests and turns were already being counted for the career record and simply
   * never credited to a quest, which is most of why the pool only had four kinds in it.
   * Tunnels are credited at the cast, because that is where the ability's kind is known.
   */
  store.questProgress("play");
  store.questProgress("turns", s.state.turn);
  if (s.queens > 0) store.questProgress("queen", s.queens);
  if (won) {
    store.questProgress("win");
    if (s.reason === "nest") store.questProgress("nest");
  }

  /*
   * A WIN PAYS A LARVA, WHICH IS ONE LUCKY HATCH.
   *
   * The hatch is the only source of a trait and larva was the only thing that could open
   * it, so until this line a player who never bought any had the whole collection closed
   * to them. It is paid at EVERY chapter and only SHOWN once the hatch is open (below):
   * banking it is right, because the player who arrives at chapter 10 should arrive with
   * something to open, and a reward the app cannot yet explain is a question it does not
   * answer.
   */
  if (won) store.update((p) => { p.larva += WIN_LARVA; });

  if (s.challenge && won) payChallenge(store, s.challenge);

  const after = store.get();
  const level = store.level().level;
  return {
    challenge: s.challenge ? CHALLENGES[s.challenge.index] ?? null : null,
    turns: s.state.turn,
    played: s.playedMs,
    youArmy: armyOf(s.state, "you"),
    species: s.species,
    xpGained: after.xp - beforeXp,
    colony: after.colony,
    colonyDelta: after.colony - beforeColony,
    mycel: after.mycel - beforeMycel,
    larva: store.traitsOpen() ? after.larva - beforeLarva : null,
    leveledTo: level > beforeLevel ? level : null,
    reason: s.reason,
  };
}

/**
 * A CHALLENGE PAYS ONCE, and the profile is what remembers it.
 *
 * It used to be guarded by a flag on the match, which only stopped it paying twice for the
 * same match — replaying the easiest position paid forty mycelium every single run.
 * `beatChallenge` returns false when it was already beaten and the reward hangs off that;
 * the daily is stamped by DAY, because it is meant to come back.
 */
function payChallenge(store: ProfileStore, c: { index: number; daily: boolean }): void {
  const def = CHALLENGES[c.index];
  const first = c.daily ? store.beatDaily(dayNumber()) : !!def && store.beatChallenge(def.id);
  // Beating a daily also beats the position it drew, so the ladder moves too.
  if (c.daily && def) store.beatChallenge(def.id);
  if (!first) return;
  store.update((p) => {
    p.mycel += CHALLENGE_REWARD;
    if (c.daily) p.pheromone += DAILY_BONUS_PHEROMONE;
  });
}
