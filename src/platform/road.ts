/**
 * The Colony Road: a ladder of rewards paid out as the colony grows.
 *
 * It used to be a Trophy Road — a hundred stops two hundred and fifty trophies apart,
 * running to twenty-five thousand and stopping. That shape belongs to a rating, which is a
 * number about the player. The colony is a number about the COLONY, and a colony compounds
 * (colony.ts), so the road has to compound with it: every stop is a fixed MULTIPLE of the
 * one before, and a hundred of them carry it from a few dozen troops to past a trillion.
 *
 * That is also why a stop is identified by its INDEX rather than by its size. The old table
 * asked "is this number a multiple of five hundred?", which only works on a ladder with
 * even rungs; on a geometric one the rung number is the only stable name a reward has.
 *
 * Pure functions — no storage, no DOM. The screen renders whatever `roadStops()` returns,
 * and `ProfileStore.claimRoad` is the only thing that pays out, so the table can be retuned
 * without touching either.
 *
 * Two tracks, as in the legacy build. Both pay at every checkpoint now — a chapter's purse
 * split five ways — but the PASS half only to players who hold the Colony Pass. The pass is the RevenueCat integration point
 * (roadmap step 5) — `ProfileStore.grantPass()` is what a purchase calls.
 */
import { COLONY_START } from "./colony";

/**
 * A chapter is FIVE checkpoints wide, and the fifth is the one that closes it.
 *
 * It was TWO — one free reward a chapter, a pass reward on each rung — which gave the
 * screen nothing to be a road OF: two cards under a chapter label, fifty times. Five
 * checkpoints is a stretch a player walks, with a visibly bigger reward at the end of it.
 *
 * WIDENING IT DID NOT MULTIPLY THE ROAD'S INCOME, and that is the whole of the care here.
 * A chapter has a PURSE (`freePurse`/`passPurse`) and its checkpoints SPLIT it
 * (`splitPurse`), so the road pays exactly what it paid before — in five pieces instead
 * of one. Paying each of the five what the single stop used to pay would have been two and
 * a half times the free track's lifetime income, straight through the band
 * `economy.test.ts` holds mycelium to.
 */
export const ROAD_CHAPTER_STOPS = 5;
export const ROAD_CHAPTERS = 50;
export const ROAD_STOPS = ROAD_CHAPTERS * ROAD_CHAPTER_STOPS;

/**
 * The first rung, and the last: the whole ladder, from a young colony to five million troops.
 *
 * The last rung used to be two trillion, which is what a flat compounding win rate reaches
 * — and a chapter-50 victory paid a hundred and thirty-six billion troops, a number that
 * has stopped meaning anything. The win share tapers now (colony.ts), and the road's top
 * comes down to meet it: five million is about two hundred wins of climbing, and a victory
 * there pays a hundred and fifty thousand.
 */
export const ROAD_FIRST = 100;
export const ROAD_LAST = 5e6;

/**
 * What each rung multiplies the one before it by.
 *
 * Solved from the two ends rather than picked, so retuning either end keeps the ladder
 * evenly spaced instead of bunching at one of them.
 */
export const ROAD_GROWTH = (ROAD_LAST / ROAD_FIRST) ** (1 / (ROAD_STOPS - 1));

export type RoadTrack = "free" | "pass";

export interface RoadReward {
  mycel?: number;
  pheromone?: number;
}

export interface RoadStop {
  /** Which rung this is, counting from one. The reward's stable name. */
  index: number;
  /** Troops needed to reach it. */
  colony: number;
  chapter: number;
  free: RoadReward | null;
  pass: RoadReward | null;
}

/** The colony size that reaches rung `index` (1-based). */
export function stopColony(index: number): number {
  if (index < 1) return COLONY_START;
  const raw = ROAD_FIRST * ROAD_GROWTH ** (index - 1);
  // Rounded to something a player would read: three significant figures is as much as the
  // compact label can show anyway, and a rung of "1,047,382" is a number nobody wants.
  return roundish(raw);
}

/**
 * Round to three significant figures, so every rung reads as a round-ish number.
 *
 * THREE EVERYWHERE, including under a thousand — that case used to round to the nearest
 * TEN, which is only two figures at a hundred. With two rungs to a chapter the step there
 * was 15%, so it never showed; at five checkpoints a chapter the step is 4.4%, which is
 * four troops at the first rung — and the nearest ten put rungs one and two BOTH on 100.
 * Two checkpoints asking for the same colony is one the player can never be short of, and
 * `stopReached(100)` answered 2.
 */
function roundish(n: number): number {
  const mag = Math.max(1, 10 ** (Math.floor(Math.log10(n)) - 2));
  return Math.round(n / mag) * mag;
}

/** Stable id for a reward, used as the claim key stored on the profile. */
export const roadKey = (track: RoadTrack, index: number): string =>
  `${track === "pass" ? "p" : "f"}${index}`;

/**
 * Reward tables, ported from the legacy build's roadFree/roadPass — but PRICED, not copied.
 *
 * Legacy pays some stops in larva, the lucky-hatch currency, which is not ported; those
 * stops pay pheromone instead. The conversion was fifty, chosen so the numbers looked like
 * the legacy ones, and nobody checked it against what pheromone actually BUYS. A research
 * level costs forty to a hundred and eighty, so a single ten-larva stop was paying for
 * five of them, and the whole research economy — every track on all eight colonies — was
 * covered three times over before the road was half walked.
 *
 * Four is the rate that makes a larva worth about a tenth of a research level, so a stop
 * that pays ten of them buys one. The mycelium numbers came down with it: the free track
 * alone used to pay more mycelium than everything in the game costs.
 */
const LARVA_IN_PHEROMONE = 4;

/** Which chapter a rung belongs to, 1-based. The one answer, so nothing derives it twice. */
export const chapterAt = (index: number): number => Math.ceil(index / ROAD_CHAPTER_STOPS);

/** Which checkpoint of its chapter a rung is, 1..ROAD_CHAPTER_STOPS. */
export const rungOfChapter = (index: number): number =>
  ((index - 1) % ROAD_CHAPTER_STOPS) + 1;

/** The rung that closes a chapter — the one paying the big share of its purse. */
export const isChapterEnd = (index: number): boolean =>
  rungOfChapter(index) === ROAD_CHAPTER_STOPS;

/**
 * WHAT A WHOLE CHAPTER PAYS, per track. The checkpoints inside it divide this up.
 *
 * The two tracks alternate on OPPOSITE phases, so every chapter pays both currencies
 * somewhere — the free track pays mycelium on the odd chapters and the pass pays
 * pheromone on them.
 *
 * Both are the totals the two-rung road paid, carried over exactly: the free track's
 * per-chapter reward is the number it always was, and the pass track's is its old
 * per-chapter average (155 mycelium and 28 pheromone a chapter, 7,750 and 1,400 over the
 * fifty). Retuning the road is retuning these two lines and nothing else.
 */
const freePurse = (chapter: number): RoadReward =>
  chapter % 2 === 0 ? { pheromone: 10 * LARVA_IN_PHEROMONE } : { mycel: 100 + chapter * 5 };

const passPurse = (chapter: number): RoadReward =>
  chapter % 2 === 0 ? { mycel: 310 } : { pheromone: 56 };

/**
 * HOW ONE CHAPTER'S PURSE IS SHARED OUT ACROSS ITS FIVE CHECKPOINTS.
 *
 * The fifth marks the end of the chapter, so it has to be worth visibly more than the four
 * before it: each of those takes an eighth, and the last takes WHAT IS LEFT rather than a
 * fraction of its own — four times an eighth, and a chapter that pays exactly its purse
 * however the eighths round. Computed as its own half it would drift by a troop or two per
 * chapter, which over fifty of them is the road quietly paying something else.
 */
const STEP_SHARE = 1 / 8;

function splitPurse(purse: RoadReward, rung: number): RoadReward {
  // A floor of one, so a purse small enough to round an eighth to nothing still pays
  // something at every checkpoint: a reward of zero is a checkpoint that lied.
  const share = (total: number): number => {
    const step = Math.max(1, Math.round(total * STEP_SHARE));
    if (rung !== ROAD_CHAPTER_STOPS) return step;
    return Math.max(1, total - step * (ROAD_CHAPTER_STOPS - 1));
  };
  const out: RoadReward = {};
  if (purse.mycel) out.mycel = share(purse.mycel);
  if (purse.pheromone) out.pheromone = share(purse.pheromone);
  return out;
}

/** Free track: a share of the chapter's purse at every one of its five checkpoints. */
export function freeReward(index: number): RoadReward | null {
  if (index < 1 || index > ROAD_STOPS) return null;
  return splitPurse(freePurse(chapterAt(index)), rungOfChapter(index));
}

/** Pass track: the same, out of the pass purse, and only to a player holding the pass. */
export function passReward(index: number): RoadReward | null {
  if (index < 1 || index > ROAD_STOPS) return null;
  return splitPurse(passPurse(chapterAt(index)), rungOfChapter(index));
}

export function roadStops(): RoadStop[] {
  const out: RoadStop[] = [];
  for (let i = 1; i <= ROAD_STOPS; i++) {
    out.push({
      index: i,
      colony: stopColony(i),
      chapter: chapterAt(i),
      free: freeReward(i),
      pass: passReward(i),
    });
  }
  return out;
}

/** Look a reward back up from its claim key. Returns null for a key that pays nothing. */
export function rewardFor(key: string): RoadReward | null {
  const track = key[0];
  const index = Number(key.slice(1));
  if (!Number.isFinite(index) || index <= 0) return null;
  if (track === "f") return freeReward(index);
  if (track === "p") return passReward(index);
  return null;
}

/** The colony size a claim key asks for, so the store can refuse one not yet reached. */
export const roadColony = (key: string): number => stopColony(Number(key.slice(1)));
export const isPassKey = (key: string): boolean => key[0] === "p";

/** The rung the colony is standing on, 0 before the first one. */
export function stopReached(colony: number): number {
  let reached = 0;
  for (let i = 1; i <= ROAD_STOPS; i++) {
    if (colony >= stopColony(i)) reached = i; else break;
  }
  return reached;
}

/**
 * THE ROAD RUNS THROUGH TEN PLACES, five chapters each.
 *
 * A region is what the board LOOKS like — the ground a match is played on is painted per
 * region rather than per chapter (`ui/regions.ts`), so climbing the road changes the world
 * every five chapters instead of every one. Ten pictures is a set somebody can actually
 * paint; fifty is not.
 *
 * It lives beside `chapterOf` for the same reason that does: it is a fact about the road,
 * and the screen that draws the ground and anything that ever NAMES the place have to get
 * the same answer. The width is derived, never written twice — `road.test.ts` holds that
 * the ten of them cover the fifty chapters exactly.
 */
export const REGIONS = [
  "Forest floor", "Desert", "Volcano", "Rainforest canopy", "Mangrove wetland",
  "Savanna grassland", "Cave system", "Permafrost tundra", "Amber deposit", "Fungal bloom",
] as const;

/** How many chapters one region spans. */
export const REGION_CHAPTERS = ROAD_CHAPTERS / REGIONS.length;

/** Which region a chapter is played in, 1-based. Clamped, so a broken save still draws. */
export const regionOf = (chapter: number): number =>
  Math.min(REGIONS.length, Math.max(1, Math.ceil(Math.round(chapter) / REGION_CHAPTERS)));

/** Its name, for anything that says where the player is. */
export const regionName = (region: number): string =>
  REGIONS[Math.min(REGIONS.length, Math.max(1, Math.round(region))) - 1] ?? REGIONS[0];

/**
 * Which chapter of the road a colony this size is playing through.
 *
 * It lives here rather than beside the thing that first needed it (the opponent search):
 * it is a fact about the road, and the granary asks the same question to decide which of
 * its levels are open. Two copies of this arithmetic would be two answers on one screen.
 */
export const chapterOf = (colony: number): number =>
  Math.min(ROAD_CHAPTERS, Math.max(1, chapterAt(stopReached(colony) + 1)));

export function rewardText(r: RoadReward): string {
  return [
    r.mycel ? `+${r.mycel} mycelium` : "",
    r.pheromone ? `+${r.pheromone} pheromone` : "",
  ].filter(Boolean).join("  ");
}
