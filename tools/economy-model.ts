/**
 * Seeded calendar projection through the real profile settlement and purchase methods.
 * Match events are assumptions, not measurements: see docs/economy-balance.md.
 * No real save, clock, payment gateway or DOM is accessed.
 */
import { CHAMBER_MAX, SPECIES, SPECIES_LEVEL_MAX, chamberCost, researchCost } from "../src/engine";
import type { SpeciesId } from "../src/engine";
import { CHAMBERS, SPECIES_ORDER, SPECIES_UNLOCK } from "../src/platform/catalogue";
import { GRANARY_LEVELS } from "../src/platform/granary";
import { COLONY_START } from "../src/platform/colony";
import { CHALLENGE_REWARD, DAILY_BONUS_PHEROMONE } from "../src/platform/challenge-rewards";
import { ProfileStore } from "../src/platform/profile";
import { MemoryStore } from "../src/platform/storage";
import { ROAD_LAST, ROAD_STOPS, chapterOf, roadKey, stopColony } from "../src/platform/road";
import { questDef } from "../src/platform/quests";
import { WIN_LARVA } from "../src/platform/traits";

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 5, 12);
const MAIN: SpeciesId = "fire";

export interface EconomyOptions {
  days: number;
  gamesPerDay: number;
  winRate: number;
  seed?: number;
  /** Balanced purchases reserve half of earned mycelium for the next species. */
  spend?: boolean;
  gift?: boolean;
  quests?: boolean;
  road?: boolean;
  levels?: boolean;
  league?: boolean;
  dailyChallenge?: boolean;
  pass?: boolean;
  turns?: number;
}

export interface Money { mycel: number; pheromone: number; larva: number }
type Source = "matches" | "gift" | "quests" | "levels" | "road" | "league" | "challenge";
export interface EconomySnapshot {
  day: number; colony: number; chapter: number; level: number;
  earned: Money; wallet: Money; species: number; chamberLevels: number;
  researchLevels: number; mainLevel: number; granary: number;
}
export interface EconomyRun {
  options: EconomyOptions;
  matches: number; wins: number;
  earned: Money;
  sources: Record<Source, Money>;
  snapshots: EconomySnapshot[];
  firstPurchaseDay: number | null;
  speciesDays: Partial<Record<SpeciesId, number>>;
  mainMaxDay: number | null;
  chambersMaxDay: number | null;
  freeResearchMaxDay: number | null;
  roadCompleteDay: number | null;
  purchaseDays: number[];
  final: EconomySnapshot;
}

const money = (): Money => ({ mycel: 0, pheromone: 0, larva: 0 });
const sum = (a: Money, b: Money): void => {
  a.mycel += b.mycel; a.pheromone += b.pheromone; a.larva += b.larva;
};
const rngFor = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

/** All currencies actually buyable without cash; premium species are not a soft-currency sink. */
export function finiteSinks(): { mycel: number; pheromone: number; perSpecies: number;
  chambers: number; species: number; granary: number } {
  const chambers = CHAMBERS.reduce((total, ch) => total
    + Array.from({ length: ch.max }, (_, i) => chamberCost(i)).reduce((a, b) => a + b, 0), 0);
  const species = SPECIES_ORDER.filter(id => !SPECIES[id].premium);
  const perSpecies = Array.from({ length: SPECIES_LEVEL_MAX }, (_, i) => researchCost(i))
    .reduce((a, b) => a + b, 0);
  const speciesCost = species.reduce((total, id) => total + SPECIES_UNLOCK[id], 0);
  const granary = GRANARY_LEVELS.reduce((total, level) => total + level.cost, 0);
  return {
    mycel: chambers + speciesCost + granary, chambers, species: speciesCost, granary,
    pheromone: species.length * perSpecies,
    perSpecies,
  };
}

export function simulateEconomy(options: EconomyOptions): EconomyRun {
  if (!Number.isInteger(options.days) || options.days < 1
    || !Number.isInteger(options.gamesPerDay) || options.gamesPerDay < 0
    || options.winRate < 0 || options.winRate > 1) throw new Error("Invalid economy scenario");
  const random = rngFor(options.seed ?? 1);
  const events = rngFor((options.seed ?? 1) ^ 0xa511e9b3);
  const store = new ProfileStore(new MemoryStore());
  store.update(p => {
    p.name = "Economy model";
    p.colony = COLONY_START;
    p.granaryAt = START - DAY;
    p.freeAt = 0;
    p.pass = options.pass ?? false;
    p.friends = [];
    p.duelsIn = [];
  });
  if (options.league) store.season(START);
  const earned = money();
  const sources = Object.fromEntries(
    ["matches", "gift", "quests", "levels", "road", "league", "challenge"]
      .map(key => [key, money()]),
  ) as Record<Source, Money>;
  const run: EconomyRun = {
    options, matches: 0, wins: 0, earned, sources, snapshots: [],
    firstPurchaseDay: null, speciesDays: {}, mainMaxDay: null,
    chambersMaxDay: null, freeResearchMaxDay: null, roadCompleteDay: null,
    purchaseDays: [], final: {} as EconomySnapshot,
  };
  const track = (source: Source, action: () => void): void => {
    const { mycel, pheromone, larva } = store.get();
    action();
    const after = store.get();
    const delta = { mycel: after.mycel - mycel, pheromone: after.pheromone - pheromone,
      larva: after.larva - larva };
    sum(sources[source], delta);
    sum(earned, delta);
  };
  // Shuffle a balanced twenty-match deck. It permits losing streaks while preserving
  // the requested long-run win rate instead of rounding 3 matches into 2 wins.
  let deck: boolean[] = [];
  const nextResult = (): boolean => {
    if (!deck.length) {
      const wins = Math.round(options.winRate * 20);
      deck = Array.from({ length: 20 }, (_, i) => i < wins);
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      }
    }
    return deck.pop() ?? false;
  };
  let speciesSpent = 0;
  const bought = (day: number): void => {
    run.firstPurchaseDay ??= day;
    if (run.purchaseDays[run.purchaseDays.length - 1] !== day) run.purchaseDays.push(day);
  };
  const spend = (day: number, now: number): void => {
    const nextSpecies = SPECIES_ORDER.find(id => store.canUnlock(id));
    if (nextSpecies) {
      const cost = SPECIES_UNLOCK[nextSpecies];
      if (earned.mycel * .5 - speciesSpent >= cost && store.unlockSpecies(nextSpecies)) {
        speciesSpent += cost;
        run.speciesDays[nextSpecies] = day;
        bought(day);
      }
    }
    const target = SPECIES_ORDER.find(id => store.canUnlock(id));
    const reserve = target ? Math.min(SPECIES_UNLOCK[target],
      Math.max(0, earned.mycel * .5 - speciesSpent)) : 0;
    // A bounded loop, and every iteration buys a real capped upgrade.
    for (let i = 0; i < 30; i++) {
      const allowance = store.get().mycel - reserve;
      const candidates: { cost: number; buy: () => boolean }[] = [];
      for (const ch of CHAMBERS) {
        const level = store.get().hill[ch.id] ?? 0;
        if (level < ch.max) candidates.push({
          cost: chamberCost(level), buy: () => store.buyChamber(ch.id),
        });
      }
      const granary = store.granary(now);
      if (granary.next && granary.chapter >= granary.next.chapter) {
        candidates.push({ cost: granary.next.cost, buy: () => store.buyGranary(now) });
      }
      const purchase = candidates.sort((a, b) => a.cost - b.cost).find(c => c.cost <= allowance);
      if (!purchase || !purchase.buy()) break;
      bought(day);
    }
    for (let i = 0; i < SPECIES_ORDER.length * SPECIES_LEVEL_MAX; i++) {
      const order = [MAIN, ...SPECIES_ORDER.filter(id => id !== MAIN)];
      const id = order.find(id => store.isUnlocked(id)
        && (store.get().research[id]?.level ?? 0) < SPECIES_LEVEL_MAX);
      if (!id || !store.buyResearch(id)) break;
      bought(day);
    }
  };
  const snapshot = (day: number): EconomySnapshot => {
    const p = store.get();
    return {
      day, colony: p.colony, chapter: chapterOf(p.colony), level: store.level().level,
      earned: { ...earned }, wallet: { mycel: p.mycel, pheromone: p.pheromone, larva: p.larva },
      species: p.unlocked.filter(id => !SPECIES[id].premium).length,
      chamberLevels: Object.values(p.hill).reduce((a, b) => a + (b ?? 0), 0),
      researchLevels: Object.values(p.research).reduce((a, b) => a + (b?.level ?? 0), 0),
      mainLevel: p.research[MAIN]?.level ?? 0,
      granary: p.granary,
    };
  };

  const stops = Array.from({ length: ROAD_STOPS }, (_, i) => ({
    colony: stopColony(i + 1), free: roadKey("free", i + 1), pass: roadKey("pass", i + 1),
  }));
  const paidRoad = new Set<string>();
  const claimRoad = (): void => {
    if (options.road === false) return;
    track("road", () => {
      for (const stop of stops) {
        if (stop.colony > store.get().colony) break;
        for (const key of options.pass ? [stop.free, stop.pass] : [stop.free]) {
          if (!paidRoad.has(key) && store.claimRoad(key, events)) paidRoad.add(key);
        }
      }
    });
  };

  for (let day = 1; day <= options.days; day++) {
    const now = START + (day - 1) * DAY;
    store.dailyQuests(now);
    store.collectGranary(now);
    claimRoad();
    if (options.gift !== false) track("gift", () => { store.claimDailyGift(now); });
    const tunnelQuest = store.get().quests.some(q => questDef(q.id)?.kind === "tunnel");
    const tunnelSpecies = store.get().unlocked.find(id => SPECIES[id].ability.kind === "tunnel");
    for (let game = 0; game < options.gamesPerDay; game++) {
      const won = nextResult();
      const species: SpeciesId = tunnelQuest && tunnelSpecies ? tunnelSpecies : MAIN;
      const turns = options.turns ?? 45;
      const queens = events() < .35 ? 1 : 0;
      track("matches", () => {
        store.recordResult(won, species, turns, { byNest: won, queens, playedMs: turns * 6000 });
        if (won) store.update(p => { p.larva += WIN_LARVA; });
      });
      run.matches++;
      if (won) run.wins++;
      if (options.quests !== false) {
        store.questProgress("play", 1, now);
        store.questProgress("turns", turns, now);
        store.questProgress("conquered", won ? 12 : 6, now);
        store.questProgress("ability", 2, now);
        if (queens) store.questProgress("queen", queens, now);
        if (SPECIES[species].ability.kind === "tunnel") store.questProgress("tunnel", 1, now);
        if (won) { store.questProgress("win", 1, now); store.questProgress("nest", 1, now); }
        track("quests", () => {
          for (const quest of store.get().quests) store.claimQuest(quest.id, now);
        });
      }
      if (options.dailyChallenge && game === 0 && won) track("challenge", () => {
        if (store.beatDaily(Math.floor(now / DAY))) store.update(p => {
          p.mycel += CHALLENGE_REWARD;
          p.pheromone += DAILY_BONUS_PHEROMONE;
        });
      });
      // Claims happen at the peak reached, before a later defeat can lower eligibility.
      claimRoad();
      if (options.levels !== false) track("levels", () => {
        for (const level of store.unclaimedLevels()) store.claimLevel(level);
      });
      const held = store.get().pendingHomeGain;
      if (held) store.acknowledgeHomeGain(held);
    }
    if (options.league) track("league", () => { store.rollSeason(now); });
    if (options.spend !== false) spend(day, now);
    const p = store.get();
    if ((p.research[MAIN]?.level ?? 0) === SPECIES_LEVEL_MAX) run.mainMaxDay ??= day;
    if (CHAMBERS.every(ch => (p.hill[ch.id] ?? 0) === CHAMBER_MAX[ch.id])) run.chambersMaxDay ??= day;
    if (SPECIES_ORDER.filter(id => !SPECIES[id].premium)
      .every(id => (p.research[id]?.level ?? 0) === SPECIES_LEVEL_MAX)) run.freeResearchMaxDay ??= day;
    if (p.colony >= ROAD_LAST) run.roadCompleteDay ??= day;
    run.final = snapshot(day);
    if ([1, 3, 7, 14, 30, 60, 90, 180, 365].includes(day) || day === options.days) {
      run.snapshots.push(run.final);
    }
  }
  return run;
}
