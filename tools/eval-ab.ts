/** Sweep one evaluation weight against the shipped `normal`. */
import { match } from "./arena";
import { PROFILES } from "../src/ai/search";
import { FULL } from "../src/ai/evaluate";

const N = Number(process.argv[2] ?? 12);
const SPEED = Number(process.argv[3] ?? 10);
const KEY = (process.argv[4] ?? "fragility") as keyof typeof FULL;
const VALUES = (process.argv[5] ?? "4,0").split(",").map(Number);
// Nodes, not the clock — see tools/ladder.ts.
for (const p of Object.values(PROFILES)) {
  p.timeBudgetMs = 3_600_000;
  p.nodeBudget = Math.max(100, Math.round(p.nodeBudget / SPEED));
}
const original = FULL[KEY];
for (const v of VALUES) {
  FULL[KEY] = v;
  const r = match("hard", "normal", N);
  const pct = ((r.aWins + r.draws / 2) / N * 100).toFixed(1);
  console.log(`${KEY}=${String(v).padEnd(5)} ${String(r.aWins).padStart(3)}-${String(r.bWins).padStart(3)}  ${pct.padStart(5)}%`);
}
FULL[KEY] = original;
