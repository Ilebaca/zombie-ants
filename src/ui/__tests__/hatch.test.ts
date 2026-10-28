/**
 * THE LUCKY HATCH.
 *
 * It is the only source of a trait in the game, so what matters is that a hatch is
 * ATOMIC — a larva spent always produces a trait in the bag, and a hatch that cannot be
 * afforded takes nothing. Everything else on the screen is one egg and one button.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  HATCH_COST, LARVA_MYCEL, MemoryStore, ProfileStore, TRAITS, TRAITS_CHAPTER, TRAIT_TIER,
  TRAIT_TIERS, itemDef, tierOdds,
} from "../../platform";
import { SKIN_TIERS } from "../../platform";
import type { Cue, Feedback } from "../../platform";
import { TIERS, lookById } from "../../engine";
import { buildHatch } from "../hatch";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

/** A store past the chapter gate, with larva in it. */
const store = (larva = 5): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => {
    p.colony = 2_000_000;
    p.larva = larva;
    p.unlocked = ["leafcutter", "fire"];
  });
  return s;
};

interface Spy { shop: number; bag: number; changed: number }

const build = (s: ProfileStore, random = (): number => 0.5): { root: HTMLElement; spy: Spy } => {
  const spy: Spy = { shop: 0, bag: 0, changed: 0 };
  const root = buildHatch(s, {
    onBack: () => {},
    onBuyLarva: () => { spy.shop++; },
    onInventory: () => { spy.bag++; },
    onChanged: () => { spy.changed++; },
    random,
  });
  document.body.replaceChildren(root);
  return { root, spy };
};

const tap = (root: HTMLElement, id: string): void =>
  root.querySelector<HTMLButtonElement>(`#${id}`)?.click();

describe("the odds", () => {
  /**
   * A hatch that does not print its chances asks a player to keep spending on a
   * distribution they can only guess at, and the guess is always that the good one never
   * comes. Read off `tierOdds` rather than written out here, so a retune cannot leave the
   * screen quietly stating a chance the roll does not use.
   */
  it("prints every tier and its real chance", () => {
    const rows = build(store()).root.querySelectorAll("#hatchOdds .ho-row");
    expect(rows.length).toBe(TRAIT_TIERS.length);
    const text = build(store()).root.querySelector("#hatchOdds")?.textContent ?? "";
    for (const t of TRAIT_TIERS) {
      expect(text, `${t} is not named`).toContain(TRAIT_TIER[t].name);
      expect(text, `${t}'s chance is not stated`).toContain(`${Math.round(tierOdds(t))}%`);
    }
  });

  /**
   * NO HEADING HERE, and that is not the same as dropping the disclosure.
   *
   * The panel sits under a button that says Hatch, beside a purse counting larva, on a
   * screen titled "Lucky hatch" — "Chances" was a label on the only thing it could be the
   * chances of, and it cost a line the screen needed once the handful went under the main
   * button. In the SHOP it is a row of percentages under a PRICE and the heading is what
   * carries the requirement; `store-policy.test.ts` holds that one.
   */
  it("needs no heading on the screen it is the chances of", () => {
    const panel = build(store()).root.querySelector("#hatchOdds");
    expect(panel?.querySelector(".ho-h"), "the heading took a line back").toBeNull();
    // ...and every chance is still printed, which is the half that has to hold.
    for (const t of TRAIT_TIERS) {
      expect(panel?.textContent, `${t}'s chance went with the heading`)
        .toContain(`${Math.round(tierOdds(t))}%`);
    }
  });

  /** Shut with the rest of it: there is nothing to state the chances OF. */
  it("says nothing before the hatch opens", () => {
    const young = new ProfileStore(new MemoryStore());
    expect(build(young).root.querySelector("#hatchOdds")).toBeNull();
  });
});

describe("the hatch", () => {
  it("shows how many larva are in hand", () => {
    expect(build(store(7)).root.querySelector("#hatchLarva")?.textContent).toBe("7");
  });

  it("spends a larva and puts a trait in the bag", () => {
    const s = store(3);
    const { root } = build(s);
    tap(root, "hatchGo");
    expect(s.get().larva).toBe(3 - HATCH_COST);
    expect(s.bag.length).toBe(1);
  });

  /**
   * ATOMIC. A hatch that spent and did not roll takes something for nothing; one that
   * rolled and did not spend is free traits for ever. The store owns both halves.
   */
  it("takes nothing when there is nothing to spend", () => {
    const s = store(0);
    const { root, spy } = build(s);
    tap(root, "hatchGo");
    expect(s.get().larva).toBe(0);
    expect(s.bag.length).toBe(0);
    // ...and the button is not a dead end: with no larva it is the way to buy some.
    expect(spy.shop, "an empty hatch did nothing at all").toBe(1);
  });

  /**
   * ...and the STORE refuses too, not just the screen. The screen's button turns into a
   * shop link when there is nothing to spend, so the guard that actually protects the
   * save is never reached from there — and it is the one that has to hold for every
   * future caller.
   */
  it("refuses a hatch that cannot be paid for, whoever asks", () => {
    const s = store(0);
    expect(s.hatch(() => 0.5)).toBeNull();
    expect(s.bag.length, "a trait was hatched for nothing").toBe(0);
    expect(s.get().larva).toBe(0);
  });

  it("reveals what came out, and says where it went", () => {
    vi.useFakeTimers();
    const s = store();
    const { root, spy } = build(s);
    tap(root, "hatchGo");
    // IT HOLDS FIRST: the answer is not on screen the instant the button is pressed, and
    // the larva is wriggling through the hold (`.working` is the one class that drives
    // the animation, the button's label and the guard against a second press).
    expect(root.querySelector("#hatchPop")).toBeNull();
    expect(root.querySelector("#hatchPrize")).toBeNull();
    expect(root.querySelector(".hatchstage.working")).toBeTruthy();
    expect(root.querySelector("#hatchLarvaArt"),
      "the larva vanished on the press, so there was nothing to wriggle").toBeTruthy();

    vi.advanceTimersByTime(2000);
    const prize = root.querySelector("#hatchPop #hatchPrize");
    expect(prize, "the prize did not come up over the screen").toBeTruthy();
    const item = s.bag[0]!;
    expect(prize?.textContent).toContain(itemDef(item)?.name);
    expect(spy.changed).toBe(1);

    tap(root, "hatchToBag");
    expect(spy.bag).toBe(1);
    vi.useRealTimers();
  });

  /** One press is one larva, however many times the button is hit mid-animation. */
  it("cannot be hatched twice into one animation", () => {
    vi.useFakeTimers();
    const s = store(5);
    const { root } = build(s);
    tap(root, "hatchGo");
    // The button itself is what stops the second press — one mechanism, and the one a
    // player can see, rather than a flag re-checked inside the handler as well.
    expect(root.querySelector<HTMLButtonElement>("#hatchGo")?.disabled,
      "the button stayed live while the egg was still rocking").toBe(true);
    tap(root, "hatchGo");
    tap(root, "hatchGo");
    expect(s.get().larva).toBe(4);
    expect(s.bag.length).toBe(1);
    vi.useRealTimers();
  });

  /**
   * SHUT UNTIL TRAITS ARE. Larva buys traits and nothing else, so a hatch open before the
   * benches are would sell a player something they cannot equip on any colony — which is
   * the one thing a shop must never do.
   */
  it("is shut before the chapter that opens traits", () => {
    const early = new ProfileStore(new MemoryStore());
    early.update((p) => { p.larva = 9; });
    const { root } = build(early);
    expect(root.querySelector("#hatchShut")?.textContent).toContain(`chapter ${TRAITS_CHAPTER}`);
    expect(root.querySelector("#hatchGo"), "a shut hatch still offered a hatch").toBeNull();
    expect(root.querySelector("#hatchBuy"), "a shut hatch still sold larva").toBeNull();
  });

  it("takes the plus sign to the shop", () => {
    const { root, spy } = build(store());
    tap(root, "hatchBuy");
    expect(spy.shop).toBe(1);
  });
});

describe("what is in a larva", () => {
  /**
   * ONLY COLONIES THE PLAYER HAS, plus the universal ones. A mythic for a colony they may
   * never buy is a mythic they cannot use, and the whole point of the top tier is that
   * finding one is the best thing that happens in the feature.
   */
  it("never hatches a trait for a colony the player does not own", () => {
    const s = store(200);
    let seed = 1;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 200; i++) s.hatch(rnd);
    // Every larva bought SOMETHING: a trait in the bag, or a skin unlocked. A hatch that
    // spent and gave nothing is the one outcome this call must never produce.
    expect(s.bag.length + s.skins.length).toBe(200);
    for (const item of s.bag) {
      const def = itemDef(item);
      expect(def, "hatched something not in the table").toBeTruthy();
      if (def?.species === null) continue;
      expect(s.get().unlocked, `hatched a ${def?.species} trait`).toContain(def?.species);
    }
  });

  /** ...and it can reach ALL of them: universal, and every colony that is owned. */
  it("reaches every trait the player can use", () => {
    const s = store(3000);
    let seed = 99;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 3000; i++) s.hatch(rnd);
    const seen = new Set(s.bag.map((i) => i.def));
    const reachable = TRAITS.filter(
      (t) => t.species === null || s.get().unlocked.includes(t.species));
    expect(seen.size, "some traits can never be hatched").toBe(reachable.length);
    // ...and every tier turns up, or the top of the table is decoration.
    expect(new Set(s.bag.map((i) => i.tier)).size).toBe(5);
  });
});

/**
 * A SKIN CAME OUT.
 *
 * It is the one prize that does not go to the inventory, so the card must not offer that
 * as the way out — the only place a skin can be worn from is the colony it belongs to.
 */
describe("hatching a skin", () => {
  /**
   * A stream that lands on a skin: pick the trait, then a tier in the top 5% of the
   * weighted roll (which is where Exceptional and Mythic are), then which skin.
   */
  const skinRoll = (): (() => number) => {
    const values = [0.1, 0.995, 0];
    let i = 0;
    return () => values[i++] ?? 0.5;
  };

  it("shows the colony wearing it, and points at that colony", () => {
    const s = store(3);
    const spy = { colony: "" };
    const root = buildHatch(s, {
      onBack: () => {}, onBuyLarva: () => {}, onInventory: () => {},
      onColony: (id) => { spy.colony = id; },
      random: skinRoll(),
    });
    document.body.replaceChildren(root);
    vi.useFakeTimers();
    tap(root, "hatchGo");
    vi.advanceTimersByTime(1200);
    vi.useRealTimers();

    const prize = root.querySelector("#hatchPrize");
    expect(prize?.className, "a skin was drawn as a trait").toContain("skin");
    // It wears its own rarity, in the game's one colour for it — a skin is only ever
    // Exceptional or Mythic, and the card has to say which.
    const look = lookById(s.skins[0] as string);
    expect(prize?.textContent).toContain(`${TIERS[look!.tier!].name} skin`);
    expect((prize as HTMLElement).style.getPropertyValue("--tier"))
      .toBe(TIERS[look!.tier!].colour);
    // The picture IS the prize: the colony's own head, wearing it.
    expect(prize?.querySelector("canvas"), "the skin was not drawn").toBeTruthy();

    const found = s.skins[0];
    expect(found, "nothing was unlocked").toBeTruthy();
    expect(prize?.textContent).toContain(lookById(found as string)?.name ?? "");

    // It went nowhere: a skin is an appearance, not an item.
    expect(s.bag.length).toBe(0);
    expect(root.querySelector("#hatchToBag"), "a skin offered the inventory").toBeNull();
    root.querySelector<HTMLButtonElement>("#hatchToColony")?.click();
    expect(spy.colony).toBe(lookById(found as string)?.species);
  });

  /**
   * Printed, like the tiers. A skin has no chance of its own — it IS the top of the row —
   * so the note NAMES the tiers rather than restating a number that could drift from them.
   */
  it("names the tiers a skin comes out of, beside the odds", () => {
    const root = buildHatch(store(1), {
      onBack: () => {}, onBuyLarva: () => {}, onInventory: () => {},
    });
    const said = root.querySelector("#hatchOdds")?.textContent ?? "";
    for (const t of SKIN_TIERS) expect(said).toContain(TIERS[t].name);
    expect(said).toContain("colony skin");
  });

  /**
   * AND IT BREAKS AT THE COMMA.
   *
   * As one string the note wraps wherever the column runs out — mid-clause, on a
   * different word at every screen width — which reads as a paragraph that did not fit
   * rather than as one line saying what is paid and a second saying when. The halves are
   * their own elements so the break cannot drift; `.ho-line` is what makes each a line.
   */
  it("puts the note on two lines, split at the comma", () => {
    const root = buildHatch(store(1), {
      onBack: () => {}, onBuyLarva: () => {}, onInventory: () => {},
    });
    const lines = Array.from(root.querySelectorAll("#hatchOdds .ho-note .ho-line"))
      .map((n) => n.textContent ?? "");
    expect(lines.length, "the note is one run of text again").toBe(2);
    expect(lines[0]?.endsWith(","), `the first line does not end at the comma: ${lines[0]}`)
      .toBe(true);
    expect(lines[1], "the clause after the comma is not its own line").not.toContain(",");
    // ...and the split lost nothing: the two halves are still the whole sentence.
    expect(lines.join(" ")).toBe(
      `${SKIN_TIERS.map((t) => TIERS[t].name).join(" and ")} hatches pay a colony skin,`
      + " while you still have one to find.");
  });
});

/**
 * MYCELIUM BUYS A LARVA.
 *
 * The mycelium sink is finite — the chambers, the eight colonies and the granary — and a
 * player on the record this economy is tuned for owns all of it well before the road ends.
 * From that day the currency every match pays buys nothing at all, which is a reward that
 * has stopped being one. The hatch is the only sink in the game with no end, so this row
 * is where the surplus goes.
 */
describe("mycelium into a larva", () => {
  const withMycel = (mycel: number, larva = 0): ProfileStore => {
    const s = store(larva);
    s.update((p) => { p.mycel = mycel; });
    return s;
  };

  it("trades the price for one larva and updates the purse on the screen", () => {
    const s = withMycel(LARVA_MYCEL);
    const { root, spy } = build(s);
    tap(root, "hatchTrade");

    expect(s.get().larva).toBe(1);
    expect(s.get().mycel).toBe(0);
    expect(root.querySelector("#hatchLarva")?.textContent).toBe("1");
    expect(spy.changed, "the screen behind has a stale mycelium figure").toBe(1);
  });

  /** It states what it costs rather than disappearing: a blank control reads as broken. */
  it("still names the price when it cannot be paid, and takes nothing", () => {
    const s = withMycel(LARVA_MYCEL - 1);
    const { root } = build(s);
    const row = root.querySelector<HTMLButtonElement>("#hatchTrade");
    expect(row?.textContent).toContain(String(LARVA_MYCEL));
    expect(row?.className).toContain("out");
    row?.click();
    expect(s.get().larva).toBe(0);
    expect(s.get().mycel).toBe(LARVA_MYCEL - 1);
  });

  /** Shut with everything else on this screen until the benches it feeds are open. */
  it("is not offered before the chapter gate", () => {
    const s = withMycel(1e6);
    s.update((p) => { p.colony = 40; });
    expect(build(s).root.querySelector("#hatchTrade")).toBe(null);
  });
});

/**
 * THE MOMENT HAS A SOUND, AND THE SOUND IS THE TIER.
 *
 * The hatch was silent apart from the bed — a feature whose entire point is the beat
 * between the button and the answer, resolving into a card that appeared without a noise.
 * The colour is what says "mythic" before the trait is named, and the cue has to say the
 * same thing or the top two rungs sound exactly like the sixty-in-a-hundred one.
 */
describe("what it sounds like", () => {
  const spyFeedback = (): { cues: string[]; feedback: Feedback } => {
    const cues: string[] = [];
    const feedback = {
      play: (cue: Cue) => { cues.push(cue); },
      setMusic: () => {}, unlock: () => {}, setSound: () => {},
      setMusicEnabled: () => {}, setHaptics: () => {}, close: () => {},
    } satisfies Feedback;
    return { cues, feedback };
  };

  const hatchWith = (roll: number): string[] => {
    vi.useFakeTimers();
    const { cues, feedback } = spyFeedback();
    const root = buildHatch(store(), {
      onBack: () => {}, onBuyLarva: () => {}, onInventory: () => {},
      random: () => roll, feedback,
    });
    document.body.replaceChildren(root);
    root.querySelector<HTMLButtonElement>("#hatchGo")?.click();
    vi.runAllTimers();
    vi.useRealTimers();
    return cues;
  };

  /**
   * THE SHELL FIRST, AND NOT THE PRIZE. Nothing has been revealed while the egg is
   * rocking, and a sound that gave the answer away there would undo the only thing the
   * rocking is for.
   */
  it("cracks when the egg starts, and names the tier only at the reveal", () => {
    const cues = hatchWith(0.01);
    expect(cues[0], "the shell never gave way").toBe("hatch");
    expect(cues).toHaveLength(2);
    expect(["prize", "jackpot"]).toContain(cues[1]);
  });

  /**
   * A MYTHIC MUST NOT SOUND LIKE A COMMON. `TIER_IDS` decides which, so a retune of the
   * ladder cannot move a colour on one screen and leave the sound where it was.
   */
  it("gives the top two rungs a different cue from the rest", () => {
    // The weights run common-first, so a roll near zero is a common and one near the top
    // of the range is a mythic (platform/traits.ts).
    expect(hatchWith(0.01)[1], "a common got the rare cue").toBe("prize");
    expect(hatchWith(0.999)[1], "a mythic sounded like a common").toBe("jackpot");
  });

  it("is silent with no feedback device, rather than broken", () => {
    vi.useFakeTimers();
    const { root } = build(store());
    expect(() => {
      tap(root, "hatchGo");
      vi.runAllTimers();
    }).not.toThrow();
    vi.useRealTimers();
  });
});

/**
 * TEN AT ONCE.
 *
 * The handful is a shortcut through the one action this screen offers, so it is OFFERED
 * only when it can be paid for — the main button already carries "a dead button is a dead
 * end" and never says no, and a second one under it that mostly reads "you cannot" is a
 * control competing with the one that can.
 */
describe("the handful", () => {
  const BULK = 10;

  it("is not offered until the whole batch can be paid for", () => {
    expect(build(store(BULK - 1)).root.querySelector("#hatchGo10"),
      "a handful was offered that the purse cannot cover").toBeNull();
    expect(build(store(BULK)).root.querySelector("#hatchGo10"),
      "a player holding ten was not offered the handful").toBeTruthy();
  });

  /** Under the one that always works, never above it: there is one primary action here. */
  it("sits under the main button", () => {
    const foot = build(store(BULK)).root.querySelector(".hatchfoot");
    const ids = Array.from(foot?.children ?? []).map((n) => n.id);
    expect(ids, "the handful is not under the main button").toEqual(["hatchGo", "hatchGo10"]);
  });

  it("spends ten and puts ten in the bag", () => {
    vi.useFakeTimers();
    const s = store(12);
    const { root, spy } = build(s);
    tap(root, "hatchGo10");
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();
    expect(s.get().larva, "the batch did not cost ten larva").toBe(2);
    // Every roll landed: a trait in the bag, or a skin, which goes nowhere else.
    expect(s.bag.length + s.skins.length, "ten larva did not produce ten prizes").toBe(BULK);
    expect(spy.changed).toBe(1);
  });

  /**
   * TEN ROWS, IN TWO COLUMNS, IN THE ORDER THEY ROLLED. Ten of the single card would be a
   * scroller — a player would have to travel to see what they got.
   */
  it("shows the whole handful on one card", () => {
    vi.useFakeTimers();
    const { root } = build(store(BULK));
    tap(root, "hatchGo10");
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();

    const card = root.querySelector("#hatchPop #hatchPrize");
    expect(card?.className, "a handful drew the single prize card").toContain("many");
    expect(root.querySelectorAll("#hatchHaul .hp-one").length,
      "the card does not show every roll").toBe(BULK);
  });

  /** ...and it is put down the same three ways the single card is. */
  it("closes on a tap anywhere", () => {
    vi.useFakeTimers();
    const { root } = build(store(BULK));
    tap(root, "hatchGo10");
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();
    root.querySelector<HTMLElement>("#hatchPop")?.click();
    expect(root.querySelector("#hatchPop"), "the handful's card would not go down").toBeNull();
  });

  /**
   * A MYTHIC IN A HANDFUL MUST SOUND LIKE THE MYTHIC — the same rule the match screen's
   * `loudestOf` follows. Ten cues on top of each other is a rattle; the batch is graded by
   * its best roll.
   */
  it("sounds like the loudest thing in it", () => {
    const heard: Cue[] = [];
    const feedback: Feedback = {
      play: (c: Cue) => { heard.push(c); }, unlock: () => {}, setMuted: () => {},
      setMusic: () => {}, setMusicMuted: () => {},
    } as unknown as Feedback;
    vi.useFakeTimers();
    const s = store(BULK);
    // A roll at the very top of the range is a mythic (platform/traits.ts).
    const root = buildHatch(s, {
      onBack: () => {}, onBuyLarva: () => {}, onInventory: () => {},
      random: () => 0.999, feedback,
    });
    document.body.replaceChildren(root);
    tap(root, "hatchGo10");
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();
    expect(heard[0], "the shell did not give way first").toBe("hatch");
    expect(heard.at(-1), "a handful of mythics sounded like a common").toBe("jackpot");

    // A SKIN IN THE BATCH GOES SOMEWHERE THE BUTTON DOES NOT, so the card says so. At the
    // top of the range every roll pays one while any is still locked, which is the whole
    // point of the note: the inventory is the one place a skin will never be.
    expect(s.skins.length, "the top of the range paid no skin at all").toBeGreaterThan(0);
    expect(root.querySelector(".hp-many-n")?.textContent,
      "a handful carrying a skin did not say where it went").toMatch(/worn on/i);
    expect(root.querySelectorAll("#hatchHaul .hp-one.skin").length,
      "a skin was drawn as a trait").toBeGreaterThan(0);
  });

  /**
   * ...AND THE STORE REFUSES TOO, not just the screen. The button is only drawn when the
   * batch is affordable, so the guard that actually protects the save is never reached
   * from there — and it is the one that has to hold for every future caller.
   */
  it("refuses a batch the purse cannot cover, whoever asks", () => {
    const s = store(BULK - 1);
    expect(s.hatchMany(BULK, () => 0.5)).toEqual([]);
    expect(s.bag.length, "a partial batch was rolled").toBe(0);
    expect(s.get().larva, "larva went missing on a refused batch").toBe(BULK - 1);
  });
});

/**
 * THE MIDDLE OF THE SCREEN IS THE LARVA.
 *
 * A drawn gold egg sat on a tinted disc over the larva the ARTWORK painted there, with a
 * line of copy under it — a screen illustrating itself twice, removed when it was asked
 * for. The chamber is empty in the picture now and the animal is an element, which is
 * what let the movement come back; the caption did not.
 */
describe("the stage", () => {
  it("holds the larva and nothing else", () => {
    const { root } = build(store());
    const stage = root.querySelector("#hatchStage");
    expect(stage, "the stage went away with the egg").toBeTruthy();
    expect(stage?.childElementCount, "something else is drawn over the artwork").toBe(1);
    expect(stage?.querySelector("#hatchLarvaArt"), "the larva is not in the chamber").toBeTruthy();
    expect(stage?.textContent, "the stage is captioned again").toBe("");
  });

  /**
   * NO LARVA, NO LARVA IN THE CHAMBER.
   *
   * The picture is the hatch you are holding rather than decoration, so an empty purse
   * leaves an empty burrow — and the button under it is the one thing on the screen
   * saying what to do about that.
   */
  it("empties the chamber when there is nothing to hatch", () => {
    const { root } = build(store(0));
    expect(root.querySelector("#hatchLarvaArt"),
      "a larva is lying there that the player does not own").toBeNull();
    // The screen is not broken by it — the stage still holds its room, so nothing below
    // jumps when the next larva is bought.
    expect(root.querySelector("#hatchStage")).toBeTruthy();
  });

  /**
   * THE LAST LARVA STAYS PUT WHILE IT IS HATCHING.
   *
   * `store.hatch()` spends BEFORE the screen redraws, so a player opening their last one
   * has none left by the time the wriggle starts — read off the purse alone the animal
   * would vanish on the press and the hold would play over an empty burrow. While it is
   * wriggling it is the one being hatched, so `busy` comes first.
   */
  it("keeps the last larva on screen while it hatches", () => {
    vi.useFakeTimers();
    const { root } = build(store(1));
    tap(root, "hatchGo");
    expect(root.querySelector("#hatchLarvaArt"),
      "the last larva vanished on the press, mid-wriggle").toBeTruthy();
    vi.advanceTimersByTime(2000);
    // ...and once it HAS hatched there is nothing left in the burrow.
    expect(root.querySelector("#hatchLarvaArt"),
      "a larva the player no longer has is still lying there").toBeNull();
    vi.useRealTimers();
  });

  /**
   * ...AND IT COMES BACK WHEN ONE IS BOUGHT, because the stage is read off the store on
   * every render rather than decided once when the screen was built.
   */
  it("puts one back the moment one is traded for", () => {
    const s = store(0);
    s.update((p) => { p.mycel = 99_999; });
    const { root } = build(s);
    expect(root.querySelector("#hatchLarvaArt")).toBeNull();
    tap(root, "hatchTrade");
    expect(root.querySelector("#hatchLarvaArt"), "the chamber stayed empty").toBeTruthy();
  });
});

/**
 * WHAT CAME OUT, OVER THE WHOLE SCREEN.
 *
 * The card used to land in the middle of the chamber at about the size of the larva it
 * replaced, which made the best thing that happens in this feature the same size as the
 * thing that was already there.
 *
 * THREE WAYS OUT AND ALL OF THEM CLOSE IT, which is the part worth holding: a press
 * wobbles, and the browser fires the click on the nearest common ancestor of where it
 * went down and where it came up — so a thumb that starts on the button and lifts on the
 * dark lands on the backdrop. With every target closing, the worst a wobble does is
 * close without navigating, which is what the backdrop does anyway.
 */
describe("the prize pop-up", () => {
  const opened = (s = store()): { root: HTMLElement; spy: Spy } => {
    vi.useFakeTimers();
    const built = build(s);
    tap(built.root, "hatchGo");
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();
    return built;
  };

  it("comes up over the screen rather than inside the chamber", () => {
    const { root } = opened();
    const pop = root.querySelector("#hatchPop");
    expect(pop, "the prize did not come up").toBeTruthy();
    expect(pop?.querySelector("#hatchPrize"), "the card is not in the pop-up").toBeTruthy();
    expect(root.querySelector("#hatchStage #hatchPrize"),
      "the card landed in the chamber again").toBeNull();
  });

  it("is put down by a tap anywhere on it", () => {
    const { root } = opened();
    root.querySelector<HTMLElement>("#hatchPop")?.click();
    expect(root.querySelector("#hatchPop"), "a tap on the pop-up left it standing").toBeNull();
  });

  it("is put down by the close mark", () => {
    const { root } = opened();
    const x = root.querySelector<HTMLButtonElement>("#hatchPopClose");
    expect(x, "there is no visible way out of a full-screen card").toBeTruthy();
    x?.click();
    expect(root.querySelector("#hatchPop")).toBeNull();
  });

  /** The way to the thing that was just won — and it closes on the way, or the card
   *  would be standing here on the way back from the inventory. */
  it("offers the inventory, and closes behind it", () => {
    const { root, spy } = opened();
    tap(root, "hatchToBag");
    expect(spy.bag, "the way to the inventory did not go anywhere").toBe(1);
    expect(root.querySelector("#hatchPop"), "it was left standing behind the inventory").toBeNull();
  });

  /** Closed, the screen is the screen again — the next hatch is one press away. */
  it("leaves the hatch ready to go again", () => {
    const { root } = opened(store(5));
    root.querySelector<HTMLElement>("#hatchPop")?.click();
    expect(root.querySelector<HTMLButtonElement>("#hatchGo")?.disabled).toBe(false);
    expect(root.querySelector("#hatchLarvaArt"), "the next larva is not in the chamber").toBeTruthy();
  });

  /**
   * A HOLD THAT OUTLIVES ITS SCREEN GETS NOTHING. The pop-up covers the whole viewport,
   * so a card raised after the player left would be standing over wherever they went.
   */
  it("does not come up on a screen that was left", () => {
    vi.useFakeTimers();
    const { root, spy } = build(store());
    tap(root, "hatchGo");
    document.body.replaceChildren();          // the player went somewhere else
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();
    expect(root.querySelector("#hatchPop"), "a card was raised over another screen").toBeNull();
    expect(spy.changed, "a prize landed on a screen nobody was looking at").toBe(0);
  });
});
