/**
 * THE COLONY NUMBER: how big your colony is, and how it is written down.
 *
 * The ladder used to be a trophy count — thirty for a win, fifteen off for a loss, capped
 * by a fifty-chapter road at twenty-five thousand. That is a rating, and a rating is a
 * number about the PLAYER. The thing this game is about is a colony, and a colony grows:
 * it starts as a queen and a few dozen workers and it does not stop. So the ladder counts
 * TROOPS, it compounds rather than adds, and the interesting part is that it runs off the
 * end of what a person reads comfortably — thousands, then millions, then billions.
 *
 * Compounding is the whole design. A flat thirty per win means the hundredth win is worth
 * exactly what the first was; a percentage means a colony of a million grows by a hundred
 * and forty thousand, which is what makes the number run away. From the starting size a
 * win-heavy career reaches its first thousand in about twenty-five wins, its first million
 * in seventy-seven, and a trillion at around a hundred and eighty.
 *
 * Pure arithmetic — no storage, no DOM. `ProfileStore` is the only thing that writes it.
 */

/** A colony that has never won anything. Small, and never smaller than this. */
export const COLONY_START = 40;

/** A win grows the colony by this share of itself; a loss costs this share. */
export const COLONY_WIN = 0.14;
export const COLONY_LOSS = 0.05;

/**
 * ...but a win always grows it by at least this many troops.
 *
 * Fourteen percent of forty is five and a half, and a first win that moves the number by
 * five reads as nothing happening. The floor is what carries the opening matches until the
 * percentage is worth more than it is.
 */
export const COLONY_FLOOR = 8;

/** The colony after a match. Never below the starting size — you always have a colony. */
export function grownColony(colony: number, won: boolean): number {
  const from = Math.max(COLONY_START, Math.round(colony));
  if (!won) return Math.max(COLONY_START, Math.round(from * (1 - COLONY_LOSS)));
  return Math.round(from + Math.max(COLONY_FLOOR, from * COLONY_WIN));
}

const UNITS = [
  { at: 1e12, suffix: "T" },
  { at: 1e9, suffix: "B" },
  { at: 1e6, suffix: "M" },
  { at: 1e3, suffix: "K" },
] as const;

/**
 * A colony size as a player reads it: 940, 23K, 1.2M, 4.8B, 6T.
 *
 * One decimal only while the figure is under ten of its unit, because that is where the
 * decimal carries information — 1.2M is meaningfully different from 1.9M, and 457.3K is
 * three characters of noise. Truncated rather than rounded at the boundary, so a colony
 * of 999,900 reads as 999K and never as the 1000K that would follow 999K on screen.
 */
export function compact(n: number): string {
  const v = Math.max(0, Math.floor(n));
  for (const { at, suffix } of UNITS) {
    if (v < at) continue;
    const scaled = v / at;
    // Truncate to the digit shown, so the label never rounds UP past its own unit.
    if (scaled < 10) {
      const tenths = Math.floor(scaled * 10) / 10;
      return `${tenths % 1 === 0 ? tenths.toFixed(0) : tenths.toFixed(1)}${suffix}`;
    }
    return `${Math.floor(scaled)}${suffix}`;
  }
  return String(v);
}

/** The same figure written out in full, for a place with room for it. */
export const exact = (n: number): string =>
  Math.max(0, Math.floor(n)).toLocaleString("en-US");
