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
 * THE STORE HAS A LID, AND THE LID IS WHAT A LEVEL MOSTLY BUYS. Without one, a fortnight
 * away pays a fortnight's foraging and not playing becomes the fastest way up the ladder.
 * But the lid is also the only dial with any room in it: real time bounds the RATE at
 * twenty-four hours a day whatever the level says, so a rate ladder wide enough to feel
 * like a ladder has to end somewhere the granary out-earns playing. A LID ladder does not
 * — it pays the player who checks in once a day, which is who this is for, and it cannot
 * pay anybody more than the clock allows. So the rate steps gently and the store steps
 * hard: six hours at level one, a whole day at level seven.
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
  /** Hours the store holds before it stops filling. Higher is a bigger payout per visit. */
  lid: number;
  /** The road chapter that opens it. */
  chapter: number;
  /** Mycelium to dig it. */
  cost: number;
}

/**
 * Seven levels, and every one of them is a TOP-UP rather than a rival to playing.
 *
 * TWO NUMBERS PER LEVEL, because one of them cannot carry the ladder on its own. The rate
 * is priced in hours-per-win, and what bounds it is not the tuning but the CLOCK: nobody
 * can forage more than twenty-four hours in a day, so a level worth one win per 24h is
 * already level with playing and there is nowhere above it to go. That leaves the whole
 * rate ladder squeezed into a span of about two, which after rounding is what a player
 * actually reported — level one reading "0.6 an hour" and the level bought two chapters
 * later reading "0.6" as well.
 *
 * The LID has all the room the rate does not. A player who opens the app once a day
 * collects whatever the store held, so a store that grows from six hours to a full day is
 * a sevenfold improvement in what they actually carry in, and it cannot pay anybody more
 * than the clock allows however diligent they are. So the rate comes down 56 → 32 hours
 * per win (about 0.9 to 1.5 troops an hour at chapter 10) and the store goes 6h → 24h,
 * which at the same chapter is 5 troops a visit at the bottom and 37 at the top.
 *
 * WAITING STILL NEVER BEATS PLAYING. At the extreme — collecting every single time the
 * store fills, which is four visits a day at level one — the granary pays 30/hours of a
 * day's play for somebody with an even record at two and a half matches a day: 54% at
 * level one and 97% at level seven. Under playing at every level, and it is the top level
 * on the last chapter of the road that comes closest, which is the right end for it to be
 * close at. `economy.test.ts` holds that.
 */
export const GRANARY_LEVELS: readonly GranaryLevel[] = [
  { level: 1, hours: 56, lid: 6,  chapter: 1,  cost: 0 },
  { level: 2, hours: 48, lid: 8,  chapter: 6,  cost: 400 },
  { level: 3, hours: 44, lid: 10, chapter: 12, cost: 800 },
  { level: 4, hours: 40, lid: 13, chapter: 20, cost: 1500 },
  { level: 5, hours: 36, lid: 16, chapter: 30, cost: 2600 },
  { level: 6, hours: 33, lid: 20, chapter: 40, cost: 4200 },
  { level: 7, hours: 31, lid: 24, chapter: 50, cost: 6500 },
];

export const GRANARY_MAX = GRANARY_LEVELS.length;

/** The longest any level's store can hold — real time is the only thing above it. */
export const GRANARY_MAX_LID = 24;

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
  Math.floor(granaryRate(colony, level) * granaryLevel(level).lid);

/** Troops carried back over this much time, and never more than the store holds. */
export function granaryStored(colony: number, level: number, elapsedMs: number): number {
  const hours = Math.min(granaryLevel(level).lid, Math.max(0, elapsedMs) / HOUR_MS);
  return Math.floor(granaryRate(colony, level) * hours);
}

/** How long until the store is full, in ms. Zero once it is. */
export function granaryFillsIn(elapsedMs: number, level: number): number {
  return Math.max(0, granaryLevel(level).lid * HOUR_MS - Math.max(0, elapsedMs));
}
