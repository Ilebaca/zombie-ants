/**
 * THE LUCKY HATCH.
 *
 * The painting in the middle of the screen, the larva you have above it, a button under it.
 * That is deliberately the whole interface: the hatch does exactly one thing, and every
 * control that is not "hatch" is a control competing with it.
 *
 * It is the ONLY source of a trait (platform/traits.ts), which is what gives it a reason to
 * exist beyond handing out currency a player could have earned by playing. A match pays
 * mycelium and a colony; this pays the one thing there is no other way to get.
 *
 * THE MOMENT IS THE FEATURE. A roll that resolves instantly is a number changing, and a
 * collection nobody feels collecting is a spreadsheet. So the roll HOLDS — the larva in
 * the middle of the chamber WRIGGLES through it — and then the tier's colour comes up
 * before the trait is named. The colour is the answer, and it arrives first, which is the
 * whole reason the tiers have colours at all.
 */
import {
  AVATAR_TIER, HATCH_COST, LARVA_MYCEL,
} from "../platform";
import type { Cue, Feedback, HatchPrize, ProfileStore } from "../platform";
import { TIER_IDS } from "../engine";
import { el, resourceMark, resourcePrice, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";
import { buildOdds } from "./odds";
import { buildRewardReveal, hatchReward } from "./reward-reveal";
import LARVA_ART from "./backdrops/larva.webp";

/** How long the larva wriggles before it gives an answer. */
const SHAKE_MS = 900;

/**
 * HOW MANY A HANDFUL IS.
 *
 * Ten, because that is the number a player counts their larva in once they have more than
 * a few, and because ten rolls at the printed odds is where the row below stops being a
 * table of chances and starts being something they have watched happen — four uncommons,
 * a rare, and the one in a hundred still missing.
 *
 * The button for it is SHOWN ONLY when the whole batch is affordable, which is the one
 * place this screen departs from "a dead button is a dead end": the main button already
 * carries that job, and it never says no. A second one under it that mostly reads "you
 * cannot" is a control competing with the one that can.
 */
const BULK = 10;

export interface HatchOptions {
  onBack: () => void;
  /** Straight to the larva shelf in the shop — the plus sign is not a general "go shopping". */
  onBuyLarva: () => void;
  /** Into the inventory, from the found trait. It is where the thing has just gone. */
  onInventory: () => void;
  /** Told after a hatch, so the drawer's counts and the screen behind can catch up. */
  onChanged?: () => void;
  /** Into the colony a found skin belongs to — that is where it is worn from. */
  onColony?: (species: string) => void;
  /** Into the profile, from a found avatar: a face is worn there and nowhere else. */
  onProfile?: () => void;
  /** Injected so a test is not a coin flip. */
  random?: () => number;
  /**
   * Sound and haptics. Optional: a hatch with none is a quiet hatch, not a broken one,
   * which is what every test gets.
   */
  feedback?: Feedback;
}

/**
 * WHICH SOUND A PRIZE MAKES, off the same ladder that decides its colour.
 *
 * The top two rungs are the ones a skin can be and the ones a player is hatching FOR —
 * 5 rolls in 100 — so they get the cue that arrives rather than climbs. Read off
 * `TIER_IDS` rather than listed here, or a retune of the ladder would move a colour on one
 * screen and leave the sound where it was.
 */
const LOUD = TIER_IDS.slice(-2) as readonly string[];
const prizeCue = (tier: string | undefined): Cue =>
  tier && LOUD.includes(tier) ? "jackpot" : "prize";

/** What a prize is worth to the ear, whichever kind it is. */
const tierOf = (prize: HatchPrize): string | undefined =>
  prize.kind === "skin" ? prize.look.tier
    : prize.kind === "avatar" ? AVATAR_TIER
      : prize.item.tier;

/**
 * ONE CUE FOR A BATCH, AND IT IS THE LOUDEST THING IN IT.
 *
 * The same rule the match screen's `loudestOf` follows: ten cues on top of each other is a
 * rattle, and a mythic in a handful of commons has to sound like the mythic — grading the
 * batch by its best roll is what the player is listening for.
 */
const batchCue = (prizes: readonly HatchPrize[]): Cue =>
  prizes.some((p) => LOUD.includes(tierOf(p) ?? "")) ? "jackpot" : "prize";

export function buildHatch(store: ProfileStore, opts: HatchOptions): HTMLElement {
  const root = screenEl("luckyhatch");
  /**
   * What the last hatch produced, and nothing before the first one.
   *
   * It is also what puts the prize OVER the screen: the card is a full-screen pop-up
   * rather than something that lands in the middle of the chamber, so this doubles as
   * "is the pop-up up". Closing it clears the field, which is how one state can be both.
   */
  let found: HatchPrize | null = null;
  /**
   * What a HANDFUL produced, and empty for a single hatch.
   *
   * It is a second field rather than `found` becoming a list, because the two are two
   * different cards: one prize is the tier's colour filling the screen, and ten is a
   * table of what came out. A list of one would draw the handful's card for an ordinary
   * hatch and lose the moment the whole feature is built around.
   */
  let haul: HatchPrize[] = [];
  /** True while the larva is wriggling: the button must not be tapped twice into one roll. */
  let busy = false;

  const render = (): void => {
    root.replaceChildren();
    screenHeader(root, {
      title: "Lucky hatch", onBack: opts.onBack,
      backId: "hatchBack",
    });

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "hatchwrap");
    wrap.id = "hatchBody";

    wrap.append(purse(), trade(), stage(), foot(), odds());

    body.appendChild(wrap);
    root.appendChild(body);

    // THE PRIZE IS OVER THE SCREEN, AND IT RIDES INSIDE IT. Appended to `root` rather
    // than to the body, so leaving the hatch takes the pop-up with it — a full-screen
    // card left standing over whatever the player went to next is a far worse fault
    // than the one it is here to fix.
    //
    // WHICH IS WHY THE SCREEN IS LIFTED. `.screen` is `z-index: 20` in the legacy sheet
    // and the tab bar is 60, both in the page's own stacking context — so a pop-up
    // INSIDE the screen cannot out-stack the bar however high its own z-index goes, and
    // it came up with five tabs still lit across the bottom of it. The class raises the
    // screen rather than the card, because the card is the thing that is trapped.
    const up = !busy && revealedPrizes().length > 0;
    root.classList.toggle("popped", up);
    if (up) root.appendChild(popup());
  };

  /* ------------------------------------------------------------------- THE LARVA */

  /**
   * How many hatches you are holding, and the way to get more.
   *
   * Larva is shown HERE and nowhere else in the app: it buys exactly one thing, and a
   * number in the top bar that the top bar offers nothing to spend on is a question the
   * interface never answers.
   */
  const purse = (): HTMLElement => {
    const box = el("div", "hatchpurse");
    const mark = el("span", "hp-i");
    mark.appendChild(resourceMark("brood", 20));
    const n = el("span", "hp-n", String(store.get().larva));
    n.id = "hatchLarva";

    const plus = el("button", "hp-plus") as HTMLButtonElement;
    plus.type = "button";
    plus.id = "hatchBuy";
    plus.setAttribute("aria-label", "Buy larva");
    plus.appendChild(icon("plus", 16));
    plus.onclick = opts.onBuyLarva;

    box.append(mark, n, el("span", "hp-k", "larva"), plus);
    return box;
  };

  /**
   * MYCELIUM BUYS A LARVA.
   *
   * The mycelium sink is FINITE and always was — the chambers, the eight colonies and the
   * granary come to about 21,585, and a player on the record this economy is tuned for has
   * bought every one of them well before the road ends. From that day the currency every
   * match pays buys nothing at all, for ever, which is a reward that has stopped being one.
   *
   * The hatch is the only sink in the game with no end, so this is where the surplus goes.
   * Priced against the LEFTOVER rather than against income (platform/exchange.ts): about a
   * larva every four days out of money that was doing nothing. A win still pays one
   * outright, so playing is never the slow way to hatch.
   *
   * It sits under the purse because it is about the purse — the plus sign beside the
   * figure spends real money, and a player holding nine thousand mycelium should not have
   * to reach the shop to find that out.
   */
  const trade = (): HTMLElement => {
    const mycel = store.get().mycel;
    const can = mycel >= LARVA_MYCEL;

    const row = el("button", "hatchtrade" + (can ? "" : " out")) as HTMLButtonElement;
    row.type = "button";
    row.id = "hatchTrade";

    const from = el("span", "ht-c");
    from.append(resourceMark("mycel", 15), resourcePrice(LARVA_MYCEL, !can));
    const into = el("span", "ht-c ht-to");
    into.append(resourceMark("brood", 15), el("span", undefined, "1"));
    row.append(from, icon("next", 12), into, el("span", "ht-go", "Trade"));

    row.onclick = () => {
      if (!store.buyLarva()) return;
      render();
      opts.onChanged?.();
    };
    row.disabled = !can;
    return row;
  };

  /* ------------------------------------------------------------------- THE STAGE */

  /**
   * THE MIDDLE IS THE LARVA, AND NOTHING ELSE.
   *
   * There was a drawn EGG here — a gold mark on a dashed gold-tinted disc — over a larva
   * the ARTWORK painted in the middle of the chamber, which is a screen illustrating
   * itself twice. The egg went, and with it the only thing on the screen that could move
   * while the roll resolved: a painted larva is part of a full-screen background, not an
   * element, so the hold was left saying it was WORKING rather than showing it.
   *
   * THE LARVA IS AN ELEMENT NOW and the chamber is empty without it, which is what buys
   * the movement back. It is sized to land where the painted one did (`skin.css`), so the
   * swap is invisible — and it WRIGGLES through the hold rather than spinning, because a
   * spin is what a loading indicator does and this is an animal.
   *
   * IT IS THERE EXACTLY WHEN YOU CAN HATCH. No larva, no larva in the chamber: the
   * picture is the hatch you are holding rather than decoration, so an empty purse leaves
   * an empty burrow and the button under it is the one that says what to do about it.
   * Measured against `HATCH_COST` and not against zero, or holding a fraction of a hatch
   * would show one that cannot be opened.
   */
  const stage = (): HTMLElement => {
    const box = el("div", "hatchstage" + (busy ? " working" : ""));
    box.id = "hatchStage";
    // `busy` FIRST, and that is not belt and braces: `store.hatch()` spends before this
    // ever redraws, so a player opening their LAST larva has none left by the time the
    // wriggle would start — the animal would vanish on the press and the hold would play
    // over an empty burrow. While it is wriggling it is the one being hatched.
    if (busy || store.get().larva >= HATCH_COST) box.appendChild(larva());
    return box;
  };

  /** The animal in the middle of the chamber. Named by the screen around it, not by itself. */
  const larva = (): HTMLElement => {
    const img = document.createElement("img");
    img.src = LARVA_ART;
    img.className = "hatchlarva";
    img.id = "hatchLarvaArt";
    // The screen is titled "Lucky hatch" and the purse above says what is in the burrow,
    // so a name here is the same fact a third time (§ EVERY CONTROL SAYS WHAT IT IS).
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.decoding = "async";
    return img;
  };

  /* -------------------------------------------------------------------- THE PRIZE */

  /** Only traits and avatars use the full-screen reveal; skins retain an unlock notice. */
  const revealedPrizes = () =>
    (haul.length ? haul : found ? [found] : []).flatMap(prize => {
      const reward = hatchReward(prize);
      return reward ? [reward] : [];
    });

  const skinNotice = (prizes: readonly HatchPrize[] = haul.length ? haul : found ? [found] : []): void => {
    const skins = prizes
      .filter((prize) => prize.kind === "skin");
    if (skins.length) toast(root, skins.map(prize => `${prize.look.name} unlocked`).join(" · "), "good");
  };
  const revealSettledPrizes = (): void => {
    render();
    if (revealedPrizes().length === 0) {
      skinNotice();
      found = null;
      haul = [];
    }
  };

  const close = (): void => {
    const prizes = haul.length ? [...haul] : found ? [found] : [];
    found = null;
    haul = [];
    render();
    skinNotice(prizes);
  };

  const popup = (): HTMLElement => {
    const pop = buildRewardReveal(revealedPrizes(), close);
    pop.id = "hatchPop";
    const content = pop.querySelector<HTMLElement>(".reward-content");
    if (content) content.id = "hatchPrize";
    queueMicrotask(() => { if (pop.isConnected) pop.focus({ preventScroll: true }); });
    return pop;
  };

  /* -------------------------------------------------------------------- THE ODDS */

  /**
   * WHAT YOU ARE CHASING, STATED.
   *
   * A hatch that does not print its odds is asking a player to keep spending on a
   * distribution they can only guess at, and the guess is always that the good one never
   * comes. Printed, one in a hundred is a target rather than a suspicion — and it is the
   * whole reason the top tier is worth the chase.
   *
   * Five rows rather than a sentence, because the ORDER is the message: the colours run
   * from the one that turns up most to the one that almost never does, and a player reads
   * the shape of that before they read any number on it.
   */
  const odds = (): HTMLElement => {
    const box = buildOdds();
    box.id = "hatchOdds";
    return box;
  };

  /* ------------------------------------------------------------------ THE BUTTON */

  const hatchPrice = (cost: number, insufficient: boolean): HTMLElement => {
    const label = el("span", "hb-c");
    label.append(resourcePrice(cost, insufficient), document.createTextNode(" larva"));
    return label;
  };

  const foot = (): HTMLElement => {
    const box = el("div", "hatchfoot");
    const can = store.get().larva >= HATCH_COST;

    const btn = el("button", "hatchbtn" + (can ? "" : " out")) as HTMLButtonElement;
    btn.type = "button";
    btn.id = "hatchGo";
    btn.disabled = busy;
    // It never says "you cannot": it says what it costs, and the plus above is the answer.
    btn.append(
      el("span", "hb-t", busy ? "Hatching…" : "Hatch"),
      hatchPrice(HATCH_COST, !busy && !can),
    );
    btn.onclick = () => (can ? run() : opts.onBuyLarva());
    box.appendChild(btn);

    // THE HANDFUL SITS UNDER THE ONE THAT ALWAYS WORKS, and it is ALWAYS THERE.
    // It used to be drawn only once the whole batch could be paid for, on the argument
    // that a second button mostly reading "you cannot" competes with the one that can —
    // asked for directly the other way, and the argument was wrong about what appearing
    // and disappearing costs: a shortcut a player has seen once and cannot find again
    // reads as the screen having lost it. Shown and DISABLED, it is a price to save up
    // to. Quieter than the button above it either way: one primary action on this screen.
    const enough = store.get().larva >= HATCH_COST * BULK;
    const many = el("button", "hatchbtn bulk") as HTMLButtonElement;
    many.type = "button";
    many.id = "hatchGo10";
    // The DISABLED attribute is the whole mechanism, not a second guard inside the
    // handler: a button that cannot be pressed is the one state a player can see.
    many.disabled = busy || !enough;
    many.append(
      el("span", "hb-t", `Hatch ${BULK}`),
      hatchPrice(HATCH_COST * BULK, !busy && !enough),
    );
    many.onclick = () => runMany();
    box.appendChild(many);
    return box;
  };

  /**
   * Spend, roll, reveal.
   *
   * The spend and the roll are ONE call on the store (`hatch`), because those two must
   * never come apart — a hatch that spent and did not roll takes something for nothing.
   * What is here is only the drama: hold, then show what was already decided.
   *
   * Re-entry is stopped by the BUTTON being disabled through the hold, not by a flag
   * checked here as well — one mechanism, and the one a player can actually see.
   */
  const run = (): void => {
    const item = store.hatch(opts.random);
    if (!item) return;
    found = item;
    busy = true;
    // The shell first, under the hold. Not the prize: nothing has been revealed yet, and
    // a sound that gave the answer away here would undo the only thing the hold is for
    // (PROJECT_GUIDE.md — the moment is the feature).
    opts.feedback?.play("hatch");
    render();
    window.setTimeout(() => {
      // A SCREEN THAT WAS LEFT GETS NOTHING. The pop-up covers the whole viewport, so a
      // hatch whose hold outlived its screen would put a card up over wherever the
      // player went — and the prize cue would arrive there with it.
      if (!root.isConnected) return;
      busy = false;
      revealSettledPrizes();
      // THE TIER, THE MOMENT THE COLOUR ARRIVES. Same instant as the card, off the same
      // ladder — a mythic that sounds like a common is the feature failing at the one
      // moment it exists for.
      opts.feedback?.play(prizeCue(tierOf(item)));
      opts.onChanged?.();
    }, SHAKE_MS);
  };

  /**
   * ...AND THE SAME DRAMA FOR A HANDFUL.
   *
   * It holds for exactly as long as one roll does. The wriggle is what says the screen is
   * working, not a progress bar, and ten times the wait for ten times the larva would be
   * the shortcut costing more time than the ten taps it saves.
   *
   * `hatchMany` spends and rolls in ONE call, the same rule `hatch` follows, and refuses
   * the whole batch rather than part of it if the purse cannot cover it (platform).
   */
  const runMany = (): void => {
    const got = store.hatchMany(BULK, opts.random);
    if (got.length === 0) return;
    haul = got;
    busy = true;
    opts.feedback?.play("hatch");
    render();
    window.setTimeout(() => {
      if (!root.isConnected) return;
      busy = false;
      revealSettledPrizes();
      opts.feedback?.play(batchCue(got));
      opts.onChanged?.();
    }, SHAKE_MS);
  };

  render();
  return root;
}
