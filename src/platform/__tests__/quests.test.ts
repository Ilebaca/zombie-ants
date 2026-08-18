import { describe, expect, it } from "vitest";
import { MemoryStore } from "../storage";
import { ProfileStore, normalise } from "../profile";
import {
  QUESTS_PER_DAY, QUEST_POOL, QUEST_SWEEP_BONUS, dayIndex, isClaimable, msUntilRollover,
  questDef, rollQuests,
} from "../quests";

const store = (): ProfileStore => new ProfileStore(new MemoryStore());
/** Local noon on a given day index, so a test never straddles a rollover. */
const at = (day: number): number => {
  const utcMidnight = new Date(day * 86_400_000);
  return new Date(
    utcMidnight.getUTCFullYear(), utcMidnight.getUTCMonth(), utcMidnight.getUTCDate(), 12,
  ).getTime();
};

describe("quest rolling", () => {
  it("gives the same three quests for the same day, every time", () => {
    for (const day of [0, 1, 19_000, 25_000]) {
      expect(rollQuests(day)).toEqual(rollQuests(day));
      expect(rollQuests(day).length).toBe(QUESTS_PER_DAY);
    }
  });

  it("does not repeat a quest or a kind within a day", () => {
    for (let day = 19_000; day < 19_120; day++) {
      const ids = rollQuests(day).map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      const kinds = ids.map((id) => questDef(id)?.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });

  it("varies from day to day", () => {
    const seen = new Set<string>();
    for (let day = 19_000; day < 19_060; day++) seen.add(rollQuests(day).map((q) => q.id).join());
    expect(seen.size).toBeGreaterThan(5);
  });

  it("only ever rolls quests that exist in the pool", () => {
    for (let day = 19_000; day < 19_050; day++) {
      for (const q of rollQuests(day)) expect(questDef(q.id)).toBeTruthy();
    }
  });

  it("prices every quest in the pool", () => {
    for (const q of QUEST_POOL) {
      expect(q.goal).toBeGreaterThan(0);
      expect(q.mycel + q.pheromone).toBeGreaterThan(0);
      expect(q.text.length).toBeGreaterThan(0);
    }
  });

  it("counts down to the next local midnight", () => {
    const ms = msUntilRollover(at(19_000));
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(86_400_000);
    // Crossing the countdown must land on the next day index.
    expect(dayIndex(at(19_000) + ms)).toBe(dayIndex(at(19_000)) + 1);
  });
});

describe("quest progress", () => {
  it("advances only quests of the matching kind", () => {
    const s = store();
    const day = at(19_000);
    const quests = s.dailyQuests(day);
    const kinds = quests.map((q) => questDef(q.id)?.kind);
    const kind = kinds[0]!;
    s.questProgress(kind, 1, day);
    for (const q of s.dailyQuests(day)) {
      const expected = questDef(q.id)?.kind === kind ? 1 : 0;
      expect(q.progress).toBe(expected);
    }
  });

  it("never counts past the goal", () => {
    const s = store();
    const day = at(19_000);
    const kind = questDef(s.dailyQuests(day)[0]!.id)!.kind;
    s.questProgress(kind, 999, day);
    for (const q of s.dailyQuests(day)) {
      const def = questDef(q.id)!;
      if (def.kind === kind) expect(q.progress).toBe(def.goal);
    }
  });

  it("stops advancing a quest once it is claimed", () => {
    const s = store();
    const day = at(19_000);
    const target = s.dailyQuests(day)[0]!;
    const def = questDef(target.id)!;
    s.questProgress(def.kind, def.goal, day);
    expect(s.claimQuest(target.id, day)).toBe(true);
    s.questProgress(def.kind, 5, day);
    expect(s.dailyQuests(day).find((q) => q.id === target.id)?.progress).toBe(def.goal);
  });
});

describe("claiming quests", () => {
  const finish = (s: ProfileStore, day: number, id: string): void => {
    const def = questDef(id)!;
    s.questProgress(def.kind, def.goal, day);
  };

  it("pays out once and marks the quest claimed", () => {
    const s = store();
    const day = at(19_000);
    const q = s.dailyQuests(day)[0]!;
    const def = questDef(q.id)!;
    finish(s, day, q.id);
    expect(s.claimQuest(q.id, day)).toBe(true);
    expect(s.get().mycel).toBe(def.mycel);
    expect(s.get().pheromone).toBe(def.pheromone);
    expect(s.claimQuest(q.id, day)).toBe(false);
    expect(s.get().mycel).toBe(def.mycel);
  });

  it("refuses an unfinished quest", () => {
    const s = store();
    const day = at(19_000);
    const q = s.dailyQuests(day)[0]!;
    expect(isClaimable(q)).toBe(false);
    expect(s.claimQuest(q.id, day)).toBe(false);
    expect(s.get().mycel).toBe(0);
  });

  it("pays the sweep bonus exactly once, on the last claim", () => {
    const s = store();
    const day = at(19_000);
    const quests = [...s.dailyQuests(day)];
    let expected = 0;
    quests.forEach((q, i) => {
      finish(s, day, q.id);
      expect(s.claimQuest(q.id, day)).toBe(true);
      expected += questDef(q.id)!.mycel;
      if (i === quests.length - 1) expected += QUEST_SWEEP_BONUS.mycel;
      expect(s.get().mycel).toBe(expected);
    });
  });
});

describe("daily rollover", () => {
  it("keeps the same quests for the whole day", () => {
    const s = store();
    const first = [...s.dailyQuests(at(19_000))].map((q) => q.id);
    const later = [...s.dailyQuests(at(19_000) + 6 * 3600_000)].map((q) => q.id);
    expect(later).toEqual(first);
  });

  it("rolls a fresh set on the next day and clears progress", () => {
    const s = store();
    const day = at(19_000);
    const q = s.dailyQuests(day)[0]!;
    s.questProgress(questDef(q.id)!.kind, 1, day);
    expect(s.dailyQuests(day)[0]?.progress).toBe(1);

    const tomorrow = s.dailyQuests(at(19_001));
    expect(tomorrow.every((x) => x.progress === 0 && !x.claimed)).toBe(true);
    expect(tomorrow.map((x) => x.id)).toEqual(rollQuests(dayIndex(at(19_001))).map((x) => x.id));
  });

  it("extends the streak only for a swept day followed immediately by the next", () => {
    const s = store();
    const sweep = (day: number): void => {
      for (const q of [...s.dailyQuests(day)]) {
        const def = questDef(q.id)!;
        s.questProgress(def.kind, def.goal, day);
        s.claimQuest(q.id, day);
      }
    };
    sweep(at(19_000));
    s.dailyQuests(at(19_001));
    expect(s.get().questStreak).toBe(1);
    sweep(at(19_001));
    s.dailyQuests(at(19_002));
    expect(s.get().questStreak).toBe(2);

    // A day skipped entirely breaks the run, even though the previous day was swept.
    sweep(at(19_002));
    s.dailyQuests(at(19_010));
    expect(s.get().questStreak).toBe(0);
  });

  it("breaks the streak on a day left unfinished", () => {
    const s = store();
    const day = at(19_000);
    const q = s.dailyQuests(day)[0]!;
    const def = questDef(q.id)!;
    s.questProgress(def.kind, def.goal, day);
    s.claimQuest(q.id, day);           // one of three: not a sweep
    s.dailyQuests(at(19_001));
    expect(s.get().questStreak).toBe(0);
  });

  it("drops quest ids that no longer exist in the pool", () => {
    const p = normalise({
      quests: [{ id: "play1", progress: 2, claimed: false }, { id: "gone", progress: 9, claimed: true }, null],
    });
    expect(p.quests.map((q) => q.id)).toEqual(["play1"]);
    expect(p.quests[0]?.progress).toBe(2);
  });

  it("survives junk progress values", () => {
    const p = normalise({ quests: [{ id: "play1", progress: NaN, claimed: "yes" }] });
    expect(p.quests[0]?.progress).toBe(0);
    expect(p.quests[0]?.claimed).toBe(false);
  });
});
