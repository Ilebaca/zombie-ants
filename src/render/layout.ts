/**
 * Board geometry: where each tile lands in canvas pixels.
 *
 * Everything that needs a pixel position goes through a Layout, so the drawing code never
 * recomputes tile size and can't drift out of sync with hit testing.
 */
import type { Coord } from "../engine";

const BOARD_PAD = 14;

export class Layout {
  /** Device pixel ratio, capped at 2 — beyond that costs fill rate for no visible gain. */
  dpr = 1;
  /** Tile size in CSS pixels. */
  ts = 0;
  /** Board origin (top-left of cell 0,0) in CSS pixels. */
  ox = 0;
  oy = 0;
  width = 0;
  height = 0;

  constructor(public size: number) {}

  /**
   * Resize the backing store to the container and recentre the board.
   * A zero-sized or tiny container must not produce a non-positive tile size — that
   * would hand a negative radius to `ellipse()` and throw on every frame.
   */
  measure(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): CanvasRenderingContext2D | null {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = cssWidth;
    this.height = cssHeight;
    canvas.width = Math.max(1, Math.round(cssWidth * this.dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * this.dpr));
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const span = Math.min(cssWidth, cssHeight) - BOARD_PAD * 2;
    this.ts = Math.max(8, Math.floor(span / this.size));
    const board = this.ts * this.size;
    this.ox = Math.round((cssWidth - board) / 2);
    this.oy = Math.round((cssHeight - board) / 2);
    return ctx;
  }

  /** Centre of a column / row, in CSS pixels. */
  cx(c: number): number { return this.ox + c * this.ts + this.ts / 2; }
  cy(r: number): number { return this.oy + r * this.ts + this.ts / 2; }

  /** Top-left of a cell. */
  x0(c: number): number { return this.ox + c * this.ts; }
  y0(r: number): number { return this.oy + r * this.ts; }

  inBounds(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.size && r < this.size;
  }

  /** Canvas-relative pixel → cell, or null outside the board. */
  hit(px: number, py: number): Coord | null {
    const c = Math.floor((px - this.ox) / this.ts);
    const r = Math.floor((py - this.oy) / this.ts);
    return this.inBounds(c, r) ? { c, r } : null;
  }
}
