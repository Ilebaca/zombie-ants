/**
 * Daily quests and the colony level, ported from the legacy build.
 *
 * The pool, the goals, the XP and the rewards are that build's QUEST_POOL verbatim, and the
 * level curve is its xpForLevel. What differs deliberately is *how the day's three are
 * chosen*: the legacy build rolls with Math.random and stores the result, this one derives
 * them from the day number (CLAUDE.md §11). The player sees the same three all day either
 * way; deriving them means a reload cannot reroll, and a test can ask for any day it likes.
 *
 * Progress is recorded by the app shell from what a match reports. Nothing here watches the
 * engine, and the engine knows nothing about quests.
 */

/**
 * What a quest can ask for.
 *
 * There were four, and three of the six quests in the pool were "play N" or "win N" — so a
 * day's three regularly asked the same thing twice in different numbers. Every kind added
 * here is something the app was ALREADY counting and simply never asked about: queens
 * taken off the Hive, nests cracked, galleries dug, and turns played.
 */
export type QuestKind =
  | "play" | "win" | "conquered" | "ability" | "queen" | "nest" | "tunnel" | "turns";

export interface QuestReward {
  mycel?: number;
  pheromone?: number;
}

export interface QuestDef {
  id: string;
  icon: string;
  text: string;
  kind: QuestKind;
  goal: number;
  xp: number;
  reward: QuestReward;
}

export interface QuestState {
  id: string;
  progress: number;
  claimed: boolean;
}

/**
 * THE POOL, and why it is this long.
 *
 * It was six, across four kinds, with three drawn a day — so a player saw the same handful
 * on rotation and two of any day's three were usually both "play N matches". Fifteen across
 * eight kinds, and the roll takes one from each of three BUCKETS (see `rollQuests`), so a
 * day asks for three different sorts of thing rather than three numbers of one.
 *
 * Larva rewards (the lucky-hatch currency) are not ported, so the legacy quests that paid
 * larva pay their mycelium or pheromone equivalent instead — noted rather than dropped.
 */
export const QUEST_POOL: readonly QuestDef[] = [
  // TURN UP — the floor. Something a player clears by playing at all.
  { id: "play2", icon: "flag", text: "Play 2 matches", kind: "play", goal: 2, xp: 45, reward: { mycel: 9 } },
  { id: "play3", icon: "flag", text: "Play 3 matches", kind: "play", goal: 3, xp: 60, reward: { mycel: 12 } },
  { id: "play5", icon: "flag", text: "Play 5 matches", kind: "play", goal: 5, xp: 100, reward: { pheromone: 28 } },
  { id: "turns60", icon: "clock", text: "Play 60 turns", kind: "turns", goal: 60, xp: 70, reward: { mycel: 13 } },
  { id: "turns120", icon: "clock", text: "Play 120 turns", kind: "turns", goal: 120, xp: 110, reward: { pheromone: 22 } },

  // WIN — the middle. It asks for a result, not just for time at the board.
  { id: "win1", icon: "trophy", text: "Win a match", kind: "win", goal: 1, xp: 50, reward: { mycel: 9 } },
  { id: "win2", icon: "trophy", text: "Win 2 matches", kind: "win", goal: 2, xp: 90, reward: { mycel: 18 } },
  { id: "win3", icon: "trophy", text: "Win 3 matches", kind: "win", goal: 3, xp: 140, reward: { pheromone: 34 } },
  { id: "nest1", icon: "anthill", text: "Win by taking the enemy nest", kind: "nest", goal: 1, xp: 130, reward: { mycel: 26 } },

  // PLAY WELL — the ceiling. Each names a thing the game can do that a beginner does not.
  { id: "conq20", icon: "antarium", text: "Conquer 20 enemy tiles", kind: "conquered", goal: 20, xp: 55, reward: { mycel: 12 } },
  { id: "conq30", icon: "antarium", text: "Conquer 30 enemy tiles", kind: "conquered", goal: 30, xp: 70, reward: { pheromone: 17 } },
  { id: "conq50", icon: "antarium", text: "Conquer 50 enemy tiles", kind: "conquered", goal: 50, xp: 120, reward: { pheromone: 30 } },
  { id: "abil3", icon: "spark", text: "Use 3 abilities", kind: "ability", goal: 3, xp: 45, reward: { mycel: 9 } },
  { id: "abil5", icon: "spark", text: "Use 5 abilities", kind: "ability", goal: 5, xp: 60, reward: { mycel: 12 } },
  { id: "queen1", icon: "crown", text: "Take the Hive queen", kind: "queen", goal: 1, xp: 100, reward: { pheromone: 25 } },
  { id: "tunnel2", icon: "granary", text: "Dig 2 galleries", kind: "tunnel", goal: 2, xp: 65, reward: { mycel: 13 } },
];

/**
 * The three buckets a day is drawn from, one each.
 *
 * Turn up, win, play well — in that order, so the card reads as an easy one, a real one and
 * a stretch. Drawing three at random from one list is how a day ended up asking for two
 * match counts and nothing else.
 */
const BUCKETS: readonly (readonly QuestKind[])[] = [
  ["play", "turns"],
  ["win", "nest"],
  ["conquered", "ability", "queen", "tunnel"],
];

/**
 * Paid on top when all of a day's quests are claimed.
 *
 * A HUNDRED in the legacy build, and it was the single biggest faucet in this game: more
 * mycelium per day than the three quests it sits on top of, and thirty-six thousand a year
 * against a game that has about twenty-one thousand of things to buy in it. Priced against
 * the sink now, like everything else here.
 */
export const QUEST_SWEEP_BONUS = { mycel: 24 } as const;

export const QUESTS_PER_DAY = 3;

export const questDef = (id: string): QuestDef | undefined =>
  QUEST_POOL.find((q) => q.id === id);

/** Local-day index. Local, not UTC: the player's midnight is the one they experience. */
export function dayIndex(now: number = Date.now()): number {
  const d = new Date(now);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** Milliseconds until the next local midnight — the countdown the screen shows. */
export function msUntilRollover(now: number = Date.now()): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now;
}

/**
 * A day's quests: one from each bucket, derived from the day number.
 *
 * Derived, never rolled and stored (CLAUDE.md §11) — a reload cannot reroll, and a test can
 * ask for any day it likes. One per bucket rather than three from the pile, because three
 * independent draws regularly produced "Play 3 matches" and "Play 5 matches" on the same
 * card, which is one quest asked twice.
 *
 * A bucket that somehow has nothing in it is skipped and the shortfall made up from the
 * rest of the pool, so the day always has its three.
 */
export function rollQuests(day: number): QuestState[] {
  const rng = mulberry32(hash(day));
  const picked: QuestDef[] = [];
  for (const kinds of BUCKETS) {
    if (picked.length >= QUESTS_PER_DAY) break;
    const options = QUEST_POOL.filter((q) => kinds.includes(q.kind));
    const q = options[Math.floor(rng() * options.length)];
    if (q) picked.push(q);
  }
  // Backstop: never hand back fewer than three, whatever the buckets happen to hold.
  const rest = QUEST_POOL.filter((q) => !picked.includes(q));
  while (picked.length < QUESTS_PER_DAY && rest.length) {
    const [q] = rest.splice(Math.floor(rng() * rest.length), 1);
    if (q) picked.push(q);
  }
  return picked.map((q) => ({ id: q.id, progress: 0, claimed: false }));
}

export const isComplete = (state: QuestState): boolean => {
  const def = questDef(state.id);
  return !!def && state.progress >= def.goal;
};

export const isClaimable = (state: QuestState): boolean => !state.claimed && isComplete(state);

/* ------------------------------------------------------------- COLONY LEVEL */

/** XP to go from level L to L+1. Gentle early, steepens — the legacy curve exactly. */
export const xpForLevel = (level: number): number =>
  Math.round(80 + (level - 1) * 45 + Math.pow(level - 1, 1.6) * 8);

export interface LevelProgress {
  level: number;
  /** XP banked inside the current level, and what the level costs. */
  into: number;
  need: number;
  pct: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  let level = 1;
  let xp = Math.max(0, Math.floor(totalXp));
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
  }
  const need = xpForLevel(level);
  return { level, into: xp, need, pct: xp / need };
}

/** Every few levels pays something the player must tap to claim. */
export function levelReward(level: number): QuestReward & { label: string } {
  if (level % 10 === 0) return { mycel: 90, pheromone: 200, label: "90 mycelium + 200 pheromone" };
  if (level % 5 === 0) return { mycel: 60, label: "60 mycelium" };
  if (level % 2 === 0) return { pheromone: 200, label: "200 pheromone" };
  return { mycel: 25, label: "25 mycelium" };
}

/** Levels reached but not yet claimed. Level 1 is free, so claims start once level 2 lands. */
export function unclaimedLevels(totalXp: number, claimed: readonly number[]): number[] {
  const current = levelProgress(totalXp).level;
  const out: number[] = [];
  for (let l = 1; l < current; l++) if (!claimed.includes(l)) out.push(l);
  return out;
}

/* ------------------------------------------------------------------ RANDOM */

/** A day number is a small integer; spread it before use or consecutive days correlate. */
function hash(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
