/**
 * Economy pacing is measured through real settlements and purchases, including gifts,
 * match XP, actual achievable quests, one-time road claims and optional league income.
 * Deliberately broad targets describe the experience; no assertion copies a price table.
 */
import { describe, expect, it } from "vitest";
import { CHAMBER_MAX, SPECIES_LEVEL_MAX, chamberCost, researchCost } from "../../engine";
import { COLONY_START, losses, winnings } from "../colony";
import { GRANARY_LEVELS, granaryFull, granaryRate } from "../granary";
import { ROAD_CHAPTER_STOPS, chapterOf, stopColony } from "../road";
import { DAILY_GIFT, MATCH_MYCEL, ProfileStore } from "../profile";
import { levelProgress } from "../quests";
import { MemoryStore } from "../storage";
import { SPECIES_ORDER, tierOf } from "../catalogue";
import { FUSE_COST, FUSE_DEALS, FUSE_FUEL, LARVA_MYCEL } from "../exchange";
import { WIN_LARVA } from "../traits";
import { prizeFor } from "../league";
import { finiteSinks, simulateEconomy } from "../../../tools/economy-model";

const GAMES_PER_DAY = 3;
const WIN_RATE = .5;
const regular = simulateEconomy({ days: 540, gamesPerDay: GAMES_PER_DAY, winRate: WIN_RATE, seed: 7 });
const day = (n: number) => regular.snapshots.find(s => s.day === n)!;

describe("progress at three daily matches and an even record", () => {
  it("gives an upgrade on day one and several useful steps in the first week", () => {
    expect(regular.firstPurchaseDay).toBe(1);
    expect(day(7).mainLevel).toBeGreaterThanOrEqual(3);
    expect(day(7).mainLevel).toBeLessThan(SPECIES_LEVEL_MAX);
    expect(day(7).chamberLevels).toBeGreaterThanOrEqual(2);
    expect(day(7).earned.larva).toBeGreaterThan(0);
  });

  it("spaces new species across weeks rather than buying every one in a fortnight", () => {
    expect(regular.speciesDays.ghost).toBeGreaterThanOrEqual(4);
    expect(regular.speciesDays.ghost).toBeLessThanOrEqual(12);
    expect(regular.speciesDays.bullet).toBeGreaterThan(35);
    expect(regular.speciesDays.bullet).toBeLessThan(105);
  });

  it("makes a max-level main species a commitment of several weeks", () => {
    expect(regular.mainMaxDay).toBeGreaterThanOrEqual(28);
    expect(regular.mainMaxDay).toBeLessThanOrEqual(65);
  });

  it("keeps chamber and collection upgrades relevant through the middle and late game", () => {
    expect(regular.chambersMaxDay).toBeGreaterThan(70);
    expect(regular.chambersMaxDay).toBeLessThan(210);
    expect(regular.freeResearchMaxDay).toBeGreaterThan(240);
    expect(regular.freeResearchMaxDay).toBeLessThan(540);
    expect(regular.roadCompleteDay).toBeGreaterThan(180);
    expect(regular.roadCompleteDay).toBeLessThan(540);
  });

  it("counts all income without double counting gifts, matches or road re-crossings", () => {
    expect(regular.wins).toBe(regular.matches / 2);
    expect(regular.sources.matches.mycel).toBe(
      regular.wins * MATCH_MYCEL.win + (regular.matches - regular.wins) * MATCH_MYCEL.loss);
    expect(regular.sources.matches.larva).toBe(regular.wins * WIN_LARVA);
    expect(regular.sources.gift.mycel).toBe(540 * DAILY_GIFT.mycel);
    expect(regular.sources.gift.pheromone).toBe(540 * DAILY_GIFT.pheromone);
    for (const key of ["mycel", "pheromone", "larva"] as const) {
      expect(Object.values(regular.sources).reduce((total, source) => total + source[key], 0))
        .toBe(regular.earned[key]);
    }
    expect(regular.sources.road.mycel).toBeLessThan(finiteSinks().mycel / 3);
    expect(regular.sources.road.pheromone).toBeLessThan(finiteSinks().pheromone / 10);
  });

  it("counts match XP even without daily quests and never invents completed quests", () => {
    const losses = simulateEconomy({ days: 2, gamesPerDay: 3, winRate: 0,
      quests: false, spend: false, turns: 45 });
    expect(losses.final.level).toBe(levelProgress(6 * (35 + 30)).level);
    expect(losses.sources.quests).toEqual({ mycel: 0, pheromone: 0, larva: 0 });
    const idle = simulateEconomy({ days: 7, gamesPerDay: 0, winRate: .5, gift: false });
    expect(idle.earned).toEqual({ mycel: 0, pheromone: 0, larva: 0 });
    expect(idle.firstPurchaseDay).toBeNull();
  });

  it("lets a losing player improve and a one-match player save toward real goals", () => {
    const losing = simulateEconomy({ days: 7, gamesPerDay: 3, winRate: 0 });
    expect(losing.firstPurchaseDay).toBe(1);
    expect(losing.final.mainLevel).toBeGreaterThan(0);
    expect(losing.final.wallet.mycel).toBeGreaterThanOrEqual(0);
    const casual = simulateEconomy({ days: 90, gamesPerDay: 1, winRate: .5, seed: 7 });
    expect(casual.speciesDays.ghost).toBeLessThanOrEqual(30);
    expect(casual.mainMaxDay).toBeLessThanOrEqual(90);
  });

  it("holds the early pacing across different losing streaks", () => {
    for (const seed of [1, 23, 91]) {
      const run = simulateEconomy({ days: 90, gamesPerDay: 3, winRate: .5, seed });
      expect(run.firstPurchaseDay).toBe(1);
      expect(run.speciesDays.ghost).toBeGreaterThanOrEqual(4);
      expect(run.speciesDays.ghost).toBeLessThanOrEqual(14);
      expect(run.mainMaxDay).toBeGreaterThanOrEqual(28);
      expect(run.mainMaxDay).toBeLessThanOrEqual(65);
    }
  });

  it("includes optional daily-challenge and league prizes in the engaged scenario", () => {
    const run = simulateEconomy({ days: 90, gamesPerDay: 3, winRate: .5,
      seed: 7, dailyChallenge: true, league: true });
    expect(run.sources.challenge.mycel).toBeGreaterThan(0);
    expect(run.sources.challenge.pheromone).toBeGreaterThan(0);
    expect(run.earned.mycel).toBeGreaterThan(day(90).earned.mycel);
    expect(run.mainMaxDay).toBeLessThanOrEqual(regular.mainMaxDay!);
  });
});

describe("stable ownership and honest prices", () => {
  it("keeps rarity independent of soft-currency price changes", () => {
    expect(tierOf("ghost").k).toBe("rare");
    expect(tierOf("pharaoh").k).toBe("rare");
    expect(tierOf("army").k).toBe("exceptional");
    expect(tierOf("bullet").k).toBe("exceptional");
    expect(tierOf("demon").k).toBe("mythic");
  });

  it("keeps existing balances, levels and unlocks when a save is reopened", () => {
    const memory = new MemoryStore();
    const store = new ProfileStore(memory);
    store.update(p => {
      p.mycel = 1234; p.pheromone = 567;
      p.unlocked.push("ghost");
      p.hill.royal = 3;
      p.research.fire = { level: 7 };
    });
    const loaded = new ProfileStore(memory);
    expect(loaded.get().mycel).toBe(1234);
    expect(loaded.get().pheromone).toBe(567);
    expect(loaded.isUnlocked("ghost")).toBe(true);
    expect(loaded.get().hill.royal).toBe(3);
    expect(loaded.get().research.fire?.level).toBe(7);
    loaded.update(p => { p.pheromone = researchCost(7) - 1; });
    expect(loaded.buyResearch("fire")).toBe(false);
    loaded.update(p => { p.pheromone = researchCost(7); });
    expect(loaded.buyResearch("fire")).toBe(true);
    expect(loaded.get().pheromone).toBe(0);
    expect(loaded.get().research.fire?.level).toBe(8);
  });

  it("keeps the first investment affordable and later prices strictly increasing", () => {
    expect(chamberCost(0)).toBeLessThanOrEqual(DAILY_GIFT.mycel + 3 * MATCH_MYCEL.loss + 25);
    expect(researchCost(0)).toBeLessThanOrEqual(DAILY_GIFT.pheromone);
    for (let level = 1; level < CHAMBER_MAX.royal; level++) {
      expect(chamberCost(level)).toBeGreaterThan(chamberCost(level - 1));
    }
    for (let level = 1; level < SPECIES_LEVEL_MAX; level++) {
      expect(researchCost(level)).toBeGreaterThan(researchCost(level - 1));
    }
    expect(finiteSinks().pheromone).toBe(7 * finiteSinks().perSpecies);
    expect(SPECIES_ORDER).toHaveLength(8);
  });
});

describe("the granary is a top-up, not a rival", () => {
  /**
   * NOT PLAYING MUST NEVER BE THE FASTEST WAY UP.
   *
   * And the thing that bounds it is not the lid — it is the CLOCK. A player who empties
   * the store every single time it fills forages twenty-four hours a day whatever the lid
   * says, so that, not two collections, is the ceiling to measure at. It is also why the
   * rate ladder is narrow and the LID ladder is wide (granary.ts): the lid can pay the
   * once-a-day player sevenfold without moving this number at all.
   */
  it("carries less than playing does, at every level", () => {
    const colony = 10_000;
    // The same fractional record the career uses: rounding 2.5 matches into two wins and a
    // loss is a 67% player, and measuring the granary against THAT makes it look modest.
    const fromPlaying = GAMES_PER_DAY *
      (winnings(colony) * WIN_RATE - losses(colony) * (1 - WIN_RATE));

    const perDay = (level: number): number => granaryRate(colony, level) * 24;

    for (const level of GRANARY_LEVELS) {
      expect(perDay(level.level), `granary level ${level.level} out-earns playing`)
        .toBeLessThan(fromPlaying);
    }
    // ...and the first level still has to be worth opening the app for.
    expect(perDay(1)).toBeGreaterThan(fromPlaying * 0.2);
  });

  /**
   * EVERY LEVEL HAS TO BE A STEP THE PLAYER CAN SEE.
   *
   * This is the bug that was reported, in a test. The rate was 96 hours per win falling
   * eight at a time, so the level bought two chapters later was 9% faster — and at the
   * colony sizes where it was bought, 9% disappeared into the one decimal place the screen
   * prints: "0.6 an hour" before, "0.6 an hour" after, for 800 mycelium.
   *
   * A full store is what a visit actually carries in, so that is the figure held here, and
   * it has to move by a QUARTER. The rate is checked more gently — it has the clock above
   * it and cannot move far — but it may never stand still.
   */
  it("makes every level a step a player can see", () => {
    const colony = 640; // about chapter 10, where this was reported from.
    for (let i = 1; i < GRANARY_LEVELS.length; i++) {
      const lower = GRANARY_LEVELS[i - 1]!, upper = GRANARY_LEVELS[i]!;
      expect(granaryFull(colony, upper.level), `granary level ${upper.level} holds no more`)
        .toBeGreaterThan(granaryFull(colony, lower.level) * 1.25);
      expect(granaryRate(colony, upper.level), `granary level ${upper.level} is no faster`)
        .toBeGreaterThan(granaryRate(colony, lower.level) * 1.03);
    }
  });

  /**
   * AND THE FIGURE ON SCREEN HAS TO BE ONE, not a rounding of nothing.
   *
   * "0.6 troops an hour" reads as a room that does not work. By the chapter the road opens
   * traits and the lucky hatch at, a granary the player can actually hold — level two, on
   * chapter 6 — carries a troop an hour or better.
   */
  it("never prints the same rate for two levels running", () => {
    // One decimal place is what the anthill writes (ui/anthill.ts), and two levels reading
    // "0.6 an hour" for 800 mycelium between them is the fault this was reported as.
    const shown = (colony: number, level: number): string => granaryRate(colony, level).toFixed(1);
    for (const colony of [640, 990, 5700, 4e6]) {
      for (let i = 1; i < GRANARY_LEVELS.length; i++) {
        expect(shown(colony, GRANARY_LEVELS[i]!.level),
          `levels ${i} and ${i + 1} print the same rate at colony ${colony}`)
          .not.toBe(shown(colony, GRANARY_LEVELS[i - 1]!.level));
      }
    }
  });

  it("pays a whole troop an hour by the chapter it is judged on", () => {
    // The colony is DERIVED from the chapter, not typed in: it was 640, which was chapter
    // 10 while a chapter was two rungs wide and is chapter 9 now that it is five.
    const colony = stopColony((10 - 1) * ROAD_CHAPTER_STOPS + 1);
    expect(chapterOf(colony)).toBe(10);
    expect(granaryRate(colony, 2)).toBeGreaterThanOrEqual(1);
  });
});


describe("the collection remains an ongoing goal", () => {
  const perDay = { mycel: regular.earned.mycel / 540, pheromone: regular.earned.pheromone / 540 };
  it("keeps optional larva trades below what playing earns", () => {
    const bought = perDay.mycel / LARVA_MYCEL;
    const played = GAMES_PER_DAY * WIN_RATE * WIN_LARVA;
    expect(bought).toBeLessThan(played);
    expect(bought).toBeGreaterThan(played * .1);
  });

  it("requires substantial time and spare traits for a guaranteed top-tier fusion", () => {
    let cost = 0, fuel = 1;
    for (let i = FUSE_DEALS.length - 1; i >= 0; i--) {
      cost += fuel * FUSE_COST[FUSE_DEALS[i]!.into];
      fuel *= FUSE_FUEL;
    }
    expect(cost / perDay.pheromone).toBeGreaterThan(20);
    // Optimistic lower bound: all common rolls become traits, ignoring avatar substitution.
    expect(fuel / (GAMES_PER_DAY * WIN_RATE * WIN_LARVA * .6)).toBeGreaterThan(60);
  });

  it("keeps the maximum weekly prize a bonus rather than the main source of progress", () => {
    const first = prizeFor(1)!;
    expect(first.mycel).toBeLessThan(7 * GAMES_PER_DAY * (MATCH_MYCEL.win + MATCH_MYCEL.loss) / 2);
    expect(first.pheromone).toBeLessThan(2 * DAILY_GIFT.pheromone);
    expect(first.larva).toBeLessThan(7 * GAMES_PER_DAY * WIN_RATE * WIN_LARVA);
  });
});
