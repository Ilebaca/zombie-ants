/**
 * Sweep NORMAL's profile against a fixed HARD.
 *
 * The levels have to differ by what they can DO, not only by how long they look. Hard and
 * Normal ended up with nearly the same repertoire, so five times the node budget bought
 * four points of win rate. This finds which capability, removed from Normal, opens a gap
 * without dropping it to Easy's level.
 */
import { match } from "./arena";
import { PROFILES } from "../src/ai/search";
import { FULL } from "../src/ai/evaluate";

const N = Number(process.argv[2] ?? 16);
const SPEED = Number(process.argv[3] ?? 8);
for (const p of Object.values(PROFILES)) {
  p.timeBudgetMs = 3_600_000;
  p.nodeBudget = Math.max(100, Math.round(p.nodeBudget / SPEED));
}
const base = JSON.parse(JSON.stringify(PROFILES.normal));

const variants: Array<[string, () => void]> = [
  ["baseline", () => {}],
  ["no vein guard", () => { PROFILES.normal.gen.veinGuard = false; }],
  ["no travel", () => { PROFILES.normal.gen.travel = false; }],
  ["depth 2", () => { PROFILES.normal.depth = 2; }],
];

for (const [name, apply] of variants) {
  Object.assign(PROFILES.normal, JSON.parse(JSON.stringify(base)));
  apply();
  const vsHard = match("hard", "normal", N);
  const vsEasy = match("normal", "easy", N);
  const h = ((vsHard.aWins + vsHard.draws / 2) / N * 100).toFixed(0);
  const e = ((vsEasy.aWins + vsEasy.draws / 2) / N * 100).toFixed(0);
  console.log(`${name.padEnd(16)} hard beats it ${h.padStart(3)}%   it beats easy ${e.padStart(3)}%`);
}
