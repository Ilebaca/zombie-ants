/**
 * THE RESULT CARD.
 *
 * The screen every match ends on, and it had no test. What it has to get right is not
 * layout but honesty: it reports what the match actually paid, and a defeat has to read as
 * one. A card that prints "+8" after a loss is worse than a card that prints nothing.
 *
 * It builds an overlay and returns it — it does not mount itself or decide what its buttons
 * do — so the whole thing is reachable without a running app.
 */
import { describe, expect, it } from "vitest";
import { SPECIES } from "../../engine";
import { compact } from "../../platform";
import { buildResultCard } from "../result";
import type { Recap } from "../result";
import { CHALLENGES, GOAL_TEXT } from "../challenges";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

const recap = (over: Partial<Recap> = {}): Recap => ({
  turns: 24,
  played: 187_000,
  youArmy: 41,
  species: "fire",
  xpGained: 90,
  colony: 24_305,
  colonyDelta: 305,
  mycel: 25,
  leveledTo: null,
  reason: null,
  challenge: null,
  ...over,
});

const card = (won: boolean, over: Partial<Recap> = {}): HTMLElement => {
  const ov = buildResultCard(won ? "you" : "ai", recap(over), {
    onAgain: () => {}, onChangeColony: () => {}, onHome: () => {},
  });
  document.body.replaceChildren(ov);
  return ov;
};

describe("what happened", () => {
  it("names the outcome", () => {
    expect(card(true).querySelector("#overTitle")?.textContent).toBe("Victory");
    expect(card(false).querySelector("#overTitle")?.textContent).toBe("Defeat");
  });

  it("names a challenge and whether its objective was met", () => {
    const c = CHALLENGES[0]!;
    const won = card(true, { challenge: c });
    expect(won.querySelector("#overSub")?.textContent).toContain(c.name);
    expect(won.querySelector("#overSub")?.textContent).toContain(GOAL_TEXT[c.goal]);
    expect(won.querySelector("#overTitle")?.textContent).toMatch(/complete/i);
    expect(card(false, { challenge: c }).querySelector("#overTitle")?.textContent)
      .toMatch(/failed/i);
    // The tick is a drawn mark, not a glyph typed into the sentence.
    expect(won.querySelector("#overSub svg")).toBeTruthy();
  });
});

describe("what it paid", () => {
  /** The colony leads: it is the number the whole match was played for (CLAUDE.md §8a). */
  it("leads with the colony, and says what it is now", () => {
    const cells = Array.from(card(true).querySelectorAll("#overRewards .payout"));
    expect(cells[0]?.textContent).toContain(`+${compact(305)}`);
    expect(cells[0]?.textContent).toContain(`${compact(24_305)} troops`);
  });

  /**
   * A DEFEAT COSTS TROOPS, and the card has to say so. Printing a bare number after a loss
   * — or worse, a plus sign — is the card lying about the thing it exists to report.
   */
  it("marks a loss as a loss rather than printing a plus", () => {
    const lost = card(false, { colonyDelta: -110, colony: 24_000, mycel: 8, xpGained: 30 });
    const cell = lost.querySelector("#overRewards .payout");
    expect(cell?.className).toContain("down");
    expect(cell?.textContent).toContain(compact(110));
    expect(cell?.textContent).not.toContain("+");
  });

  it("reports the mycelium and the XP the match actually paid", () => {
    const text = card(true, { mycel: 25, xpGained: 90 }).querySelector("#overRewards")?.textContent;
    expect(text).toContain("+25");
    expect(text).toContain("+90");
  });

  // The one thing worth its own line: it is why the XP cell matters at all.
  it("calls out a level-up, and only when there was one", () => {
    expect(card(true, { leveledTo: 7 }).querySelector(".levelup")?.textContent)
      .toContain("Colony level 7");
    expect(card(true).querySelector(".levelup")).toBeNull();
  });
});

describe("what the match looked like", () => {
  it("reports the turns, the colony fielded, the army and the clock", () => {
    const facts = card(true).querySelector("#overRecap")?.textContent ?? "";
    expect(facts).toContain("24");
    expect(facts).toContain(SPECIES.fire.name.split(" ")[0]);
    expect(facts).toContain("41");
    expect(facts).toContain("3:07");
  });

  /**
   * NOT the enemy's army. By the time this card is up the finale has washed the whole board
   * in one colour, so a number for what they had is a number for something not there.
   */
  it("does not report an enemy army that is no longer on the board", () => {
    expect(card(true).querySelector("#overRecap")?.textContent?.toLowerCase())
      .not.toContain("enemy");
  });
});

describe("the buttons", () => {
  it("hands each press back to the shell, and nothing else", () => {
    const hit: string[] = [];
    const ov = buildResultCard("you", recap(), {
      onAgain: () => hit.push("again"),
      onChangeColony: () => hit.push("colony"),
      onHome: () => hit.push("home"),
    });
    ov.querySelector<HTMLButtonElement>("#again")?.click();
    ov.querySelector<HTMLButtonElement>("#reSpecies")?.click();
    ov.querySelector<HTMLButtonElement>("#overHome")?.click();
    expect(hit).toEqual(["again", "colony", "home"]);
  });

  // The card builds an overlay and returns it. It must not mount or dispose of itself —
  // the shell owns that, which is why it can be built in a test at all.
  it("mounts nothing by itself", () => {
    document.body.replaceChildren();
    buildResultCard("you", recap(), { onAgain: () => {}, onChangeColony: () => {}, onHome: () => {} });
    expect(document.body.children.length).toBe(0);
  });
});
