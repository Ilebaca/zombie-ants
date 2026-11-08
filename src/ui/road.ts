/**
 * Colony Road: a vertical progression rail with separate normal and Colony Pass cards.
 * Reward definitions and persisted claim keys stay in the platform layer.
 */
import {
  COLONY_START, REGION_CHAPTERS, ROAD_CHAPTERS, ROAD_CHAPTER_STOPS, TRAIT_TIER,
  avatarName, compact, effectText, isChapterEnd, regionName, regionOf, roadKey, roadStops, traitDef,
} from "../platform";
import type { ProfileStore, RoadReward, RoadStop, RoadTrack, TraitItem } from "../platform";
import { avatarFace, el, hudMark, redraw, screenEl } from "./chrome";
import { icon } from "./icons";
import { shelfArt } from "./shelf";
import { roadTheme } from "./road-art";

interface Payout { mark: string; amount: number; name: string }

const payouts = (reward: RoadReward): Payout[] => [
  ...(reward.mycel ? [{ mark: "mycel", amount: reward.mycel, name: "mycelium" }] : []),
  ...(reward.pheromone ? [{
    mark: "pheromone", amount: reward.pheromone,
    name: reward.pheromone === 1 ? "pheromone crystal" : "pheromone crystals",
  }] : []),
];

const spoken = (reward: RoadReward): string =>
  reward.avatar ? avatarName(reward.avatar)
    : reward.trait ? "A random trait"
      : payouts(reward).map((p) => `+${p.amount} ${p.name}`).join(" and ");

/**
 * Position along the rail in row and chapter-divider units. CSS owns their actual size,
 * so the progress endpoint and player marker stay together at every phone width.
 */
function progressPosition(colony: number, stops: readonly RoadStop[]): string {
  const next = stops.find((stop) => colony < stop.colony);
  const previous = next ? stops[next.index - 2] : stops[stops.length - 1];
  const ratio = next ? Math.max(0, Math.min(1,
    (colony - (previous?.colony ?? COLONY_START))
      / (next.colony - (previous?.colony ?? COLONY_START)),
  )) : 0;
  const rows = previous ? previous.index - .5 + ratio : ratio * .5;
  const gates = previous ? previous.chapter - .5
    + ratio * ((next?.chapter ?? previous.chapter) - previous.chapter) : ratio * .5;
  return `calc(var(--rd-endpad) + var(--rd-row) * ${rows.toFixed(6)} + var(--rd-gate) * ${gates.toFixed(6)})`;
}

export function buildColonyRoad(
  store: ProfileStore, onBack: () => void, onShop: () => void,
): HTMLElement {
  const root = screenEl("achievements");
  root.setAttribute("aria-label", "Colony Road");
  const stops = roadStops();
  let scrollTop: number | null = null;
  let took: RoadReward | null = null;
  let tookTrait: TraitItem | null = null;

  const render = (): void => {
    const profile = store.get();
    redraw(root);
    const body = el("div", "screenbody achbody");
    body.id = "achBody";
    const nextStop = stops.find((stop) => profile.colony < stop.colony)?.index ?? -1;
    const road = el("div", "rd-road");
    road.style.setProperty("--rd-current", progressPosition(profile.colony, stops));

    const progress = el("div", "rd-progress");
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", "Colony progress");
    progress.setAttribute("aria-valuemin", "0");
    const maximum = stops[stops.length - 1]?.colony ?? 0;
    progress.setAttribute("aria-valuemax", String(maximum));
    progress.setAttribute("aria-valuenow", String(Math.max(0, Math.min(maximum, profile.colony))));
    progress.setAttribute("aria-valuetext", `${compact(profile.colony)} troops`);
    road.appendChild(progress);

    const player = el("div", "rd-player");
    player.title = `${compact(profile.colony)} troops`;
    player.appendChild(el("b", "roadt", compact(profile.colony)));
    road.appendChild(player);

    // Chapter one is at the foot. A player climbs past each divider into its five rewards.
    for (let chapter = ROAD_CHAPTERS; chapter >= 1; chapter--) {
      road.appendChild(panel(chapter, nextStop));
    }
    body.appendChild(road);
    root.appendChild(body);

    const back = el("button", "backbtn rd-back");
    back.type = "button";
    back.setAttribute("aria-label", "Back");
    back.appendChild(icon("back", 28));
    back.onclick = onBack;
    root.appendChild(back);

    root.classList.toggle("popped", Boolean(took));
    if (took) root.appendChild(popup(took));
    requestAnimationFrame(() => { body.scrollTop = scrollTop ?? restTop(body); });
    body.addEventListener("scroll", () => { scrollTop = body.scrollTop; }, { passive: true });
  };

  const restTop = (body: HTMLElement): number => {
    const target = body.querySelector<HTMLElement>(".rd-stop.next");
    if (!target) return 0; // A finished colony opens at the summit, not chapter one.
    const rect = target.getBoundingClientRect();
    const center = rect.top + rect.height / 2 - body.getBoundingClientRect().top;
    return Math.max(0, body.scrollTop + center - Math.round(body.clientHeight / 2));
  };

  const panel = (chapter: number, nextStop: number): HTMLElement => {
    const section = el("section", "rd-chap");
    const region = regionOf(chapter);
    const theme = roadTheme(region);
    const palette = theme.colors;
    section.dataset.region = String(region);
    section.style.setProperty("--rd-area", palette[0]);
    section.style.setProperty("--rd-depth", palette[1]);
    section.style.setProperty("--rd-glow", palette[2]);
    section.style.backgroundColor = palette[1];
    const premium = el("span", "rd-premiumwash");
    premium.setAttribute("aria-hidden", "true");
    section.appendChild(premium);
    const closes = stops[chapter * ROAD_CHAPTER_STOPS - 1]?.colony ?? Infinity;
    section.classList.toggle("complete", store.get().colony >= closes);
    const path = el("div", "rd-path");
    for (const stop of stops.filter((stop) => stop.chapter === chapter).reverse()) {
      path.appendChild(checkpoint(stop, nextStop));
    }
    section.append(path, gate(chapter));
    return section;
  };

  const gate = (chapter: number): HTMLElement => {
    const previous = stops[(chapter - 1) * ROAD_CHAPTER_STOPS - 1]?.colony ?? COLONY_START;
    const reached = store.get().colony >= previous;
    const divider = el("div", "rd-gate rd-chapname" + (reached ? " reached" : ""));
    divider.dataset.chapter = String(chapter);
    const ribbon = el("span", "rd-breaker");
    ribbon.setAttribute("aria-hidden", "true");
    const theme = roadTheme(regionOf(chapter));
    const art = el("img", "rd-dividerart") as HTMLImageElement;
    art.src = theme.divider;
    art.alt = "";
    art.width = 1024;
    art.height = 160;
    art.loading = "lazy";
    art.decoding = "async";
    ribbon.appendChild(art);
    divider.appendChild(ribbon);
    divider.append(
      el("b", "rd-gatek", `Chapter ${chapter}`),
      el("span", "rd-gaten", regionName(regionOf(chapter))),
    );
    const tracks = el("div", "rd-tracknames");
    const premium = el("span", "rd-trackname premium");
    premium.id = `road-pass-${chapter}`;
    premium.append(icon("crown", 17), el("span", undefined, "COLONY PASS"));
    const normal = el("span", "rd-trackname", "FREE REWARDS");
    normal.id = `road-free-${chapter}`;
    tracks.append(premium, normal);
    divider.appendChild(tracks);
    return divider;
  };

  const checkpoint = (stop: RoadStop, nextStop: number): HTMLElement => {
    const row = el("div", "rd-stop");
    row.dataset.stop = String(stop.index);
    row.classList.toggle("reached", store.get().colony >= stop.colony);
    row.classList.toggle("next", stop.index === nextStop);
    row.classList.toggle("big", isChapterEnd(stop.index));
    row.classList.toggle("grand", isChapterEnd(stop.index) && stop.chapter % REGION_CHAPTERS === 0);
    if (stop.pass) row.appendChild(prize(stop, "pass", stop.pass));
    const center = el("div", "rd-mid");
    center.append(el("span", "rd-level", String(stop.index)),
      el("span", "rd-at", compact(stop.colony)));
    row.appendChild(center);
    if (stop.free) row.appendChild(prize(stop, "free", stop.free));
    return row;
  };

  const prize = (stop: RoadStop, track: RoadTrack, reward: RoadReward): HTMLElement => {
    const profile = store.get();
    const key = roadKey(track, stop.index);
    const claimed = profile.roadClaimed.includes(key);
    const claimable = store.canClaimRoad(key);
    const needsPass = track === "pass" && !profile.pass;
    const state = claimed ? "got" : claimable ? "ready" : "locked";
    const button = el("button", `rd-prize ${track === "free" ? "main free" : "pass"} ${state}${reward.avatar ? " avprize" : ""}`);
    button.type = "button";
    button.dataset.stop = String(stop.index);
    button.dataset.track = track;
    button.dataset.key = key;
    button.title = `${track === "pass" ? "Colony Pass: " : ""}${spoken(reward)}`;
    button.setAttribute("aria-label", spoken(reward));
    button.setAttribute("aria-describedby", `road-${track}-${stop.chapter}`);

    const shadow = el("span", "rd-cardshadow");
    const card = el("span", "rd-card");
    card.appendChild(el("span", "rd-cardface"));
    shadow.setAttribute("aria-hidden", "true");
    card.setAttribute("aria-hidden", "true");
    button.append(shadow, card);

    const art = el("span", "rd-mark");
    art.setAttribute("aria-hidden", "true");
    if (reward.avatar) art.appendChild(avatarFace(reward.avatar, 100, "rd-face"));
    else if (reward.trait) art.appendChild(el("span", "rd-mystery", "?"));
    else for (const payout of payouts(reward)) {
      const source = shelfArt(payout.mark === "mycel" ? "mycel.1500" : "pher.900");
      if (source) {
        const image = el("img", "hudmark rd-resource") as HTMLImageElement;
        image.src = source;
        image.alt = "";
        image.width = 100;
        image.height = 100;
        art.appendChild(image);
      } else art.appendChild(hudMark(payout.mark, 100));
    }
    for (const image of Array.from(art.querySelectorAll("img"))) {
      image.loading = "lazy";
      image.decoding = "async";
    }
    button.appendChild(art);
    if (reward.avatar || reward.trait) button.appendChild(el("span", "rd-caption", reward.trait ? "Trait" : "Avatar"));
    else {
      const amount = el("span", "rd-amount");
      amount.setAttribute("aria-hidden", "true");
      for (const payout of payouts(reward)) {
        amount.append(hudMark(payout.mark, 18), el("b", undefined, String(payout.amount)));
      }
      button.appendChild(amount);
    }
    if (claimed) {
      const check = el("span", "rd-done");
      check.appendChild(icon("check", 30));
      button.appendChild(check);
    } else if (track === "pass" && !claimable) {
      const lock = el("span", "rd-lock");
      lock.setAttribute("aria-hidden", "true");
      lock.appendChild(icon("lock", 23));
      button.appendChild(lock);
    }
    if (claimable) {
      button.appendChild(el("span", "rd-action", "CLAIM"));
      button.onclick = () => {
        if (!store.claimRoad(key)) return;
        took = reward;
        tookTrait = reward.trait ? store.get().bag[0] ?? null : null;
        render();
      };
    } else if (needsPass) button.onclick = onShop;
    else {
      button.disabled = true;
      if (reward.trait && !claimed && profile.pass && profile.colony >= stop.colony) {
        button.appendChild(el("span", "rd-action", "BAG FULL"));
        button.title += " — Make space in your trait bag to claim";
      }
    }
    return button;
  };

  const popup = (reward: RoadReward): HTMLElement => {
    const pop = el("div", "rd-pop");
    pop.id = "roadPop";
    const card = el("div", "rd-popcard");

    const x = el("button", "rd-popx");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.appendChild(icon("cross", 16));

    card.append(x, el("div", "rd-popk", "Reward claimed"));
    if (reward.trait && tookTrait) {
      const def = traitDef(tookTrait.def);
      if (def) {
        const line = el("div", "rd-popline");
        const mark = el("span", "rd-popic");
        mark.style.color = TRAIT_TIER[tookTrait.tier].colour;
        mark.appendChild(icon(def.icon, 30));
        line.append(mark, el("span", "rd-popu", def.name));
        card.append(line, el("span", "rd-popu",
          `${TRAIT_TIER[tookTrait.tier].name} · ${effectText(def, tookTrait.tier)}`));
      }
    }
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


  render();
  return root;
}
