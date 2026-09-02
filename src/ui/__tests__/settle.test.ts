/**
 * WHAT A FINISHED MATCH PAYS.
 *
 * This lived inside the router's `onExit` handler and nothing tested it end to end — the
 * pieces were covered (`recordResult`, the quest scoring, `beatChallenge`) but the ORDER
 * they run in was not, and the order is the part that is easy to get wrong: the colony,
 * the mycelium and the XP all move inside `recordResult`, so a card that read them after
 * would report the totals where it means the deltas.
 */
import { describe, expect, it } from "vitest";
import { MemoryStore, ProfileStore, WIN_LARVA, questDef } from "../../platform";
import { NEUTRAL_MODS, START_SHAPES, createGame } from "../../engine";
import type { GameState, Player } from "../../engine";
import { settleMatch } from "../settle";
import type { Settlement } from "../settle";
import { CHALLENGES, CHALLENGE_REWARD } from "../challenges";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

const board = (): GameState =>
  createGame({ map: "small", species: { you: "fire", ai: "ghost" }, seed: 7 });

const settle = (over: Partial<Settlement> = {}): { recap: ReturnType<typeof settleMatch>; store: ProfileStore } => {
  const store = over.store ?? new ProfileStore(new MemoryStore());
  const state = over.state ?? board();
  const recap = settleMatch({
    store,
    state,
    winner: "you" as Player,
    reason: "nest",
    playedMs: 90_000,
    queens: 1,
    map: "small",
    species: "fire",
    foe: { species: "ghost", name: "Vela", human: false },
    record: {
      setup: { map: "small", species: { you: "fire", ai: "ghost" }, seed: 7,
        shape: START_SHAPES.wedge, mods: { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } } },
      moves: [{ do: "end" }, { do: "end" }],
    },
    challenge: null,
    ...over,
  });
  return { recap, store };
};

describe("what a win pays toward the lucky hatch", () => {
  /**
   * The hatch is the only source of a trait and larva was the only way to open it, so
   * before this a player who never bought any had the whole collection shut to them.
   */
  it("pays a larva for a win and nothing for a loss", () => {
    const win = new ProfileStore(new MemoryStore());
    settle({ store: win });
    expect(win.get().larva).toBe(WIN_LARVA);

    const loss = new ProfileStore(new MemoryStore());
    settle({ store: loss, winner: "ai" as Player });
    expect(loss.get().larva).toBe(0);
  });

  /**
   * BANKED AT EVERY CHAPTER, SHOWN ONLY ONCE THE DOOR IS OPEN. A player arriving at the
   * chapter the hatch opens on should arrive with something to open; a card announcing a
   * currency whose only use is still locked is a question the app cannot answer.
   */
  it("banks it before chapter 10 but keeps it off the card", () => {
    const young = new ProfileStore(new MemoryStore());
    expect(young.traitsOpen()).toBe(false);
    const { recap } = settle({ store: young });
    expect(young.get().larva).toBe(WIN_LARVA);
    expect(recap.larva).toBeNull();
  });

  it("puts it on the card once the hatch is open", () => {
    const grown = new ProfileStore(new MemoryStore());
    grown.update((p) => { p.colony = 2_000_000; });
    expect(grown.traitsOpen()).toBe(true);
    expect(settle({ store: grown }).recap.larva).toBe(WIN_LARVA);
  });
});

describe("settling a match", () => {
  /** The whole reason the figures are read before the payout and again after. */
  it("reports what the match PAID, not what the player holds", () => {
    const store = new ProfileStore(new MemoryStore());
    store.update((p) => { p.colony = 10_000; p.mycel = 500; });
    const { recap } = settle({ store });

    expect(recap.colonyDelta, "the card reported the total instead of the gain")
      .toBeLessThan(recap.colony);
    expect(recap.colonyDelta).toBe(store.get().colony - 10_000);
    expect(recap.mycel).toBe(store.get().mycel - 500);
    expect(recap.xpGained).toBe(store.get().xp);
    expect(recap.colony).toBe(store.get().colony);
  });

  it("counts the game into the career", () => {
    const { store } = settle();
    const s = store.get().stats;
    expect(s.games).toBe(1);
    expect(s.wins).toBe(1);
    expect(s.queens).toBe(1);
    expect(s.playedMs).toBe(90_000);
  });

  it("counts a loss as a loss", () => {
    const { store, recap } = settle({ winner: "ai" as Player });
    expect(store.get().stats.wins).toBe(0);
    expect(store.get().stats.games).toBe(1);
    // A defeat costs troops, and the card says so in the losing colour.
    expect(recap.colonyDelta).toBeLessThanOrEqual(0);
  });

  it("remembers the match, with its moves", () => {
    const { store } = settle();
    const [log] = store.history;
    expect(log?.foeName).toBe("Vela");
    expect(log?.record?.moves.length).toBe(2);
    // The colony figures on the row are the ones from either side of the payout.
    expect(log?.colonyAfter).toBe(store.get().colony);
    expect(log?.colonyBefore).toBeLessThan(log?.colonyAfter ?? 0);
  });

  /**
   * The quests are rolled from the DAY, so the three a match can answer are whichever
   * three today drew — the check is that a finished match moved every one of them it
   * could, not that it moved a particular id.
   */
  it("credits every kind of quest the match can answer", () => {
    const store = new ProfileStore(new MemoryStore());
    // The day's three are rolled from the date, so the kinds on offer change daily. These
    // are stated instead: one of every kind a finished match is supposed to answer.
    store.dailyQuests();
    store.update((p) => {
      p.quests = ["play3", "turns60", "win1", "nest1", "queen1"]
        .map((id) => ({ id, progress: 0, claimed: false }));
    });
    const before = store.get().quests.map((q) => `${q.id}:${q.progress}`);
    expect(before.length, "no quests were rolled").toBe(5);

    settle({ store });
    const after = store.get().quests.map((q) => `${q.id}:${q.progress}`);
    expect(after, "a finished match credited nothing").not.toEqual(before);

    /*
     * EVERY kind this match answers, not just some of them. Queens, nests and turns were
     * already being counted for the career record and simply never credited to a quest,
     * which is most of why the pool only had four kinds in it — so a test that settles for
     * "something moved" is a test that would not have noticed.
     */
    const ANSWERED = ["play", "turns", "win", "nest", "queen"];
    for (const q of store.get().quests) {
      const def = questDef(q.id);
      if (!def || !ANSWERED.includes(def.kind)) continue;
      expect(q.progress, `a won ${def.kind} quest was never credited`).toBeGreaterThan(0);
    }
  });

  it("pays a challenge the first time and never again", () => {
    // A win pays mycelium on its own, so the challenge's share is the DIFFERENCE between
    // a settled challenge and the same match settled without one.
    const paidFor = (challenge: { index: number; daily: boolean } | null): number => {
      const store = new ProfileStore(new MemoryStore());
      const was = store.get().mycel;
      settle({ store, challenge });
      return store.get().mycel - was;
    };
    expect(paidFor({ index: 0, daily: false }) - paidFor(null)).toBe(CHALLENGE_REWARD);

    // ...and the second time round it pays only what the match itself pays. Measured
    // against the same colony replaying the same position WITHOUT the challenge, because
    // a win's own mycelium grows with the colony and is bigger than the reward by then.
    const second = (challenge: { index: number; daily: boolean } | null): number => {
      const store = new ProfileStore(new MemoryStore());
      settle({ store, challenge: { index: 0, daily: false } });
      const between = store.get().mycel;
      settle({ store, challenge });
      return store.get().mycel - between;
    };
    expect(second({ index: 0, daily: false }), "the challenge paid a second time")
      .toBe(second(null));

    const store = new ProfileStore(new MemoryStore());
    settle({ store, challenge: { index: 0, daily: false } });
    expect(store.get().challenges).toContain(CHALLENGES[0]?.id);
  });

  it("pays nothing for a challenge that was lost", () => {
    const lost = (challenge: { index: number; daily: boolean } | null): number => {
      const store = new ProfileStore(new MemoryStore());
      const was = store.get().mycel;
      settle({ store, winner: "ai" as Player, challenge });
      return store.get().mycel - was;
    };
    expect(lost({ index: 0, daily: false }), "a lost challenge paid out")
      .toBe(lost(null));

    const store = new ProfileStore(new MemoryStore());
    settle({ store, winner: "ai" as Player, challenge: { index: 0, daily: false } });
    expect(store.get().challenges, "a lost challenge was marked beaten").toEqual([]);
  });

  /** Beating a daily also beats the position it drew, so the ladder moves too. */
  it("moves the ladder when a daily is beaten", () => {
    const { store } = settle({ challenge: { index: 1, daily: true } });
    expect(store.get().challenges).toContain(CHALLENGES[1]?.id);
  });

  it("hands the card the challenge it was, and the reason it ended", () => {
    const { recap } = settle({ challenge: { index: 0, daily: false } });
    expect(recap.challenge?.id).toBe(CHALLENGES[0]?.id);
    expect(recap.reason).toBe("nest");
    expect(recap.turns).toBe(1);
  });
});
