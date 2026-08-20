/**
 * Is the game itself fair?
 *
 * A mirror match — the same difficulty on both sides — should come out near 50/50. If it
 * does not, something structural is deciding games, and every strength measurement taken
 * on top of it is measuring that instead. Three things could do it: the starting corner,
 * moving first, or the species matchup.
 */
import { playGame } from "./arena";
import { PROFILES } from "../src/ai/search";
import type { Difficulty } from "../src/ai/search";
import type { MapId, SpeciesId } from "../src/engine";

const SPEED = Number(process.argv[4] ?? 6);
for (const p of Object.values(PROFILES)) {
  p.timeBudgetMs = 3_600_000;
  p.nodeBudget = Math.max(200, Math.round(p.nodeBudget / SPEED));
}

const level = (process.argv[2] ?? "normal") as Difficulty;
const games = Number(process.argv[3] ?? 12);
const maps: MapId[] = ["tiny", "small", "mid"];
const species: SpeciesId[] = ["fire", "leafcutter", "carpenter", "weaver", "army", "bullet"];

for (const map of maps) {
  // Same difficulty AND the same species on both sides: anything left is the board.
  let you = 0, ai = 0, none = 0;
  const bySpecies: string[] = [];
  for (const sp of species) {
    let sYou = 0, sAi = 0;
    for (let i = 0; i < games; i++) {
      const r = playGame(level, level, 300 + i * 17, map, { you: sp, ai: sp });
      if (r.winner === "you") { you++; sYou++; } else if (r.winner === "ai") { ai++; sAi++; } else none++;
    }
    bySpecies.push(`${sp}:${sYou}-${sAi}`);
  }
  const total = you + ai + none;
  const pct = (you / total * 100).toFixed(0);
  console.log(`${map.padEnd(6)} bottom-left ${String(you).padStart(3)}, top-right ${String(ai).padStart(3)}, unresolved ${none}  (bottom-left ${pct}%)`);
  console.log(`       ${bySpecies.join("  ")}`);
}
