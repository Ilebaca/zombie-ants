/**
 * THE COLONY ROAD — A PATH THROUGH TEN PLACES, WALKED FROM THE BOTTOM UP.
 *
 * It was a ladder of cards: two columns of grey panels either side of a thin line, a
 * chapter label every two rungs, fifty times. Everything on it was a word — "+105
 * mycelium", "Claim", "Locked" — so a road fifty chapters long read as a spreadsheet, and
 * the one thing it is FOR (how far have I come, how far is left) was the hardest thing to
 * see on it.
 *
 * Five decisions, each asked for directly:
 *
 * - A CHAPTER IS FIVE CHECKPOINTS AND THE FIFTH IS BIGGER (`platform/road.ts`). The table
 *   splits a chapter's purse across them, so the road pays exactly what it always paid.
 * - EVERY CHAPTER WEARS A PICTURE. `backdropFor` is home's own artwork — ten paintings,
 *   one per region, with a per-chapter file beating its region (`ui/backdrops.ts`). That
 *   tier was held open with nothing using it; this is the first thing that does. Home and
 *   the road are then the same place for the same chapter, which is the point of it.
 * - A CHECKPOINT IS AN ICON ON THE PATH, NOT A CARD BESIDE IT. The disc says which
 *   resource is waiting and nothing else.
 * - THE AMOUNT IS THE REWARD FOR CLAIMING IT. A popup names it when the player takes it,
 *   so walking the road is a sequence of small openings rather than a priced list. It is
 *   still on the button's own label, because a control has to say what it is (§10a).
 * - A BREAKER BETWEEN THE AREAS. Ten regions, five chapters each (`REGIONS`), and the gate
 *   at each boundary announces the one being entered. A theme that changes with nothing
 *   marking it is a background that looks like it failed to load.
 *
 * Nothing here decides what a reward is worth: the table is `platform/road.ts` and
 * `ProfileStore.claimRoad` is the only thing that pays out.
 */
import {
  REGION_CHAPTERS, ROAD_CHAPTERS, ROAD_CHAPTER_STOPS, chapterOf, compact, isChapterEnd,
  regionName, regionOf, roadKey, roadStops,
} from "../platform";
import type { ProfileStore, RoadReward, RoadStop } from "../platform";
import { backdropFor } from "./backdrops";
import { el, redraw, screenEl, screenHeader } from "./chrome";
import { icon } from "./icons";

type Track = "free" | "pass";

/** What a reward pays, as the popup reads it out: a mark, a figure and a word. */
interface Payout { mark: string; amount: number; name: string }

const payouts = (r: RoadReward): Payout[] => [
  ...(r.mycel ? [{ mark: "mycel", amount: r.mycel, name: "mycelium" }] : []),
  ...(r.pheromone ? [{ mark: "pheromone", amount: r.pheromone, name: "pheromone" }] : []),
];

/** The label a button carries, so a disc showing only an icon still says what it is. */
const spoken = (r: RoadReward): string =>
  payouts(r).map((p) => `+${p.amount} ${p.name}`).join(" and ");

export function buildColonyRoad(store: ProfileStore, onBack: () => void, onShop: () => void): HTMLElement {
  const root = screenEl("achievements");
  /** Kept across renders so claiming a reward does not throw the player back to the top. */
  let scrollTop: number | null = null;
  /** What was just claimed, if anything. The popup is the only thing that reads it. */
  let took: RoadReward | null = null;

  const render = (): void => {
    const profile = store.get();
    redraw(root);
    screenHeader(root, { title: "Colony Road", sub: "Grow the colony · claim rewards", onBack });

    const body = el("div", "screenbody achbody");
    body.id = "achBody";

    // The first checkpoint out of reach is where the player is headed. Marking exactly one
    // is the difference between a road you can read your position off and a wall of discs.
    const stops = roadStops();
    const nextStop = stops.find((x) => profile.colony < x.colony)?.index ?? -1;

    const road = el("div", "rd-road");
    // DESCENDING, so chapter one sits at the FOOT of the scroller and the player climbs.
    for (let chapter = ROAD_CHAPTERS; chapter >= 1; chapter--) {
      road.appendChild(panel(chapter, stops, nextStop));
      // The gate goes above the chapter that OPENS an area, announcing that area — which
      // in a descending list means directly after its panel.
      if (chapter > 1 && chapter % REGION_CHAPTERS === 1) road.appendChild(gate(chapter));
    }
    body.appendChild(road);
    body.appendChild(head());
    root.appendChild(body);

    root.classList.toggle("popped", Boolean(took));
    if (took) root.appendChild(popup(took));

    requestAnimationFrame(() => {
      // Opens on where the player stands rather than at either end: the foot of a
      // two-hundred-and-fifty-checkpoint road is chapter one, which a colony in chapter
      // twelve has finished with.
      body.scrollTop = scrollTop ?? restTop(body);
    });
    body.addEventListener("scroll", () => { scrollTop = body.scrollTop; }, { passive: true });
  };

  /**
   * Where the scroller opens: the checkpoint being worked towards, centred.
   *
   * MEASURED OFF THE RECTS, never `offsetTop`. A checkpoint's offset parent is its own
   * `.rd-path` (both are positioned), so `offsetTop` answers where it sits inside its
   * CHAPTER — a couple of hundred pixels into a thirty-six-thousand-pixel scroller, which
   * clamped to zero and opened every colony at chapter fifty.
   */
  const restTop = (body: HTMLElement): number => {
    const target = body.querySelector<HTMLElement>(".rd-stop.next");
    if (!target) return body.scrollHeight;
    const above = target.getBoundingClientRect().top - body.getBoundingClientRect().top;
    return Math.max(0, body.scrollTop + above - Math.round(body.clientHeight / 2));
  };

  /** One chapter: its picture, its name, and its five checkpoints climbing. */
  const panel = (chapter: number, stops: RoadStop[], nextStop: number): HTMLElement => {
    const box = el("section", "rd-chap");
    const art = backdropFor(chapter);
    // Inline, because fifty rules in a stylesheet for files the stylesheet cannot see is a
    // second table to keep in step (the rule home's own artwork follows).
    // QUOTED, because a url is not guaranteed to be free of brackets and spaces.
    box.style.backgroundImage = `url("${art}")`;

    const opens = stops[(chapter - 1) * ROAD_CHAPTER_STOPS]?.colony ?? Infinity;
    const reached = store.get().colony >= opens;
    const label = el("div", "rd-chapname" + (reached ? " reached" : ""));
    label.append(
      el("b", undefined, `Chapter ${chapter}`),
      el("span", undefined, regionName(regionOf(chapter))),
    );
    box.appendChild(label);

    const path = el("div", "rd-path");
    for (const stop of stops.filter((s) => s.chapter === chapter).reverse()) {
      path.appendChild(checkpoint(stop, nextStop));
    }
    box.appendChild(path);
    return box;
  };

  /** The breaker between two areas: a doorway with the name of the one being entered. */
  const gate = (chapter: number): HTMLElement => {
    const box = el("div", "rd-gate");
    const arch = el("div", "rd-arch");
    arch.appendChild(icon("next", 22));
    box.append(
      arch,
      el("div", "rd-gatek", "Entering"),
      el("div", "rd-gaten", regionName(regionOf(chapter))),
    );
    return box;
  };

  /** One checkpoint on the path: the prize on it, the pass prize beside it, the size under. */
  const checkpoint = (stop: RoadStop, nextStop: number): HTMLElement => {
    const colony = store.get().colony;
    const reached = colony >= stop.colony;
    const classes = ["rd-stop"];
    if (isChapterEnd(stop.index)) classes.push("big");
    if (reached) classes.push("reached");
    if (stop.index === nextStop) classes.push("next");

    const box = el("div", classes.join(" "));

    // THREE COLUMNS, so the path runs down the MIDDLE of the panel whatever is beside it.
    // The free prize and the size it asks for are one object on the path; the pass prize
    // hangs off the right-hand column rather than being positioned by hand against it.
    const mid = el("div", "rd-mid");
    if (stop.free) mid.appendChild(prize(stop.free, roadKey("free", stop.index), "free"));
    const at = el("div", "rd-at");
    if (reached) at.appendChild(icon("check", 12));
    else at.textContent = compact(stop.colony);
    mid.appendChild(at);
    box.appendChild(mid);

    if (stop.pass) box.appendChild(prize(stop.pass, roadKey("pass", stop.index), "pass"));
    return box;
  };

  /** A prize disc: which resource, and what state it is in. The figure is on its label. */
  const prize = (reward: RoadReward, key: string, track: Track): HTMLElement => {
    const profile = store.get();
    const claimed = profile.roadClaimed.includes(key);
    const claimable = store.canClaimRoad(key);
    const passLocked = track === "pass" && !profile.pass;
    const state = claimed ? "got" : passLocked ? "passlock" : claimable ? "ready" : "locked";

    const disc = el("button", `rd-prize ${track} ${state}`);
    disc.type = "button";
    const marks = payouts(reward);
    for (const p of marks) disc.appendChild(icon(p.mark, track === "pass" ? 18 : 24));
    const label = `${spoken(reward)}${track === "pass" ? ", Colony Pass" : ""}`;
    disc.title = label;
    disc.setAttribute("aria-label", label);

    if (track === "pass") {
      const tag = el("span", "rd-tag");
      tag.appendChild(icon(passLocked ? "lock" : "crown", 10));
      disc.appendChild(tag);
    }
    if (claimed) {
      const tag = el("span", "rd-done");
      tag.appendChild(icon("check", 11));
      disc.appendChild(tag);
    }

    // A dead button is a dead end: the pass is sold in the shop, so a locked pass disc
    // goes there rather than refusing the tap in silence.
    if (passLocked) disc.onclick = onShop;
    else if (claimable) {
      disc.onclick = () => {
        if (!store.claimRoad(key)) return;
        took = reward;
        render();
      };
    } else disc.disabled = true;
    return disc;
  };

  /**
   * WHAT THE CLAIM PAID — the one place the figure is written.
   *
   * It is raised INSIDE the screen rather than on the body, so leaving the road takes it
   * with it; and the SCREEN is what is lifted (`#achievements.popped`), because `.screen`
   * is z-index 20 in the legacy sheet and `#mainNav` is 60 in the same stacking context —
   * a card inside the screen cannot out-stack the tab bar at any z-index of its own. Same
   * trap the hatch's prize card walked into.
   */
  const popup = (reward: RoadReward): HTMLElement => {
    const pop = el("div", "rd-pop");
    pop.id = "roadPop";
    const card = el("div", "rd-popcard");

    const x = el("button", "rd-popx");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.appendChild(icon("cross", 16));

    card.append(x, el("div", "rd-popk", "Reward claimed"));
    for (const p of payouts(reward)) {
      const line = el("div", "rd-popline");
      const disc = el("span", "rd-popic");
      disc.appendChild(icon(p.mark, 30));
      line.append(disc, el("b", "rd-popn", `+${p.amount}`), el("span", "rd-popu", p.name));
      card.appendChild(line);
    }

    pop.appendChild(card);
    // A tap anywhere closes it. The X is for anybody who looks for one — a full-screen
    // card with no visible way out reads as something gone wrong.
    pop.onclick = () => { took = null; render(); };
    return pop;
  };

  /** Where the player stands, and the pass. Last child, as in the legacy build. */
  const head = (): HTMLElement => {
    const profile = store.get();
    const box = el("div", "roadhead");
    const left = el("div", "roadhl");
    left.append(
      el("div", "roadt", `${compact(profile.colony)} troops`),
      el("div", "roadsub",
        `Chapter ${chapterOf(profile.colony)}`
        + " · five checkpoints a chapter, the last one bigger"),
    );
    box.appendChild(left);
    if (profile.pass) {
      const on = el("span", "passon", "PASS ");
      on.appendChild(icon("check", 13));
      box.appendChild(on);
    } else {
      // The shop sells the pass now, so send the player there rather than explaining.
      const buy = el("button", "passbuy", "Get Pass");
      buy.onclick = onShop;
      box.appendChild(buy);
    }
    return box;
  };

  render();
  return root;
}
