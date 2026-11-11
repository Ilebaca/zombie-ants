/** Shared, presentation-only reward reveal. The caller settles the claim first. */
import { avatarName, itemDef } from "../platform";
import type { HatchPrize, TraitItem } from "../platform";
import { SPECIES, TIERS } from "../engine";
import type { SpeciesId } from "../engine";
import { antPortrait, avatarFace, el, hudMark } from "./chrome";
import { icon } from "./icons";
import { shelfArt } from "./shelf";
import { cutCoverFor } from "./covers";

export type RevealedReward =
  | { kind: "resource"; mark: "mycel" | "pheromone"; name: string; amount: number }
  | { kind: "avatar"; id: string }
  | { kind: "trait"; item: TraitItem }
  | { kind: "species"; species: SpeciesId };

interface RewardAmounts {
  mycel?: number; pheromone?: number;
}

/** Only the two collectible currencies belong in this reveal. */
export function resourceRewards(amounts: RewardAmounts): RevealedReward[] {
  return ([
    ["mycel", "Mycelium", amounts.mycel],
    ["pheromone", "Pheromone crystals", amounts.pheromone],
  ] as const).flatMap(([mark, name, amount]) =>
    amount && amount > 0 ? [{ kind: "resource" as const, mark, name, amount }] : []);
}

export function hatchReward(prize: HatchPrize): RevealedReward | null {
  if (prize.kind === "trait") return { kind: "trait", item: prize.item };
  if (prize.kind === "skin") return null;
  return { kind: "avatar", id: prize.id };
}

/** Use the existing large resource pile, with its currency mark as a fallback. */
function resourceArt(mark: "mycel" | "pheromone"): HTMLElement {
  const art = el("div", "reward-art");
  const products = { mycel: "mycel.1500", pheromone: "pher.900" };
  const product = products[mark];
  const source = product ? shelfArt(product) : null;
  if (source) {
    const image = el("img", "reward-pile");
    image.src = source;
    image.alt = "";
    image.decoding = "async";
    art.appendChild(image);
  } else {
    art.appendChild(hudMark(mark, 180));
  }
  return art;
}

function rewardItem(reward: RevealedReward): HTMLElement {
  const item = el("section", "reward-item");
  item.dataset.kind = reward.kind;
  let name: string;
  let art: HTMLElement;
  if (reward.kind === "resource") {
    name = reward.name;
    art = resourceArt(reward.mark);
  } else {
    art = el("div", "reward-art");
    if (reward.kind === "avatar") {
      name = avatarName(reward.id);
      art.appendChild(avatarFace(reward.id, 240, "reward-avatar"));
    } else if (reward.kind === "trait") {
      const def = itemDef(reward.item);
      name = def?.name ?? "Trait";
      item.dataset.tier = reward.item.tier;
      item.style.setProperty("--reward-colour", TIERS[reward.item.tier].colour);
      item.style.setProperty("--reward-fill", TIERS[reward.item.tier].fill);
      const emblem = el("div", "reward-emblem");
      emblem.appendChild(icon(def?.icon ?? "spark", 140));
      art.appendChild(emblem);
    } else {
      name = SPECIES[reward.species].name;
      const source = cutCoverFor(reward.species);
      if (source) {
        const image = el("img", "reward-species");
        image.src = source;
        image.alt = "";
        art.appendChild(image);
      } else art.appendChild(antPortrait(reward.species, 240, "reward-portrait"));
    }
  }
  art.setAttribute("aria-hidden", "true");
  item.append(el("h2", "reward-name", name), art);
  if (reward.kind === "resource") {
    item.appendChild(el("b", "reward-amount", `×${reward.amount.toLocaleString()}`));
  }
  return item;
}

/** No close button or secondary actions: every tap dismisses the whole reveal. */
export function buildRewardReveal(
  rewards: readonly RevealedReward[], onClose: () => void,
): HTMLElement {
  const overlay = el("div", "reward-reveal");
  overlay.tabIndex = -1;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Reward received. Tap anywhere to close.");
  const content = el("div", "reward-content");
  content.style.setProperty("--reward-columns", String(Math.min(3, rewards.length)));
  content.classList.toggle("multiple", rewards.length > 1);
  content.classList.toggle("haul", rewards.length > 4);
  for (const reward of rewards) content.appendChild(rewardItem(reward));
  overlay.appendChild(content);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    overlay.remove();
    onClose();
  };
  overlay.onclick = (event) => { event.stopPropagation(); close(); };
  overlay.onkeydown = (event) => {
    if (["Escape", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") event.preventDefault();
  };
  return overlay;
}

/** Portal deck rewards outside its transformed slides so they cover navigation too. */
export function showRewardReveal(
  owner: HTMLElement, rewards: readonly RevealedReward[], onClose: () => void = () => {},
): HTMLElement | null {
  if (!rewards.length) return null;
  const host = owner.closest<HTMLElement>("#app") ?? owner;
  dismissRewardReveal(host);
  const focused = document.activeElement;
  const overlay = buildRewardReveal(rewards, () => {
    if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
    onClose();
  });
  host.appendChild(overlay);
  queueMicrotask(() => { if (overlay.isConnected) overlay.focus({ preventScroll: true }); });
  return overlay;
}

/** Hardware Back dismisses a reward before navigating away from its screen. */
export function dismissRewardReveal(host: HTMLElement): boolean {
  const overlay = host.querySelector<HTMLElement>(".reward-reveal");
  if (!overlay) return false;
  overlay.click();
  return true;
}
