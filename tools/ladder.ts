/**
 * The strength ladder: each difficulty against the one below it.
 *
 * `SPEED` divides every level's node budget so a full ladder finishes in minutes instead
 * of an hour. It makes every level shallower by the same factor, so the ordering it
 * measures is the ordering the shipped budgets give — just faster to find out.
 */
import { match } from "./arena";
import { PROFILES } from "../src/ai/search";

const N = Number(process.argv[2] ?? 20);
const MAP = (process.argv[3] ?? "small") as "tiny" | "small" | "mid";
const SPEED = Number(process.argv[4] ?? 1);
// Budget by NODES, never by the clock. The shipped budgets are wall-clock so a slow phone
// thinks less rather than stuttering — which also means a busy machine thinks less, and a
// ladder run off a clock measures the load on the box as much as the strength of the AI.
// Nodes give the same search every run, so two ladders are comparable.
for (const p of Object.values(PROFILES)) {
  p.timeBudgetMs = 3_600_000;
  p.nodeBudget = Math.max(100, Math.round(p.nodeBudget / SPEED));
}

for (const [a, b] of [["hard", "normal"], ["hard", "easy"], ["normal", "easy"]] as const) {
  const t0 = Date.now();
  const r = match(a, b, N, MAP);
  const pct = ((r.aWins + r.draws / 2) / N * 100).toFixed(1);
  console.log(`${a.padEnd(6)} vs ${b.padEnd(6)} ${String(r.aWins).padStart(3)}-${String(r.bWins).padStart(3)}-${r.draws}  ${pct.padStart(5)}%  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
