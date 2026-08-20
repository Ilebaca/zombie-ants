/**
 * A/B one profile knob against the shipped `normal`.
 *
 * Strength questions ("is rally helping?", "is depth helping?") are unanswerable by
 * reading the code — the only answer is games. This flips one field on `hard` and plays.
 */
import { match } from "./arena";
import { PROFILES } from "../src/ai/search";

const N = Number(process.argv[2] ?? 12);
const SPEED = Number(process.argv[3] ?? 8);
// Nodes, not the clock — see tools/ladder.ts.
for (const p of Object.values(PROFILES)) {
  p.timeBudgetMs = 3_600_000;
  p.nodeBudget = Math.max(100, Math.round(p.nodeBudget / SPEED));
}

const variants: Array<[string, () => void]> = [
  ["baseline", () => {}],
  ["no vein reflex", () => { PROFILES.hard.veinReflex = false; }],
  ["branching 8", () => { PROFILES.hard.branching = 8; }],
  ["no rally", () => { PROFILES.hard.gen.rally = false; }],
  ["no travel", () => { PROFILES.hard.gen.travel = false; }],
  ["no ability search", () => { PROFILES.hard.searchAbility = false; }],
  ["depth 4", () => { PROFILES.hard.depth = 4; }],
];

const base = JSON.parse(JSON.stringify(PROFILES.hard));
for (const [name, apply] of variants) {
  Object.assign(PROFILES.hard, JSON.parse(JSON.stringify(base)));
  apply();
  const t0 = Date.now();
  const r = match("hard", "normal", N);
  const pct = ((r.aWins + r.draws / 2) / N * 100).toFixed(1);
  console.log(`${name.padEnd(20)} ${String(r.aWins).padStart(3)}-${String(r.bWins).padStart(3)}  ${pct.padStart(5)}%  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
