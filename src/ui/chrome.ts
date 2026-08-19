/**
 * Shared furniture for the meta screens, built to match the legacy build's DOM exactly.
 *
 * Every class name here is one the ported stylesheet styles (src/ui/game.css, itself a
 * verbatim copy of the legacy <style> block). Renaming one silently unstyles the element,
 * so treat these strings as part of the design, not as labels.
 *
 * Everything is built with DOM calls rather than innerHTML — the profile carries a
 * player-chosen name, and a template string would happily inject it as markup.
 */
import { ROAD_STEP, freeReward, passReward } from "../platform";
import type { Profile } from "../platform";

/** Small element factory: `el("div", "cls", "text")`. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A full-screen panel carrying the legacy id — several stylesheet rules are keyed by it. */
export function screenEl(id: string): HTMLDivElement {
  const node = el("div", "screen");
  node.id = id;
  return node;
}

export interface HeaderOptions {
  title: string;
  sub?: string;
  onBack?: () => void;
  backId?: string;
  /** Ids the legacy build puts on the title and subtitle of the species page. */
  titleId?: string;
  subId?: string;
  /** Adds the gold mycelium chip the Antarium, Anthill and species pages carry. */
  mycel?: number;
}

export function screenHeader(parent: HTMLElement, opts: HeaderOptions): void {
  const top = el("div", "screentop");
  if (opts.onBack) {
    const back = el("button", "backbtn", "←");
    back.setAttribute("aria-label", "Back");
    if (opts.backId) back.id = opts.backId;
    back.onclick = opts.onBack;
    top.appendChild(back);
  }
  const title = el("div", "screenh", opts.title);
  if (opts.titleId) title.id = opts.titleId;
  top.appendChild(title);
  if (opts.sub !== undefined) {
    const sub = el("div", "screensub", opts.sub);
    if (opts.subId) sub.id = opts.subId;
    top.appendChild(sub);
  }
  if (opts.mycel !== undefined) top.appendChild(mycelChip(opts.mycel));
  parent.appendChild(top);
}

/** 🍄 chip pinned to the top-right of a screen header. */
export function mycelChip(mycel: number): HTMLElement {
  const chip = el("div", "mycelchip");
  chip.append(el("span", undefined, "🍄"), el("b", "mycelv", String(mycel)), el("small", undefined, "mycel"));
  return chip;
}

/* ------------------------------------------------------------------- TOP BAR */

export interface TopBarOptions {
  /** Tapping the avatar opens the colony/quests screen, as it does in the legacy build. */
  onProfile: () => void;
  onTrophyRoad: () => void;
  onShop: () => void;
}

/**
 * The home screen's top bar: avatar, the three currencies, and the trophy-road progress
 * strip beneath them.
 */
export function topBar(profile: Readonly<Profile>, opts: TopBarOptions): HTMLElement {
  const head = el("div", "tophead");

  const nav = el("header", "topnav");

  const id = el("button", "tn-id");
  id.title = "Profile";
  const av = el("span", "tn-av");
  const canvas = el("canvas", "topav");
  canvas.id = "topav_0";
  canvas.width = 46; canvas.height = 46;
  drawAvatar(canvas);
  av.appendChild(canvas);
  id.appendChild(av);
  id.onclick = opts.onProfile;
  nav.appendChild(id);

  const cur = el("div", "tn-cur");
  cur.append(
    // Trophies cannot be bought, so their "+" is a hidden spacer that keeps the three
    // coins on the same grid.
    coin("🏆", "lb-pts", profile.trophies, null),
    coin("🍄", "ophio-pts", profile.mycel, { label: "Get mycel", onClick: opts.onShop }),
    coin("🧪", "pher-pts", profile.pheromone, { label: "Get pheromone", onClick: opts.onShop }),
  );
  nav.appendChild(cur);
  head.appendChild(nav);

  head.appendChild(trophyBar(profile.trophies, opts.onTrophyRoad));
  return head;
}

function coin(
  icon: string, numClass: string, value: number,
  plus: { label: string; onClick: () => void } | null,
): HTMLElement {
  const box = el("div", "tn-coin");
  box.append(el("span", "tn-ic", icon), el("span", `tn-num ${numClass}`, String(value)));
  if (plus) {
    const btn = el("button", "tn-plus", "+");
    btn.setAttribute("aria-label", plus.label);
    btn.onclick = plus.onClick;
    box.appendChild(btn);
  } else {
    const ghost = el("span", "tn-plus ghost", "+");
    ghost.setAttribute("aria-hidden", "true");
    box.appendChild(ghost);
  }
  return box;
}

/** Progress toward the next Trophy Road stop, and the icon of what it pays. */
export function trophyBar(trophies: number, onClick: () => void): HTMLElement {
  const bar = el("button", "troadbar");
  bar.title = "Trophy Road";

  const previous = Math.floor(trophies / ROAD_STEP) * ROAD_STEP;
  const next = previous + ROAD_STEP;
  const pct = Math.max(0, Math.min(1, (trophies - previous) / ROAD_STEP));

  const track = el("span", "tr-bar");
  const fill = el("i", "tr-fill");
  fill.style.width = `${Math.round(pct * 100)}%`;
  track.appendChild(fill);

  const reward = freeReward(next) ?? passReward(next);
  bar.append(
    el("span", "tr-ic", "🏆"),
    track,
    el("span", "tr-rew", reward?.pheromone ? "🧪" : "🍄"),
  );
  bar.onclick = onClick;
  return bar;
}

/** The little worker drawn in the avatar chip — three blobs and two eyes, as in legacy. */
export function drawAvatar(canvas: HTMLCanvasElement): void {
  const g = canvas.getContext("2d");
  if (!g) return;                       // jsdom, or a context the browser refused
  const W = canvas.width;
  g.clearRect(0, 0, W, W);
  const cx = W / 2;
  g.fillStyle = cssVar("--you-glow");
  ellipse(g, cx, W * 0.66, W * 0.18, W * 0.22);
  ellipse(g, cx, W * 0.45, W * 0.12, W * 0.12);
  ellipse(g, cx, W * 0.30, W * 0.13, W * 0.12);
  g.fillStyle = "#fff";
  dot(g, cx - W * 0.05, W * 0.29, W * 0.025);
  dot(g, cx + W * 0.05, W * 0.29, W * 0.025);
}

const ellipse = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void => {
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.28); g.fill();
};
const dot = (g: CanvasRenderingContext2D, x: number, y: number, r: number): void => {
  g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
};
const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* --------------------------------------------------------------- BOTTOM NAV */

export type NavId = "shop" | "anthill" | "home" | "antarium" | "challenges";

/** The five tabs, in the legacy order — Home sits in the middle. */
export const NAV_TABS: ReadonlyArray<readonly [NavId, string, string]> = [
  ["shop", "🛒", "Shop"],
  ["anthill", "🕳️", "Anthill"],
  ["home", "🏠", "Home"],
  ["antarium", "🪴", "Antarium"],
  ["challenges", "🎯", "Challenges"],
];

/** Screens that show the bottom nav. Everything else (setup, match) hides it. */
export const NAV_SCREENS: readonly string[] = [
  "home", "profile", "rules", "shop", "achievements", "settings", "news", "friends",
  "support", "luckyhatch", "antarium", "anthill", "challenges",
];

export function bottomNav(onNav: (id: NavId) => void): HTMLElement {
  const nav = el("nav", "homenav");
  nav.id = "mainNav";
  for (const [id, icon, label] of NAV_TABS) {
    const b = el("button", "navitem");
    b.dataset.nav = id;
    b.append(el("span", "ni", icon), el("span", undefined, label));
    b.onclick = () => onNav(id);
    nav.appendChild(b);
  }
  return nav;
}

/* -------------------------------------------------------------------- BITS */

/** Level pips: filled up to `level`, hollow to `max`. */
export function pips(level: number, max: number): HTMLElement {
  const row = el("div", "pips");
  for (let i = 0; i < max; i++) row.appendChild(el("span", "pip" + (i < level ? " on" : "")));
  return row;
}

export interface BuyOptions {
  /** Currency icon shown before the price. */
  icon: string;
  cost: number;
  affordable: boolean;
  maxed: boolean;
  onBuy: () => void;
}

/**
 * A price button. Unaffordable prices stay visible but dead (legacy `.buybtn.off`) — the
 * player needs to see what they are saving toward.
 */
export function buyButton(opts: BuyOptions): HTMLButtonElement {
  if (opts.maxed) {
    const b = el("button", "buybtn max", "MAX");
    b.disabled = true;
    return b;
  }
  const b = el("button", "buybtn" + (opts.affordable ? "" : " off"), `${opts.icon} ${opts.cost}`);
  b.disabled = !opts.affordable;
  if (opts.affordable) b.onclick = opts.onBuy;
  return b;
}

export type ToastKind = "good" | "bad" | "warn" | "hive";

/** Transient message. Mounts into the screen so it dies with it. */
export function toast(host: HTMLElement, msg: string, kind: ToastKind = "good"): void {
  let box = host.querySelector<HTMLElement>(".screentoast");
  if (!box) {
    box = el("div", "screentoast");
    box.id = "toast";                 // the legacy stylesheet positions the stack by id
    host.appendChild(box);
  }
  const line = el("div", "toast " + kind, msg);
  box.appendChild(line);
  setTimeout(() => {
    line.style.transition = "opacity .4s, transform .4s";
    line.style.opacity = "0";
    line.style.transform = "translateY(-6px)";
    setTimeout(() => line.remove(), 400);
  }, 1900);
  while (box.children.length > 3) box.removeChild(box.firstChild as ChildNode);
}
