/**
 * FINDING AN OPPONENT.
 *
 * Nobody is ever really found — there is no server — so what is tested here is the part
 * that will still be true when there is: that the search WAITS, that giving up seats
 * somebody sensible rather than nobody, and that leaving abandons it.
 */
import { describe, expect, it, vi } from "vitest";
import {
  BOTS_PER_CHAPTER, LocalMatchmaker, SEARCH_MS, botsForChapter,
} from "../matchmaking";
import { COLONY_START } from "../colony";
import { ROAD_CHAPTERS, ROAD_CHAPTER_STOPS, chapterOf, stopColony } from "../road";
import { SPECIES_ORDER } from "../catalogue";

describe("the bot roster", () => {
  it("fields twenty per chapter, the same twenty every time", () => {
    const a = botsForChapter(7);
    const b = botsForChapter(7);
    expect(a.length).toBe(BOTS_PER_CHAPTER);
    expect(a).toEqual(b);
    // ...and a different chapter is different PEOPLE, not the same twenty resized. The
    // roster is seeded on the chapter for exactly that: a player climbing the road should
    // meet new names, not the same ones with bigger colonies.
    const names = (n: number): string[] => botsForChapter(n).map((x) => x.name);
    expect(names(8), "every chapter fields the same twenty names").not.toEqual(names(7));
  });

  /**
   * A bot stands in for a person, so it has to be one: a name, a colony that belongs to
   * this chapter, and a colony to field. The plate on the board says all three.
   */
  it("gives every bot a name, a colony in its own band, and a species", () => {
    for (const at of [1, 12, 30, ROAD_CHAPTERS]) {
      const low = stopColony((at - 1) * ROAD_CHAPTER_STOPS + 1);
      const high = stopColony(at * ROAD_CHAPTER_STOPS + 1);
      for (const bot of botsForChapter(at)) {
        expect(bot.name.length, `chapter ${at} fielded a nameless bot`).toBeGreaterThan(2);
        expect(bot.colony).toBeGreaterThanOrEqual(low);
        expect(bot.colony).toBeLessThanOrEqual(high);
        expect(SPECIES_ORDER).toContain(bot.species);
        // A bot never claims to be a person. The PLAYER is not told; the code knows.
        expect(bot.human).toBe(false);
      }
    }
  });

  it("clamps a chapter off either end of the road", () => {
    expect(botsForChapter(0)).toEqual(botsForChapter(1));
    expect(botsForChapter(999)).toEqual(botsForChapter(ROAD_CHAPTERS));
  });

  /** The reel and the seat both come from the player's OWN chapter, or the sizes jar. */
  it("puts a colony in the chapter its size belongs to", () => {
    expect(chapterOf(COLONY_START)).toBe(1);
    expect(chapterOf(stopColony(ROAD_CHAPTER_STOPS * 5 + 1))).toBe(6);
    expect(chapterOf(1e15)).toBe(ROAD_CHAPTERS);
  });
});

describe("the offline matchmaker", () => {
  /** The five seconds are real. A search that resolves at once is not a search. */
  it("waits for a person before it seats a bot", async () => {
    vi.useFakeTimers();
    const seated = vi.fn();
    new LocalMatchmaker().find(5000).then(seated);

    await vi.advanceTimersByTimeAsync(SEARCH_MS - 100);
    expect(seated, "it gave up early").not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(seated).toHaveBeenCalledTimes(1);
    expect(seated.mock.calls[0]?.[0]).toMatchObject({ human: false });
    vi.useRealTimers();
  });

  it("seats somebody from the player's own chapter", async () => {
    vi.useFakeTimers();
    const colony = stopColony(ROAD_CHAPTER_STOPS * 9 + 1);
    const found = new LocalMatchmaker(10).find(colony);
    await vi.advanceTimersByTimeAsync(20);
    const foe = await found;
    expect(botsForChapter(chapterOf(colony)).map((b) => b.name)).toContain(foe.name);
    vi.useRealTimers();
  });

  /** A player who backs out must not have a match start behind the screen they went to. */
  it("abandons a search that was called off", async () => {
    vi.useFakeTimers();
    const stop = new AbortController();
    const search = new LocalMatchmaker().find(500, stop.signal);
    const outcome = search.then(() => "seated").catch((e: Error) => e.name);
    stop.abort();
    await vi.advanceTimersByTimeAsync(SEARCH_MS * 2);
    expect(await outcome).toBe("AbortError");
    vi.useRealTimers();
  });
});
