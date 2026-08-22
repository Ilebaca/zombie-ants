/**
 * Explain one position: what the AI can play, how it rates each option, and what it picks.
 *
 * Win rates say an AI is worse; they never say why. This prints the candidate list with
 * its ordering scores, then the static value of each move and the value after the
 * opponent's best reply — which is usually enough to tell a bad evaluation from a bad
 * move generator.
 *
 * The position below is the one that exposed the truncated-pass bug in iterative
 * deepening. Edit it to ask about a different one.
 */
import {
  defaultContext, endTurn, recomputeConnectivity, restore, snapshot,
} from "../src/engine";
import { blankGame, put } from "../src/engine/__tests__/helpers";
import { chooseMove, PROFILES } from "../src/ai/search";
import { generate } from "../src/ai/moves";
import { FULL, evaluate } from "../src/ai/evaluate";
import { applyAction } from "../src/ai/moves";

for (const p of Object.values(PROFILES)) p.timeBudgetMs = 3_600_000;
const ctx = defaultContext();

const s = blankGame("small");
put(s, 7, 7, { owner: "ai", struct: "nest", soldiers: 3 });
put(s, 7, 6, { owner: "ai", struct: "stable", soldiers: 40 });
put(s, 6, 7, { owner: "you", struct: "stable", soldiers: 30 });
for (const r of [6, 5, 4, 3, 2]) put(s, 6, r, { owner: "you", struct: "stable", soldiers: 2 });
put(s, 6, 1, { owner: "you", struct: "nest", soldiers: 10 });
recomputeConnectivity(s);
s.current = "ai";

const full = { limit: 8, travel: true, rally: true, reinforce: true, veinGuard: true };
console.log(`root evaluation: ${evaluate(s, "ai", ctx.mods, FULL).toFixed(0)}\n`);
console.log("  rank   static   after reply   action");

const snap = snapshot(s);
for (const c of generate(s, "ai", ctx, full)) {
  restore(s, snap); s.current = "ai";
  applyAction(s, c.action, ctx);
  if (!s.over) endTurn(s, ctx.mods);
  const stat = evaluate(s, "ai", ctx.mods, FULL);

  let worst = Infinity;
  const after = snapshot(s);
  for (const r of generate(s, "you", ctx, { ...full, travel: false, rally: false, veinGuard: false })) {
    restore(s, after); s.current = "you";
    applyAction(s, r.action, ctx);
    if (!s.over) endTurn(s, ctx.mods);
    worst = Math.min(worst, evaluate(s, "ai", ctx.mods, FULL));
  }
  restore(s, snap);
  const n = (v: number): string => (Math.abs(v) > 1e5 ? (v / 1e6).toFixed(1) + "M" : v.toFixed(0));
  console.log(`  ${c.score.toFixed(0).padStart(5)} ${n(stat).padStart(8)} ${n(worst).padStart(13)}   ${JSON.stringify(c.action)}`);
}

restore(s, snap); s.current = "ai";
const d = chooseMove(s, "ai", "hard", ctx);
console.log(`\nhard plays ${JSON.stringify(d.move?.action)} at depth ${d.depth} (${d.nodes} nodes), value ${d.value.toFixed(1)}`);
