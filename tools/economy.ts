/** npm run economy -- produces a repeatable free-player pacing report. */
import { finiteSinks, simulateEconomy } from "./economy-model";
import type { EconomyOptions } from "./economy-model";

const days = Number(process.argv[2] ?? 540);
const scenarios: [string, Partial<EconomyOptions>][] = [
  ["casual", { gamesPerDay: 1 }],
  ["light", { gamesPerDay: 2 }],
  ["regular", { gamesPerDay: 3 }],
  ["active", { gamesPerDay: 5 }],
  ["learning", { gamesPerDay: 3, winRate: .4 }],
  ["experienced", { gamesPerDay: 3, winRate: .6 }],
  ["engaged", { gamesPerDay: 3, league: true, dailyChallenge: true }],
];
const cohort = Array.from({ length: 12 }, (_, i) => {
  const r = simulateEconomy({ days, gamesPerDay: 3, winRate: .5, seed: i + 1 });
  return { seed: i + 1, firstPurchaseDay: r.firstPurchaseDay, speciesDays: r.speciesDays,
    mainMaxDay: r.mainMaxDay, chambersMaxDay: r.chambersMaxDay,
    freeResearchMaxDay: r.freeResearchMaxDay, roadCompleteDay: r.roadCompleteDay };
});
console.log(JSON.stringify({ sinks: finiteSinks(), cohort, scenarios: scenarios.map(([name, patch]) => {
  const r = simulateEconomy({ days, gamesPerDay: 3, winRate: .5, seed: 7, ...patch });
  return { name, options: r.options, matches: r.matches, wins: r.wins,
    sources: r.sources, earned: r.earned, firstPurchaseDay: r.firstPurchaseDay,
    speciesDays: r.speciesDays, mainMaxDay: r.mainMaxDay,
    chambersMaxDay: r.chambersMaxDay, freeResearchMaxDay: r.freeResearchMaxDay,
    roadCompleteDay: r.roadCompleteDay, purchaseDays: r.purchaseDays.length,
    snapshots: r.snapshots, final: r.final };
}) }, null, 2));
