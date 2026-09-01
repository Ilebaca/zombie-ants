/**
 * THE COLONY NUMBER — how it grows and how it is written.
 *
 * Both halves matter on screen. The growth is what every match is played for, and the
 * formatter is the only reason a colony of a billion troops is readable at all: the figure
 * runs off the end of what a person parses, so it is shown as 1.2B and the exact count is
 * kept for the one place with room for it.
 */
import { describe, expect, it } from "vitest";
import {
  COLONY_FLOOR, COLONY_LOSS_SHARE, COLONY_START, COLONY_WIN, compact, exact, grownColony,
  losses, winnings,
} from "../colony";
import { ROAD_LAST } from "../road";

describe("colony growth", () => {
  it("never falls below the starting size", () => {
    expect(grownColony(0, false)).toBe(COLONY_START);
    expect(grownColony(-1e9, false)).toBe(COLONY_START);
    expect(grownColony(COLONY_START, false)).toBe(COLONY_START);
  });

  it("pays the floor while the percentage is worth less than it", () => {
    // A first win that moved the number by five would read as nothing happening.
    expect(COLONY_START * COLONY_WIN).toBeLessThan(COLONY_FLOOR);
    expect(grownColony(COLONY_START, true)).toBe(COLONY_START + COLONY_FLOOR);
  });

  it("pays and charges what winnings() and losses() say", () => {
    expect(grownColony(1e6, true)).toBe(1e6 + winnings(1e6));
    expect(grownColony(1e6, false)).toBe(1e6 - losses(1e6));
    expect(losses(1e6)).toBe(Math.round(winnings(1e6) * COLONY_LOSS_SHARE));
  });

  /**
   * THE SHARE SHRINKS. A flat percentage compounds, and compounding ran away from the
   * road: chapter 50 paid a hundred and thirty-six billion troops for one win.
   */
  it("pays a smaller share the bigger the colony gets", () => {
    const share = (c: number): number => winnings(c) / c;
    const sizes = [1e3, 1e4, 1e5, 1e6, 5e6];
    sizes.forEach((c, i) => {
      if (i > 0) {
        expect(share(c), `${c} pays no less of itself than ${sizes[i - 1]}`)
          .toBeLessThan(share(sizes[i - 1] as number));
      }
    });
    // ...but the colony still GROWS: a smaller share of a bigger number is more troops.
    expect(winnings(5e6)).toBeGreaterThan(winnings(1e6));
  });

  /** The end of the road is a reward a player can read, not a wall of digits. */
  it("keeps the biggest win on the road under a million troops", () => {
    expect(winnings(ROAD_LAST)).toBeLessThan(1e6);
    expect(winnings(ROAD_LAST), "the last chapter pays pocket change")
      .toBeGreaterThan(10_000);
  });

  /**
   * A loss costs a share of the WIN, not of the colony, so the break-even win rate is the
   * same at forty troops as at five million. With a flat percentage off, a colony big
   * enough for the win share to have tapered below it would shrink on an even record.
   */
  it("recovers a loss with a win at every size", () => {
    for (const before of [100, 10_000, 250_000, 5e6]) {
      expect(grownColony(grownColony(before, false), true),
        `a colony of ${before} cannot win back a defeat`).toBeGreaterThan(before);
    }
  });

  /**
   * HOW LONG THE CURVE ITSELF IS, in wins — the one thing about pacing that belongs in
   * this file, because it is a property of the curve and of nothing else.
   *
   * What a real player's career comes to is a different question with a lot more in it —
   * how often they play, how often they win, what the granary carries — and it lives in
   * `economy.test.ts`, which models all of that together. Answering it here from wins
   * alone is what let the road be tuned to "two hundred-odd wins" while an actual player
   * finished it in under three months.
   */
  it("is four hundred-odd wins long, end to end", () => {
    let colony = COLONY_START;
    let wins = 0;
    while (colony < ROAD_LAST && wins < 5000) { colony = grownColony(colony, true); wins++; }
    expect(wins, "the road is short enough to sprint").toBeGreaterThan(300);
    expect(wins, "the road is too long to ever finish").toBeLessThan(600);
  });
});

describe("compact figures", () => {
  it("writes each unit the way a player reads it", () => {
    expect(compact(0)).toBe("0");
    expect(compact(940)).toBe("940");
    expect(compact(999)).toBe("999");
    expect(compact(1_000)).toBe("1K");
    expect(compact(23_000)).toBe("23K");
    expect(compact(1_240_000)).toBe("1.2M");
    expect(compact(4_800_000_000)).toBe("4.8B");
    expect(compact(6_000_000_000_000)).toBe("6T");
  });

  /**
   * One decimal only under ten of a unit. Past that it is noise — 457.3K says nothing
   * 457K does not — and the shown digit is TRUNCATED so the label never rounds up past
   * its own unit and prints the 1000K that would follow 999K on screen.
   */
  it("shows a decimal only where it carries information", () => {
    expect(compact(457_300)).toBe("457K");
    expect(compact(999_900)).toBe("999K");
    expect(compact(1_990_000)).toBe("1.9M");
    expect(compact(9_990_000)).toBe("9.9M");
    expect(compact(10_400_000)).toBe("10M");
  });

  it("never goes negative or fractional", () => {
    expect(compact(-5)).toBe("0");
    expect(compact(1_500.9)).toBe("1.5K");
  });

  it("writes the full figure out for the place with room for it", () => {
    expect(exact(1_238_441)).toBe("1,238,441");
    expect(exact(40)).toBe("40");
    expect(exact(-3)).toBe("0");
  });
});
