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

export type QuestKind = "play" | "win" | "conquered" | "ability";

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
 * The legacy pool. Larva rewards (the lucky-hatch currency) are not ported yet, so the two
 * quests that paid larva pay their mycelium equivalent instead — noted here rather than
 * silently dropped.
 */
export const QUEST_POOL: readonly QuestDef[] = [
  { id: "play3", icon: "attack", text: "Play 3 matches", kind: "play", goal: 3, xp: 60, reward: { mycel: 40 } },
  { id: "win2", icon: "trophy", text: "Win 2 matches", kind: "win", goal: 2, xp: 90, reward: { mycel: 60 } },
  { id: "conq30", icon: "antarium", text: "Conquer 30 enemy tiles", kind: "conquered", goal: 30, xp: 70, reward: { pheromone: 300 } },
  { id: "abil5", icon: "star", text: "Use 5 abilities", kind: "ability", goal: 5, xp: 60, reward: { mycel: 40 } },
  { id: "win1fast", icon: "spark", text: "Win a match", kind: "win", goal: 1, xp: 50, reward: { mycel: 30 } },
  { id: "play5", icon: "flag", text: "Play 5 matches", kind: "play", goal: 5, xp: 100, reward: { pheromone: 500 } },
];

/** Paid on top when all of a day's quests are claimed, as in the legacy build. */
export const QUEST_SWEEP_BONUS = { mycel: 100 } as const;

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

/** Three distinct quests for a day. Same shape as the legacy roll, derived from the day. */
export function rollQuests(day: number): QuestState[] {
  const rng = mulberry32(hash(day));
  const pool = [...QUEST_POOL];
  const picked: QuestDef[] = [];
  while (pool.length && picked.length < QUESTS_PER_DAY) {
    const idx = Math.floor(rng() * pool.length);
    const [q] = pool.splice(idx, 1);
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
  if (level % 10 === 0) return { mycel: 200, pheromone: 400, label: "200 mycelium + 400 pheromone" };
  if (level % 5 === 0) return { mycel: 150, label: "150 mycelium" };
  if (level % 2 === 0) return { pheromone: 400, label: "400 pheromone" };
  return { mycel: 60, label: "60 mycelium" };
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
