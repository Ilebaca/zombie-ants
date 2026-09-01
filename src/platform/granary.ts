/**
 * THE GRANARY: the colony grows while nobody is playing.
 *
 * The colony size is the number this game is played for and the number it will one day be
 * ranked on (colony.ts), and until now the only thing that moved it was finishing a match.
 * A colony that stops the moment you put the phone down is not a colony. Harvester ants
 * carry seed back around the clock and store it underground; the brood eats whether or not
 * the colony is at war, and that is what this is.
 *
 * THE RATE IS PRICED IN WINS, NEVER IN TROOPS. A flat "+40 an hour" is generous at forty
 * troops and invisible at five million, and any fixed figure has to be retuned every time
 * the win curve moves. So a level says how many HOURS of foraging add up to one victory at
 * the same colony size: level 1 is a win a day, and the last level is a win every twelve
 * hours. `winnings()` already tapers with the colony (colony.ts), so the granary tapers
 * with it for free and the sentence a player reads — "about one win a day" — stays true
 * from the first match to the last chapter.
 *
 * THE STORE HAS A LID. Without one, a fortnight away pays fourteen wins, which would make
 * not playing the fastest way up the ladder. It holds `GRANARY_CAP_HOURS` and then stops,
 * so the reward for coming back is real and the reward for staying away is bounded.
 *
 * LEVELS ARE UNLOCKED BY THE ROAD, not just bought. Chapter is the game's own measure of
 * how far a player has come, so gating on it means the passive rate can never run ahead of
 * the colony that is meant to be earning it — mycelium alone could be saved up on day one.
 *
 * Pure arithmetic — no storage, no clock of its own. `ProfileStore` owns the timestamp and
 * is the only thing that pays out.
 */
import { winnings } from "./colony";

export interface GranaryLevel {
  /** 1-based. Level 1 is dug from the start; there is no level 0. */
  level: number;
  /** Hours of foraging worth one win at the same colony size. Lower is faster. */
  hours: number;
  /** The road chapter that opens it. */
  chapter: number;
  /** Mycelium to dig it. */
  cost: number;
}

/**
 * Seven levels, and every one of them is a TOP-UP rather than a rival to playing.
 *
 * That is the number that matters here, and it was wrong. A player at two to three matches
 * a day gains a little over one win's worth of colony a day; the first level used to pay a
 * whole win every twenty-four hours and the last one two — so a maxed granary out-earned
 * playing the game by three quarters, and the fastest way up the ladder was to put the
 * phone down. The twelve-hour lid stopped a fortnight's absence paying out; it could not
 * stop the RATE being wrong.
 *
 * THE LID IS PART OF THE SUM, and so is the win rate. The store holds twelve hours, so the
 * most a diligent player can take is two full stores a day — and what that has to stay
 * under is what PLAYING yields for somebody with an even record, which is far less than it
 * is for somebody winning two in three. Measured that way the ladder runs from about a
 * third of a day's play to about two thirds of it, so waiting never beats playing at any
 * level. The hours come down eight at a time so every purchase is the same size of step,
 * and the chapters spread across the whole road so the last level is still something to
 * reach for at the end of it.
 */
export const GRANARY_LEVELS: readonly GranaryLevel[] = [
  { level: 1, hours: 96, chapter: 1, cost: 0 },
  { level: 2, hours: 88, chapter: 6, cost: 400 },
  { level: 3, hours: 80, chapter: 12, cost: 800 },
  { level: 4, hours: 72, chapter: 20, cost: 1500 },
  { level: 5, hours: 64, chapter: 30, cost: 2600 },
  { level: 6, hours: 56, chapter: 40, cost: 4200 },
  { level: 7, hours: 48, chapter: 50, cost: 6500 },
];

export const GRANARY_MAX = GRANARY_LEVELS.length;

/** How long the store keeps filling before it is full. */
export const GRANARY_CAP_HOURS = 12;

const HOUR_MS = 3_600_000;

/** The definition of a level, clamped — a save can carry anything. */
export function granaryLevel(level: number): GranaryLevel {
  const i = Math.min(GRANARY_MAX, Math.max(1, Math.round(level))) - 1;
  return GRANARY_LEVELS[i] as GranaryLevel;
}

/** The level after this one, or null at the top. */
export function granaryNext(level: number): GranaryLevel | null {
  const i = Math.round(level);
  return i >= GRANARY_MAX ? null : (GRANARY_LEVELS[i] as GranaryLevel);
}

/** Troops an hour at this size and level. A fraction, early on. */
export function granaryRate(colony: number, level: number): number {
  return winnings(colony) / granaryLevel(level).hours;
}

/** Troops the store holds when it is full. */
export const granaryFull = (colony: number, level: number): number =>
  Math.floor(granaryRate(colony, level) * GRANARY_CAP_HOURS);

/** Troops carried back over this much time, and never more than the store holds. */
export function granaryStored(colony: number, level: number, elapsedMs: number): number {
  const hours = Math.min(GRANARY_CAP_HOURS, Math.max(0, elapsedMs) / HOUR_MS);
  return Math.floor(granaryRate(colony, level) * hours);
}

/** How long until the store is full, in ms. Zero once it is. */
export function granaryFillsIn(elapsedMs: number): number {
  return Math.max(0, GRANARY_CAP_HOURS * HOUR_MS - Math.max(0, elapsedMs));
}
