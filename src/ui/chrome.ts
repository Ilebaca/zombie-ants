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
  ROAD_CHAPTER_STOPS, compact, freeReward, levelReward, passReward, rungOfChapter, stopColony,
  stopReached, tierOf,
} from "../platform";
import { faceOf } from "../platform";
import type { Profile, ProfileStore } from "../platform";
import type { Look, SpeciesId } from "../engine";
import { antHead, basicLook, lookCol } from "../render";
import { icon } from "./icons";
import { hudIcon } from "./hud";
import { avatarArt } from "./avatars";
import { faceFor } from "./faces";

/**
 * A CHROME MARK: the painted one where there is a file, the drawn one where there is not.
 *
 * `ui/hud.ts` is the table and a missing file is not a hole (§ THE PAINTED MARKS). What
 * this returns is therefore one of TWO TAGS — an `<img>` or an `<svg>` — and every box
 * that holds one has to size BOTH, which is a trap this project has already paid for once
 * on the match history, where a portrait box sized only the canvas and let every painted
 * face render at the file's own height. `css-sanity` fails on a mark box that names one.
 */
export function hudMark(
  name: string, size: number,
  /**
   * What the DRAWN one is worth, where that is not the same number.
   *
   * A flat glyph and a painted illustration do not read at one size: the design draws a
   * 36px picture inside a 48px button, and the burger drawn at 36 is three bars filling
   * the tile. The painted size is the design's; the drawn size is the one it was tuned
   * at, and it is only written out where the two differ.
   */
  drawn = size,
): HTMLElement | SVGElement {
  const painted = hudIcon(name);
  if (!painted) return icon(name, drawn);
  const img = el("img", "hudmark");
  img.src = painted;
  img.width = size;
  img.height = size;
  // The button around it carries the name; an alt here would say it twice.
  img.alt = "";
  return img;
}

/**
 * THE THREE RESOURCE MARKS, which are the ones a player has to recognise anywhere.
 *
 * Mycelium, pheromone crystals and larva. Every other mark in this app names a SCREEN or
 * an ACTION; these three name a thing the player holds a quantity of, and that quantity
 * is shown on a dozen surfaces — the top bar, a price, a reward, a prize, a payout on the
 * result card.
 */
export const RESOURCE_MARKS = ["mycel", "pheromone", "brood"] as const;

/**
 * A RESOURCE IS ALWAYS THE PAINTED MARK, and that overturns half of an earlier rule.
 *
 * § THE PAINTED CHROME MARKS settled that a mark is painted in the CHROME and still drawn
 * in the BODY: the painted set is chunky colour art sized for a 36px tile, and the same
 * picture at 15px inside a line of text reads as clutter where a flat glyph reads as
 * punctuation. That still holds for `brood` on a shop row, `gear` on a build line and
 * every other mark that names a screen or an action.
 *
 * It does NOT hold for a CURRENCY. Asked for directly: "everywhere where we show
 * resources their official icon should be like it is on the home screen." The top bar is
 * where a player learns what mycelium looks like, and a price, a reward and a payout are
 * the same object counted somewhere else — drawn as a flat glyph in nine of those places
 * and painted in the tenth, they read as two different currencies. Recognising it at a
 * glance is worth more than the punctuation argument, because it is the ONE mark the
 * player has to match across screens.
 *
 * THE SHOP IS THE EXCEPTION, and it already was: a purchase tile shows the SHELF art
 * (`ui/shelf.ts`) — a painted pile of the stuff, which is a picture of what is being
 * bought rather than the mark for it.
 *
 * Mechanically this is `hudMark` with the fallback kept, so a resource whose file went
 * missing is still a mark rather than a hole. The two TAGS trap comes with it: a painted
 * mark is an `<img>` and a drawn one an `<svg>`, so a box that sizes one must size both.
 */
export function resourceMark(name: string, size: number): HTMLElement | SVGElement {
  return hudMark(name, size);
}


/** A level claim names its level and counts the same resource marks as the HUD. */
export function levelRewardChip(level: number): HTMLButtonElement {
  const reward = levelReward(level);
  const chip = el("button", "claimchip");
  chip.type = "button";
  chip.setAttribute("aria-label", `Claim level ${level} reward: ${reward.label}`);
  chip.appendChild(el("span", undefined, `Lvl ${level} ·`));
  for (const [mark, amount] of [
    ["mycel", reward.mycel], ["pheromone", reward.pheromone],
  ] as const) {
    if (!amount) continue;
    const payout = el("span", "claimchip-reward");
    payout.append(resourceMark(mark, 20), el("span", undefined, String(amount)));
    chip.appendChild(payout);
  }
  return chip;
}

/** Small element factory: `el("div", "cls", "text")`. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * EMPTY A SCREEN FOR A REBUILD, AND PUT IT BACK WHERE THE PLAYER LEFT IT.
 *
 * Every progression screen redraws itself in place after a tap — buy a research level and
 * the price, the NOW row, the purse in the header and the bar at the top all have to
 * change — and every one of them does it by throwing the whole screen away and building a
 * new one. That is the right shape: one function decides what the screen looks like, and
 * there is no second path that updates half of it.
 *
 * What it cost was the SCROLL. A new element starts at the top, so buying the fifth
 * chamber down a long nest snapped the player back to the mound; so did claiming a level,
 * collecting the granary, equipping a trait, opening a news post. It reads as the app
 * losing your place, and it was reported exactly that way.
 *
 * The restore runs on a MICROTASK rather than here, because at this moment the new content
 * does not exist yet — this is called at the START of a render and the rest of it runs
 * synchronously after. By the time the microtask fires the screen is whole and can be
 * scrolled to where it was. A screen torn down in between simply finds nothing and stops.
 *
 * The scroller is found by looking for the one that IS scrolled: every screen has exactly
 * one, they are all named differently (`.hillwrap`, `.antscroll`, `.spgwrap`, …), and a
 * list of those names here would be a list to keep in step with twelve other files.
 */
export function redraw(root: HTMLElement): void {
  const scrolled = Array.from(root.querySelectorAll<HTMLElement>("*"))
    .find((e) => e.scrollTop > 0);
  const top = scrolled?.scrollTop ?? 0;
  const key = scrolled ? selectorFor(scrolled) : null;
  root.replaceChildren();
  if (!key || top <= 0) return;
  queueMicrotask(() => {
    const again = root.querySelector<HTMLElement>(key);
    if (again) again.scrollTop = top;
  });
}

/** How to find this element again in the rebuilt screen: its id, else its classes. */
function selectorFor(node: HTMLElement): string | null {
  if (node.id) return `#${CSS.escape(node.id)}`;
  const classes = Array.from(node.classList);
  return classes.length ? `.${classes.map((c) => CSS.escape(c)).join(".")}` : null;
}

/**
 * A NOW / NEXT ROW — the comparison the Anthill and a colony's research page both make.
 *
 * "Now: +2 soldiers in your base → Next: +3" is the only thing on either screen that says
 * what a purchase actually buys, and it was written out identically in both files. Two
 * copies of one idiom is two chances for the two screens to stop reading as one app,
 * which is the whole reason the species page borrowed the Anthill's shape to begin with.
 */
export function effectRow(kind: "now" | "next", label: string, value: string): HTMLElement {
  const row = el("div", `che-row che-${kind}`);
  row.append(el("span", "che-k", label), el("span", "che-v", value));
  return row;
}

/** A full-screen panel carrying the legacy id — several stylesheet rules are keyed by it. */
export function screenEl(id: string): HTMLDivElement {
  const node = el("div", "screen");
  node.id = id;
  return node;
}

export interface HeaderOptions {
  /**
   * The one line a screen header carries.
   *
   * THERE IS NO SUBTITLE, asked for directly: "these main titles on top should never be
   * blocks like other content — they are stand-alone with no background or frames, just
   * the title, also remove the small subtitle as well." The field is gone from the type
   * rather than ignored, so the nineteen screens that passed one had to drop it: an
   * option nothing reads is a second place the next screen will write a line nobody sees.
   */
  title: string;
  onBack?: () => void;
  backId?: string;
  /** The id the legacy build puts on the species page's title. */
  titleId?: string;
  /** Adds the gold mycelium chip the Antarium, Anthill and species pages carry. */
  mycel?: number;
  /**
   * The pheromone chip, for a screen that SPENDS pheromone — the species page and nothing
   * else. A header shows the purse the screen's own buttons draw on: showing mycelium over
   * a list of pheromone prices is the chrome answering a question nobody asked.
   */
  pheromone?: number;
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
  if (opts.mycel !== undefined) top.appendChild(purseChip("mycel", opts.mycel));
  if (opts.pheromone !== undefined) top.appendChild(purseChip("pheromone", opts.pheromone));
  parent.appendChild(top);
}

/**
 * Mycelium chip pinned to the top-right of a screen header.
 *
 * Mark and number only. The word "MYCEL" after the figure was naming the currency its own
 * icon already names, and it was the widest thing in the header — which pushed the centred
 * title off the middle of the screen to make room for a label nobody reads twice.
 */
function purseChip(mark: string, value: number): HTMLElement {
  const chip = el("div", "mycelchip");
  chip.dataset.purse = mark;
  chip.append(resourceMark(mark, 18), el("b", "mycelv", String(value)));
  chip.title = mark === "pheromone" ? "Pheromone crystal" : "Mycelium";
  chip.setAttribute("aria-label", mark === "pheromone"
    ? `${value} pheromone crystal${value === 1 ? "" : "s"}`
    : `${value} mycelium`);
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
  // THE FACE THE PLAYER CHOSE, and the drawn worker until they choose one. `profile`
  // has already been through `normalise`, so a worn id here is one they really have.
  av.appendChild(avatarFace(faceOf(profile.avatar), 46, "topav"));
  id.appendChild(av);
  id.onclick = opts.onProfile;
  nav.appendChild(id);

  // THE CRYSTAL LEADS, AND THAT IS THE DESIGN'S ORDER rather than the one this file had.
  // Nothing reads meaning into which side a purse sits on; what matters is that the two
  // screens a player moves between agree, and the mock-up is the one that decides.
  const cur = el("div", "tn-cur");
  cur.append(
    coin("pheromone", "pher-pts", profile.pheromone, { label: "Get pheromone crystals", onClick: opts.onShop }),
    coin("mycel", "ophio-pts", profile.mycel, { label: "Get mycel", onClick: opts.onShop }),
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
  box.dataset.colony = String(colony);
  box.title = "Colony Road";

  // A MARK, THEN THE FIGURE. The mark came back: the banner is the loudest object on the
  // screen now and the thing it is loud ABOUT has to be said, or a bare number on a green
  // slab is a number with no unit. The word "troops" that used to sit under the figure is
  // gone with it — a mark and a label are the same fact twice, and the label was the one
  // taking a second line.
  const size = el("div", "col-size");
  size.append(iconSlot("col-mark", "swords", 21), el("b", "col-n", compact(colony)));

  /*
   * THE BAR MEASURES THE CHAPTER, NOT THE RUNG — five checkpoints, filling one at a
   * time from the left, which is what the four dividers below cut it into. It used to
   * run 0 to 100% between every single rung, so it swept the whole width five times a
   * chapter and the bar said nothing about where in the chapter the player stood.
   *
   * `rungOfChapter` answers 1..5 for the rung being WORKED TOWARDS, so the rungs already
   * banked inside this chapter is one less than that, and the fraction toward the next
   * one is the fifth being filled right now.
   */
  const { reached, pct } = colonyProgress(colony);

  const track = el("span", "tr-bar");
  const fill = el("i", "tr-fill");
  fill.style.width = `${(pct * 100).toFixed(2)}%`;
  track.appendChild(fill);

  /*
   * AND THE FIVE ARE CUT BY FOUR REAL ELEMENTS, never a gradient. A repeating gradient
   * is the obvious way to rule a bar into fifths and it is silently nothing here: the
   * blanket in `skin.css` clears every background IMAGE in the app with `!important` and
   * exempts four whole screens, none of which is a descendant of one (§10). A hairline
   * drawn in the banner's own colour is a background COLOUR, which nothing blankets.
   */
  for (let i = 1; i < ROAD_CHAPTER_STOPS; i++) {
    const cut = el("i", "tr-cut");
    cut.style.left = `${(i * 100 / ROAD_CHAPTER_STOPS).toFixed(2)}%`;
    track.appendChild(cut);
  }

  // NO CHAPTER LABEL. It said "Chapter 12" over the bar, which is the one fact on this
  // banner the bar itself cannot show — and it is said in full on the screen the banner
  // opens. Asked for directly; what is left is the figure, the bar and what the next
  // rung pays.
  const mid = el("div", "col-mid");
  mid.append(track);

  // WHAT FILLING THE BAR PAYS, not how many troops it takes. The size the rung asks for
  // was a second big number beside the one the banner already leads with, and the two read
  // as a sum; the currency mark says what is waiting there in one glyph.
  const reward = freeReward(reached + 1) ?? passReward(reached + 1);
  const rail = el("div", "col-rail");
  rail.append(mid, iconSlot("col-pay", reward?.pheromone ? "pheromone" : "mycel", 26));

  box.append(size, rail);
  box.onclick = onClick;
  return box;
}


/** The same chapter progress for initial rendering and the reward count-up. */
function colonyProgress(colony: number): { reached: number; pct: number } {
  const reached = stopReached(colony);
  const from = reached ? stopColony(reached) : 0;
  const next = stopColony(reached + 1);
  const into = next > from ? Math.max(0, Math.min(1, (colony - from) / (next - from))) : 1;
  const done = rungOfChapter(reached + 1) - 1;
  const pct = (done + into) / ROAD_CHAPTER_STOPS;
  return { reached, pct };
}

/** Update the number, chapter fill and next resource without rebuilding the Home bar. */
export function updateColonyBanner(box: HTMLElement, colony: number): void {
  const value = Math.max(0, Math.round(colony));
  if (box.dataset.colony === String(value)) return;
  box.dataset.colony = String(value);
  const number = box.querySelector<HTMLElement>(".col-n");
  if (number) number.textContent = compact(value);
  const { reached, pct } = colonyProgress(value);
  const fill = box.querySelector<HTMLElement>(".tr-fill");
  if (fill) fill.style.width = `${(pct * 100).toFixed(2)}%`;
  const reward = freeReward(reached + 1) ?? passReward(reached + 1);
  const mark = reward?.pheromone ? "pheromone" : "mycel";
  const pay = box.querySelector<HTMLElement>(".col-pay");
  if (pay && pay.dataset.gainMark !== mark) {
    pay.replaceChildren(hudMark(mark, 26));
    pay.dataset.gainMark = mark;
  }
}

/* ------------------------------------------------------------------ THE GRANARY */

/**
 * WHERE THE PASSIVE TROOPS ARE COLLECTED, and it is the home screen for a reason.
 *
 * The store is dug and levelled in the Anthill, which is where a room in the nest belongs
 * — but a payout waiting behind two taps is a payout nobody takes. Home is the one screen
 * every session passes through, so the store is emptied from here, directly under the
 * figure it pays into.
 *
 * It re-renders ITSELF rather than asking the app to rebuild the screen: collecting
 * changes the colony, and rebuilding home to show that would throw away the deck's slide
 * and re-run the artwork for one number. `onCollected` is what tells the top bar to catch
 * up with it.
 */
export function granaryPill(
  store: ProfileStore, onCollected: (got: number) => void,
): HTMLElement {
  const pill = el("button", "granpill");
  pill.id = "granaryPill";

  const draw = (): void => {
    const g = store.granary();
    pill.replaceChildren();
    const ready = g.stored >= 1;
    pill.classList.toggle("ready", ready);
    // A MARK AND A FIGURE, then one word. It wears the colony's own mark rather than the
    // granary's, because what it pays out is TROOPS — the same thing the banner above it
    // counts — and the room it is dug in is named on the screen that digs it.
    const left = el("span", "gp-l");
    left.append(
      iconSlot("gp-ic", "swords", 14),
      // Full, it says what is waiting; empty, it says what it is doing — never nothing, or
      // a control that does nothing when tapped looks broken rather than patient.
      el("b", "gp-n", ready ? `+${compact(g.stored)}` : `+${perHourLabel(g.rate)}/h`),
    );
    pill.append(left);
    // ONE WORD IN THE RIGHT-HAND SLOT, whichever state it is in, so nothing on the row
    // moves as the store crosses over. `.gp-go` is still only drawn when there is
    // something to collect: it is the half that makes this a control rather than a
    // readout, and offering Collect over an empty store is the screen lying.
    pill.append(ready
      ? el("span", "gp-go", "Collect")
      : el("span", "gp-k", "foraging"));
  };

  pill.onclick = (): void => {
    const got = store.collectGranary();
    draw();
    if (got > 0) onCollected(got);
  };

  draw();
  return pill;
}

/** Troops an hour: a fraction survives being written down, a big number gets compacted. */
const perHourLabel = (rate: number): string =>
  rate >= 10 ? compact(Math.round(rate)) : rate.toFixed(1);

function coin(
  mark: string, numClass: string, value: number,
  plus: { label: string; onClick: () => void } | null,
): HTMLElement {
  const box = el("div", "tn-coin");
  box.classList.add(`c-${mark}`);
  // 26 AND 18, which are the design's own numbers: the currency's mark is nearly the
  // height of the chip it sits in, and the "+" is the smaller of the two. They were 18
  // and 15 — a mark and an affordance at almost one size, which is what made the chip
  // read as a row of three things rather than as a purse with a way to fill it.
  const ic = el("span", "tn-ic");
  ic.appendChild(hudMark(mark, 26));
  box.append(ic, el("span", `tn-num ${numClass}`, String(value)));
  if (plus) {
    const btn = el("button", "tn-plus");
    btn.appendChild(hudMark("plus", 18));
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

/**
 * THE PLAYER'S OWN FACE, WHEREVER IT IS DRAWN.
 *
 * One function, because it is on three screens already — the top bar's disc, the profile
 * hero and the hatch's prize card — and a fourth place drawing it by hand is a fourth
 * place to fix when the fallback or the size changes (§7). An avatar the player has not
 * chosen, or one whose file is missing, is the drawn worker this app has always had:
 * `avatarArt` answering null is not a hole, it is the picture that was there before.
 *
 * AND IT ANSWERS WITH TWO DIFFERENT TAGS, so every box that sizes it has to size BOTH —
 * an `<img>` where there is a painting and a `<canvas>` where there is not. That is the
 * trap the match history and the chrome marks have each paid for once already, and
 * `css-sanity` sweeps the stylesheet for it.
 *
 * Silent either way: the face always sits inside something already named — a button, a
 * row, a card with the name beside it — so a second announcement is noise, not access.
 */
export function avatarFace(
  id: string | null, size: number, cls?: string,
): HTMLElement {
  const art = id ? avatarArt(id) : null;
  if (art) {
    const img = document.createElement("img");
    img.src = art;
    img.width = size;
    img.height = size;
    if (cls) img.className = cls;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    return img;
  }
  const cv = document.createElement("canvas");
  // THE BACKING STORE ONLY, never an inline size. A caller passes the size it wants
  // DRAWN and the stylesheet decides the box — which is both how `antPortrait` keeps a
  // face sharp (drawn at twice what it is shown at) and the only way this can go in a
  // 30px disc whose rule is in `skin.css`: an inline `width` outranks the sheet, and the
  // app has paid for that one before (§5, the zero-sized canvas).
  cv.width = size;
  cv.height = size;
  if (cls) cv.className = cls;
  cv.setAttribute("aria-hidden", "true");
  drawAvatar(cv);
  return cv;
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

/**
 * THE BAR IS THE FIVE SCREENS IT HAS TILES FOR, AND NOTHING ELSE. Asked for directly.
 *
 * It used to ride eight more — the profile, the manual, Settings, News, Friends,
 * Support, the hatch and the Colony Road — which is the legacy build's own list. A bar
 * whose five marks name five screens, shown on thirteen, says the player is on one of
 * the five when they are not; and on those eight the active tile was whichever tab they
 * had come from, so the bar was lit for a screen that was no longer on the glass.
 *
 * Every one of the eight has its own back arrow (the manual was given one when this
 * landed), so none of them lost its way out.
 */
export const NAV_SCREENS: readonly string[] = [
  "shop", "anthill", "home", "antarium", "challenges",
];

export function bottomNav(onNav: (id: NavId) => void): HTMLElement {
  const nav = el("nav", "homenav");
  nav.id = "mainNav";
  for (const [id, iconName, label] of NAV_TABS) {
    const b = el("button", "navitem");
    b.dataset.nav = id;
    const mark = el("span", "ni");
    mark.appendChild(hudMark(iconName, 40));
    b.append(mark);
    // THE LABEL IS GONE FROM THE TILE AND NOT FROM THE BUTTON. Five words across a phone
    // is what made these tiles tall and the type tiny; the mark is the tab. It is still
    // NAMED, because a drawn control that says nothing is a control a screen reader
    // cannot announce (§ EVERY CONTROL SAYS WHAT IT IS) — the name moved off the glass,
    // not out of the markup.
    b.title = label;
    b.setAttribute("aria-label", label);
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
  /**
   * The currency's mark, by NAME.
   *
   * It used to be the emoji itself, mapped back to a mark here — so every caller passed a
   * mushroom or a test tube through a layer whose whole job was to throw it away, and a
   * typo in the glyph silently priced everything in mycelium.
   */
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
  // THE PAINTED currency mark, the same one the top bar carries: a price is the purse
  // counted somewhere else, and two drawings of one currency read as two currencies.
  b.append(resourceMark(opts.icon, 15), el("span", undefined, String(opts.cost)));
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
export function setupSteps(current: number, total = 2): HTMLElement {
  const row = el("div", "setupsteps");
  for (let i = 0; i < total; i++) {
    row.appendChild(el("span", "sstep" + (i === current ? " on" : i < current ? " done" : "")));
  }
  return row;
}

/** A mark in a wrapper, so the flex row can size it without the SVG shrinking. */
/**
 * A colony's face: its painted icon where there is one, and its drawn head where there
 * is not.
 *
 * One function, because every screen that names a colony wants the same picture — the
 * profile, the Antarium, a friend row, the ladder, the opponent search, the result card —
 * and a copy per screen is a copy to fix when the drawing changes (PROJECT_GUIDE.md §7).
 *
 * THE PAINTING IS ONLY EVER THE BASIC LOOK, and that is the rule worth keeping. A skin
 * recolours the whole colony and may carry an overlay (`engine/skins.ts`); the drawn head
 * is the only one of the two that can show either, so a colony wearing something found
 * keeps its drawn face. Handing a skinned colony its painted icon would make wearing a
 * skin do nothing on every screen that shows a face, silently.
 *
 * AND IT STANDS ON ITS RARITY, asked for directly: "wherever the icons of the species are
 * shown they need to be shown with their respective coloured backgrounds that shows
 * rarity." The Antarium has painted a colony's tile in its tier since that screen was
 * drawn to the design, and every OTHER place a face appears — the profile's collection
 * strip, a friend row, the ladder, the opponent search, the sign-in roster, the result
 * card — showed the same head on whatever the page happened to be. So the same fact was
 * said in colour on one screen and nowhere else.
 *
 * It is set HERE rather than on each box, which is the whole reason this function exists
 * (§7): a background per calling site is twelve places to fix when a rung's colour moves,
 * and the twelfth is the one that gets missed. Inline, because it is read off the SPECIES
 * — a stylesheet cannot know which rung a given face is on.
 *
 * jsdom has no canvas and a screen must survive a context it cannot draw into (§6), so a
 * null context returns a blank canvas rather than throwing.
 */
export function antPortrait(
  id: SpeciesId, size: number, cls?: string, look?: Look | null,
): HTMLElement {
  const worn = look ?? basicLook(id);
  const art = faceFor(id);
  if (art && worn.id === basicLook(id).id) {
    const img = document.createElement("img");
    img.src = art;
    img.width = size;
    img.height = size;
    img.style.objectFit = "cover";
    img.style.background = tierOf(id).fill;
    if (cls) img.className = cls;
    // Silent, for the reason the canvas below is: the face always sits inside something
    // that is already named, and a second announcement is noise rather than access.
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    return img;
  }
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  cv.style.background = tierOf(id).fill;
  if (cls) cv.className = cls;
  // DECORATION, and marked as such. A drawn face always sits inside something that is
  // already named — a button, a row, a card with the colony's name beside it — so a screen
  // reader announcing it a second time as an unlabelled graphic is noise rather than
  // access. Silent is the correct answer for a picture the text already gives.
  cv.setAttribute("aria-hidden", "true");
  const g = cv.getContext("2d");
  // A look carries its own colours as well as its overlay, and `lookCol` is the one place
  // that decides which wins — so a portrait and the board can never disagree about what a
  // colony looks like. No look means the basic one, which is what an opponent always is.
  if (g) antHead(g, size / 2, size / 2, size * 0.46, lookCol(id, worn), worn);
  return cv;
}

function iconSlot(cls: string, mark: string, size: number): HTMLElement {
  const box = el("span", cls);
  box.appendChild(hudMark(mark, size));
  return box;
}
