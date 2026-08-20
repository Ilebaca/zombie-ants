/**
 * How do these matches actually end?
 *
 * Hard beats Easy less convincingly than Normal does, which should not be true. The way to
 * find out why is to look at HOW the games finish: a colony wiped out and a colony that
 * simply had fewer tiles when the clock ran out are very different losses, and only one of
 * them says the AI played badly.
 */
import { playGame } from "./arena";
import { PROFILES } from "../src/ai/search";
import type { Difficulty } from "../src/ai/search";
import type { MapId, Player, SpeciesId } from "../src/engine";

const SPEED = Number(process.argv[4] ?? 8);
for (const p of Object.values(PROFILES)) {
  p.timeBudgetMs = 3_600_000;
  p.nodeBudget = Math.max(200, Math.round(p.nodeBudget / SPEED));
}
const a = (process.argv[2] ?? "hard") as Difficulty;
const b = (process.argv[3] ?? "easy") as Difficulty;
const games = Number(process.argv[5] ?? 12);
const map = (process.argv[6] ?? "small") as MapId;
const species: SpeciesId[] = ["fire", "leafcutter", "carpenter", "weaver", "army", "bullet"];

const tally = new Map<string, number>();
let aWins = 0, bWins = 0;
for (let i = 0; i < games; i++) {
  const aIsYou = i % 2 === 0;
  const sp: Record<Player, SpeciesId> = {
    you: species[i % species.length] as SpeciesId,
    ai: species[(i + 3) % species.length] as SpeciesId,
  };
  const r = playGame(aIsYou ? a : b, aIsYou ? b : a, 1000 + i, map, sp);
  const won = r.winner !== null && (r.winner === "you") === aIsYou;
  if (won) aWins++; else if (r.winner) bWins++;
  const key = `${won ? a : b} won by ${r.reason}`;
  tally.set(key, (tally.get(key) ?? 0) + 1);
}
console.log(`${a} vs ${b}: ${aWins}-${bWins} over ${games} games on ${map}`);
for (const [k, n] of [...tally].sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);
