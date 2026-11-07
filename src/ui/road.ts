/**
 * THE COLONY ROAD — one reward per checkpoint on a path through ten dark area colors.
 *
 * Free rewards and owned pass bonuses share one claim button. Existing claim keys remain
 * separate so buying the pass later never pays an already claimed reward twice.
 */
import {
  REGION_CHAPTERS, ROAD_CHAPTERS, ROAD_CHAPTER_STOPS, avatarName, chapterOf, compact, isChapterEnd,
  regionName, regionOf, roadKey, roadStops,
} from "../platform";
import type { ProfileStore, RoadReward, RoadStop } from "../platform";
import { avatarFace, el, hudMark, redraw, screenEl, screenHeader } from "./chrome";
import { icon } from "./icons";

const AREA_COLORS = [
  "#11271e", "#2b2114", "#2c1918", "#10252a", "#172d28",
  "#292719", "#1e192b", "#172833", "#30231b", "#271d2d",
] as const;

const areaColor = (chapter: number): string =>
  AREA_COLORS[regionOf(chapter) - 1] ?? AREA_COLORS[0];

interface ClaimPart { key: string; reward: RoadReward }

const totalReward = (rewards: readonly RoadReward[]): RoadReward => ({
  mycel: rewards.reduce((sum, reward) => sum + (reward.mycel ?? 0), 0),
  pheromone: rewards.reduce((sum, reward) => sum + (reward.pheromone ?? 0), 0),
  // A face is not a currency, so it does not SUM — a checkpoint pays one or none, and
  // dropping the field here is how an avatar checkpoint pays nothing at all.
  avatar: rewards.find((reward) => reward.avatar)?.avatar,
});

/** What a reward pays, as the popup reads it out: a mark, a figure and a word. */
interface Payout { mark: string; amount: number; name: string }

const payouts = (r: RoadReward): Payout[] => [
  ...(r.mycel ? [{ mark: "mycel", amount: r.mycel, name: "mycelium" }] : []),
  ...(r.pheromone ? [{ mark: "pheromone", amount: r.pheromone, name: r.pheromone === 1 ? "pheromone crystal" : "pheromone crystals" }] : []),
];

/** The label a button carries, so a disc showing only an icon still says what it is. */
const spoken = (r: RoadReward): string =>
  r.avatar ? avatarName(r.avatar) : payouts(r).map((p) => `+${p.amount} ${p.name}`).join(" and ");

export function buildColonyRoad(store: ProfileStore, onBack: () => void, _onShop: () => void): HTMLElement {
  const root = screenEl("achievements");
  /** Kept across renders so claiming a reward does not throw the player back to the top. */
  let scrollTop: number | null = null;
  /** What was just claimed, if anything, for the confirmation popup. */
  let took: RoadReward | null = null;

  const render = (): void => {
    const profile = store.get();
    redraw(root);
    screenHeader(root, { title: "Colony Road", onBack });

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
      if (chapter > 1 && chapter % REGION_CHAPTERS === 1) road.appendChild(gate(chapter, stops));
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
    const rect = target.getBoundingClientRect();
    const center = rect.top + rect.height / 2 - body.getBoundingClientRect().top;
    return Math.max(0, body.scrollTop + center - Math.round(body.clientHeight / 2));
  };

  /** One chapter: its area color, name, and five checkpoints climbing. */
  const panel = (chapter: number, stops: RoadStop[], nextStop: number): HTMLElement => {
    const box = el("section", "rd-chap");
    box.dataset.region = String(regionOf(chapter));
    box.style.backgroundColor = areaColor(chapter);
    const closes = stops[chapter * ROAD_CHAPTER_STOPS - 1]?.colony ?? Infinity;
    box.classList.toggle("complete", store.get().colony >= closes);

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
  const gate = (chapter: number, stops: RoadStop[]): HTMLElement => {
    const box = el("div", "rd-gate");
    box.style.backgroundColor = areaColor(chapter);
    const opens = stops[(chapter - 1) * ROAD_CHAPTER_STOPS]?.colony ?? Infinity;
    box.classList.toggle("reached", store.get().colony >= opens);
    box.append(
      el("div", "rd-gatek", "Entering"),
      el("div", "rd-gaten", regionName(regionOf(chapter))),
    );
    return box;
  };

  /** Only the rewards this player owns; claim keys retain their original track. */
  const partsFor = (stop: RoadStop): ClaimPart[] => {
    const parts: ClaimPart[] = [];
    if (stop.free) parts.push({ key: roadKey("free", stop.index), reward: stop.free });
    if (store.get().pass && stop.pass) {
      parts.push({ key: roadKey("pass", stop.index), reward: stop.pass });
    }
    return parts;
  };

  /** One combined reward sits on the center line at each checkpoint. */
  const checkpoint = (stop: RoadStop, nextStop: number): HTMLElement => {
    const reached = store.get().colony >= stop.colony;
    const classes = ["rd-stop"];
    if (isChapterEnd(stop.index)) classes.push("big");
    if (isChapterEnd(stop.index) && stop.chapter % REGION_CHAPTERS === 0) classes.push("grand");
    if (reached) classes.push("reached");
    if (stop.index === nextStop) classes.push("next");
    const box = el("div", classes.join(" "));
    const mid = el("div", "rd-mid");
    const parts = partsFor(stop);
    if (parts.length) mid.appendChild(prize(stop, parts));
    const at = el("div", "rd-at", compact(stop.colony));
    mid.appendChild(at);
    box.appendChild(mid);
    return box;
  };

  /** One action banks every unclaimed part the player owns at this checkpoint. */
  const prize = (stop: RoadStop, parts: ClaimPart[]): HTMLElement => {
    const profile = store.get();
    const pending = parts.filter((part) => !profile.roadClaimed.includes(part.key));
    const claimed = pending.length === 0;
    const claimable = pending.some((part) => store.canClaimRoad(part.key));
    const state = claimed ? "got" : claimable ? "ready" : "locked";
    const reward = totalReward((pending.length ? pending : parts).map((part) => part.reward));
    const disc = el("button", `rd-prize main ${state}${reward.avatar ? " avprize" : ""}`);
    disc.type = "button";
    disc.dataset.stop = String(stop.index);
    const marks = payouts(reward);
    const art = el("span", "rd-mark");
    const big = isChapterEnd(stop.index);
    const grand = big && stop.chapter % REGION_CHAPTERS === 0;
    const size = grand ? 112 : big ? 100 : 80;
    // AN AVATAR CHECKPOINT WEARS THE FACE IT PAYS, rather than a mark standing for it.
    // Every other disc carries the MARK of the resource behind it because a resource has
    // no picture; an avatar is nothing BUT a picture, so a badge here would be the one
    // checkpoint on the road that refuses to show what it is giving.
    if (reward.avatar) art.appendChild(avatarFace(reward.avatar, size, "rd-face"));
    else for (const p of marks) art.appendChild(hudMark(p.mark, size));
    const amount = el("span", "rd-amount");
    amount.setAttribute("aria-hidden", "true");
    for (const p of marks) amount.appendChild(el("b", undefined, String(p.amount)));
    const base = el("span", "rd-base");
    base.setAttribute("aria-hidden", "true");
    // THE FIGURE IS NOT DRAWN AT ALL ON AN AVATAR RUNG, rather than drawn empty. It is a
    // bordered plate in this design, so an avatar checkpoint left one hanging over the
    // face — a frame with nothing in it, which reads as a label that failed to fill
    // rather than as a reward that has no number. A face has no amount.
    if (reward.avatar) disc.append(base, art);
    else disc.append(base, amount, art);
    disc.title = spoken(reward);
    disc.setAttribute("aria-label", spoken(reward));

    if (claimed) {
      const tag = el("span", "rd-done");
      tag.appendChild(icon("check", 11));
      disc.appendChild(tag);
    }

    if (claimable) {
      disc.onclick = () => {
        const paid: RoadReward[] = [];
        for (const part of pending) {
          if (store.claimRoad(part.key)) paid.push(part.reward);
        }
        if (!paid.length) return;
        took = totalReward(paid);
        render();
      };
    } else disc.disabled = true;
    return disc;
  };

  /**
   * Confirms the amount actually banked, including any owned pass bonus.
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
    if (reward.avatar) {
      const line = el("div", "rd-popline");
      const disc = el("span", "rd-popic");
      disc.appendChild(avatarFace(reward.avatar, 30, "rd-face"));
      // NAMED, not "a new avatar". Every other checkpoint says exactly what it paid,
      // and a face is the one reward on this road that has a name of its own.
      line.append(disc, el("span", "rd-popu", avatarName(reward.avatar)));
      card.appendChild(line);
    }
    for (const p of payouts(reward)) {
      const line = el("div", "rd-popline");
      const disc = el("span", "rd-popic");
      disc.appendChild(hudMark(p.mark, 30));
      line.append(disc, el("b", "rd-popn", `+${p.amount}`), el("span", "rd-popu", p.name));
      card.appendChild(line);
    }

    pop.appendChild(card);
    // A tap anywhere closes it. The X is for anybody who looks for one — a full-screen
    // card with no visible way out reads as something gone wrong.
    pop.onclick = () => { took = null; render(); };
    return pop;
  };

  /** Where the player stands. Last child, as in the legacy build. */
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
    return box;
  };

  render();
  return root;
}
