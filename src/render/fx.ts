/**
 * Transient combat/movement flourishes: a travelling comet trail, a clash burst, a capture pop.
 *
 * Time-based and read-only — they never touch game state. Positions are stored as board
 * coordinates and resolved to pixels at draw time, so an effect mid-flight survives a resize.
 */
import type { Coord, Player } from "../engine";
import type { Layout } from "./layout";
import { COL, hexA, ownerCol } from "./palette";

type Fx =
  | { type: "flow"; path: Coord[]; owner: Player; t: number; dur: number }
  | { type: "clash"; at: Coord; t: number; dur: number }
  | { type: "pop"; at: Coord; owner: Player; t: number; dur: number };

const TAU = 6.283;

/** Milliseconds the streak takes to cross one tile. Matches REVEAL_MS_PER_TILE. */
const FLOW_MS_PER_STEP = 260;

export class FxLayer {
  private items: Fx[] = [];

  reduced = typeof matchMedia === "function"
    ? matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  flow(path: Coord[], owner: Player, delay = 0): void {
    if (this.reduced || path.length < 2) return;
    // The streak keeps pace with the fill front (reveal.ts): same tiles-per-second, so the
    // comet arrives exactly as the ground it crossed finishes filling.
    const steps = Math.max(1, path.length - 1);
    this.items.push({
      type: "flow", path: path.slice(), owner, t: performance.now() + delay,
      dur: this.reduced ? 1 : FLOW_MS_PER_STEP * steps,
    });
  }

  clash(at: Coord, delay = 0): void {
    this.items.push({ type: "clash", at, t: performance.now() + delay, dur: this.reduced ? 1 : 520 });
  }

  pop(at: Coord, owner: Player, delay = 0): void {
    this.items.push({
      type: "pop", at, owner, t: performance.now() + delay, dur: this.reduced ? 1 : 380,
    });
  }

  clear(): void { this.items.length = 0; }

  draw(ctx: CanvasRenderingContext2D, layout: Layout): void {
    const now = performance.now();
    const ts = layout.ts;
    this.items = this.items.filter((f) => now - f.t < f.dur);

    for (const f of this.items) {
      const k = (now - f.t) / f.dur;
      if (k < 0) continue;                  // still waiting for its turn in the run

      if (f.type === "flow") {
        const pts = f.path.map((p) => ({ x: layout.cx(p.c), y: layout.cy(p.r) }));
        const glow = ownerCol(f.owner, "glow");
        ctx.save();
        ctx.shadowColor = glow; ctx.shadowBlur = 12; ctx.fillStyle = glow;
        // four trailing dots, each lagging the head slightly, make a comet tail
        for (let d = 0; d < 4; d++) {
          const lag = Math.max(0, k - d * 0.08);
          const seg = (pts.length - 1) * lag;
          const i = Math.min(pts.length - 2, Math.floor(seg));
          const lt = seg - i;
          const a = pts[i] as { x: number; y: number };
          const b = pts[i + 1] as { x: number; y: number };
          ctx.globalAlpha = (1 - k) * (1 - d * 0.2);
          ctx.beginPath();
          ctx.arc(a.x + (b.x - a.x) * lt, a.y + (b.y - a.y) * lt, ts * 0.07, 0, TAU);
          ctx.fill();
        }
        ctx.restore();

      } else if (f.type === "clash") {
        const x = layout.cx(f.at.c), y = layout.cy(f.at.r);
        ctx.save();
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, ts * 0.2 + ts * 0.4 * k, 0, TAU); ctx.stroke();
        ctx.fillStyle = hexA(COL.gold ?? "#ffd23f", 1 - k);
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05 + k * 3, rr = ts * 0.3 * k;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, ts * 0.05 * (1 - k), 0, TAU);
          ctx.fill();
        }
        ctx.restore();

      } else {
        const x = layout.cx(f.at.c), y = layout.cy(f.at.r);
        ctx.save();
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = ownerCol(f.owner, "glow"); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, ts * 0.1 + ts * 0.35 * k, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }
  }
}
