/**
 * The deck: the five main screens as one strip the player drags between.
 *
 * This is NOT a scroll container. Native scroll-snap looked right until a screen with a
 * scrolling panel in it was under the finger: the panel claimed the gesture and the deck
 * stopped moving entirely, and `touch-action` cannot fix that — it is computed down the
 * whole hit-test chain, so allowing the panel to pan vertically also forbids the ancestor
 * from panning sideways. Owning the gesture is the only way to have both.
 *
 * So the rail is a transform, and a drag is claimed only once it is clearly horizontal.
 * Until then the touch belongs to whatever is under it, which is what keeps a long list
 * scrolling normally. `touch-action: pan-y` on the rail says exactly that to the browser:
 * vertical is yours, horizontal is mine.
 */

/** How far a drag must run before it is a swipe rather than a tap or a scroll. */
const AXIS_LOCK = 10;
/** Past this fraction of the screen, the finger has committed to the next screen. */
const COMMIT = 0.22;
/** ...or past this speed, in pixels per millisecond, however short the drag was. */
const FLICK = 0.45;
/** Resistance when dragging past either end, where there is nothing to show. */
const RUBBER = 0.35;
/**
 * How far a claimed gesture may have travelled and still be a TAP the deck stole.
 *
 * Well under COMMIT: past this the finger was going somewhere, even if it did not get far
 * enough to turn the page.
 */
const TAP_SLOP = 24;

export class Deck<T extends string> {
  readonly el: HTMLElement;
  private rail: HTMLElement;
  private slots = new Map<T, HTMLElement>();
  private index = 0;

  /** Drag state. `axis` is null until the gesture commits to one. */
  private startX = 0;
  private startY = 0;
  private startAt = 0;
  private axis: "x" | "y" | null = null;
  private pointer: number | null = null;
  /** What the finger came down on, so a stolen tap can be given back to it. */
  private downOn: Element | null = null;

  constructor(
    private ids: readonly T[],
    private build: (id: T) => HTMLElement,
    /** Fired when a screen becomes the one on show, however it got there. */
    private onArrive: (id: T) => void,
  ) {
    this.el = document.createElement("div");
    this.el.className = "deck";
    this.el.id = "deck";

    this.rail = document.createElement("div");
    this.rail.className = "deckrail";
    this.el.appendChild(this.rail);

    for (const id of ids) {
      const slot = document.createElement("div");
      slot.className = "slide";
      slot.dataset.slide = id;
      slot.appendChild(build(id));
      this.slots.set(id, slot);
      this.rail.appendChild(slot);
    }

    // Touch is handled alongside the pointer events, for one reason: `preventDefault` on a
    // non-passive touchmove is the only thing that stops the browser taking a horizontal
    // gesture for itself. `touch-action: pan-y` was not enough — Chromium still claimed a
    // swipe that began near the left edge, cancelled our pointer stream mid-drag, and
    // navigated the whole app away to a blank page.
    this.el.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.el.addEventListener("pointerdown", this.onDown);
    this.el.addEventListener("pointermove", this.onMove);
    this.el.addEventListener("pointerup", this.onUp);
    this.el.addEventListener("pointercancel", this.onCancel);
    window.addEventListener("resize", () => { this.measure(); this.place(false); });
    this.measure();
    this.place(false);
  }

  get at(): T { return this.ids[this.index] as T; }
  get hidden(): boolean { return this.el.classList.contains("hidden"); }
  set hidden(v: boolean) { this.el.classList.toggle("hidden", v); }

  /** Move to a screen. `animate` false is for arriving from somewhere else entirely. */
  goTo(id: T, animate: boolean): void {
    const next = this.ids.indexOf(id);
    if (next < 0) return;
    const changed = next !== this.index;
    this.index = next;
    this.place(animate);
    if (changed || !animate) this.arrive();
  }

  /** Rebuild one screen in place — they read the profile, which changes under them. */
  refresh(id: T): void {
    this.slots.get(id)?.replaceChildren(this.build(id));
  }

  private arrive(): void {
    this.refresh(this.at);
    this.onArrive(this.at);
  }

  /**
   * ONE WHOLE-PIXEL STEP, used for the slide's width AND for the rail's travel.
   *
   * It used to be a percentage — five slides of 20% inside a rail of 500% — while the rail
   * was moved by `clientWidth`, a whole number. On a viewport that is not a whole number of
   * pixels those two disagree by a fraction and the screen next door shows as a sliver down
   * the edge.
   *
   * Sizing the slides in that same fraction did not fix it, it moved the sliver to the
   * other side: the browser LAYS OUT a flex item at a rounded position, so the slides drift
   * left of an exact fractional multiple while the transform does not. The only way the two
   * can agree is for neither to carry a fraction — and the step rounds UP, so the slide on
   * show is always at least as wide as the viewport rather than half a pixel short of it.
   * The overhang falls outside the deck, which clips.
   */
  private step = 0;

  private measure(): void {
    const rect = this.el.getBoundingClientRect().width || window.innerWidth || 1;
    this.step = Math.ceil(rect);
    this.rail.style.width = `${this.ids.length * this.step}px`;
    for (const slot of this.slots.values()) slot.style.width = `${this.step}px`;
  }

  private width(): number {
    return this.step || Math.ceil(this.el.getBoundingClientRect().width) || window.innerWidth || 1;
  }

  /** Put the rail where the current index says, plus any drag in progress. */
  private place(animate: boolean, drag = 0): void {
    this.rail.style.transition = animate ? "transform .34s cubic-bezier(.22,.61,.36,1)" : "none";
    this.rail.style.transform = `translate3d(${-this.index * this.width() + drag}px,0,0)`;
  }

  /* ------------------------------------------------------------------- GESTURE */

  private onDown = (e: PointerEvent): void => {
    // A second finger mid-drag would fight the first.
    if (this.pointer !== null) return;
    this.pointer = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startAt = e.timeStamp;
    this.axis = null;
    this.downOn = e.target instanceof Element ? e.target : null;
  };

  private onTouchMove = (e: TouchEvent): void => {
    const t = e.touches[0];
    if (!t || this.pointer === null) return;
    this.lock(t.clientX - this.startX, t.clientY - this.startY);
    if (this.axis === "x") e.preventDefault();
  };

  /** Decide, once, whether this gesture is the deck's or the list's underneath. */
  private lock(dx: number, dy: number): void {
    if (this.axis !== null) return;
    if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
    this.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
  }

  private onMove = (e: PointerEvent): void => {
    if (this.pointer !== e.pointerId) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;

    // Nothing is claimed until the gesture has a direction. A tap never gets this far, and
    // a vertical drag is handed to the list under the finger.
    const had = this.axis;
    this.lock(dx, dy);
    if (this.axis !== "x") return;
    // Capture keeps the drag alive when the finger leaves the element. It can be refused
    // (a pointer the browser has already taken back), and that must not kill the drag.
    if (had === null) { try { this.el.setPointerCapture(e.pointerId); } catch { /* fine */ } }

    this.place(false, this.resist(dx));
  };

  private onUp = (e: PointerEvent): void => {
    if (this.pointer !== e.pointerId) return;
    this.pointer = null;
    const on = this.downOn;
    this.downOn = null;
    if (this.axis !== "x") { this.axis = null; return; }
    this.axis = null;

    const dx = e.clientX - this.startX;
    const elapsed = Math.max(1, e.timeStamp - this.startAt);
    const speed = Math.abs(dx) / elapsed;
    const far = Math.abs(dx) > this.width() * COMMIT;
    const flick = speed > FLICK && Math.abs(dx) > AXIS_LOCK * 2;

    let next = this.index;
    if (far || flick) next = dx < 0 ? this.index + 1 : this.index - 1;
    next = Math.max(0, Math.min(this.ids.length - 1, next));

    const changed = next !== this.index;
    this.index = next;
    this.place(true);
    if (changed) { this.arrive(); return; }
    this.giveBackTheTap(on, dx);
  };

  /**
   * A TAP THE DECK STOLE.
   *
   * A finger on a phone is not a mouse: it wobbles. Ten pixels of sideways drift on the
   * way down and the deck claims the gesture — and claiming it is what kills the tap,
   * twice over. `preventDefault` on the touchmove tells the browser not to synthesise the
   * click at all, and the pointer capture that keeps a real drag alive retargets the rest
   * of the sequence away from whatever was under the finger. So the rail nudges a few
   * pixels, snaps back, and the button the player pressed never hears about it.
   *
   * From the outside that is a dead button, and it is every button on all five deck
   * screens — which is exactly how it was reported: "I hit Play and nothing happens".
   *
   * So when a claimed gesture ends without turning the page and went nowhere at all, it was
   * a tap: hand it back to what it landed on.
   *
   * DISTANCE decides it, not speed. Speed was the first guard and it was wrong: a quick,
   * decisive press wobbles just as far as a slow one and covers the ground in a few
   * milliseconds, which reads as a flick — so the fastest taps, the confident ones, were
   * exactly the ones still being eaten. Under the slop nothing else can happen anyway; the
   * real choice is between pressing what the finger was on and doing nothing at all, and
   * doing nothing is the bug.
   */
  private giveBackTheTap(on: Element | null, dx: number): void {
    if (!on || !on.isConnected) return;              // the screen was rebuilt under it
    if (Math.abs(dx) > TAP_SLOP) return;
    on.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }

  /**
   * The browser took the gesture over — a swipe that starts within its edge-back region
   * does this. The event carries no useful position (Chromium reports 0), so treating it
   * as a finished drag read as a full-width swipe in the wrong direction and jumped a
   * screen. Nothing has happened: put the rail back where it was.
   */
  private onCancel = (e: PointerEvent): void => {
    if (this.pointer !== e.pointerId) return;
    this.pointer = null;
    this.axis = null;
    this.downOn = null;
    this.place(true);
  };

  /** Dragging past the first or last screen pulls back, so the end is felt. */
  private resist(dx: number): number {
    const first = this.index === 0 && dx > 0;
    const last = this.index === this.ids.length - 1 && dx < 0;
    return first || last ? dx * RUBBER : dx;
  }
}
