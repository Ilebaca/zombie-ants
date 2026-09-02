/**
 * THE ECONOMY, AGAINST THE PLAYER IT IS FOR.
 *
 * Every other test in this folder checks one number in isolation — what a win pays, what a
 * chamber costs, what the granary carries. None of them could see the thing that was
 * actually wrong, which is that the numbers did not add up TOGETHER:
 *
 *  - the whole research economy, every track on all nine colonies, was covered three times
 *    over inside three weeks, because larva were converted to pheromone at a rate nobody
 *    had checked against what pheromone buys;
 *  - the daily sweep bonus alone paid more mycelium in a year than there is in the game to
 *    spend it on;
 *  - the granary out-earned playing, so the fastest way up the ladder was to stop;
 *  - and the fifty-chapter road was over in under three months.
 *
 * So this file models the player the game is tuned for — TWO TO THREE MATCHES A DAY, won
 * about three in five — and holds the totals against what there is to buy. The bands are
 * wide on purpose: this is a design target, not a fixed point, and a change that moves a
 * number a little should not fail. A change that breaks the SHAPE should.
 */
import { describe, expect, it } from "vitest";
import { CHAMBER_MAX, RESEARCH_MAX, chamberCost, researchCost } from "../../engine";
import { COLONY_START, losses, winnings } from "../colony";
import { GRANARY_LEVELS, granaryFull, granaryRate, granaryStored } from "../granary";
import { ROAD_LAST, ROAD_STOPS, chapterOf, freeReward } from "../road";
import { QUEST_POOL, QUEST_SWEEP_BONUS, QUESTS_PER_DAY, levelReward, xpForLevel } from "../quests";
import { SPECIES_UNLOCK } from "../catalogue";

const DAY_MS = 24 * 60 * 60 * 1000;
const GAMES_PER_DAY = 2.5;
/**
 * AN EVEN RECORD. Matchmaking seats a `hard` bot and the player is a person, so half is
 * the honest assumption for the average of them — and it is the number the curve has to
 * work for, because a player who loses as often as they win still has to feel the colony
 * grow. It does: a loss costs about a third of what a win pays, so an even record gains
 * roughly a third of a win every match.
 */
const WIN_RATE = 0.5;

/** Everything mycelium can ever be spent on. */
function mycelSink(): number {
  const chambers = Object.values(CHAMBER_MAX).reduce(
    (sum, max) => sum + Array.from({ length: max }, (_, l) => chamberCost(l)).reduce((a, b) => a + b, 0), 0);
  const species = Object.values(SPECIES_UNLOCK).reduce((a, b) => a + b, 0);
  const granary = GRANARY_LEVELS.reduce((a, g) => a + g.cost, 0);
  return chambers + species + granary;
}

/** Every research level on every colony. */
function pheromoneSink(): number {
  const perTrack = Array.from({ length: RESEARCH_MAX }, (_, l) => researchCost(l)).reduce((a, b) => a + b, 0);
  return perTrack * 3 * Object.keys(SPECIES_UNLOCK).length;
}

/**
 * A career, day by day: matches, the granary, three quests, the sweep, the level track and
 * the Colony Road's free rewards. Deterministic — the point is one answer, not a spread.
 */
function career(): { days: number; mycel: number; pheromone: number; level: number } {
  // The day's three quests, averaged over the pool: what a player actually banks varies,
  // and the average is what the year adds up to.
  const paying = (k: "mycel" | "pheromone"): number => {
    const rewards = QUEST_POOL.map((q) => q.reward[k] ?? 0).filter((v) => v > 0);
    return rewards.reduce((a, b) => a + b, 0) / rewards.length;
  };
  const mycelQuests = QUEST_POOL.filter((q) => q.reward.mycel).length / QUEST_POOL.length;
  const dailyMycel = QUESTS_PER_DAY * mycelQuests * paying("mycel") + QUEST_SWEEP_BONUS.mycel;
  const dailyPher = QUESTS_PER_DAY * (1 - mycelQuests) * paying("pheromone");

  let colony = COLONY_START, days = 0, mycel = 0, pheromone = 0, xp = 0, level = 1, stop = 0;
  let pending = 0;
  const questXp = QUEST_POOL.reduce((a, q) => a + q.xp, 0) / QUEST_POOL.length;
  while (colony < ROAD_LAST && days < 20_000) {
    days++;
    // Two and a half matches a day is not two wins and a loss. Rounding it that way is a
    // 67% record wearing a 50% label, and it made the road look a third shorter than it is.
    pending += GAMES_PER_DAY;
    while (pending >= 1) {
      pending -= 1;
      colony = Math.max(COLONY_START,
        colony + winnings(colony) * WIN_RATE - losses(colony) * (1 - WIN_RATE));
    }
    colony += granaryStored(colony, 1, DAY_MS);
    mycel += dailyMycel;
    pheromone += dailyPher;
    xp += QUESTS_PER_DAY * questXp;
    while (xp >= xpForLevel(level)) {
      xp -= xpForLevel(level);
      level++;
      const r = levelReward(level);
      mycel += r.mycel ?? 0;
      pheromone += r.pheromone ?? 0;
    }
    // The road pays as the colony passes each rung.
    let reached = 0;
    for (let i = 1; i <= ROAD_STOPS; i++) { if (colony >= stopColonyOf(i)) reached = i; else break; }
    for (let i = stop + 1; i <= reached; i++) {
      const r = freeReward(i);
      if (r) { mycel += r.mycel ?? 0; pheromone += r.pheromone ?? 0; }
    }
    stop = reached;
  }
  return { days, mycel: Math.round(mycel), pheromone: Math.round(pheromone), level };
}

/** The road's rungs, without importing a private helper. */
function stopColonyOf(index: number): number {
  const growth = (ROAD_LAST / 100) ** (1 / (ROAD_STOPS - 1));
  return Math.round(100 * growth ** (index - 1));
}

describe("the economy adds up", () => {
  const run = career();

  /**
   * A YEAR, give or take a season. Fifty chapters is a long road and it should read as one;
   * three months makes every chapter forgettable and three years makes the last forty of
   * them decoration.
   */
  it("takes about a year of real play to walk the road", () => {
    expect(run.days, `the road took ${run.days} days`).toBeGreaterThan(240);
    expect(run.days, `the road took ${run.days} days`).toBeLessThan(560);
  });

  /**
   * MYCELIUM MUST TRAIL DESIRE. A player should reach the end of the road at about the
   * point they have bought everything — with enough slack that they are never stuck, and
   * never so much that the currency stops meaning anything. It was 2.6x.
   */
  it("pays out a little more mycelium than there is to spend it on", () => {
    const ratio = run.mycel / mycelSink();
    expect(ratio, `earned ${run.mycel} against ${mycelSink()} of things to buy`).toBeGreaterThan(0.9);
    expect(ratio, `earned ${run.mycel} against ${mycelSink()} of things to buy`).toBeLessThan(1.8);
  });

  /**
   * ...and the same for pheromone, which was the worse of the two: at fifty pheromone to
   * the larva a single quest paid for five research levels, and the whole tree was covered
   * five times over.
   */
  it("pays out about as much pheromone as there is research to spend it on", () => {
    const ratio = run.pheromone / pheromoneSink();
    // A tighter band than mycelium's on purpose: pheromone buys ONE thing, so there is
    // nowhere for a surplus to go and an oversupply turns research into a formality.
    expect(ratio, `earned ${run.pheromone} against ${pheromoneSink()} of research`).toBeGreaterThan(0.7);
    expect(ratio, `earned ${run.pheromone} against ${pheromoneSink()} of research`).toBeLessThan(1.3);
  });

  /**
   * ONE COLONY FULLY RESEARCHED IS A COMMITMENT, not an afternoon. It used to be two days
   * of dailies, which is the same as it being free.
   */
  it("makes maxing a colony's research weeks of play, not days", () => {
    const perColony = Array.from({ length: RESEARCH_MAX }, (_, l) => researchCost(l))
      .reduce((a, b) => a + b, 0) * 3;
    const daysOfPheromone = perColony / (run.pheromone / run.days);
    expect(daysOfPheromone, `${Math.round(daysOfPheromone)} days`).toBeGreaterThan(14);
    expect(daysOfPheromone, `${Math.round(daysOfPheromone)} days`).toBeLessThan(90);
  });
});

describe("no single faucet carries the economy", () => {
  /**
   * The level track pays every other level for the whole career, and nobody counts it: it
   * is not a screen a player goes to for currency, it just arrives. That makes it exactly
   * the kind of stream that can quietly become the biggest one — as the daily sweep bonus
   * had, paying more mycelium in a year than the game has to spend it on.
   *
   * So it is held UNDER the quests, which are the thing a player actually plays for.
   */
  it("keeps the level track smaller than the quests it rides on", () => {
    const DAYS = 300;
    const questXp = QUEST_POOL.reduce((a, q) => a + q.xp, 0) / QUEST_POOL.length;
    let xp = 0, level = 1, levelMycel = 0, levelPher = 0;
    for (let d = 0; d < DAYS; d++) {
      xp += QUESTS_PER_DAY * questXp;
      while (xp >= xpForLevel(level)) {
        xp -= xpForLevel(level);
        level++;
        const r = levelReward(level);
        levelMycel += r.mycel ?? 0;
        levelPher += r.pheromone ?? 0;
      }
    }
    const avg = (k: "mycel" | "pheromone"): number => {
      const paid = QUEST_POOL.map((q) => q.reward[k] ?? 0).filter((v) => v > 0);
      return paid.reduce((a, b) => a + b, 0) / paid.length;
    };
    const mycelShare = QUEST_POOL.filter((q) => q.reward.mycel).length / QUEST_POOL.length;
    const questMycel = DAYS * QUESTS_PER_DAY * mycelShare * avg("mycel");
    const questPher = DAYS * QUESTS_PER_DAY * (1 - mycelShare) * avg("pheromone");

    expect(levelMycel, "levelling pays more mycelium than playing does").toBeLessThan(questMycel);
    expect(levelPher, "levelling pays more pheromone than playing does").toBeLessThan(questPher);
  });

  /** ...and the same for the bonus paid for clearing the day, which was the worst offender. */
  it("keeps the sweep bonus under what the three quests themselves pay", () => {
    const paid = QUEST_POOL.map((q) => q.reward.mycel ?? 0).filter((v) => v > 0);
    const avgQuest = paid.reduce((a, b) => a + b, 0) / paid.length;
    const mycelShare = QUEST_POOL.filter((q) => q.reward.mycel).length / QUEST_POOL.length;
    expect(QUEST_SWEEP_BONUS.mycel, "the bonus for finishing outweighs the quests")
      .toBeLessThan(QUESTS_PER_DAY * mycelShare * avgQuest);
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
    const colony = 640;
    expect(chapterOf(colony)).toBeGreaterThanOrEqual(10);
    expect(granaryRate(colony, 2)).toBeGreaterThanOrEqual(1);
  });
});
