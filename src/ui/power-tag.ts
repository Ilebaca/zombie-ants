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

/** Entry and loadout feedback settle back to the exact idle phase. */
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
    { d: 'path("M23 3H145L119 8Q108 15 123 13L165 16Q172 20 164 25L124 31Q110 35 124 38L142 41H23C12 41 3 33 3 22S12 3 23 3Z")',
      fill: "#fa853f", offset: .18, easing: "ease-in-out" },
    { d: 'path("M23 3H137L114 13Q106 18 119 17L158 25Q166 29 158 30L121 32Q109 34 120 36L134 41H23C12 41 3 33 3 22S12 3 23 3Z")',
      fill: "#ee6040", offset: .42, easing: "ease-out" },
    { ...back, offset: 1 },
  ], { duration: 1000 });

  flare.id = "power-tail-flare";
  // Separate curved tongues curl above, through and below the stretching tail.
  const upper = [
    "M116 14C123 7 123-4 134-7C131 3 147 0 156-10C156 2 146 12 134 11C125 10 123 18 116 14Z",
    "M116 14C125 12 127-1 139-3C135 6 155 2 162-5C158 8 148 15 135 12C126 10 123 19 116 14Z",
    "M116 14C127 7 129 1 138-5C134 5 148 10 157 3C151 16 142 17 133 13C125 11 122 19 116 14Z",
  ];
  const lower = [
    "M116 30C123 37 123 48 134 51C131 41 147 44 156 54C156 42 146 32 134 33C125 34 123 26 116 30Z",
    "M116 30C125 32 127 45 139 47C135 38 155 42 162 49C158 36 148 29 135 32C126 34 123 25 116 30Z",
    "M116 30C127 37 129 43 138 49C134 39 148 34 157 41C151 28 142 27 133 31C125 33 122 25 116 30Z",
  ];
  const middle = [
    "M126 22C139 12 143 24 151 17C160 11 167 15 169 7C171 22 159 30 150 25C140 19 136 29 126 22Z",
    "M126 22C137 25 143 13 154 18C162 23 166 13 172 18C167 31 158 31 149 27C140 21 137 31 126 22Z",
    "M126 22C139 16 143 27 154 21C162 17 168 23 170 14C168 29 158 34 148 28C140 23 135 30 126 22Z",
  ];
  const tongues = [upper, lower, middle].map((waves, index) => {
    const tongue = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tongue.setAttribute("class", "power-tag__burst-wisp");
    tongue.setAttribute("d", waves[0]!);
    path.before(tongue);
    const animation = tongue.animate([
      { d: `path("${waves[0]}")`, opacity: 0, transform: "scale(.15,.2)", offset: 0 },
      { d: `path("${waves[1]}")`, opacity: 1, transform: "scale(1,1)", fill: "#fa853f", offset: .15 },
      { d: `path("${waves[2]}")`, opacity: 1, transform: "scale(.95,1)", fill: "#ffc363", offset: .4 },
      { d: `path("${waves[1]}")`, opacity: .7, transform: "scale(.7,.65)", fill: "#ee6040", offset: .7 },
      { d: `path("${waves[0]}")`, opacity: 0, transform: "scale(.15,.2)", fill: "#db4147", offset: 1 },
    ], { duration: 1000 - index * 40, easing: "cubic-bezier(.2,.65,.35,1)", fill: "both" });
    return { tongue, animation };
  });
  const settle = (): void => {
    flare.onfinish = null;
    flare.oncancel = null;
    flare.cancel();
    tongues.forEach(({ tongue, animation }) => { animation.cancel(); tongue.remove(); });
    idle.forEach(animation => { if (animation.playState === "paused") animation.play(); });
    if (activeFlares.get(tag) === settle) activeFlares.delete(tag);
  };
  activeFlares.set(tag, settle);
  flare.onfinish = settle;
  flare.oncancel = settle;
}
