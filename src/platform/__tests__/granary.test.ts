/**
 * THE GRANARY: the colony grows while nobody is playing.
 *
 * What matters here is not the numbers themselves — those are tuning — but the two
 * promises they make. A level is worth a fixed number of HOURS PER WIN at any colony
 * size, so the sentence the player reads stays true from forty troops to five million;
 * and the store has a lid, so staying away can never out-earn playing.
 */
import { describe, expect, it } from "vitest";
import {
  GRANARY_LEVELS, GRANARY_MAX, GRANARY_MAX_LID, granaryFull, granaryLevel, granaryNext,
  granaryRate, granaryStored,
} from "../granary";
import { COLONY_START, winnings } from "../colony";
import { chapterOf, ROAD_CHAPTERS, stopColony } from "../road";
import { MemoryStore, ProfileStore } from "../index";

const HOUR = 3_600_000;
const T0 = 1_700_000_000_000;

describe("the granary rate", () => {
  // The whole point of pricing it in wins: a flat troops-per-hour would be generous at
  // forty and invisible at five million, and would need retuning whenever the win curve
  // moves. A day of level-1 foraging is one win, at EVERY size.
  it("pays one win per its own hours, at any colony size", () => {
    for (const colony of [COLONY_START, 500, 12_000, 1e6, 5e6]) {
      for (const lv of GRANARY_LEVELS) {
        const day = granaryRate(colony, lv.level) * lv.hours;
        expect(day).toBeCloseTo(winnings(colony), 6);
      }
    }
  });

  it("gets faster with every level, never slower", () => {
    let last = 0;
    for (const lv of GRANARY_LEVELS) {
      const rate = granaryRate(10_000, lv.level);
      expect(rate).toBeGreaterThan(last);
      last = rate;
    }
  });

  it("clamps a level a save should not be carrying", () => {
    expect(granaryLevel(0)).toBe(GRANARY_LEVELS[0]);
    expect(granaryLevel(99)).toBe(GRANARY_LEVELS[GRANARY_MAX - 1]);
    expect(granaryNext(GRANARY_MAX)).toBeNull();
    expect(granaryNext(1)).toBe(GRANARY_LEVELS[1]);
  });

  // Every level has to be reachable, and the last one has to still be worth reaching for
  // at the end of the road rather than ticked off in the first week.
  it("spreads its levels across the whole road", () => {
    expect(GRANARY_LEVELS[0]?.chapter).toBe(1);
    expect(GRANARY_LEVELS[GRANARY_MAX - 1]?.chapter).toBe(ROAD_CHAPTERS);
    for (let i = 1; i < GRANARY_MAX; i++) {
      expect(GRANARY_LEVELS[i]!.chapter).toBeGreaterThan(GRANARY_LEVELS[i - 1]!.chapter);
      expect(GRANARY_LEVELS[i]!.cost).toBeGreaterThan(GRANARY_LEVELS[i - 1]!.cost);
    }
  });
});

describe("the store", () => {
  it("fills at the rate", () => {
    const rate = granaryRate(10_000, 1);
    expect(granaryStored(10_000, 1, 3 * HOUR)).toBe(Math.floor(rate * 3));
  });

  // Without a lid, a fortnight away would pay fourteen wins — not playing would be the
  // fastest way up the ladder.
  it("stops at the cap however long you stay away", () => {
    const full = granaryFull(10_000, 1);
    expect(granaryStored(10_000, 1, GRANARY_LEVELS[0]!.lid * HOUR)).toBe(full);
    expect(granaryStored(10_000, 1, 400 * HOUR)).toBe(full);
    expect(full).toBeLessThan(winnings(10_000));
  });

  it("holds nothing at all for negative time", () => {
    expect(granaryStored(10_000, 1, -5 * HOUR)).toBe(0);
  });
});

describe("collecting", () => {
  const fresh = (): ProfileStore => new ProfileStore(new MemoryStore());

  it("pays the store into the colony and restarts the clock", () => {
    const store = fresh();
    store.update((p) => { p.colony = 10_000; p.granaryAt = T0 - 4 * HOUR; });
    const before = store.get().colony;
    const owed = store.granary(T0).stored;
    expect(owed).toBeGreaterThan(0);
    expect(store.collectGranary(T0)).toBe(owed);
    expect(store.get().colony).toBe(before + owed);
    expect(store.granary(T0).stored).toBe(0);
  });

  // Rounding a part-troop down to zero AND restarting the clock would throw away every
  // partial hour — a young colony foraging a third of a troop an hour would bank nothing
  // for ever.
  it("does not restart the clock when there is nothing whole to carry", () => {
    const store = fresh();
    store.update((p) => { p.granaryAt = T0 - 60_000; });
    expect(store.collectGranary(T0)).toBe(0);
    expect(store.get().granaryAt).toBe(T0 - 60_000);
  });

  // A save from a build with no granary is owed the one payout that costs, and is correct
  // for ever after the first tap.
  it("reads a save that has never emptied it as full", () => {
    const store = fresh();
    store.update((p) => { p.colony = 10_000; p.granaryAt = 0; });
    expect(store.granary(T0).stored).toBe(granaryFull(10_000, 1));
  });

  // A device clock that moved backwards must read as empty, never as a negative store.
  it("reads a stamp in the future as empty", () => {
    const store = fresh();
    store.update((p) => { p.colony = 10_000; p.granaryAt = T0 + 50 * HOUR; });
    expect(store.granary(T0).stored).toBe(0);
  });
});

describe("digging it deeper", () => {
  const rich = (colony: number): ProfileStore => {
    const store = new ProfileStore(new MemoryStore());
    store.update((p) => { p.colony = colony; p.mycel = 99_999; p.granaryAt = T0; });
    return store;
  };

  it("refuses a level the road has not reached", () => {
    const store = rich(COLONY_START);
    expect(chapterOf(COLONY_START)).toBeLessThan(GRANARY_LEVELS[1]!.chapter);
    expect(store.buyGranary(T0)).toBe(false);
    expect(store.get().granary).toBe(1);
    expect(store.get().mycel).toBe(99_999);
  });

  it("sells it once the chapter is open, and charges for it", () => {
    const store = rich(stopColony((GRANARY_LEVELS[1]!.chapter - 1) * 2 + 1));
    expect(store.buyGranary(T0)).toBe(true);
    expect(store.get().granary).toBe(2);
    expect(store.get().mycel).toBe(99_999 - GRANARY_LEVELS[1]!.cost);
  });

  it("refuses it with the chapter open but the mycelium missing", () => {
    const store = rich(stopColony((GRANARY_LEVELS[1]!.chapter - 1) * 2 + 1));
    store.update((p) => { p.mycel = GRANARY_LEVELS[1]!.cost - 1; });
    expect(store.buyGranary(T0)).toBe(false);
    expect(store.get().granary).toBe(1);
  });

  // Hours foraged at the old rate belong to the old rate. Levelling up on a full store
  // would pay them out at a speed that was not running when they were earned.
  it("empties the store at the OLD rate before it digs", () => {
    const colony = stopColony((GRANARY_LEVELS[1]!.chapter - 1) * 2 + 1);
    const store = rich(colony);
    store.update((p) => { p.granaryAt = T0 - GRANARY_MAX_LID * HOUR; });
    const owedAtOldRate = granaryFull(colony, 1);
    expect(store.buyGranary(T0)).toBe(true);
    expect(store.get().colony).toBe(colony + owedAtOldRate);
    expect(store.granary(T0).stored).toBe(0);
  });

  it("stops at the top level", () => {
    const store = rich(5e6);
    store.update((p) => { p.granary = GRANARY_MAX; });
    expect(store.buyGranary(T0)).toBe(false);
  });
});
