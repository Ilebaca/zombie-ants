/** Shared combat-power tag. Decorative sticker and flame never change the score. */
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
  svg.setAttribute("viewBox", "0 0 24 30");
  svg.setAttribute("aria-hidden", "true");
  for (const [d, cls] of [
    ["M12 1C13 8 21 10 21 18C21 24 17 28 11 28C5 28 2 24 2 19C2 15 5 12 6 9C6 14 9 14 10 11C12 7 10 5 12 1Z", "power-tag__flame-edge"],
    ["M12 6C14 11 19 13 19 19C19 23 16 26 11 26C7 26 4 23 4 19C4 17 5 16 6 14C7 17 11 17 12 13C13 10 12 8 12 6Z", "power-tag__flame-fill"],
    ["M12 16C12 20 16 20 15 23C14 26 8 26 8 22C8 20 11 19 12 16Z", "power-tag__flame-core"],
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
