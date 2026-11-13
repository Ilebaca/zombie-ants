/** Shared combat-power tag. Decorative flame-tail silhouette never change the score. */
import { el } from "./chrome";
import "./power-tag.css";

export interface PowerTagOptions { compact?: boolean; context?: string }
export function powerTag(total: number, opts: PowerTagOptions = {}): HTMLElement {
  const tag = el("div", "power-tag" + (opts.compact ? " power-tag--compact" : ""));
  if (opts.context) tag.dataset.context = opts.context;
  const label = el("span", "power-tag__label", "POWER");
  const value = el("span", "power-tag__value");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "power-tag__flame");
  svg.setAttribute("viewBox", "0 0 140 44");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("preserveAspectRatio", "none");
  for (const [d, cls] of [
    ["M23 3H121L108 13Q104 16 110 17L136 21Q140 22 136 24L111 30Q107 31 111 34L120 41H23C12 41 3 33 3 22S12 3 23 3Z", "power-tag__flame-edge"],
    ["M23 8H102M10 20C11 13 16 8 23 8", "power-tag__flame-fill"],
  ] as const) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);path.setAttribute("class", cls);svg.appendChild(path);
  }
  tag.append(label, value, svg);
  updatePowerTag(tag, total);
  return tag;
}
export function updatePowerTag(tag: HTMLElement, total: number): void {
  const score = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
  tag.dataset.power = String(score);
  const number = tag.querySelector(".power-tag__value");
  if (number) number.textContent = tag.classList.contains("power-tag--compact")
    ? String(score) : score.toLocaleString("en-US");
  const context = tag.dataset.context;
  tag.setAttribute("aria-label", `${context ? context + ": " : ""}Total power ${score.toLocaleString("en-US")}`);
  tag.title = "Total power · species, research, combat chambers and equipped traits";
}
