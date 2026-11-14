/** A rigid metal power badge with level-driven fire behind its silhouette. */
import { el } from "./chrome";
import { flarePowerFire, setPowerFire } from "./power-fire";
import "./power-tag.css";

export interface PowerTagOptions { compact?: boolean; context?: string; level?: number; owned?: boolean }
const OUTLINE = "M23 3H121L108 13Q104 16 110 17L136 21Q140 22 136 24L111 30Q107 31 111 34L120 41H23C12 41 3 33 3 22S12 3 23 3Z";
let sequence = 0;
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
  const defs = document.createElementNS(ns, "defs");
  const id = ++sequence;
  const gradient = (name: string, stops: readonly (readonly [number, string])[]): string => {
    const g = document.createElementNS(ns, "linearGradient");
    g.id = `power-${name}-${id}`;
    g.setAttribute("x1", "0"); g.setAttribute("y1", "0");
    g.setAttribute("x2", "0"); g.setAttribute("y2", "1");
    for (const [offset, colour] of stops) {
      const stop = document.createElementNS(ns, "stop");
      stop.setAttribute("offset", String(offset)); stop.setAttribute("stop-color", colour);
      g.appendChild(stop);
    }
    defs.appendChild(g);
    return `url(#${g.id})`;
  };
  const metal = gradient("metal", [[0, "#fff8e4"], [.22, "#c9d4d8"], [.5, "#6d7b89"], [.72, "#e0e7e7"], [1, "#465464"]]);
  const enamel = gradient("enamel", [[0, "#ff8762"], [.28, "#e75046"], [.7, "#be303d"], [1, "#752133"]]);
  const rim = document.createElementNS(ns, "path");
  rim.setAttribute("class", "power-tag__flame-edge");
  rim.setAttribute("d", OUTLINE); rim.setAttribute("fill", metal);
  const face = document.createElementNS(ns, "path");
  face.setAttribute("class", "power-tag__face");
  face.setAttribute("d", OUTLINE); face.setAttribute("fill", enamel);
  face.setAttribute("transform", "translate(4 4) scale(.94 .82)");
  svg.append(defs, rim, face);
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
  setPowerFire(tag, owned ? level : 0, OUTLINE);
}
/** Upgrade and entry feedback energises the fire, never the rigid badge. */
export function burstPowerTag(tag: HTMLElement): void { flarePowerFire(tag); }
