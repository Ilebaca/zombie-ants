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
import {
  ROAD_CHAPTER_STOPS, compact, freeReward, passReward, stopColony, stopReached,
} from "../platform";
import type { Profile } from "../platform";
import { icon } from "./icons";

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
    const back = el("button", "backbtn");
    back.appendChild(icon("back", 20));
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

/**
 * Mycelium chip pinned to the top-right of a screen header.
 *
 * Mark and number only. The word "MYCEL" after the figure was naming the currency its own
 * icon already names, and it was the widest thing in the header — which pushed the centred
 * title off the middle of the screen to make room for a label nobody reads twice.
 */
function mycelChip(mycel: number): HTMLElement {
  const chip = el("div", "mycelchip");
  chip.append(icon("mycel", 18), el("b", "mycelv", String(mycel)));
  return chip;
}

/* ------------------------------------------------------------------- TOP BAR */

export interface TopBarOptions {
  /** Tapping the avatar opens the profile. */
  onProfile: () => void;
  onColonyRoad: () => void;
  onShop: () => void;
}

/**
 * The home screen's top bar: avatar, the two spendable currencies, and the colony banner
 * beneath them — the number the game is played for, not a coin in the row.
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
    coin("mycel", "ophio-pts", profile.mycel, { label: "Get mycel", onClick: opts.onShop }),
    coin("pheromone", "pher-pts", profile.pheromone, { label: "Get pheromone", onClick: opts.onShop }),
  );
  nav.appendChild(cur);
  head.appendChild(nav);

  head.appendChild(colonyBanner(profile.colony, opts.onColonyRoad));
  return head;
}

/**
 * THE COLONY, and it is the biggest thing on the screen for a reason.
 *
 * It is the number the whole game is played for: troops won and lost a match at a time,
 * compounding, with no ceiling — and one day, a world ranking of the biggest colony there
 * is. It was a coin in a row of three, the same size as the mycelium a player spends on a
 * chamber, which said it was worth about as much.
 *
 * The figure is compact (23K, 1.2M, 4.8B) because that is how a number this big is read,
 * and the road progress runs under it so the next rung is part of the same object.
 */
export function colonyBanner(colony: number, onClick: () => void): HTMLElement {
  const box = el("button", "colhero");
  box.id = "colonyHero";
  box.title = "Colony Road";

  // THE FIGURE STANDS WHERE THE MARK DID. The left plate carried an ant, which said what
  // the banner was about to a player who could already read the label beside it — and put
  // a picture in the one slot the eye lands on first. The size goes there instead.
  const size = el("div", "col-size");
  size.append(el("b", "col-n", compact(colony)), el("span", "col-k", "troops"));

  const reached = stopReached(colony);
  const from = reached ? stopColony(reached) : 0;
  const next = stopColony(reached + 1);
  const pct = next > from ? Math.max(0, Math.min(1, (colony - from) / (next - from))) : 1;

  const track = el("span", "tr-bar");
  const fill = el("i", "tr-fill");
  fill.style.width = `${Math.round(pct * 100)}%`;
  track.appendChild(fill);

  // WHAT FILLING THE BAR PAYS, not how many troops it takes. The size the rung asks for
  // was a second big number beside the one the banner already leads with, and the two read
  // as a sum; the currency mark says what is waiting there in one glyph.
  const reward = freeReward(reached + 1) ?? passReward(reached + 1);
  const rail = el("div", "col-rail");
  rail.append(track, iconSlot("col-pay", reward?.pheromone ? "pheromone" : "mycel", 16));

  // The label names WHERE ON THE ROAD the player is standing. "Your colony" named the
  // thing the figure beside it already is.
  const chapter = Math.ceil((reached + 1) / ROAD_CHAPTER_STOPS);
  const mid = el("div", "col-mid");
  mid.append(el("div", "col-t", `Chapter ${chapter}`), rail);

  box.append(size, mid);
  box.onclick = onClick;
  return box;
}

function coin(
  mark: string, numClass: string, value: number,
  plus: { label: string; onClick: () => void } | null,
): HTMLElement {
  const box = el("div", "tn-coin");
  box.classList.add(`c-${mark}`);
  const ic = el("span", "tn-ic");
  ic.appendChild(icon(mark, 18));
  box.append(ic, el("span", `tn-num ${numClass}`, String(value)));
  if (plus) {
    const btn = el("button", "tn-plus");
    btn.appendChild(icon("plus", 15));
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

/** The little worker drawn in the avatar chip — three blobs and two eyes, as in legacy. */
function drawAvatar(canvas: HTMLCanvasElement): void {
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
  ["shop", "shop", "Shop"],
  ["anthill", "anthill", "Anthill"],
  ["home", "home", "Home"],
  ["antarium", "antarium", "Antarium"],
  ["challenges", "challenges", "Challenges"],
];

/** Screens that show the bottom nav. Everything else (setup, match) hides it. */
export const NAV_SCREENS: readonly string[] = [
  "home", "profile", "rules", "shop", "achievements", "settings", "news", "friends",
  "support", "luckyhatch", "antarium", "anthill", "challenges",
];

export function bottomNav(onNav: (id: NavId) => void): HTMLElement {
  const nav = el("nav", "homenav");
  nav.id = "mainNav";
  for (const [id, iconName, label] of NAV_TABS) {
    const b = el("button", "navitem");
    b.dataset.nav = id;
    const mark = el("span", "ni");
    mark.appendChild(icon(iconName, 24));
    b.append(mark, el("span", undefined, label));
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
  const b = el("button", "buybtn" + (opts.affordable ? "" : " off"));
  // The currency is a mark from the icon family, not the emoji the price used to carry.
  b.append(icon(opts.icon === "🧪" ? "pheromone" : "mycel", 15), el("span", undefined, String(opts.cost)));
  b.disabled = !opts.affordable;
  if (opts.affordable) b.onclick = opts.onBuy;
  return b;
}

/**
 * How long a match took, the way a player reads a clock: 4:07, and 1:02:11 once it has run
 * past an hour. Seconds are always two digits so the figure does not change width as it
 * counts, which is the whole reason a stopwatch reads the way it does.
 */
export function clockOf(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
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

/**
 * Where you are in the three steps before a match.
 *
 * The flow gave no sign it WAS a flow: three screens, each with a back arrow and a quiet
 * "Next", and nothing saying how many more there were.
 */
export function setupSteps(current: number): HTMLElement {
  const row = el("div", "setupsteps");
  for (let i = 0; i < 3; i++) {
    row.appendChild(el("span", "sstep" + (i === current ? " on" : i < current ? " done" : "")));
  }
  return row;
}

/** A mark in a wrapper, so the flex row can size it without the SVG shrinking. */
function iconSlot(cls: string, mark: string, size: number): HTMLElement {
  const box = el("span", cls);
  box.appendChild(icon(mark, size));
  return box;
}
