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
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "power-tag__flame-edge");
  path.setAttribute("d", flameOutline());
  svg.appendChild(path);
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

/** All poses share one continuous cubic outline, so the charge can travel through it. */
function flameOutline(center = -100, energy = 0, kick = 0, sway = 0): string {
  const swell = (x: number): number => energy * Math.exp(-Math.pow((x - center) / 23, 2));
  const top = (x: number): string => `${x} ${3 - swell(x)}`;
  const bottom = (x: number): string => `${x} ${41 + swell(x)}`;
  const cap = swell(10) * .4;
  return `M${top(23)}
    C${top(32)} ${top(41)} ${top(50)}
    C${top(59)} ${top(69)} ${top(78)}
    C${top(87)} ${top(96)} ${top(104)}
    C110 ${3 - swell(110)} 116 ${3 - swell(116)} ${121 + kick * 14} ${3 - sway * 4}
    C${117 + kick * 8} ${6 - sway * 3} 112 10 108 ${13 + sway * 2}
    C104 16 106 17 110 17
    C119 ${18 + sway * 4} ${127 + kick * 13} ${20 + sway * 7} ${136 + kick * 24} ${21 + sway * 6}
    C${140 + kick * 24} ${22 + sway * 6} ${140 + kick * 24} ${23 + sway * 6} ${136 + kick * 24} ${24 + sway * 6}
    C${128 + kick * 12} ${26 + sway * 5} 119 28 111 ${30 + sway * 2}
    C107 31 108 32 111 34
    C114 ${37 - sway * 2} ${117 + kick * 8} ${40 - sway * 3} ${120 + kick * 13} ${41 - sway * 4}
    C116 ${41 + swell(116)} 110 ${41 + swell(110)} ${bottom(104)}
    C${bottom(96)} ${bottom(87)} ${bottom(78)}
    C${bottom(69)} ${bottom(59)} ${bottom(50)}
    C${bottom(41)} ${bottom(32)} ${bottom(23)}
    C12 ${41 + swell(23)} ${3 - cap} 33 ${3 - cap} 22
    C${3 - cap} 11 12 ${3 - swell(23)} ${top(23)}Z`.replace(/\s+/g, " ");
}

/** Entry and loadout feedback: charge left to right, release, then resume idle. */
const activeFlares = new WeakMap<HTMLElement, () => void>();
let chargeSequence = 0;
export function burstPowerTag(tag: HTMLElement): void {
  const path = tag.querySelector<SVGPathElement>(".power-tag__flame-edge");
  const svg = path?.ownerSVGElement;
  if (!path || !svg || !tag.isConnected || typeof path.animate !== "function"
    || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const from = getComputedStyle(path).getPropertyValue("d");
  activeFlares.get(tag)?.();
  const idle = path.getAnimations().filter(animation => animation.playState === "running");
  idle.forEach(animation => animation.pause());
  const back = getComputedStyle(path).getPropertyValue("d");
  const pose = (offset: number, center: number, energy: number, kick = 0, sway = 0): Keyframe =>
    ({ offset, d: `path("${flameOutline(center, energy, kick, sway)}")` });
  const flare = path.animate([
    { d: from, offset: 0 },
    pose(.12, 10, 4),
    pose(.24, 42, 5.5),
    pose(.36, 78, 6),
    pose(.46, 110, 5),
    pose(.54, 130, 1, 1, -.8),
    pose(.60, 150, 0, .65, 1),
    pose(.65, 150, 0, .85, -1),
    pose(.69, 150, 0, .55, 1),
    pose(.73, 150, 0, .65, -.8),
    pose(.77, 150, 0, .4, .6),
    pose(.81, 150, 0, .45, -.5),
    pose(.86, 150, 0, .25, .35),
    pose(.92, 150, 0, .12, -.15),
    { d: back, offset: 1 },
  ], { duration: 1000, easing: "linear" });
  flare.id = "power-tail-flare";

  // The hot band is a fill inside the same outline, never another flame shape.
  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs");
  const gradient = document.createElementNS(ns, "linearGradient");
  gradient.id = `power-charge-${++chargeSequence}`;
  gradient.setAttribute("gradientUnits", "userSpaceOnUse");
  const stops = [
    [0, "#db4147"], [.25, "#ef6740"], [.5, "#ffe09a"], [.75, "#ef6740"], [1, "#db4147"],
  ] as const;
  for (const [offset, colour] of stops) {
    const stop = document.createElementNS(ns, "stop");
    stop.setAttribute("offset", String(offset));
    stop.setAttribute("stop-color", colour);
    gradient.appendChild(stop);
  }
  defs.appendChild(gradient);
  svg.prepend(defs);
  const originalFill = path.style.fill;
  path.style.fill = `url(#${gradient.id})`;
  let frame = 0;
  const light = (): void => {
    const t = Math.max(0, Math.min(1, Number(flare.currentTime ?? 0) / 1000));
    const center = t < .54 ? -20 + 150 * (t / .54) : 130 + 75 * ((t - .54) / .46);
    gradient.setAttribute("x1", String(center - 30));
    gradient.setAttribute("x2", String(center + 30));
    gradient.setAttribute("y1", "22");
    gradient.setAttribute("y2", "22");
    frame = requestAnimationFrame(light);
  };
  light();
  const settle = (): void => {
    flare.onfinish = null;
    flare.oncancel = null;
    flare.cancel();
    cancelAnimationFrame(frame);
    path.style.fill = originalFill;
    defs.remove();
    idle.forEach(animation => { if (animation.playState === "paused") animation.play(); });
    if (activeFlares.get(tag) === settle) activeFlares.delete(tag);
  };
  activeFlares.set(tag, settle);
  flare.onfinish = settle;
  flare.oncancel = settle;
}
