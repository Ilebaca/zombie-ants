/**
 * BOARD GEOMETRY: the board is nine tenths of the viewport wide, always, and centred.
 *
 * This runs in jsdom (see vite.config.ts) because `measure` reads the real window — the
 * viewport width is the whole rule, and the device pixel ratio sizes the backing store.
 *
 * What is held here is the RULE and its one escape: a tile is a tenth of the viewport
 * whatever the canvas it lands on, the nine of them are centred in that canvas, and a
 * canvas too small for the square falls back to fitting it rather than clipping it.
 */
import { describe, expect, it, afterEach } from "vitest";
import { Layout } from "../layout";

/** A canvas whose context exists — jsdom has none, so one is stubbed in. */
function canvas(): HTMLCanvasElement {
  const el = document.createElement("canvas");
  const ctx = { setTransform: () => {} } as unknown as CanvasRenderingContext2D;
  el.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
  return el;
}

/** The viewport the next measure reads. jsdom lets `innerWidth` be written straight. */
function viewport(w: number): void {
  Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
}

const PHONES = [320, 360, 375, 390, 412, 430, 768];
/** What the match screen leaves the canvas: the screen's own 16px gutter, both sides. */
const canvasWidth = (vw: number): number => vw - 32;
/** Taller than any board 90vw can ask for, so the width rule is what is being measured. */
const canvasHeight = (vw: number): number => Math.round(vw * 1.4);

afterEach(() => { viewport(1024); });

describe("Layout.measure", () => {
  it("gives a tile a tenth of the viewport on every phone width", () => {
    for (const vw of PHONES) {
      viewport(vw);
      const l = new Layout(9);
      l.measure(canvas(), canvasWidth(vw), canvasHeight(vw));
      expect(l.ts).toBe(Math.floor(vw / 10));
    }
  });

  it("spans the nine tiles across nine tenths of the viewport", () => {
    for (const vw of PHONES) {
      viewport(vw);
      const l = new Layout(9);
      l.measure(canvas(), canvasWidth(vw), canvasHeight(vw));
      const board = l.ts * 9;
      // Within the one tile's worth of rounding that keeps tile edges on whole pixels.
      expect(board).toBeLessThanOrEqual(vw * 0.9);
      expect(board).toBeGreaterThan(vw * 0.9 - 9);
    }
  });

  it("centres the board in the canvas", () => {
    for (const vw of PHONES) {
      viewport(vw);
      const w = canvasWidth(vw), h = canvasHeight(vw);
      const l = new Layout(9);
      l.measure(canvas(), w, h);
      const board = l.ts * 9;
      expect(l.ox).toBe(Math.round((w - board) / 2));
      expect(l.oy).toBe(Math.round((h - board) / 2));
      // Equal margins either side, to the pixel the rounding allows.
      expect(Math.abs((w - board - l.ox) - l.ox)).toBeLessThanOrEqual(1);
      expect(Math.abs((h - board - l.oy) - l.oy)).toBeLessThanOrEqual(1);
    }
  });

  it("does not change with the height of the canvas it is drawn on", () => {
    viewport(390);
    const tall = new Layout(9), short = new Layout(9);
    tall.measure(canvas(), 358, 800);
    short.measure(canvas(), 358, 420);
    expect(short.ts).toBe(tall.ts);
  });

  it("falls back to fitting a canvas too short for the square", () => {
    viewport(1200);
    const l = new Layout(9);
    l.measure(canvas(), 1160, 450);
    // 90vw is 1080 and would be clipped; the height is what is left to fit.
    expect(l.ts).toBe(50);
    expect(l.ts * 9).toBeLessThanOrEqual(450);
  });

  it("falls back to fitting a canvas narrower than the board", () => {
    viewport(1200);
    const l = new Layout(9);
    l.measure(canvas(), 400, 900);
    expect(l.ts).toBe(Math.floor(400 / 9));
    expect(l.ts * 9).toBeLessThanOrEqual(400);
  });

  it("never hands out a non-positive tile, whatever it is measured against", () => {
    viewport(0);
    const l = new Layout(9);
    l.measure(canvas(), 0, 0);
    expect(l.ts).toBeGreaterThan(0);
  });

  it("hit testing agrees with the geometry it just measured", () => {
    viewport(390);
    const l = new Layout(9);
    l.measure(canvas(), 358, 700);
    expect(l.hit(l.cx(0), l.cy(0))).toEqual({ c: 0, r: 0 });
    expect(l.hit(l.cx(8), l.cy(8))).toEqual({ c: 8, r: 8 });
    expect(l.hit(l.ox - 1, l.cy(4))).toBeNull();
    expect(l.hit(l.ox + l.ts * 9 + 1, l.cy(4))).toBeNull();
  });
});
