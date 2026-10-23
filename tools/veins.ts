/**
 * THE VEIN SWEEP — every state a trail can be left in, hunted across whole games.
 *
 * `invariants.test.ts` already plays games and checks the board after every action, and it
 * had never caught a vein fault — because it plays `easy`, and easy generates NO TRAVEL
 * (CLAUDE.md §4a). Travel is the only thing in the game that lays a vein, so the audit
 * with the most vein rules in it was running on boards that had almost none.
 *
 * This plays HARD, which plays the whole action set, and checks the three vein rules
 * (§4.4, §4.5) after EVERY engine entry point rather than once per turn — the hand-over
 * included, because `startTurn` is where effects tick and the hive hands its five tiles
 * back, and a fault created there is invisible to a check that only runs after an action.
 *
 *   npx tsx tools/veins.ts [games] [turns]
 *
 * A TOOL, not a test: a hard game is most of vitest's RPC budget. The suite carries the
 * short version in `engine/__tests__/veins.test.ts`.
 */
import {
  abilityReady, activateAbility, allTiles, createGame, defaultContext, endTurn, neighbours,
  NEUTRAL_MODS, startTurn,
} from "../src/engine";
import type { GameState, Player, SpeciesId, Tile } from "../src/engine";
import { aiTurn } from "../src/ai/search";

const mods = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };
const ctx = defaultContext();

const SPECIES: SpeciesId[] = [
  "fire", "leafcutter", "carpenter", "army", "bullet", "demon", "ghost", "pharaoh",
];

/** §4.5: a vein needs two same-owner colony neighbours, or the trail prunes. */
function anchors(s: GameState, t: Tile): number {
  let n = 0;
  for (const nb of neighbours(s, t)) {
    if (nb.owner === t.owner && (nb.struct === "vein" || nb.struct === "stable" || nb.struct === "nest")) n++;
  }
  return n;
}

/** §4.5, the other half: it must be able to WALK to a captured tile of its own colony. */
function reaching(s: GameState, owner: Player): Set<string> {
  const held = new Set<string>();
  const queue: Tile[] = allTiles(s).filter(
    (t) => t.owner === owner && (t.struct === "stable" || t.struct === "nest"),
  );
  while (queue.length) {
    const cur = queue.pop() as Tile;
    for (const nb of neighbours(s, cur)) {
      if (nb.owner !== owner || nb.struct !== "vein") continue;
      const k = `${nb.c},${nb.r}`;
      if (held.has(k)) continue;
      held.add(k);
      queue.push(nb);
    }
  }
  return held;
}

export function veinFaults(s: GameState): string[] {
  const bad: string[] = [];
  const held = { you: reaching(s, "you"), ai: reaching(s, "ai") };
  for (const t of allTiles(s)) {
    if (t.struct !== "vein") continue;
    const at = `${t.c},${t.r}`;
    if (!t.owner) { bad.push(`${at} is a vein owned by nobody`); continue; }
    // §4.4: a vein holds no garrison. A number on one is a tile the player can count
    // that the rules say is not there.
    if (t.soldiers !== 0) bad.push(`${at} is a vein carrying ${t.soldiers} soldiers`);
    if (t.guard > 0) bad.push(`${at} is a vein holding a wild garrison`);
    if (anchors(s, t) < 2) bad.push(`${at} is a vein standing on ${anchors(s, t)} anchor(s)`);
    if (!held[t.owner].has(at)) bad.push(`${at} is a vein reaching no captured tile`);
    // A vein is captured with no combat at all, so armour on one can change no outcome —
    // it only draws a full-tile plate and a shield over a trail drawn as a thin bar.
    if (s.effects.some((e) => e.c === t.c && e.r === t.r && e.kind === "armor")) {
      bad.push(`${at} is a vein wearing armour`);
    }
  }
  return bad;
}

function sweep(games: number, turns: number): void {
  let faults = 0, played = 0, checked = 0;
  for (let g = 0; g < games; g++) {
    const you = SPECIES[g % SPECIES.length] as SpeciesId;
    const ai = SPECIES[(g * 3 + 1) % SPECIES.length] as SpeciesId;
    const s = createGame({ map: "small", species: { you, ai }, seed: 1000 + g });
    const say = (where: string): void => {
      checked++;
      for (const f of veinFaults(s)) {
        faults++;
        console.log(`game ${g} (${you} v ${ai}) turn ${s.turn}: ${f}  [${where}]`);
      }
    };
    say("the opening");
    for (let i = 0; i < turns && !s.over; i++) {
      const p: Player = s.current;
      startTurn(s, mods);
      say(`startTurn for ${p}`);
      if (s.over) break;
      if (abilityReady(s, p)) {
        activateAbility(s, p, mods[p], { target: openGround(s) });
        say(`${s.species[p]}'s ability`);
      }
      if (s.over) break;
      aiTurn(s, p, "hard", ctx);
      say(`${p} moved`);
      if (s.over) break;
      endTurn(s, mods);
      say(`hand-over`);
      played++;
    }
  }
  console.log(`\n${games} games, ${played} turns, ${checked} checks — ${faults} fault(s)`);
  if (faults) process.exitCode = 1;
}

function openGround(s: GameState): { c: number; r: number } | null {
  const free = allTiles(s).find((t) => !t.owner && t.guard === 0 && t.terrain === "ground");
  return free ? { c: free.c, r: free.r } : null;
}

sweep(Number(process.argv[2] ?? 8), Number(process.argv[3] ?? 60));
