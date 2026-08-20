/**
 * Does the AI ever actually fight for the Hive?
 *
 * The surge is the biggest swing in the game, so a weight sweep on it that changes nothing
 * has two possible explanations: the weight does not matter, or the situation never arises.
 * This tells them apart by counting what happens in real games.
 */
import { createGame, defaultContext, endTurn, allTiles, NEUTRAL_MODS } from "../src/engine";
import type { MapId, Player, SpeciesId } from "../src/engine";
import { aiTurn, PROFILES } from "../src/ai/search";
import type { Difficulty } from "../src/ai/search";

for (const p of Object.values(PROFILES)) p.timeBudgetMs = 3_600_000;
const mods = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };
const ctx = defaultContext();
const level = (process.argv[2] ?? "hard") as Difficulty;
const games = Number(process.argv[3] ?? 6);
const map = (process.argv[4] ?? "small") as MapId;

let captures = 0, contested = 0, awoke = 0, played = 0;
for (let i = 0; i < games; i++) {
  const sp: Record<Player, SpeciesId> = { you: "fire", ai: "leafcutter" };
  const s = createGame({ map, species: sp, seed: 900 + i });
  let guard = 0;
  let sawAwake = false, sawCapture = false, sawContact = false;
  while (!s.over && guard++ < 4000) {
    const events = aiTurn(s, s.current, level, ctx);
    for (const e of events) {
      if (e.type === "hiveAwake") sawAwake = true;
      if (e.type === "hiveCaptured") { sawCapture = true; captures++; }
      if (e.type === "combat" && allTiles(s).some((t) =>
        (t.terrain === "hiveQ" || t.terrain === "hiveG") && t.c === e.at.c && t.r === e.at.r)) sawContact = true;
    }
    if (s.over) break;
    const turned = endTurn(s, mods);
    for (const e of turned) if (e.type === "hiveAwake") sawAwake = true;
  }
  played++;
  if (sawAwake) awoke++;
  if (sawContact || sawCapture) contested++;
}
console.log(`${level} on ${map}: ${played} games`);
console.log(`  hive awoke in ${awoke}, was attacked in ${contested}, captured ${captures} times`);
