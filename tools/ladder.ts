/**
 * The strength ladder: each difficulty against the one below it.
 *
 * `SPEED` scales every profile's thinking time so a full ladder finishes in minutes
 * instead of an hour. It makes every level shallower by the same factor, so the ordering
 * it measures is the ordering the shipped budgets give — just faster to find out.
 */
import { match } from "./arena";
import { PROFILES } from "../src/ai/search";

const N = Number(process.argv[2] ?? 20);
const MAP = (process.argv[3] ?? "small") as "tiny" | "small" | "mid";
const SPEED = Number(process.argv[4] ?? 1);
if (SPEED !== 1) {
  for (const p of Object.values(PROFILES)) {
    p.timeBudgetMs = Math.max(10, Math.round(p.timeBudgetMs / SPEED));
    p.nodeBudget = Math.max(100, Math.round(p.nodeBudget / SPEED));
  }
}

for (const [a, b] of [["hard", "normal"], ["hard", "easy"], ["normal", "easy"]] as const) {
  const t0 = Date.now();
  const r = match(a, b, N, MAP);
  const pct = ((r.aWins + r.draws / 2) / N * 100).toFixed(1);
  console.log(`${a.padEnd(6)} vs ${b.padEnd(6)} ${String(r.aWins).padStart(3)}-${String(r.bWins).padStart(3)}-${r.draws}  ${pct.padStart(5)}%  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
