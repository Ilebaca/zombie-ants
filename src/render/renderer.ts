/**
 * The board renderer: owns the canvas, the frame loop and all view-only state.
 *
 * It reads GameState to draw and consumes EngineEvent[] to animate. It never calls into
 * the engine's action functions and never mutates game state — the one-way dependency in
 * CLAUDE.md §3 is enforced by this file having no writes to `state`.
 */
import type { Coord, EngineEvent, GameState, Player, SpeciesId } from "../engine";
import { Layout } from "./layout";
import { RevealTracker } from "./reveal";
import { FxLayer } from "./fx";
import { animate } from "./animate";
import { basicLook, type Look } from "./art";
import { loadColors, setFactionColor } from "./palette";
import {
  drawBackground, drawSelection, drawTile, seedMotes, type Mote, type Scene,
} from "./board";

export interface RendererOptions {
  /** Species per side — sets the faction colours the whole UI inherits. */
  species: Record<Player, SpeciesId>;
  /** Cosmetic look per side. Defaults to each species' basic look. */
  looks?: Partial<Record<Player, Look>>;
  /** Notified for events the match screen turns into toasts / HUD updates. */
  onNotice?: (event: EngineEvent) => void;
}

export class BoardRenderer {
  readonly layout: Layout;
  private ctx: CanvasRenderingContext2D | null = null;
  private reveal = new RevealTracker();
  private fx = new FxLayer();
  private motes: Mote[] = [];
  private raf = 0;
  private startedAt = performance.now();
  private observer: ResizeObserver | null = null;
  private warnedOnce = false;
  /** Set when a resize was attempted against a zero-sized container; retried each frame. */
  private needsResize = true;

  private looks: Record<Player, Look>;
  private selection: Coord | null = null;
  private valid: readonly Coord[] = [];

  /** Set during the win-flood finale to hide every soldier count. */
  hideCounts = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private state: GameState,
    private opts: RendererOptions,
  ) {
    this.layout = new Layout(state.size);
    loadColors();
    setFactionColor("you", opts.species.you);
    setFactionColor("ai", opts.species.ai);
    this.looks = {
      you: opts.looks?.you ?? basicLook(opts.species.you),
      ai: opts.looks?.ai ?? basicLook(opts.species.ai),
    };
    this.motes = seedMotes(this.reveal.reduced);
  }

  /** Point the renderer at a new match without rebuilding the canvas. */
  reset(state: GameState, opts: RendererOptions): void {
    this.state = state;
    this.opts = opts;
    this.layout.size = state.size;
    setFactionColor("you", opts.species.you);
    setFactionColor("ai", opts.species.ai);
    this.looks = {
      you: opts.looks?.you ?? basicLook(opts.species.you),
      ai: opts.looks?.ai ?? basicLook(opts.species.ai),
    };
    this.reveal.clear();
    this.fx.clear();
    this.hideCounts = false;
    this.selection = null;
    this.valid = [];
    this.resize();
  }

  start(): void {
    if (this.raf) return;
    this.resize();
    const host = this.canvas.parentElement;
    if (host && typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(host);
    }
    const loop = (): void => {
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.observer?.disconnect();
    this.observer = null;
  }

  /**
   * Match the canvas to its container.
   *
   * A zero-sized container is ignored rather than measured. `measure` writes the size to
   * `canvas.style`, and an inline `width: 0px` outranks the stylesheet's `100%` — so
   * measuring too early (before first layout, or while the tab is not being composited)
   * would pin the board at zero and never recover, since the container's size never
   * changes afterwards and the observer never fires again. Instead we flag it and retry
   * on the next frame.
   */
  resize(): void {
    const host = this.canvas.parentElement;
    const w = host?.clientWidth ?? this.canvas.clientWidth;
    const h = host?.clientHeight ?? this.canvas.clientHeight;
    if (w < 1 || h < 1) { this.needsResize = true; return; }
    this.needsResize = false;
    this.ctx = this.layout.measure(this.canvas, w, h);
  }

  /** Dramatise one action's events. */
  consume(events: readonly EngineEvent[]): void {
    if (!events.length) return;
    animate(events, { reveal: this.reveal, fx: this.fx, onNotice: this.opts.onNotice });
  }

  setSelection(selection: Coord | null, valid: readonly Coord[] = []): void {
    this.selection = selection;
    this.valid = valid;
  }

  /** True while a reveal is still sweeping — the match screen waits before handing over. */
  get animating(): boolean {
    return this.reveal.animating;
  }

  /** Client (viewport) coordinates → board cell. */
  hit(clientX: number, clientY: number): Coord | null {
    const rect = this.canvas.getBoundingClientRect();
    return this.layout.hit(clientX - rect.left, clientY - rect.top);
  }

  private frame(): void {
    if (this.needsResize) this.resize();
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      this.reveal.step(performance.now());
      ctx.clearRect(0, 0, this.layout.width, this.layout.height);
      drawBackground(ctx, this.layout, this.motes, this.startedAt);

      const scene: Scene = {
        ctx,
        layout: this.layout,
        state: this.state,
        reveal: this.reveal,
        looks: this.looks,
        hideCounts: this.hideCounts,
        selection: this.selection,
        valid: this.valid,
        current: this.state.current,
      };

      for (const row of this.state.grid) for (const t of row) drawTile(scene, t);
      drawSelection(scene);
      this.fx.draw(ctx, this.layout);
    } catch (err) {
      // A bad frame must never kill the loop — recover on the next tick (e.g. mid-resize).
      if (!this.warnedOnce) {
        this.warnedOnce = true;
        console.warn("render skipped:", err instanceof Error ? err.message : err);
      }
    }
  }
}
