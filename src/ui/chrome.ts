/**
 * Shared furniture for the meta screens.
 *
 * The Anthill, Antarium and Trophy Road are all the same shape: a header with a back
 * button, a currency strip, a scrolling body of cards, and buy buttons that grey out when
 * the player cannot afford them. That shape lives here once.
 *
 * Everything is built with DOM calls rather than innerHTML — the profile carries a
 * player-chosen name, and a template string would happily inject it as markup.
 */
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

export function screenEl(className: string): HTMLDivElement {
  return el("div", "screen " + className);
}

export interface HeaderOptions {
  title: string;
  sub?: string;
  onBack?: () => void;
  /** Currency strip. Omitted on screens that sell nothing. */
  profile?: Readonly<Profile>;
}

export function screenHeader(parent: HTMLElement, opts: HeaderOptions): void {
  const top = el("div", "screentop");
  if (opts.onBack) {
    const back = el("button", "backbtn", "←");
    back.setAttribute("aria-label", "Back");
    back.onclick = opts.onBack;
    top.appendChild(back);
  }
  top.appendChild(el("div", "screenh", opts.title));
  if (opts.sub) top.appendChild(el("div", "screensub", opts.sub));
  if (opts.profile) top.appendChild(currencyBar(opts.profile));
  parent.appendChild(top);
}

/** 🍄 mycelium · 🧪 pheromone · 🏆 trophies. Rebuilt on every render, never patched. */
export function currencyBar(profile: Readonly<Profile>): HTMLElement {
  const bar = el("div", "curbar");
  bar.append(
    chip("🍄", profile.mycel, "mycel"),
    chip("🧪", profile.pheromone, "pheromone"),
    chip("🏆", profile.trophies, "trophies"),
  );
  return bar;
}

function chip(icon: string, value: number, label: string): HTMLElement {
  const c = el("div", "curchip");
  c.append(el("span", "ci", icon), el("b", "cv", String(value)), el("small", "cl", label));
  return c;
}

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
 * A price button. When it is unaffordable it stays visible and disabled rather than
 * disappearing — the player needs to see what they are saving toward.
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

/** A titled card. Returns the body so callers can fill it. */
export function card(title: string, aside?: string): { root: HTMLElement; body: HTMLElement } {
  const root = el("div", "metacard");
  const head = el("div", "mch");
  head.appendChild(el("span", undefined, title));
  if (aside !== undefined) head.appendChild(el("span", "mcaside", aside));
  const body = el("div", "mcb");
  root.append(head, body);
  return { root, body };
}

export type ToastKind = "good" | "bad" | "warn" | "hive";

/** Transient message. Mounts into the screen so it dies with it. */
export function toast(host: HTMLElement, msg: string, kind: ToastKind = "good"): void {
  let box = host.querySelector<HTMLElement>(".metatoast");
  if (!box) {
    box = el("div", "metatoast");
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
