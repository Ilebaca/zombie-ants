/**
 * Headless AI-vs-AI arena.
 *
 * The only honest way to answer "is this AI stronger?" is to play it against the old one
 * many times and count. Run with:  npx tsx tools/arena.ts <A> <B> [games]
 * where A and B are difficulties. Sides and species are swapped every game so neither
 * result comes from the first-move advantage or a species matchup.
 */
import {
  createGame, defaultContext, endTurn, allTiles, NEUTRAL_MODS,
} from "../src/engine";
import type { GameState, Player, SpeciesId, MapId } from "../src/engine";
import { aiTurn, PROFILES } from "../src/ai/search";
import type { Difficulty } from "../src/ai/search";

const mods = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };
const ctx = defaultContext();

export interface GameResult { winner: Player | null; turns: number; reason: string }

export function playGame(
  youAI: Difficulty, aiAI: Difficulty, seed: number, map: MapId,
  species: Record<Player, SpeciesId>,
): GameResult {
  const state: GameState = createGame({ map, species, seed });
  let guard = 0;
  while (!state.over && guard++ < 4000) {
    const p = state.current;
    aiTurn(state, p, p === "you" ? youAI : aiAI, ctx);
    if (state.over) break;
    endTurn(state, mods);
  }
  const you = allTiles(state).filter((t) => t.owner === "you").length;
  const ai = allTiles(state).filter((t) => t.owner === "ai").length;
  return {
    winner: state.winner,
    turns: state.turn,
    reason: state.over ? "over" : `stalled you=${you} ai=${ai}`,
  };
}

const SPECIES: SpeciesId[] = ["fire", "leafcutter", "carpenter", "weaver", "army", "bullet"];

/** A round-robin of `games` matches with A and B swapping sides each time. */
export function match(a: Difficulty, b: Difficulty, games: number, map: MapId = "small"): {
  aWins: number; bWins: number; draws: number; avgTurns: number;
  /** Wins by SIDE rather than by player, to catch a first-move advantage that swamps skill. */
  youWins: number; aiWins: number;
} {
  let aWins = 0, bWins = 0, draws = 0, turns = 0, youWins = 0, aiWins = 0;
  for (let i = 0; i < games; i++) {
    const aIsYou = i % 2 === 0;
    const sp: Record<Player, SpeciesId> = {
      you: SPECIES[i % SPECIES.length] as SpeciesId,
      ai: SPECIES[(i + 3) % SPECIES.length] as SpeciesId,
    };
    const r = playGame(aIsYou ? a : b, aIsYou ? b : a, 1000 + i, map, sp);
    turns += r.turns;
    if (r.winner === "you") youWins++;
    if (r.winner === "ai") aiWins++;
    if (r.winner === null) draws++;
    else if ((r.winner === "you") === aIsYou) aWins++;
    else bWins++;
  }
  return { aWins, bWins, draws, avgTurns: turns / games, youWins, aiWins };
}

if (process.argv[1]?.endsWith("arena.ts")) {
  // Pin to the node budget, never the clock. The shipped budgets are wall-clock so a slow
  // phone thinks less rather than stuttering; a busy machine also thinks less, which would
  // make this measure the load on the box instead of the AI (see tools/ladder.ts).
  for (const p of Object.values(PROFILES)) p.timeBudgetMs = 3_600_000;
  const a = (process.argv[2] ?? "hard") as Difficulty;
  const b = (process.argv[3] ?? "easy") as Difficulty;
  const n = Number(process.argv[4] ?? 20);
  const map = (process.argv[5] ?? "small") as MapId;
  const t0 = Date.now();
  const r = match(a, b, n, map);
  const pct = ((r.aWins + r.draws / 2) / n * 100).toFixed(1);
  console.log(`${a} vs ${b} on ${map}: ${r.aWins}-${r.bWins}-${r.draws}  (${a} scores ${pct}%)`);
  console.log(`by side: bottom-left ${r.youWins}, top-right ${r.aiWins}  (a lopsided split means`);
  console.log(`the map or the move order decided it, not the difficulty)`);
  console.log(`avg ${r.avgTurns.toFixed(1)} turns · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
