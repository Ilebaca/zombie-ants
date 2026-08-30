/**
 * CHALLENGES.
 *
 * It was a list that remembered nothing: five identical cards, and beating one changed
 * nothing at all — so the forty-mycelium reward paid again on every replay of the easiest
 * position in the game. What is tested is the structure that fixed it: a challenge is
 * beaten once, the ladder opens one rung at a time, and the daily comes back tomorrow.
 */
import { describe, expect, it } from "vitest";
import { MemoryStore, ProfileStore } from "../../platform";
import {
  CHALLENGES, buildChallenges, buildDaily, challengeState, dailyIndex, dayNumber,
} from "../challenges";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

const store = (): ProfileStore => new ProfileStore(new MemoryStore());
const list = (s: ProfileStore): HTMLElement => {
  const root = buildChallenges(s, () => {});
  document.body.replaceChildren(root);
  return root;
};
const cards = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(".chalcard"));

describe("the challenge table", () => {
  // An index is not a name: reorder the list and every stored mark points somewhere else.
  it("gives every challenge a unique, stable id", () => {
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    for (const c of CHALLENGES) expect(c.id).toMatch(/^[a-z-]+$/);
  });

  it("runs from one star to five, hardest last", () => {
    expect(CHALLENGES.map((c) => c.stars)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("beating one", () => {
  it("is remembered, and only pays the first time", () => {
    const s = store();
    const id = CHALLENGES[0]!.id;
    expect(s.challengeBeaten(id)).toBe(false);
    expect(s.beatChallenge(id)).toBe(true);
    expect(s.challengeBeaten(id)).toBe(true);
    // The second time it is not a first win, which is what stops the reward repeating.
    expect(s.beatChallenge(id)).toBe(false);
  });

  it("survives a reload", () => {
    const disk = new MemoryStore();
    new ProfileStore(disk).beatChallenge(CHALLENGES[1]!.id);
    expect(new ProfileStore(disk).challengeBeaten(CHALLENGES[1]!.id)).toBe(true);
  });

  // The daily is the repeatable half: once a DAY, not once ever.
  it("stamps the daily by day, so tomorrow's pays again", () => {
    const s = store();
    expect(s.beatDaily(100)).toBe(true);
    expect(s.beatDaily(100)).toBe(false);
    expect(s.beatDaily(101)).toBe(true);
  });
});

describe("the ladder", () => {
  it("opens only the first position to a new colony", () => {
    const { open, done } = challengeState(store());
    expect(open).toBe(0);
    expect(done).toBe(0);
  });

  it("opens the next one as each falls", () => {
    const s = store();
    s.beatChallenge(CHALLENGES[0]!.id);
    s.beatChallenge(CHALLENGES[1]!.id);
    expect(challengeState(s).open).toBe(2);
    expect(challengeState(s).done).toBe(2);
  });

  // Beaten out of order — a daily can draw any of them — must not open the whole ladder.
  it("counts a position beaten out of order without opening the ones before it", () => {
    const s = store();
    s.beatChallenge(CHALLENGES[3]!.id);
    expect(challengeState(s).open).toBe(0);
    expect(challengeState(s).done).toBe(1);
  });
});

describe("the challenges screen", () => {
  it("draws one card per position, with a picture of each", () => {
    const root = list(store());
    expect(cards(root).length).toBe(CHALLENGES.length);
    for (const card of cards(root)) {
      expect(card.querySelector(".chalshot canvas"), card.dataset.chal).toBeTruthy();
    }
  });

  it("says how far along the ladder is", () => {
    const s = store();
    s.beatChallenge(CHALLENGES[0]!.id);
    expect(list(s).querySelector(".chalsum-v")?.textContent).toBe(`1 of ${CHALLENGES.length}`);
  });

  /** The whole point of the restructure: an unbeaten rung past the open one is shut. */
  it("offers only the open position, and names what stands in the way of the rest", () => {
    const root = list(store());
    const [first, second] = cards(root) as [HTMLElement, HTMLElement];
    expect(first.className).not.toContain("locked");
    expect(first.querySelector(".challplay")).toBeTruthy();
    expect(second.className).toContain("locked");
    expect(second.querySelector(".challplay"), "a locked position was playable").toBeNull();
    expect(second.querySelector(".chalstate")?.textContent).toContain(CHALLENGES[0]!.name);
  });

  it("marks a beaten position, and still lets it be replayed", () => {
    const s = store();
    s.beatChallenge(CHALLENGES[0]!.id);
    const [first] = cards(list(s)) as [HTMLElement];
    expect(first.className).toContain("beaten");
    expect(first.querySelector(".chalstate.done")?.textContent).toContain("Beaten");
    expect(first.querySelector(".chalagain"), "a beaten position could not be replayed")
      .toBeTruthy();
    // ...but it does not advertise a reward it will not pay again.
    expect(first.querySelector(".chalpay")).toBeNull();
  });

  it("shows what an unbeaten position pays", () => {
    expect(cards(list(store()))[0]?.querySelector(".chalpay")?.textContent).toContain("+40");
  });

  it("plays the position that was tapped", () => {
    let played = -1;
    const root = buildChallenges(store(), (i) => { played = i; });
    root.querySelector<HTMLButtonElement>(".chalcard .challplay")?.click();
    expect(played).toBe(0);
  });
});

describe("the daily", () => {
  const AT = 1_700_000_000_000;
  const daily = (s: ProfileStore, now = AT): HTMLElement => {
    const root = buildDaily(s, () => {}, () => {}, () => {}, now);
    document.body.replaceChildren(root);
    return root;
  };

  it("draws the same position for everybody on a given day", () => {
    expect(dailyIndex(AT)).toBe(dailyIndex(AT + 1000));
    expect(daily(store()).querySelector<HTMLElement>(".chalcard")?.dataset.chal)
      .toBe(CHALLENGES[dailyIndex(AT)]?.id);
  });

  it("says when the next one arrives, beaten or not", () => {
    const s = store();
    expect(daily(s).querySelector(".chalclock")?.textContent).toMatch(/a new one in/i);
    s.beatDaily(dayNumber(AT));
    expect(daily(s).querySelector(".chalclock")?.textContent).toMatch(/a new one in/i);
  });

  it("offers today's reward once, then reports it beaten", () => {
    const s = store();
    const before = daily(s);
    expect(before.querySelector(".chalpay")?.textContent).toContain("+250");
    expect(before.querySelector(".challplay")).toBeTruthy();
    s.beatDaily(dayNumber(AT));
    const after = daily(s);
    expect(after.querySelector(".chalstate.done")?.textContent).toContain("today");
    expect(after.querySelector(".chalpay"), "still advertising a reward it has paid")
      .toBeNull();
    // Still playable — it just does not pay twice.
    expect(after.querySelector(".chalagain")).toBeTruthy();
  });

  it("is a fresh one tomorrow", () => {
    const s = store();
    s.beatDaily(dayNumber(AT));
    expect(daily(s, AT + 864e5).querySelector(".chalpay")).toBeTruthy();
  });
});
