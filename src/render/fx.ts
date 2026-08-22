/**
 * Transient combat/movement flourishes: a travelling comet trail, a clash burst, a capture pop.
 *
 * Time-based and read-only — they never touch game state. Positions are stored as board
 * coordinates and resolved to pixels at draw time, so an effect mid-flight survives a resize.
 */
import type { Coord, Player } from "../engine";
import type { Layout } from "./layout";
import { COL, hexA, ownerCol } from "./palette";
import { rrect } from "./shapes";

type Fx =
  | { type: "flow"; path: Coord[]; owner: Player; t: number; dur: number }
  | { type: "clash"; at: Coord; t: number; dur: number }
  | { type: "pop"; at: Coord; owner: Player; t: number; dur: number }
  | { type: "crumble"; at: Coord; owner: Player | null; vein: boolean; t: number; dur: number };

const TAU = 6.283;

/** Milliseconds the streak takes to cross one tile. Matches REVEAL_MS_PER_TILE. */
const FLOW_MS_PER_STEP = 260;

/**
 * How long a destroyed tile takes to go.
 *
 * The engine removes it the instant it dies, so this is the ONLY thing that says it was
 * ever there — losing ground has to be as visible as taking it, or a trail eaten by venom
 * simply is not there any more the next time you look at the board.
 */
export const CRUMBLE_MS = 520;
/** The share of that spent going white-hot, before it breaks up. */
const FLASH = 0.42;

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

  /**
   * A tile being destroyed: it holds for a moment, whites out, then shatters.
   *
   * Drawn over ground the engine has already cleared, which is what gives the tile its stay
   * of execution without any of that living on the tile itself (CLAUDE.md §5).
   */
  crumble(at: Coord, owner: Player | null, vein = false, delay = 0): void {
    this.items.push({
      type: "crumble", at, owner, vein,
      t: performance.now() + delay, dur: this.reduced ? 1 : CRUMBLE_MS,
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

      } else if (f.type === "crumble") {
        const x = layout.cx(f.at.c), y = layout.cy(f.at.r);
        const base = f.owner ? ownerCol(f.owner) : "#8b98ad";
        ctx.save();

        if (k < FLASH) {
          // Still standing, and going white. The rim lights first so the tile reads as
          // being burned out from its edge rather than simply fading.
          const heat = k / FLASH;
          const half = f.vein ? ts * 0.17 : ts * 0.5;
          rrect(ctx, x - half, y - half, half * 2, half * 2, ts * 0.2);
          ctx.fillStyle = base;
          ctx.fill();
          ctx.fillStyle = `rgba(255,255,255,${(0.15 + 0.85 * heat).toFixed(3)})`;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = Math.max(2, ts * 0.06) * (0.4 + heat);
          ctx.stroke();

        } else {
          // Gone. What is left is the blast: a ring pushing out and the pieces flying.
          const b = (k - FLASH) / (1 - FLASH);
          ctx.globalAlpha = 1 - b;
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = Math.max(1.5, ts * 0.05) * (1 - b);
          ctx.beginPath(); ctx.arc(x, y, ts * (0.18 + 0.55 * b), 0, TAU); ctx.stroke();

          ctx.fillStyle = base;
          for (let i = 0; i < 7; i++) {
            const a = i * (TAU / 7) + f.at.c * 0.7 + f.at.r * 1.3;   // seeded by the tile
            const d = ts * (0.1 + 0.5 * b);
            const s = ts * 0.08 * (1 - b);
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d + ts * 0.25 * b * b, s, 0, TAU);
            ctx.fill();
          }
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
