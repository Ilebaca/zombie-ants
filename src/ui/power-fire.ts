/** Flat, joined flame illustrations. Only this backdrop animates; the badge stays rigid. */
const NS = "http://www.w3.org/2000/svg";
const POSES = [
  "M2 41C-5 28 1 18 8 11C7 23 15 23 19 18C20 5 29 1 31-10C36 0 34 11 43 15C46 1 59 0 59-17C69-5 63 4 75 12C79 2 90 0 90-12C100-2 94 9 105 15C110 4 122 3 124-5C125 10 131 14 135 18C142 13 145 11 145 5C153 21 146 32 139 41C108 47 32 47 2 41Z",
  "M2 41C-3 29 4 21 9 14C9 25 17 23 20 19C23 8 27 2 35-7C36 4 38 10 45 16C50 3 55-2 56-14C67-3 67 7 77 14C83 4 86-4 93-9C100 1 98 10 107 16C113 7 119 0 127-2C125 11 133 15 136 20C144 16 143 11 147 8C152 24 145 33 139 41C108 47 32 47 2 41Z",
  "M2 41C-6 27 0 17 6 8C6 21 13 25 18 17C17 6 30 4 28-13C39-3 35 10 42 14C44 3 60 1 63-13C68-1 61 5 73 11C76-1 90 2 88-15C101-5 93 9 104 13C108 2 124 6 121-8C130 5 128 15 134 17C140 9 147 14 143 2C154 18 147 31 139 41C108 47 32 47 2 41Z",
] as const;
interface Fire {
  svg: SVGSVGElement;
  pulse: SVGGElement;
  animations: Animation[];
  boost: Animation | null;
  visible: boolean;
}
const fires = new Map<SVGSVGElement, Fire>();
let observer: IntersectionObserver | null = null;
let cleanup: MutationObserver | null = null;
let motion: MediaQueryList | null = null;
function remove(svg: SVGSVGElement): void {
  const f = fires.get(svg);
  if (f) { f.animations.forEach(a => a.cancel()); f.boost?.cancel(); fires.delete(svg); }
  observer?.unobserve(svg);
  svg.remove();
}
function sync(f: Fire): void {
  f.animations.forEach(a => {
    if (f.visible && !motion?.matches && !document.hidden) a.play();
    else a.pause();
  });
}
function watch(): void {
  if (!motion && typeof window.matchMedia === "function") {
    motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    motion.addEventListener?.("change", () => { for (const f of fires.values()) sync(f); });
    document.addEventListener("visibilitychange", () => { for (const f of fires.values()) sync(f); });
  }
  if (!observer && typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const f = fires.get(entry.target as SVGSVGElement);
        if (f) { f.visible = entry.isIntersecting; sync(f); }
      }
    }, { rootMargin: "20px" });
  }
  if (!cleanup && typeof MutationObserver !== "undefined") {
    cleanup = new MutationObserver(() => {
      for (const svg of fires.keys()) if (!svg.isConnected) remove(svg);
    });
    cleanup.observe(document.documentElement, { childList: true, subtree: true });
  }
}
export function setPowerFire(tag: HTMLElement, level: number): void {
  const previous = tag.querySelector<SVGSVGElement>(".power-tag__fire");
  if (previous && Number(previous.dataset.level) === level) return;
  if (previous) remove(previous);
  if (level <= 0) return;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "power-tag__fire");
  svg.setAttribute("viewBox", "0 0 140 44");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("aria-hidden", "true");
  svg.dataset.level = String(level);
  const size = document.createElementNS(NS, "g");
  const height = .24 + level * .076;
  size.setAttribute("transform", `translate(70 3) scale(${.92 + level * .008} ${height}) translate(-70 -3)`);
  const pulse = document.createElementNS(NS, "g");
  pulse.setAttribute("class", "power-tag__fire-pulse");
  const outer = document.createElementNS(NS, "path");
  outer.setAttribute("class", "power-tag__fire-outer");
  outer.setAttribute("d", POSES[0]);
  const inner = document.createElementNS(NS, "path");
  inner.setAttribute("class", "power-tag__fire-inner");
  inner.setAttribute("d", POSES[0]);
  inner.setAttribute("transform", "translate(0 5) scale(1 .82)");
  outer.setAttribute("fill", level < 8 ? "#f26a35" : level === 9 ? "#307dcc" : "#8851c8");
  inner.setAttribute("fill", level < 8 ? "#ffd36f" : level === 9 ? "#8fe1ff" : "#dbb3ff");
  pulse.append(outer, inner); size.appendChild(pulse); svg.appendChild(size); tag.prepend(svg);
  if (typeof outer.animate !== "function") return;
  const loop = (path: SVGPathElement, delay: number): Animation =>
    path.animate([...POSES, POSES[0]].map(d => ({ d: `path("${d}")` })),
      { duration: 1900 - level * 55, iterations: Infinity, easing: "ease-in-out", delay });
  const animations = [loop(outer, 0), loop(inner, -250)];
  if (level === 10) {
    animations.push(outer.animate([{fill:"#8851c8"},{fill:"#307dcc"},{fill:"#d65287"},{fill:"#8851c8"}],
      {duration:4800,iterations:Infinity,easing:"ease-in-out"}));
    animations.push(inner.animate([{fill:"#dbb3ff"},{fill:"#8fe1ff"},{fill:"#ffd58c"},{fill:"#dbb3ff"}],
      {duration:4800,iterations:Infinity,easing:"ease-in-out"}));
  }
  animations.forEach(a => a.pause());
  const f: Fire = { svg, pulse, animations, boost: null, visible: true };
  fires.set(svg, f);
  watch();
  if (observer) observer.observe(svg); else sync(f);
}
export function flarePowerFire(tag: HTMLElement): void {
  const svg = tag.querySelector<SVGSVGElement>(".power-tag__fire");
  const f = svg && fires.get(svg);
  if (!f || motion?.matches || typeof f.pulse.animate !== "function") return;
  f.boost?.cancel();
  f.boost = f.pulse.animate([{transform:"scaleY(1)"},{transform:"scaleY(1.12)",offset:.2},{transform:"scaleY(1)"}],
    {duration:1000,easing:"ease-out"});
}
