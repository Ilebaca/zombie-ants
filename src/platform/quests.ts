/**
 * Daily quests: three tasks a day, rerolled at midnight local time.
 *
 * The roll is a pure function of the day number, so the same day always produces the same
 * three quests — no stored randomness, no drift between a reload and a rollover, and a test
 * can ask for any day it likes. (This is the same discipline as the engine's seeded RNG,
 * CLAUDE.md §4.1, for the same reason: reproducibility.)
 *
 * Progress is recorded by the app shell from what a match reports. Nothing here watches the
 * engine, and the engine knows nothing about quests.
 */

export type QuestKind = "play" | "win" | "capture" | "ability" | "tunnel" | "hive";

export interface QuestDef {
  id: string;
  kind: QuestKind;
  goal: number;
  text: string;
  /** Payout on claim. */
  mycel: number;
  pheromone: number;
}

export interface QuestState {
  id: string;
  progress: number;
  claimed: boolean;
}

/** Every quest must be completable in one or two matches — a daily the player cannot finish
 *  today is just a dead slot. */
export const QUEST_POOL: readonly QuestDef[] = [
  { id: "play1", kind: "play", goal: 1, text: "Fight a battle", mycel: 25, pheromone: 25 },
  { id: "play3", kind: "play", goal: 3, text: "Fight three battles", mycel: 60, pheromone: 60 },
  { id: "win1", kind: "win", goal: 1, text: "Win a battle", mycel: 45, pheromone: 45 },
  { id: "win2", kind: "win", goal: 2, text: "Win two battles", mycel: 90, pheromone: 80 },
  { id: "cap10", kind: "capture", goal: 10, text: "Capture 10 tiles", mycel: 35, pheromone: 35 },
  { id: "cap25", kind: "capture", goal: 25, text: "Capture 25 tiles", mycel: 70, pheromone: 60 },
  { id: "ab3", kind: "ability", goal: 3, text: "Cast your ability 3 times", mycel: 40, pheromone: 40 },
  { id: "ab6", kind: "ability", goal: 6, text: "Cast your ability 6 times", mycel: 75, pheromone: 70 },
  { id: "dig2", kind: "tunnel", goal: 2, text: "Dig two galleries", mycel: 45, pheromone: 45 },
  { id: "hive1", kind: "hive", goal: 1, text: "Take the Hive queen", mycel: 80, pheromone: 70 },
];

/** Paid on top when all of today's quests are claimed. */
export const QUEST_SWEEP_BONUS = { mycel: 100, pheromone: 100 } as const;

export const QUESTS_PER_DAY = 3;

export const questDef = (id: string): QuestDef | undefined =>
  QUEST_POOL.find((q) => q.id === id);

/** Local-day index. Local, not UTC: the player's midnight is the one they experience. */
export function dayIndex(now: number = Date.now()): number {
  const d = new Date(now);
  return Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000,
  );
}

/** Milliseconds until the next local midnight — the countdown the screen shows. */
export function msUntilRollover(now: number = Date.now()): number {
  const d = new Date(now);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return next - now;
}

/**
 * Three distinct quests for a day, and never two of the same kind — a day of "win 1 / win 2"
 * would be one task wearing two hats.
 */
export function rollQuests(day: number): QuestState[] {
  const rng = mulberry32(hash(day));
  const pool = [...QUEST_POOL];
  const picked: QuestDef[] = [];
  const usedKinds = new Set<QuestKind>();

  while (pool.length && picked.length < QUESTS_PER_DAY) {
    const idx = Math.floor(rng() * pool.length);
    const [q] = pool.splice(idx, 1);
    if (!q || usedKinds.has(q.kind)) continue;
    usedKinds.add(q.kind);
    picked.push(q);
  }
  return picked.map((q) => ({ id: q.id, progress: 0, claimed: false }));
}

export const isComplete = (state: QuestState): boolean => {
  const def = questDef(state.id);
  return !!def && state.progress >= def.goal;
};

export const isClaimable = (state: QuestState): boolean => !state.claimed && isComplete(state);

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
