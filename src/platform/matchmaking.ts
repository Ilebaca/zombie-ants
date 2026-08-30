/**
 * FINDING AN OPPONENT.
 *
 * There is no server yet, so nobody is ever actually found — but the SHAPE is the real one,
 * because the screen in front of it (ui/matchmaking.ts) has to behave the same on the day
 * there is. `Matchmaker` is an interface with one method; `LocalMatchmaker` is the offline
 * implementation, and swapping in a real one is a new class and one line in `App`. That is
 * the same seam `PurchaseGateway` uses for the shop.
 *
 * THE RULE, when nobody answers: after `SEARCH_MS` the search gives up and seats a bot from
 * the roster for the player's own chapter. The player is not told — a bot has a name, a
 * colony and a colony head like anyone else, and it plays on `hard`, which is the level
 * that beats `normal` 96% of the time. An opponent who folds is worse than no opponent.
 *
 * The roster is GENERATED, not typed out: twenty per chapter across the road's fifty is a
 * thousand names, and a table that long is a thousand chances to leave one stale when the
 * road is retuned. It is derived from the chapter number instead, so the same chapter
 * always fields the same twenty and a player meets a familiar ladder rather than noise.
 */
import { SPECIES_ORDER } from "./catalogue";
import type { SpeciesId } from "../engine";
import { ROAD_CHAPTERS, ROAD_CHAPTER_STOPS, chapterOf, stopColony } from "./road";
import { RIVAL_NAMES } from "./rival";

/** Who is across the board: what the plate says, and what the board is dressed in. */
export interface Opponent {
  name: string;
  colony: number;
  species: SpeciesId;
  /** False for a bot the search seated when nobody answered. */
  human: boolean;
}

/** How long the search waits for a person before it seats a bot. */
export const SEARCH_MS = 5000;

/** How many bots stand in for each chapter of the road. */
export const BOTS_PER_CHAPTER = 20;

export interface Matchmaker {
  /**
   * Find someone near this colony. Resolves with whoever was seated — a person, or a bot
   * once the search has waited long enough. `signal` aborts a search the player left.
   */
  find(colony: number, signal?: AbortSignal): Promise<Opponent>;
}

/** A tiny deterministic generator, so a chapter's roster is the same every time. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The twenty who play this chapter.
 *
 * Their colonies are spread across the chapter's OWN band — from its first rung to the
 * next chapter's — so a player matched here meets someone their own size, which is what a
 * ranked ladder would serve them and what makes the plate on the board mean anything.
 */
export function botsForChapter(chapter: number): Opponent[] {
  const at = Math.max(1, Math.min(ROAD_CHAPTERS, Math.round(chapter)));
  const low = stopColony((at - 1) * ROAD_CHAPTER_STOPS + 1);
  const high = stopColony(at * ROAD_CHAPTER_STOPS + 1);
  const rand = seeded(0x9e3779b9 ^ (at * 0x85ebca6b));

  const out: Opponent[] = [];
  for (let i = 0; i < BOTS_PER_CHAPTER; i++) {
    const stem = RIVAL_NAMES[Math.floor(rand() * RIVAL_NAMES.length)] as string;
    const tag = 11 + Math.floor(rand() * 89);
    const species = SPECIES_ORDER[Math.floor(rand() * SPECIES_ORDER.length)] as SpeciesId;
    out.push({
      name: `${stem}${tag}`,
      colony: Math.round(low + (high - low) * rand()),
      species,
      human: false,
    });
  }
  return out;
}

/**
 * The offline matchmaker: it searches honestly, finds nobody, and seats a bot.
 *
 * It really waits — the five seconds are not decoration. When a server exists the same
 * screen will show the same search and sometimes end it early with a person.
 */
export class LocalMatchmaker implements Matchmaker {
  constructor(private wait = SEARCH_MS, private pick = Math.random) {}

  find(colony: number, signal?: AbortSignal): Promise<Opponent> {
    const roster = botsForChapter(chapterOf(colony));
    const bot = roster[Math.floor(this.pick() * roster.length)] as Opponent;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(bot), this.wait);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("search cancelled", "AbortError"));
      });
    });
  }
}
