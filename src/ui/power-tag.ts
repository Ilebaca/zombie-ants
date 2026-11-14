/** Static illustrated power badge with one clean, continuous border. */
import { el } from "./chrome";
import "./power-tag.css";

export interface PowerTagOptions { compact?: boolean; context?: string; level?: number; owned?: boolean }
const OUTLINE = "M23 4H120L108 14Q106 16 110 17L135 21Q138 22 135 23L110 29Q106 30 109 33L120 40H23C12.5 40 4 32 4 22S12.5 4 23 4Z";
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
  rim.setAttribute("d", OUTLINE); rim.setAttribute("fill", "#dc4947");
  svg.appendChild(rim);
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
  tag.dataset.fire = "false";
  tag.classList.toggle("power-tag--locked", !owned);
  const number = tag.querySelector(".power-tag__value");
  if (number) number.textContent = tag.classList.contains("power-tag--compact") ? String(score) : score.toLocaleString("en-US");
  const context = tag.dataset.context;
  tag.setAttribute("aria-label", `${context ? context + ": " : ""}Total power ${score.toLocaleString("en-US")}`);
  tag.title = "Total power · species, research, combat chambers and equipped traits";
}
