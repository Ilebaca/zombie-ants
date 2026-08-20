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
  for (let i = 0; i < games; i++) {
    const sp = species[i % species.length] as SpeciesId;
    const r = playGame(level, level, 300 + i, map, { you: sp, ai: sp });
    if (r.winner === "you") you++; else if (r.winner === "ai") ai++; else none++;
  }
  const pct = (you / games * 100).toFixed(0);
  console.log(`${map.padEnd(6)} same species both sides: bottom-left ${String(you).padStart(2)}, top-right ${String(ai).padStart(2)}, unresolved ${none}   (bottom-left ${pct}%)`);
}
