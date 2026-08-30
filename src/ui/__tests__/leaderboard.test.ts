/**
 * THE LADDER.
 *
 * The screen answers three questions, and the version it replaced answered none of them
 * on arrival: what am I looking at, where do I stand, and who are these people. The first
 * was a layout bug — the body was one scroller and it opened by scrolling the player's row
 * into the middle, taking the division chips and the banner off the top with it.
 */
import { describe, expect, it } from "vitest";
import { COLONY_START } from "../../platform";
import { SPECIES } from "../../engine";
import type { SpeciesId } from "../../engine";
import {
  DIVISIONS, buildLeaderboard, divisionOf, ordinal, standings,
} from "../leaderboard";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

const you = (colony: number, name = "Milan"): {
  name: string; colony: number; species: SpeciesId;
} => ({ name, colony, species: "fire" });

const build = (colony: number, name = "Milan"): HTMLElement => {
  const root = buildLeaderboard(you(colony, name), () => {});
  document.body.replaceChildren(root);
  return root;
};

describe("the divisions", () => {
  it("covers every colony size with exactly one band", () => {
    for (const size of [0, COLONY_START, 999, 1000, 9_999, 1e5, 4.9e6, 1e9]) {
      const d = DIVISIONS[divisionOf(size)];
      expect(d, `nothing covers ${size}`).toBeTruthy();
      expect(size >= (d as { min: number }).min, `${size} below its own band`).toBe(true);
    }
  });

  it("runs unbroken from nothing to no ceiling", () => {
    expect(DIVISIONS[0]?.min).toBe(0);
    expect(DIVISIONS[DIVISIONS.length - 1]?.max).toBe(Infinity);
    for (let i = 1; i < DIVISIONS.length; i++) {
      expect(DIVISIONS[i]!.min, `a gap below ${DIVISIONS[i]!.name}`).toBe(DIVISIONS[i - 1]!.max);
    }
  });
});

describe("the standings", () => {
  it("seats the player in their own division and nowhere else", () => {
    const me = you(24_000);
    const home = divisionOf(me.colony);
    expect(standings(home, me).filter((r) => r.you).length).toBe(1);
    for (let i = 0; i < DIVISIONS.length; i++) {
      if (i !== home) expect(standings(i, me).some((r) => r.you), DIVISIONS[i]!.name).toBe(false);
    }
  });

  it("shows the player under their own name, not as \"You\"", () => {
    const me = you(24_000, "Ilebaca");
    expect(standings(divisionOf(me.colony), me).find((r) => r.you)?.name).toBe("Ilebaca");
  });

  it("ranks by colony, largest first", () => {
    const rows = standings(2, you(24_000));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.points).toBeLessThanOrEqual(rows[i - 1]!.points);
    }
  });

  // A ladder that reshuffles on every open is not a ladder.
  it("is the same table every time it is asked", () => {
    const me = you(24_000);
    expect(standings(3, me).map((r) => r.name + r.points))
      .toEqual(standings(3, me).map((r) => r.name + r.points));
  });

  // Spread geometrically, not evenly: a band runs orders of magnitude wide, and equal
  // intervals across one put most of the table in its top slice.
  it("spreads rivals across the whole band rather than bunching at the top", () => {
    const d = DIVISIONS[2]!;
    const rivals = standings(2, you(0)).filter((r) => !r.you);
    const bottomHalf = rivals.filter((r) => r.points < Math.sqrt(d.min * d.max));
    expect(bottomHalf.length).toBeGreaterThanOrEqual(5);
    for (const r of rivals) {
      expect(r.points).toBeGreaterThanOrEqual(d.min);
      expect(r.points).toBeLessThan(d.max);
    }
  });

  // Every other screen gives an opponent a colony and a face. This was the one that did
  // not — and a premium colony on the ladder is a shop window, not a player.
  it("gives every rival a colony of their own, none of them premium", () => {
    const rivals = standings(4, you(0));
    for (const r of rivals) expect(SPECIES[r.species]?.premium).toBeFalsy();
    expect(new Set(rivals.map((r) => r.species)).size).toBeGreaterThan(1);
  });
});

describe("the screen", () => {
  /**
   * THE HEAD DOES NOT SCROLL. It was inside the one scroller the player's own row is
   * brought into view within, so arriving at the screen scrolled it away.
   */
  it("keeps the chips and the banner out of the scrolling table", () => {
    const root = build(24_000);
    const list = root.querySelector(".lblist");
    expect(list, "no table").toBeTruthy();
    expect(list?.querySelector(".lbchips"), "the chips scroll with the table").toBeNull();
    expect(list?.querySelector(".lbbanner"), "the banner scrolls with the table").toBeNull();
    expect(root.querySelector(".lbtop .lbchips")).toBeTruthy();
    expect(root.querySelector(".lbtop .lbbanner")).toBeTruthy();
  });

  it("opens on the player's own division", () => {
    const root = build(24_000);
    const on = root.querySelector(".lbchip.on");
    expect(on?.textContent).toContain(DIVISIONS[divisionOf(24_000)]?.name);
    expect(root.querySelector(".lbrow.you")).toBeTruthy();
  });

  // A highlighted row says which one is yours. It never said what PLACE that was.
  it("says where the player stands, in words", () => {
    const root = build(24_000);
    const rows = Array.from(root.querySelectorAll(".lbrow"));
    const rank = rows.findIndex((r) => r.classList.contains("you")) + 1;
    expect(root.querySelector(".lbstand")?.textContent).toBe(`You are ${ordinal(rank)} of ${rows.length}`);
  });

  it("says how far the next division is", () => {
    const root = build(24_000);
    const next = DIVISIONS[divisionOf(24_000) + 1];
    expect(root.querySelector(".lbnext")?.textContent).toContain(next?.name);
  });

  // The top band has no ceiling, which is the point of it — the colony number has none
  // either, so there is nothing to promise beyond it.
  it("promises nothing beyond the top division", () => {
    const root = build(5e8);
    expect(root.querySelector(".lbnext")?.textContent).not.toMatch(/to /);
    expect(root.querySelector(".lbtrack")).toBeTruthy();
  });

  // What makes the other six chips worth tapping through.
  it("tells the player whether another division is ahead of them or behind", () => {
    const root = build(24_000);
    const chips = Array.from(root.querySelectorAll<HTMLButtonElement>(".lbchip"));
    chips[0]?.click();
    expect(root.querySelector(".lbstand")?.textContent).toMatch(/outgrown/i);
    Array.from(root.querySelectorAll<HTMLButtonElement>(".lbchip"))[5]?.click();
    expect(root.querySelector(".lbstand")?.textContent).toMatch(/to reach it/i);
    expect(root.querySelector(".lbrow.you"), "seated the player in a band they are not in")
      .toBeNull();
  });

  it("marks only the top three places", () => {
    const root = build(24_000);
    const ranks = Array.from(root.querySelectorAll(".lbrank"));
    expect(ranks[0]?.className).toContain("gold");
    expect(ranks[1]?.className).toContain("silver");
    expect(ranks[2]?.className).toContain("bronze");
    for (const r of ranks.slice(3)) expect(r.className).toBe("lbrank");
  });

  it("gives every row a face", () => {
    const root = build(24_000);
    const rows = Array.from(root.querySelectorAll(".lbrow"));
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) expect(r.querySelector(".lbface canvas"), r.textContent).toBeTruthy();
  });
});

describe("ordinals", () => {
  it("reads as a placing", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal))
      .toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st"]);
  });
});
