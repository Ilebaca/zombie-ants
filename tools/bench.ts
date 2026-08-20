/** How long one AI turn takes, per difficulty and map. */
import { createGame, defaultContext, endTurn, NEUTRAL_MODS } from "../src/engine";
import type { MapId } from "../src/engine";
import { aiTurn, chooseMove } from "../src/ai/search";
import type { Difficulty } from "../src/ai/search";

const mods = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };
const ctx = defaultContext();

for (const map of ["tiny", "small", "mid"] as MapId[]) {
  for (const d of ["easy", "normal", "hard"] as Difficulty[]) {
    const s = createGame({ map, species: { you: "fire", ai: "leafcutter" }, seed: 7 });
    // Play twelve turns of the same difficulty so the board is a real mid-game.
    for (let i = 0; i < 12 && !s.over; i++) { aiTurn(s, s.current, d, ctx); if (!s.over) endTurn(s, mods); }
    if (s.over) { console.log(`${map}/${d}: game ended early`); continue; }
    const t0 = Date.now();
    const dec = chooseMove(s, s.current, d, ctx);
    const ms = Date.now() - t0;
    console.log(`${map.padEnd(6)} ${d.padEnd(7)} ${String(ms).padStart(6)}ms  depth ${dec.depth}  ${dec.nodes} nodes`);
  }
}
