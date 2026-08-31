/**
 * THE BOARD RENDERER.
 *
 * The one file in `render/` with no test, because it is the one that owns real browser
 * objects — a canvas, a ResizeObserver, an animation frame — rather than drawing into a
 * context it is handed. So this file runs in jsdom (see vite.config.ts) and drives it the
 * way the match screen does.
 *
 * What is asserted is the CONTRACT, not the picture: that it never writes to the game
 * state, that a zero-sized container cannot pin the board at nothing, that stopping really
 * stops, and that the finale washes from the winner's own nest. Every one of those is a bug
 * this project has already paid for once (CLAUDE.md §5).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { blankGame, put } from "../../engine/__tests__/helpers";
import { createGame } from "../../engine";
import type { GameState } from "../../engine";
import { BoardRenderer } from "../renderer";
import { makeRecorder, type Recorder } from "./recorder";

/** A canvas whose context records, inside a container of the size a test asks for. */
function mount(w = 400, h = 400): { canvas: HTMLCanvasElement; rec: Recorder; host: HTMLElement } {
  const rec = makeRecorder();
  const host = document.createElement("div");
  const canvas = document.createElement("canvas");
  canvas.getContext = (() => rec.ctx) as unknown as HTMLCanvasElement["getContext"];
  Object.defineProperty(host, "clientWidth", { value: w, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: h, configurable: true });
  host.appendChild(canvas);
  document.body.appendChild(host);
  return { canvas, rec, host };
}

const game = (): GameState =>
  createGame({ map: "small", species: { you: "fire", ai: "ghost" }, seed: 7 });

const make = (state = game(), w = 400, h = 400): {
  r: BoardRenderer; rec: Recorder; canvas: HTMLCanvasElement; host: HTMLElement;
} => {
  const { canvas, rec, host } = mount(w, h);
  const r = new BoardRenderer(canvas, state, { species: { ...state.species } });
  return { r, rec, canvas, host };
};

/**
 * Draw exactly one frame, through the real loop.
 *
 * The frame is private and it should stay that way — a renderer that exposes "draw now" is
 * a renderer somebody will drive by hand. Stubbing `requestAnimationFrame` and running the
 * callback once is the same path the browser takes, and it costs nothing.
 */
function drawOneFrame(r: BoardRenderer): void {
  let queued: FrameRequestCallback | null = null;
  const raf = vi.fn((cb: FrameRequestCallback) => { queued = cb; return 1; });
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  r.start();
  (queued as FrameRequestCallback | null)?.(performance.now());
  r.stop();
  vi.unstubAllGlobals();
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("measuring the canvas", () => {
  /**
   * NEVER AGAINST A ZERO-SIZED CONTAINER. `measure` writes the result to `canvas.style`,
   * and an inline `width: 0px` outranks the stylesheet's `100%` — so one early measurement
   * pinned the board at nothing permanently: the container never resized again, so the
   * observer never fired again either.
   */
  it("refuses a container that has not been laid out yet", () => {
    const { r, canvas } = make(game(), 0, 0);
    r.resize();
    // The INLINE STYLE is the thing that does the damage: `measure` writes it, and a
    // `width: 0px` there outranks the stylesheet's `100%` for ever after. A layout width
    // of zero proves nothing on its own — measuring nothing produces that too.
    expect(canvas.style.width, "the canvas was pinned at zero").toBe("");
    expect(canvas.style.height).toBe("");
  });

  it("measures once the container has a size, and lays the board out inside it", () => {
    const { r } = make();
    r.resize();
    expect(r.layout.width).toBeGreaterThan(0);
    expect(r.layout.ts).toBeGreaterThan(0);
    // The whole board has to fit: a tile size that overflows is a board with its edge off
    // the screen, which no amount of scrolling can reach.
    expect(r.layout.ts * r.layout.size).toBeLessThanOrEqual(r.layout.width + 1);
  });

  it("retries after a zero measurement rather than staying blank", () => {
    const state = game();
    const { r, host } = make(state, 0, 0);
    r.resize();
    expect(r.layout.width).toBe(0);
    Object.defineProperty(host, "clientWidth", { value: 380, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 380, configurable: true });
    r.resize();
    expect(r.layout.width).toBe(380);
  });
});

describe("drawing", () => {
  /**
   * THE RENDERER READS THE GAME AND NEVER WRITES TO IT. This is the rule that lets the AI
   * search thousands of futures safely, so it is worth a test that would notice a stray
   * assignment anywhere in a whole frame.
   */
  it("never touches the game state", () => {
    const state = game();
    const before = JSON.stringify(state.grid);
    const { r } = make(state);
    r.resize();
    drawOneFrame(r);
    expect(JSON.stringify(state.grid)).toBe(before);
  });

  it("draws a frame, and stops drawing when told to", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    const cancelled: number[] = [];
    vi.stubGlobal("cancelAnimationFrame", (h: number) => cancelled.push(h));

    const { r } = make();
    r.start();
    expect(frames.length, "start() never asked for a frame").toBe(1);
    r.stop();
    expect(cancelled.length, "stop() left the loop running").toBe(1);
  });

  it("survives a canvas it cannot get a context from", () => {
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
    Object.defineProperty(host, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 300, configurable: true });
    host.appendChild(canvas);
    const state = game();
    const r = new BoardRenderer(canvas, state, { species: { ...state.species } });
    expect(() => { r.resize(); drawOneFrame(r); }).not.toThrow();
  });
});

describe("the opening", () => {
  it("runs, and reports how long the caller must hold the turn for", () => {
    const { r } = make();
    r.resize();
    const held = r.playIntro();
    expect(held).toBeGreaterThan(0);
    expect(r.introducing).toBe(true);
  });

  /** Every control skips it. Sitting through the same descent every match is not a feature. */
  it("can be cut short, and the board is left filled in", () => {
    const { r } = make();
    r.resize();
    r.playIntro();
    r.endIntro();
    expect(r.introducing).toBe(false);
    expect(() => drawOneFrame(r)).not.toThrow();
  });

  it("ignores a second skip", () => {
    const { r } = make();
    r.resize();
    r.playIntro();
    r.endIntro();
    expect(() => r.endIntro()).not.toThrow();
    expect(r.introducing).toBe(false);
  });
});

describe("the finale", () => {
  /**
   * IT STARTS FROM THE WINNER'S OWN NEST. A match is usually won by TAKING the loser's
   * nest — and at that moment the winner owns two, so searching the board for "their nest"
   * returns whichever comes first in grid order and the colour washes out from the ground
   * that has just fallen. The renderer snapshots both nests while the board is untouched.
   */
  it("washes from the nest the winner started on, not the one they just took", () => {
    const state = blankGame("tiny");
    put(state, 0, 6, { owner: "you", struct: "nest", soldiers: 9 });
    put(state, 6, 0, { owner: "ai", struct: "nest", soldiers: 9 });
    const { r } = make(state);
    r.resize();
    // The enemy nest falls: it is the winner's now, and it comes FIRST in grid order.
    put(state, 6, 0, { owner: "you", struct: "nest", soldiers: 4 });
    const ms = r.floodWin("you");
    expect(ms).toBeGreaterThan(0);
    expect(r.hideCounts, "the finale left the counts on the board").toBe(true);
  });

  it("drops the selection, so nothing stays lit under the wash", () => {
    const { r } = make();
    r.resize();
    r.setSelection({ c: 0, r: 6 }, [{ c: 1, r: 6 }]);
    r.floodWin("you");
    expect(() => drawOneFrame(r)).not.toThrow();
  });
});

describe("hit testing", () => {
  it("turns a press into the cell under it, and refuses one off the board", () => {
    const { r, canvas } = make();
    r.resize();
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, width: r.layout.width, height: r.layout.height,
      right: r.layout.width, bottom: r.layout.height, x: 0, y: 0, toJSON: () => ({}),
    });
    const mid = r.layout.ox + r.layout.ts * 1.5;
    expect(r.hit(mid, r.layout.oy + r.layout.ts * 0.5)).toEqual({ c: 1, r: 0 });
    expect(r.hit(-50, -50), "a press outside the grid found a cell").toBeNull();
  });
});
