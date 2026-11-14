/** A flat illustrated power badge with a separate, level-driven flame backdrop. */
import { el } from "./chrome";
import { flarePowerFire, setPowerFire } from "./power-fire";
import "./power-tag.css";

export interface PowerTagOptions { compact?: boolean; context?: string; level?: number; owned?: boolean }
const OUTLINE = "M23 3H121L108 13Q104 16 110 17L136 21Q140 22 136 24L111 30Q107 31 111 34L120 41H23C12 41 3 33 3 22S12 3 23 3Z";
export function powerTag(total: number, opts: PowerTagOptions = {}): HTMLElement {
  const tag = el("div", "power-tag" + (opts.compact ? " power-tag--compact" : ""));
  if (opts.context) tag.dataset.context = opts.context;
  const label = el("span", "power-tag__label", "POWER");
  const value = el("span", "power-tag__value");
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "power-tag__flame");
  svg.setAttribute("viewBox", "0 0 140 44");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const rim = document.createElementNS(ns, "path");
  rim.setAttribute("class", "power-tag__flame-edge");
  rim.setAttribute("d", OUTLINE); rim.setAttribute("fill", "#c7ced0");
  const face = document.createElementNS(ns, "path");
  face.setAttribute("class", "power-tag__face");
  face.setAttribute("d", OUTLINE); face.setAttribute("fill", "#dc4947");
  face.setAttribute("transform", "translate(4 4) scale(.94 .82)");
  svg.append(rim, face);
  tag.append(label, value, svg);
  updatePowerTag(tag, total, opts);
  return tag;
}
export function updatePowerTag(tag: HTMLElement, total: number, opts: Pick<PowerTagOptions, "level" | "owned"> = {}): void {
  const score = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
  const rawLevel = opts.level ?? Number(tag.dataset.level ?? 0);
  const level = Number.isFinite(rawLevel) ? Math.max(0, Math.min(10, Math.floor(rawLevel))) : 0;
  const owned = opts.owned ?? tag.dataset.owned !== "false";
  tag.dataset.power = String(score);
  tag.dataset.level = String(level);
  tag.dataset.owned = String(owned);
  tag.dataset.fire = String(owned && level > 0);
  tag.classList.toggle("power-tag--locked", !owned);
  const number = tag.querySelector(".power-tag__value");
  if (number) number.textContent = tag.classList.contains("power-tag--compact") ? String(score) : score.toLocaleString("en-US");
  const context = tag.dataset.context;
  tag.setAttribute("aria-label", `${context ? context + ": " : ""}Total power ${score.toLocaleString("en-US")}`);
  tag.title = "Total power · species, research, combat chambers and equipped traits";
  setPowerFire(tag, owned ? level : 0);
}
/** Upgrade and entry feedback energises the fire, never the rigid badge. */
export function burstPowerTag(tag: HTMLElement): void { flarePowerFire(tag); }
