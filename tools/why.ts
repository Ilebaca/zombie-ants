/** Print what the AI is thinking about one position. */
import { defaultContext, recomputeConnectivity } from "../src/engine";
import { blankGame, put } from "../src/engine/__tests__/helpers";
import { chooseMove } from "../src/ai/search";
import { generate } from "../src/ai/moves";

const ctx = defaultContext();
const s = blankGame("small");
put(s, 1, 1, { owner: "ai", struct: "nest", soldiers: 10 });
put(s, 1, 2, { owner: "ai", struct: "stable", soldiers: 3 });
put(s, 1, 3, { owner: "ai", struct: "stable", soldiers: 3 });
put(s, 1, 4, { owner: "ai", struct: "stable", soldiers: 20 });
put(s, 0, 4, { terrain: "resource" });
put(s, 2, 4, { owner: "you", struct: "stable", soldiers: 80 });
put(s, 7, 7, { owner: "you", struct: "nest", soldiers: 10 });
recomputeConnectivity(s);
s.current = "ai";

for (const c of generate(s, "ai", ctx, { limit: 8, travel: true, rally: true, reinforce: true, veinGuard: true })) {
  console.log(c.score.toFixed(0).padStart(6), JSON.stringify(c.action));
}
import { snapshot, restore } from "../src/engine";
import { applyAction } from "../src/ai/moves";
import { FULL, evaluate } from "../src/ai/evaluate";
const mods = ctx.mods;
for (const c of generate(s, "ai", ctx, { limit: 8, travel: true, rally: true, reinforce: true, veinGuard: true })) {
  const snap = snapshot(s);
  s.current = "ai";
  applyAction(s, c.action, ctx);
  console.log("static", evaluate(s, "ai", mods, FULL).toFixed(1).padStart(8), JSON.stringify(c.action));
  restore(s, snap);
}
for (const level of ["normal", "hard"] as const) {
  const d = chooseMove(s, "ai", level, ctx);
  console.log(level, "CHOSE:", JSON.stringify(d.move?.action), "value", d.value.toFixed(1), "depth", d.depth);
}
