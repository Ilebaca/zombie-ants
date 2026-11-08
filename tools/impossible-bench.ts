/**
 * Accelerated paired screening, not a claim of perfect play or a full-budget rating.
 * Run: npx tsx tools/impossible-bench.ts [budget divisor, default 32] [pairs, default 8]
 */
import {
  SPECIES, allTiles, createGame, defaultContext, endTurn, opponentModifiers,
} from "../src/engine";
import type { Player, SpeciesId } from "../src/engine";
import { aiTurn, PROFILES } from "../src/ai/search";
import { planImpossibleTurn } from "../src/ai/impossible";

const divisor = Math.max(1, Number(process.argv[2] ?? 32));
const pairs = Math.max(1, Math.min(8, Number(process.argv[3] ?? 8)));
const species = Object.keys(SPECIES) as SpeciesId[];
const sampleContext = defaultContext();
sampleContext.mods.ai = opponentModifiers("impossible");
const sample = createGame({
  map: "small", species: { you: "fire", ai: "army" }, seed: 9123,
  mods: sampleContext.mods, first: "ai",
});
const probeStart = Date.now();
const probe = planImpossibleTurn(sample, "ai", sampleContext, PROFILES.impossible);
console.log(JSON.stringify({ fullBudgetProbe: true, depth: probe.depth, nodes: probe.nodes, elapsed: Date.now() - probeStart }));
const originals = Object.values(PROFILES).map((profile) => ({ ...profile }));
for (const profile of Object.values(PROFILES)) {
  profile.nodeBudget = Math.max(200, Math.floor(profile.nodeBudget / divisor));
  profile.timeBudgetMs = Math.max(20, profile.timeBudgetMs / divisor);
}

interface Result { winner: Player | null; turns: number; elapsed: number }
async function play(index: number, swapped: boolean, equalUpgrades: boolean): Promise<Result> {
  const impossible: Player = swapped ? "ai" : "you";
  const ctx = defaultContext();
  ctx.mods[impossible] = opponentModifiers("impossible");
  if (equalUpgrades) ctx.mods[swapped ? "you" : "ai"] = opponentModifiers("impossible");
  const firstSpecies = species[index % species.length] ?? "fire";
  const secondSpecies = species[(index + 3) % species.length] ?? "army";
  const state = createGame({
    map: "small", seed: 7000 + index, first: "you", mods: ctx.mods,
    species: swapped ? { you: secondSpecies, ai: firstSpecies } : { you: firstSpecies, ai: secondSpecies },
  });
  const started = Date.now();
  for (let ply = 0; ply < 120 && !state.over; ply++) {
    aiTurn(state, state.current, state.current === impossible ? "impossible" : "hard", ctx);
    if (!state.over) endTurn(state, ctx.mods);
    // Keep the worker responsive even during a long screening run.
    await new Promise(setImmediate);
  }
  // A turn-capped game is a draw; territory is diagnostic, never counted as a win.
  const result = { winner: state.over ? state.winner : null, turns: state.turn, elapsed: Date.now() - started };
  console.log(JSON.stringify({
    mode: equalUpgrades ? "equal-upgrades" : "configured-difficulties",
    species: firstSpecies, impossibleSide: impossible,
    result: !result.winner ? "draw" : result.winner === impossible ? "impossible" : "hard",
    ...result,
    resources: allTiles(state).filter((tile) => tile.terrain === "resource" && tile.owner === impossible).length,
  }));
  return result;
}

try {
  for (const equal of [false, true]) {
    let wins = 0, losses = 0, draws = 0;
    for (let index = 0; index < pairs; index++) for (const swapped of [false, true]) {
      const result = await play(index, swapped, equal);
      if (!result.winner) draws++;
      else if ((result.winner === "ai") === swapped) wins++;
      else losses++;
    }
    console.log(JSON.stringify({ summary: true, equalUpgrades: equal, divisor, pairs, wins, losses, draws }));
  }
} finally {
  Object.values(PROFILES).forEach((profile, index) => Object.assign(profile, originals[index]));
}
