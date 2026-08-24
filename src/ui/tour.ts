/**
 * The guided tour: one thing lit, everything else dark, and a line explaining why.
 *
 * A new player lands on a home screen with three currencies, five tabs, two floating
 * buttons and a Play button, then on a board of 49 tiles with four actions under it. The
 * tour walks them through it by taking everything else away: four dark panels cover the
 * screen with a hole cut around the ONE thing that matters, so the only tap that can land
 * is the one being taught. Nothing else needs disabling — a panel swallows the tap before
 * it reaches whatever is underneath.
 *
 * A step ends in one of three ways: the player taps the lit thing (`tap`), reads and
 * presses Next (`next`), or does something the app confirms afterwards (`signal`) — that
 * last one is what lets a match step wait for a move to actually resolve rather than for
 * the tap that started it.
 *
 * The overlay re-measures on a timer rather than being told when to move. Screens rebuild
 * on entry, the board resizes with the window, and a step can be waiting for an element
 * that does not exist yet — polling handles all three without every screen having to know
 * the tour exists.
 */

/** Where a step's spotlight goes, in viewport coordinates. */
export interface SpotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TourStep {
  /** Stable name. `signal` steps are completed by it, and tests read it. */
  id: string;
  title?: string;
  text: string;
  /**
   * The element to leave lit. Resolved on every measure, so a step may be declared before
   * its screen exists — the tour simply waits, dark, until it appears.
   */
  find?: () => Element | null | undefined;
  /** A spotlight that is not an element: a board cell, say. Takes precedence over `find`. */
  rect?: () => SpotRect | null;
  /** How the step ends. Defaults to "next". */
  advance?: "next" | "tap" | "signal";
  /** Extra room around the hole, in pixels. */
  pad?: number;
  /** Label on the button of a `next` step. */
  button?: string;
  /** Corner radius of the ring. An element target supplies its own; this overrides it. */
  radius?: string;
  /**
   * Run as the step opens — the app uses it to bring the right screen up. It fires BEFORE
   * the first measure, and `find` is polled anyway, so a screen that takes a moment to
   * arrive (a deck sliding to it) is fine.
   */
  enter?: () => void;
  /**
   * Show the lit thing but keep it inert. Some steps are "look at this screen" rather than
   * "press this": the screen has to be VISIBLE, which a hole gives, but a tap on it would
   * navigate out from under the tour. A pane of glass over the hole solves both.
   */
  block?: boolean;
}

export interface TourOptions {
  /** Every step was finished. */
  onDone?: () => void;
  /** The player pressed Skip. */
  onSkip?: () => void;
  /** Fired as each step opens, so the app can pause a clock or arm a listener. */
  onStep?: (step: TourStep, index: number) => void;
}

/** How often the spotlight re-measures. Fast enough to track a screen change, cheap. */
const MEASURE_MS = 90;
/** Default breathing room around the lit thing. */
const PAD = 6;
/** Gap between the hole and the bubble. */
const BUBBLE_GAP = 12;
const EDGE = 12;

export class Tour {
  private steps: readonly TourStep[] = [];
  private index = 0;
  private wrap: HTMLElement | null = null;
  private shades: HTMLElement[] = [];
  private ring: HTMLElement | null = null;
  private glass: HTMLElement | null = null;
  private bubble: HTMLElement | null = null;
  private timer: number | null = null;
  private opts: TourOptions = {};
  /** The hole as last measured, so a tap can be tested against it. */
  private hole: SpotRect | null = null;
  /** True once the current step's target has been found at least once. */
  private lit = false;
  /** The element the hole is currently around, so the ring can borrow its shape. */
  private node: Element | null = null;

  constructor(private host: HTMLElement) {}

  get running(): boolean { return this.wrap !== null; }
  get step(): TourStep | null { return this.steps[this.index] ?? null; }

  start(steps: readonly TourStep[], opts: TourOptions = {}): void {
    this.stop();
    if (!steps.length) { opts.onDone?.(); return; }
    this.steps = steps;
    this.opts = opts;
    this.index = 0;
    this.build();
    window.addEventListener("pointerdown", this.onPointerDown, true);
    this.timer = window.setInterval(() => this.measure(), MEASURE_MS);
    this.open();
  }

  /**
   * The deed named by a `signal` step is done. Ignored when a different step is showing,
   * so the app can report freely without tracking where the tour is.
   */
  signal(id: string): void {
    const step = this.step;
    if (!step || step.id !== id || step.advance !== "signal") return;
    this.next();
  }

  /** Skip from here: the tour ends and the player is left where they are. */
  skip(): void {
    const cb = this.opts.onSkip;
    this.stop();
    cb?.();
  }

  stop(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    window.removeEventListener("pointerdown", this.onPointerDown, true);
    this.wrap?.remove();
    this.wrap = null;
    this.shades = [];
    this.ring = null;
    this.glass = null;
    this.bubble = null;
    this.hole = null;
    this.steps = [];
  }

  /* ------------------------------------------------------------------ INTERNALS */

  private next(): void {
    if (!this.running) return;
    if (this.index >= this.steps.length - 1) {
      const cb = this.opts.onDone;
      this.stop();
      cb?.();
      return;
    }
    this.index++;
    this.open();
  }

  private open(): void {
    const step = this.step;
    if (!step) return;
    this.lit = false;
    this.hole = null;
    this.node = null;
    step.enter?.();
    this.paint(step);
    this.measure();
    this.opts.onStep?.(step, this.index);
  }

  private build(): void {
    const wrap = document.createElement("div");
    wrap.className = "tourwrap";
    wrap.id = "tour";
    // Four panels rather than one with a hole punched in it: a hole made with a shadow or
    // a clip path still captures the tap that lands in it, and the whole point is that the
    // one lit control stays live.
    this.shades = ["t", "b", "l", "r"].map((side) => {
      const s = document.createElement("div");
      s.className = "tourshade tourshade-" + side;
      wrap.appendChild(s);
      return s;
    });

    const glass = document.createElement("div");
    glass.className = "tourglass";
    wrap.appendChild(glass);
    this.glass = glass;

    const ring = document.createElement("div");
    ring.className = "tourring";
    wrap.appendChild(ring);
    this.ring = ring;

    const bubble = document.createElement("div");
    bubble.className = "tourbubble";
    wrap.appendChild(bubble);
    this.bubble = bubble;

    this.host.appendChild(wrap);
    this.wrap = wrap;
  }

  /** Fill the bubble for a step. Re-run per step, not per measure. */
  private paint(step: TourStep): void {
    const bubble = this.bubble;
    if (!bubble) return;
    bubble.replaceChildren();

    if (step.title) {
      const h = document.createElement("div");
      h.className = "tourttl";
      h.textContent = step.title;
      bubble.appendChild(h);
    }
    const p = document.createElement("div");
    p.className = "tourtxt";
    p.textContent = step.text;
    bubble.appendChild(p);

    const row = document.createElement("div");
    row.className = "tourrow";

    const count = document.createElement("span");
    count.className = "tourcount";
    count.textContent = `${this.index + 1} / ${this.steps.length}`;
    row.appendChild(count);

    const right = document.createElement("div");
    right.className = "tourbtns";

    // Every step carries the way out. A player who already knows the game should never
    // have to walk the whole thing to get to a match.
    const skip = document.createElement("button");
    skip.className = "tourskip";
    skip.id = "tourSkip";
    skip.textContent = "Skip tutorial";
    skip.onclick = () => this.skip();
    right.appendChild(skip);

    if ((step.advance ?? "next") === "next") {
      const btn = document.createElement("button");
      btn.className = "tournext";
      btn.id = "tourNext";
      btn.textContent = step.button ?? "Got it";
      btn.onclick = () => this.next();
      right.appendChild(btn);
    }

    row.appendChild(right);
    bubble.appendChild(row);
  }

  /** A tap inside the hole is the tap the step was waiting for. */
  private onPointerDown = (e: PointerEvent): void => {
    const step = this.step;
    if (!step || (step.advance ?? "next") !== "tap" || !this.hole) return;
    if (!inside(this.hole, e.clientX, e.clientY)) return;
    // The app's own handler has not run yet — it is behind this one in the capture phase,
    // and it may navigate. Advancing on the next tick lets the tap do its job first, which
    // means the tour may have moved on by the time this runs: the last meta step starts a
    // match, and the match starts a tour of its own. Only advance the step that was tapped.
    const tapped = step.id;
    window.setTimeout(() => { if (this.step?.id === tapped) this.next(); }, 0);
  };

  /**
   * Put the hole where the step's target is now.
   *
   * A missing target is not a failure: the screen may still be building. The overlay goes
   * fully dark and the bubble waits in the middle until it turns up.
   */
  private measure(): void {
    const step = this.step;
    if (!step || !this.wrap) return;

    const spot = this.spotOf(step);
    this.hole = spot;
    if (spot) this.lit = true;

    const w = window.innerWidth, h = window.innerHeight;
    const [top, bottom, left, right] = this.shades as [
      HTMLElement, HTMLElement, HTMLElement, HTMLElement,
    ];

    if (!spot) {
      // No hole: one panel covers everything, the other three collapse.
      box(top, 0, 0, w, h);
      box(bottom, 0, h, w, 0);
      box(left, 0, h, 0, 0);
      box(right, w, h, 0, 0);
      if (this.ring) this.ring.style.opacity = "0";
      if (this.glass) box(this.glass, 0, 0, 0, 0);
    } else {
      box(top, 0, 0, w, Math.max(0, spot.top));
      box(bottom, 0, spot.top + spot.height, w, Math.max(0, h - spot.top - spot.height));
      box(left, 0, spot.top, Math.max(0, spot.left), spot.height);
      box(right, spot.left + spot.width, spot.top, Math.max(0, w - spot.left - spot.width), spot.height);
      if (this.ring) {
        this.ring.style.opacity = "1";
        // A ring drawn square around a pill button reads as a second, wrong-shaped button.
        // The target's own corner is the right one; a cell target falls back to the sheet's.
        this.ring.style.borderRadius = step.radius ?? radiusOf(this.node) ?? "";
        box(this.ring, spot.left, spot.top, spot.width, spot.height);
      }
      if (this.glass) {
        if (step.block) box(this.glass, spot.left, spot.top, spot.width, spot.height);
        else box(this.glass, 0, 0, 0, 0);
      }
    }
    this.placeBubble(spot, w, h);
  }

  /** Where the bubble sits: under the hole if it fits, over it if not, centred otherwise. */
  private placeBubble(spot: SpotRect | null, w: number, h: number): void {
    const bubble = this.bubble;
    if (!bubble) return;
    const bw = bubble.offsetWidth || Math.min(320, w - EDGE * 2);
    const bh = bubble.offsetHeight || 120;

    if (!spot) {
      bubble.style.left = Math.round((w - bw) / 2) + "px";
      bubble.style.top = Math.round((h - bh) / 2) + "px";
      return;
    }

    const below = spot.top + spot.height + BUBBLE_GAP;
    const above = spot.top - BUBBLE_GAP - bh;
    const top = below + bh + EDGE <= h ? below : above >= EDGE ? above : Math.max(EDGE, (h - bh) / 2);
    const wanted = spot.left + spot.width / 2 - bw / 2;
    const left = Math.min(Math.max(EDGE, wanted), Math.max(EDGE, w - bw - EDGE));
    bubble.style.left = Math.round(left) + "px";
    bubble.style.top = Math.round(top) + "px";
  }

  private spotOf(step: TourStep): SpotRect | null {
    const pad = step.pad ?? PAD;
    if (step.rect) {
      const r = step.rect();
      return r ? grow(r, pad) : null;
    }
    if (!step.find) { this.node = null; return null; }
    const target = step.find();
    this.node = target ?? null;
    if (!target) return null;
    const r = target.getBoundingClientRect();
    // jsdom, and an element still laid out at nothing, both measure zero. Treat that as
    // "not ready" rather than lighting a hole nobody can see or tap.
    if (r.width <= 0 || r.height <= 0) return this.lit ? this.hole : null;
    return grow({ left: r.left, top: r.top, width: r.width, height: r.height }, pad);
  }
}

/**
 * The target's own corner radius, grown a little so the ring sits OUTSIDE the shape rather
 * than cutting across it. A radius given in percent belongs to the element's own box and
 * means something else on the ring, so those fall through to the stylesheet's.
 */
const radiusOf = (node: Element | null): string | null => {
  if (!node || typeof getComputedStyle !== "function") return null;
  const r = getComputedStyle(node).borderRadius;
  if (!r || r === "0px" || r.includes("%")) return null;
  const px = parseFloat(r);
  return Number.isFinite(px) ? Math.round(px + PAD) + "px" : null;
};

const grow = (r: SpotRect, pad: number): SpotRect => ({
  left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2,
});

const inside = (r: SpotRect, x: number, y: number): boolean =>
  x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;

const box = (node: HTMLElement, x: number, y: number, w: number, h: number): void => {
  node.style.left = Math.round(x) + "px";
  node.style.top = Math.round(y) + "px";
  node.style.width = Math.max(0, Math.round(w)) + "px";
  node.style.height = Math.max(0, Math.round(h)) + "px";
};
