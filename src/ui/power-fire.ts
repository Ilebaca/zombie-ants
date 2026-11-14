/** Shared, visibility-aware heat simulation for flames behind power badges. */
const WIDTH = 98, HEIGHT = 55;
interface Fire {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  buffer: HTMLCanvasElement;
  paint: CanvasRenderingContext2D;
  image: ImageData;
  heat: Float32Array;
  next: Float32Array;
  seeds: number[];
  level: number;
  visible: boolean;
  boostUntil: number;
}
const fires = new Map<HTMLCanvasElement, Fire>();
let frame = 0, last = 0;
let observer: IntersectionObserver | null = null;
let motion: MediaQueryList | null = null;
const clamp = (n: number): number => Math.max(0, Math.min(1, n));
function wake(): void {
  if (!frame && typeof requestAnimationFrame === "function" && !motion?.matches) frame = requestAnimationFrame(tick);
}
function tick(now: number): void {
  frame = 0;
  let active = false;
  for (const [canvas, fire] of fires) {
    if (!canvas.isConnected) { observer?.unobserve(canvas); fires.delete(canvas); continue; }
    if (!fire.visible || motion?.matches || document.hidden || !canvas.getClientRects().length) continue;
    active = true;
    if (now - last >= 32) draw(fire, now);
  }
  if (now - last >= 32) last = now;
  if (active) wake();
}
function rgb(hue: number, light: number): [number, number, number] {
  const a = Math.min(light, 1 - light);
  const channel = (n: number): number => {
    const k = (n + hue / 30) % 12;
    return 255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [channel(0), channel(8), channel(4)];
}
function draw(f: Fire, now: number, render = true): void {
  const t = now / 1000, boost = clamp((f.boostUntil - now) / 1000);
  const cooling = .14 - .009 * f.level - boost * .012;
  for (let y = 0; y < HEIGHT - 2; y++) {
    const drift = Math.sin(t * 3.4 + y * .39) * .8;
    for (let x = 1; x < WIDTH - 1; x++) {
      const sx = Math.max(1, Math.min(WIDTH - 2, Math.round(x + drift + Math.random() - .5)));
      const below = (y + 1) * WIDTH + sx;
      f.next[y * WIDTH + x] = Math.max(0,
        ((f.heat[below - 1] ?? 0) + (f.heat[below] ?? 0) + (f.heat[below + 1] ?? 0)
          + (f.heat[below + WIDTH] ?? 0)) * .25 - cooling * (.55 + Math.random() * .65));
    }
  }
  [f.heat, f.next] = [f.next, f.heat];
  f.next.fill(0);
  for (const index of f.seeds) {
    const pulse = .8 + .2 * Math.sin(t * 9 + (index % WIDTH) * .42);
    f.heat[index] = (.65 + Math.random() * .6 + f.level * .035 + boost * .25) * pulse;
  }
  if (!render) return;
  const pixels = f.image.data;
  for (let i = 0; i < f.heat.length; i++) {
    const h = clamp((f.heat[i] ?? 0) * .86);
    const x = i % WIDTH, y = Math.floor(i / WIDTH);
    const edge = clamp(y / 5) * clamp(x / 3) * clamp((WIDTH - 1 - x) / 3);
    const alpha = clamp((h - .055) * 2.5) * edge;
    let colour: [number, number, number];
    if (f.level >= 8) {
      const hue = f.level === 8 ? 278 + h * 25 : f.level === 9 ? 205 - h * 25
        : (t * 62 + h * 105 + Math.floor(i / WIDTH) * 1.7) % 360;
      colour = rgb(hue, .18 + h * .76);
    } else {
      colour = [Math.min(255, 160 + h * 210), Math.max(0, Math.min(255, (h - .1) * 345)),
        Math.max(0, Math.min(235, (h - .62) * 620))];
    }
    const at = i * 4;
    pixels[at] = colour[0]; pixels[at + 1] = colour[1]; pixels[at + 2] = colour[2];
    pixels[at + 3] = alpha * 255;
  }
  f.paint.putImageData(f.image, 0, 0);
  f.ctx.clearRect(0, 0, 196, 110);
  f.ctx.filter = "blur(3px)"; f.ctx.globalAlpha = .65;
  f.ctx.drawImage(f.buffer, 0, 0, 196, 110);
  f.ctx.filter = "none"; f.ctx.globalAlpha = 1;
  f.ctx.drawImage(f.buffer, 0, 0, 196, 110);
}
function watch(): void {
  if (!motion && typeof window.matchMedia === "function") {
    motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    motion.addEventListener?.("change", () => {
      if (motion?.matches) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        for (const f of fires.values()) f.ctx.clearRect(0, 0, 196, 110);
      } else wake();
    });
    document.addEventListener("visibilitychange", wake);
  }
  if (!observer && typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const f = fires.get(entry.target as HTMLCanvasElement);
        if (f) f.visible = entry.isIntersecting;
      }
      wake();
    }, { rootMargin: "20px" });
  }
}
export function setPowerFire(tag: HTMLElement, level: number, outline: string): void {
  const previous = tag.querySelector<HTMLCanvasElement>(".power-tag__fire");
  if (level <= 0) {
    if (previous) { observer?.unobserve(previous); fires.delete(previous); previous.remove(); }
    return;
  }
  if (previous) {
    const current = fires.get(previous);
    if (current) current.level = level;
    wake();
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.className = "power-tag__fire";
  canvas.width = 196; canvas.height = 110;
  canvas.setAttribute("aria-hidden", "true");
  tag.prepend(canvas);
  // The DOM still describes the effect in non-canvas test and accessibility environments.
  if (typeof Path2D === "undefined" || typeof requestAnimationFrame !== "function") return;
  const ctx = canvas.getContext("2d");
  const buffer = document.createElement("canvas");
  buffer.width = WIDTH; buffer.height = HEIGHT;
  const paint = buffer.getContext("2d");
  if (!ctx || !paint) return;
  const shape = new Path2D(outline), mask = new Uint8Array(WIDTH * HEIGHT), seeds: number[] = [];
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    mask[y * WIDTH + x] = paint.isPointInPath(shape, x * 2 - 28, y * 2 - 44) ? 1 : 0;
  }
  for (let y = 1; y < HEIGHT - 1; y++) for (let x = 1; x < WIDTH - 1; x++) {
    const at = y * WIDTH + x;
    if (mask[at] && (!mask[at - 1] || !mask[at + 1] || !mask[at - WIDTH] || !mask[at + WIDTH])) seeds.push(at);
  }
  const f: Fire = { canvas, ctx, buffer, paint, image: paint.createImageData(WIDTH, HEIGHT),
    heat: new Float32Array(WIDTH * HEIGHT), next: new Float32Array(WIDTH * HEIGHT), seeds,
    level, visible: true, boostUntil: 0 };
  fires.set(canvas, f);
  watch(); observer?.observe(canvas);
  // Warm the heat field before its first visible frame.
  for (let i = 0; i < 18; i++) draw(f, performance.now(), false);
  draw(f, performance.now());
  wake();
}
export function flarePowerFire(tag: HTMLElement): void {
  const canvas = tag.querySelector<HTMLCanvasElement>(".power-tag__fire");
  const f = canvas && fires.get(canvas);
  if (!f || motion?.matches) return;
  f.boostUntil = performance.now() + 1000;
  wake();
}
