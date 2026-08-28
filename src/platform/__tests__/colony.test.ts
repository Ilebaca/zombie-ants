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
  COLONY_FLOOR, COLONY_LOSS, COLONY_START, COLONY_WIN, compact, exact, grownColony,
} from "../colony";

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

  it("compounds once the colony is big", () => {
    expect(grownColony(1e6, true)).toBe(Math.round(1e6 * (1 + COLONY_WIN)));
    expect(grownColony(1e6, false)).toBe(Math.round(1e6 * (1 - COLONY_LOSS)));
  });

  /** A win is worth more than a loss costs, or the ladder could not climb at all. */
  it("recovers a loss with a win", () => {
    const before = 250_000;
    expect(grownColony(grownColony(before, false), true)).toBeGreaterThan(before);
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
