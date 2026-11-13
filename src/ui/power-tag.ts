/** Shared combat-power tag. Decorative flame-tail silhouette never changes the score. */
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

/** Flare only after a successful loadout change, then resume the exact idle phase. */
const activeFlares = new WeakMap<HTMLElement, () => void>();
export function burstPowerTag(tag: HTMLElement): void {
  const path = tag.querySelector<SVGPathElement>(".power-tag__flame-edge");
  if (!path || !tag.isConnected || typeof path.animate !== "function"
    || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const start = getComputedStyle(path);
  const from = { d: start.getPropertyValue("d"), fill: start.fill };
  activeFlares.get(tag)?.();
  const idle = path.getAnimations().filter(animation => animation.playState === "running");
  idle.forEach(animation => animation.pause());
  const resting = getComputedStyle(path);
  const back = { d: resting.getPropertyValue("d"), fill: resting.fill };
  const flare = path.animate([
    { ...from, offset: 0, easing: "cubic-bezier(.18,.75,.3,1)" },
    { d: 'path("M23 3H137L117 10Q110 14 119 15L154 19Q160 20 155 23L121 31Q112 34 119 37L134 41H23C12 41 3 33 3 22S12 3 23 3Z")',
      fill: "#fa853f", offset: .18, easing: "ease-in-out" },
    { d: 'path("M23 3H132L113 11Q108 15 115 17L148 23Q154 24 149 26L119 31Q111 32 116 35L129 41H23C12 41 3 33 3 22S12 3 23 3Z")',
      fill: "#ee6040", offset: .42, easing: "ease-out" },
    { ...back, offset: 1 },
  ], { duration: 1000 });

  flare.id = "power-tail-flare";
  const settle = (): void => {
    flare.onfinish = null;
    flare.oncancel = null;
    flare.cancel();
    idle.forEach(animation => { if (animation.playState === "paused") animation.play(); });
    if (activeFlares.get(tag) === settle) activeFlares.delete(tag);
  };
  activeFlares.set(tag, settle);
  flare.onfinish = settle;
  flare.oncancel = settle;
}
