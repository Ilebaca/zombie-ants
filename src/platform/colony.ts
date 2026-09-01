/**
 * THE COLONY NUMBER: how big your colony is, and how it is written down.
 *
 * The ladder used to be a trophy count — thirty for a win, fifteen off for a loss. That is
 * a rating, and a rating is a number about the PLAYER. The thing this game is about is a
 * colony, and a colony grows: it starts as a queen and a few dozen workers and it does not
 * stop. So the ladder counts TROOPS, a win pays a SHARE of what you already have, and the
 * figure runs off the end of what a person reads comfortably.
 *
 * THE SHARE SHRINKS AS THE COLONY GROWS, and that is the whole of the tuning. A flat
 * fourteen percent compounds, and compounding runs away from a road with a hundred rungs on
 * it: the last chapter paid a hundred and thirty-six BILLION troops for one win, which is
 * not a reward, it is a number that has stopped meaning anything. Raising the colony to a
 * power below one instead makes the growth polynomial — a win pays 13% of a young colony,
 * 5% of a hundred thousand and 3% of five million — so the road's rungs stay a few wins
 * apart the whole way up instead of a fraction of one.
 *
 * There is still no ceiling. A career long enough carries on past the road; it just walks
 * rather than sprinting.
 *
 * Pure arithmetic — no storage, no DOM. `ProfileStore` is the only thing that writes it.
 */

/** A colony that has never won anything. Small, and never smaller than this. */
export const COLONY_START = 40;

/** The share of itself a colony THIS SIZE gains on a win. The share falls from here. */
export const COLONY_WIN = 0.14;

/**
 * How fast the share falls — the power the colony is raised to.
 *
 * Exactly 1 would be the flat percentage that ran away; below 1 is what bends the curve
 * over. It is the one number to turn if the late road feels too fast or too slow, and
 * it moves the whole shape rather than one end of it.
 *
 * MODELLED AGAINST A REAL PLAYER: two to three matches a day, winning about half of them.
 * At 0.87 that player finished the fifty-chapter road in under three months, which is not
 * a career — and the figure ran to eleven digits inside a year. At 0.78 the road is eleven
 * to fifteen months for an even record, nine or ten for somebody who wins more, and the
 * number stays a number: a win pays 20% of a starting colony, 7% of a thousand and about
 * 1% of five million.
 */
export const COLONY_TAPER = 0.78;

/**
 * ...but a win always grows it by at least this many troops.
 *
 * Fourteen percent of forty is five and a half, and a first win that moves the number by
 * five reads as nothing happening.
 */
export const COLONY_FLOOR = 8;

/**
 * A loss costs this much of what a win at the same size PAYS — not a share of the colony.
 *
 * Tying the two together is what keeps the ladder climbable at every size: with a flat
 * percentage off for a defeat, a colony big enough for the win share to have tapered below
 * it would shrink on a even record. This way the break-even win rate is the same at forty
 * troops as at five million.
 */
export const COLONY_LOSS_SHARE = 0.36;

/** What a win pays a colony this size. */
export function winnings(colony: number): number {
  const from = Math.max(COLONY_START, Math.round(colony));
  const paid = COLONY_WIN * COLONY_START * (from / COLONY_START) ** COLONY_TAPER;
  return Math.max(COLONY_FLOOR, Math.round(paid));
}

/** What a defeat costs a colony this size. */
export const losses = (colony: number): number =>
  Math.round(winnings(colony) * COLONY_LOSS_SHARE);

/** The colony after a match. Never below the starting size — you always have a colony. */
export function grownColony(colony: number, won: boolean): number {
  const from = Math.max(COLONY_START, Math.round(colony));
  return won ? from + winnings(from) : Math.max(COLONY_START, from - losses(from));
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
