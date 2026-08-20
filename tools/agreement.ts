/**
 * How often does the SEARCH actually change the move?
 *
 * Every difficulty comparison came back at exactly 50%, whatever I varied. The simplest
 * explanation is that the levels are playing the same moves — that the search almost always
 * confirms the move ordering's first choice and the depth is decoration. This measures it
 * directly: play real games, and at each AI turn count how often the searched move differs
 * from the top-rated candidate, and how often the levels differ from each other.
 */
import { createGame, defaultContext, endTurn, NEUTRAL_MODS } from "../src/engine";
import type { MapId, Player, SpeciesId } from "../src/engine";
import { aiTurn, chooseMove, PROFILES } from "../src/ai/search";
import { generate } from "../src/ai/moves";
import type { Action, Difficulty } from "../src/ai/moves";

for (const p of Object.values(PROFILES)) p.timeBudgetMs = 3_600_000;
const mods = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };
const ctx = defaultContext();

const same = (a: Action | undefined, b: Action | undefined): boolean =>
  !!a && !!b && a.kind === b.kind && a.to.c === b.to.c && a.to.r === b.to.r;

const map = (process.argv[2] ?? "small") as MapId;
const games = Number(process.argv[3] ?? 3);

let turns = 0, searchChanged = 0, levelsDiffer = 0;
for (let g = 0; g < games; g++) {
  const sp: Record<Player, SpeciesId> = { you: "fire", ai: "leafcutter" };
  const s = createGame({ map, species: sp, seed: 700 + g });
  let guard = 0;
  while (!s.over && guard++ < 400) {
    const p = s.current;
    const top = generate(s, p, ctx, {
      ...PROFILES.hard.gen, limit: PROFILES.hard.branching,
    })[0]?.action;
    const hard = chooseMove(s, p, "hard", ctx).move?.action;
    const normal = chooseMove(s, p, "normal", ctx).move?.action;
    if (top && hard) {
      turns++;
      if (!same(top, hard)) searchChanged++;
      if (!same(hard, normal)) levelsDiffer++;
    }
    aiTurn(s, p, "hard" as Difficulty, ctx);
    if (s.over) break;
    endTurn(s, mods);
  }
}
console.log(`${map}, ${games} games, ${turns} decisions`);
console.log(`  search changed the top-rated move : ${searchChanged} (${(searchChanged / turns * 100).toFixed(0)}%)`);
console.log(`  hard and normal chose differently : ${levelsDiffer} (${(levelsDiffer / turns * 100).toFixed(0)}%)`);
