/** Shared combat-power tag. Decorative flame and frame never change the score. */
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
  svg.setAttribute("viewBox", "0 0 34 40");
  svg.setAttribute("aria-hidden", "true");
  for (const [d, cls] of [
    ["M2 39C-1 31 4 28 5 22C7 25 9 24 10 21C13 14 7 11 15 2C14 12 26 13 24 23C29 21 29 17 29 15C37 25 32 31 33 39", "power-tag__flame-edge"],
    ["M11 33C5 27 15 24 14 15C24 21 22 25 23 28C26 26 28 25 28 23C33 32 23 37 17 37Z", "power-tag__flame-fill"],
    ["M16 35C12 31 19 28 19 24C25 29 24 33 20 36Z", "power-tag__flame-core"],
  ]) {
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
