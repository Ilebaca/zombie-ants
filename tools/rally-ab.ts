/** Is rally worth giving the AI, now that a fist is priced with a cap? */
import { match } from "./arena";
import { PROFILES } from "../src/ai/search";
const N = Number(process.argv[2] ?? 12);
const SPEED = Number(process.argv[3] ?? 12);
for (const p of Object.values(PROFILES)) {
  p.timeBudgetMs = Math.max(10, Math.round(p.timeBudgetMs / SPEED));
  p.nodeBudget = Math.max(100, Math.round(p.nodeBudget / SPEED));
}
for (const rally of [true, false]) {
  PROFILES.hard.gen.rally = rally;
  const r = match("hard", "normal", N);
  const pct = ((r.aWins + r.draws / 2) / N * 100).toFixed(1);
  console.log(`rally=${String(rally).padEnd(5)} ${String(r.aWins).padStart(3)}-${String(r.bWins).padStart(3)}  ${pct.padStart(5)}%`);
}
