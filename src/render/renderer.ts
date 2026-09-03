/**
 * The board renderer: owns the canvas, the frame loop and all view-only state.
 *
 * It reads GameState to draw and consumes EngineEvent[] to animate. It never calls into
 * the engine's action functions and never mutates game state — the one-way dependency in
 * CLAUDE.md §3 is enforced by this file having no writes to `state`.
 */
import { allTiles, nestTile } from "../engine";
import type { Coord, EngineEvent, GameState, Player, SpeciesId, Tile } from "../engine";
import { Layout } from "./layout";
import { RevealTracker } from "./reveal";
import { FxLayer } from "./fx";
import { animate } from "./animate";
import { floodDuration, floodFade, planFlood, type Flood } from "./flood";
import {
  INTRO_FROM, drawSupply, drawSurround, introAt, introScale, introTotal, planIntro,
  supplyFade, type Frame, type Intro, type Supply,
} from "./intro";
import { basicLook, type Look } from "./art";
import { MAP, loadColors, ownerCol, setFactionColor } from "./palette";
import { drawPlates, rowsOf, type Plate } from "./plates";
import {
  drawBackground, drawFillets, drawFlood, drawSelection, drawSurge, drawTile, drawTileBevels,
  drawTrails, seedMotes,
  type Mote, type Scene,
} from "./board";

export interface RendererOptions {
  /** Species per side — sets the faction colours the whole UI inherits. */
  species: Record<Player, SpeciesId>;
  /** Cosmetic look per side. Defaults to each species' basic look. */
  looks?: Partial<Record<Player, Look>>;
  /**
   * Who is playing, drawn on the ground beside each side's own base (plates.ts). Omitted
   * for a board with nobody named — a test, or a scenario preview.
   */
  plates?: Partial<Record<Player, Plate>>;
  /** How a colony size is written. Passed in: the renderer reads no progression code. */
  colonySize?: (n: number) => string;
}

export class BoardRenderer {
  readonly layout: Layout;
  private ctx: CanvasRenderingContext2D | null = null;
  private reveal = new RevealTracker();
  /** The opening's supply lines: when they started, and how long the whole opening runs. */
  private supply: { start: number; dur: number } | null = null;
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
  /** The winner's wash over the board once the match is decided. */
  private flood: Flood | null = null;
  /** The camera coming down through the canopy at the start of a match. */
  private intro: Intro | null = null;
  /**
   * Where each colony STARTED, for the finale to wash out from.
   *
   * Taken while the board is still untouched. A match is usually won by capturing the
   * loser's nest, and by then the winner owns two — so the board itself can no longer say
   * which one was theirs.
   */
  private home: Partial<Record<Player, Coord>> = {};

  constructor(
    private canvas: HTMLCanvasElement,
    private state: GameState,
    private opts: RendererOptions,
  ) {
    this.layout = new Layout(state.size);
    loadColors();
    // THE LOOKS ARE SETTLED BEFORE THE PAINT, because a skin carries its own palette
    // (engine/skins.ts) and this repaint is the LAST one before the first frame — it used
    // to run on the bare species and quietly undo the colour the app had just set, so a
    // skinned colony wore its own nest shape in the base species' colour.
    this.looks = looksOf(opts);
    this.paint();
    this.motes = seedMotes(this.reveal.reduced);
    this.rememberHomes();
  }

  /** One repaint for both factions, taking each one's look with it. */
  private paint(): void {
    setFactionColor("you", this.opts.species.you, this.looks.you);
    setFactionColor("ai", this.opts.species.ai, this.looks.ai);
  }

  /** Point the renderer at a new match without rebuilding the canvas. */
  reset(state: GameState, opts: RendererOptions): void {
    this.state = state;
    this.layout.size = state.size;
    this.looks = looksOf(opts);
    this.paint();
    this.reveal.clear();
    this.fx.clear();
    this.hideCounts = false;
    this.flood = null;
    this.intro = null;
    this.selection = null;
    this.valid = [];
    this.rememberHomes();
    this.resize();
  }

  /** Snapshot both nests while the board is still the one the match started on. */
  private rememberHomes(): void {
    this.home = {};
    for (const p of ["you", "ai"] as const) {
      const nest = nestTile(this.state, p);
      if (nest) this.home[p] = { c: nest.c, r: nest.r };
    }
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
    animate(events, { reveal: this.reveal, fx: this.fx });
  }

  /**
   * THE OPENING: the camera drops through the canopy onto the map (intro.ts).
   *
   * Returns how long the caller should hold the turn for — the descent, and then the
   * colonies filling in from their nests, which `land()` starts when the camera arrives.
   */
  playIntro(): number {
    const intro = planIntro(performance.now(), this.reveal.reduced);
    this.intro = intro;
    // The supply lines run in from off the frame and reach the nests exactly as the camera
    // lands, then hold while the colonies unfold and go. They outlive `intro` by the fill,
    // which is why they carry their own clock.
    this.supply = { start: intro.start, dur: introTotal(intro) };
    // Scheduled NOW so the colonies are registered as unfilled from this frame, but with a
    // front that does not set off until the camera lands. Without that they sit finished on
    // the floor for the whole descent and then blink out to be revealed.
    this.growColonies(intro.start + intro.dur);
    return introTotal(intro);
  }

  /** True while the opening is still running, so a tap can cut it short. */
  get introducing(): boolean { return this.intro !== null; }

  /** Cut the opening short: the camera snaps home and the colonies fill in from here. */
  endIntro(): void {
    if (!this.intro) return;
    this.intro = null;
    // A player who skipped the opening asked for the board, not for the rest of the show.
    this.supply = null;
    this.reveal.clear();                 // the front was timed for a landing that never came
    this.growColonies(performance.now());
  }

  /**
   * The frame the camera can see at the TOP of the descent.
   *
   * Not the canvas: the opening is drawn inside a transform scaled about the board's
   * middle, so a line starting at the canvas edge would already be inside the picture on
   * the first frame and would appear to sprout rather than to arrive.
   */
  private introFrame(): Frame {
    const cx = this.layout.ox + (this.layout.size * this.layout.ts) / 2;
    const cy = this.layout.oy + (this.layout.size * this.layout.ts) / 2;
    const hw = this.layout.width / 2 / INTRO_FROM;
    const hh = this.layout.height / 2 / INTRO_FROM;
    return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
  }

  /** Where the nameplates are written, for the scenery to leave clear. */
  private plateBoxes(ctx: CanvasRenderingContext2D): { x: number; y: number; w: number; h: number }[] {
    if (!this.opts.plates) return [];
    return rowsOf(ctx, this.layout, this.opts.plates, this.opts.colonySize ?? String)
      .map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  }

  private drawSupplyLines(ctx: CanvasRenderingContext2D, now: number, descent: number): void {
    const supply = this.supply;
    if (!supply) return;
    const p = (now - supply.start) / supply.dur;
    if (p >= 1) { this.supply = null; return; }

    const lines: Supply[] = [];
    for (const who of ["you", "ai"] as const) {
      const nest = nestTile(this.state, who);
      if (nest) {
        lines.push({
          x: this.layout.cx(nest.c), y: this.layout.cy(nest.r), colour: ownerCol(who),
        });
      }
    }
    // Grown on the camera's OWN curve, so the front arrives at the nest on the frame the
    // camera locks and the colonies begin to grow. Once it has landed it simply stays put.
    const grow = descent < 1 ? descent : 1;
    // A trail on the board is a bar a fifth of a tile wide (board.ts). This is the same
    // trail, so it is the same width.
    const screen: Frame = { x0: 0, y0: 0, x1: this.layout.width, y1: this.layout.height };
    drawSupply(ctx, this.introFrame(), screen, lines, grow, supplyFade(p), this.layout.ts * 0.2);
  }

  /**
   * The two colonies grow out of their nests rather than being there already — the reveal
   * machinery is exactly the one a capture uses, run over the starting formation with each
   * tile's slot set by how far it sits from the nest.
   */
  private growColonies(at: number): void {
    for (const p of ["you", "ai"] as const) {
      const nest = nestTile(this.state, p);
      if (!nest) continue;
      const held = allTiles(this.state).filter((t) => t.owner === p);
      const slot = (t: Tile): number => Math.abs(t.c - nest.c) + Math.abs(t.r - nest.r);
      held.sort((a, b) => slot(a) - slot(b));
      this.reveal.begin(held.map((t) => ({
        at: { c: t.c, r: t.r },
        // Grow from the side facing the nest, so the colony unfolds outward from her.
        edge: Math.abs(t.c - nest.c) >= Math.abs(t.r - nest.r)
          ? (t.c >= nest.c ? "L" : "R")
          : (t.r >= nest.r ? "U" : "D"),
        prev: null,
        slot: slot(t),
      })), at);
    }
  }

  /**
   * THE FINALE: the winner consumes the whole board (flood.ts).
   *
   * Returns how long the caller should wait before showing the result card. Nothing here
   * touches the game state — the card still reports the position the match ended in.
   */
  floodWin(winner: Player): number {
    this.hideCounts = true;
    this.selection = null;
    this.valid = [];
    this.flood = planFlood(
      this.state, winner, performance.now(), this.reveal.reduced, this.home[winner] ?? null,
    );
    return floodDuration(this.flood);
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
      const now = performance.now();
      this.reveal.step(now);
      ctx.clearRect(0, 0, this.layout.width, this.layout.height);

      // The opening is a camera: one transform around the whole frame, and the canopy over
      // the top of it. The board underneath is drawn exactly as it always is.
      const descent = this.intro ? introAt(this.intro, now) : 1;
      if (descent >= 1) this.intro = null;
      if (descent < 1) {
        // The floor runs to every edge, so the frame outside the shrunken board is soil and
        // not void — at this height the board does not fill the screen.
        ctx.fillStyle = MAP.groundDark;
        ctx.fillRect(0, 0, this.layout.width, this.layout.height);
        const s = introScale(descent);
        const cx = this.layout.ox + (this.layout.size * this.layout.ts) / 2;
        const cy = this.layout.oy + (this.layout.size * this.layout.ts) / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.translate(-cx, -cy);
      }

      // The scenery is baked around the names as well as around the board: a fern grown
      // where a name is written reads as clutter over the text. Measured here rather than
      // guessed, so only the props that actually overlap are dropped.
      drawBackground(ctx, this.layout, this.motes, this.startedAt, this.plateBoxes(ctx));
      // UNDER the tiles: a colony's nest sits ON the end of its line, which is what makes
      // the five tiles in the corner read as connected to something past the clearing.
      this.drawSupplyLines(ctx, now, descent);

      const scene: Scene = {
        ctx,
        layout: this.layout,
        state: this.state,
        reveal: this.reveal,
        looks: this.looks,
        hideCounts: this.hideCounts,
        flood: this.flood,
        selection: this.selection,
        valid: this.valid,
        current: this.state.current,
      };

      // Two passes: every tile's solid under-band first, then every tile face on top, so a
      // colony reads as one slab instead of a grid of separately-shadowed squares.
      drawTileBevels(scene);
      for (const row of this.state.grid) for (const t of row) drawTile(scene, t);
      drawFillets(scene);
      // The colonies' own markings dissolve as the wash starts — a dashed border stroked
      // half outside a flooded cell would otherwise be left showing at its edge.
      const fade = this.flood ? floodFade(this.flood, performance.now()) : 1;
      if (fade > 0) {
        ctx.save();
        ctx.globalAlpha = fade;
        drawSurge(scene);
        drawTrails(scene);
        drawSelection(scene);
        ctx.restore();
      }
      // On the ground beside each base, and BEFORE the wash: "consumed" takes the whole
      // board, and a name left standing on flooded ground would be the one thing the
      // winner's colour did not reach.
      if (this.opts.plates) {
        drawPlates(ctx, this.layout, this.opts.plates,
          this.opts.colonySize ?? String, this.looks, this.flood ? fade : 1);
      }

      // Last, and over everything: "consumed" means the veins, the garrisons, the Hive, the
      // gem seams and the rocks all go under it.
      drawFlood(scene);

      // The undergrowth around the clearing is drawn INSIDE the camera: it is on the ground,
      // so it slides off the edges as the board grows rather than sitting over it.
      if (descent < 1) {
        drawSurround(ctx, this.layout.width, this.layout.height, descent);
        ctx.restore();
      }
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

/** Both sides' looks, defaulting to the basic one — which is what an opponent always is. */
function looksOf(opts: RendererOptions): Record<Player, Look> {
  return {
    you: opts.looks?.you ?? basicLook(opts.species.you),
    ai: opts.looks?.ai ?? basicLook(opts.species.ai),
  };
}
