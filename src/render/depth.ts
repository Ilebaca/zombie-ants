/**
 * TILT-SHIFT — the clearing is what is in focus, and the forest is not.
 *
 * A photographic depth of field: a band across the middle is sharp, and everything above
 * and below it goes progressively soft. It is the one effect that makes a flat top-down
 * board read as a real place being photographed rather than a diagram, and it costs the
 * game nothing — it is drawn OVER the finished frame and never touches the board, the
 * layout or a hit test, exactly as the opening camera and the winning flood do.
 *
 * THE BLUR IS A DOWNSCALE, NOT A FILTER. `ctx.filter = "blur()"` is the obvious way and
 * it is the wrong one here: it arrived in Safari only in 17, so on an older iPhone the
 * effect would silently not happen, and a full-canvas gaussian every frame on a mid-range
 * phone is the most expensive thing on the frame. Drawing the scene into a canvas an
 * eighth the size and blowing it back up IS a blur — the browser's own bilinear filter
 * does it, in hardware, on 1.5% of the pixels — and it works everywhere.
 *
 * THE MASK IS APPLIED SMALL TOO. The gradient that decides how much of the soft copy
 * shows is a smooth ramp, so it loses nothing by being drawn at the same scale and blown
 * up with it.
 *
 * AND THE BLUR IS READ OFF THE SCREEN ITSELF. The first version drew the whole frame into
 * an offscreen copy and blitted it back, which doubled the frame: measured at 16.7 ms
 * without and 39.1 ms with, on a 13x13 board. There is no need for the copy — the finished
 * frame is already on the canvas, so the small canvas takes ITS pixels. What is left is
 * one read down to a thumbnail and one write back over the two bands that are actually
 * soft; the sharp middle is never touched, and on the biggest map that is most of the
 * canvas skipped.
 *
 * THE SHARP BAND IS THE BOARD, not a fraction of the screen. A 7x7 map and a 13x13 map
 * fill very different amounts of the canvas, so a fixed "middle third" would blur half the
 * playfield on one and none of the scenery on the other. It is measured off the board's
 * own rectangle, which is also what stops the effect hiding a garrison count — the numbers
 * a player counts out before committing must stay legible (CLAUDE.md 4.1).
 */

/** How far past the board's own edge the sharp band runs, as a fraction of the board. */
const SHARP_MARGIN = 0.04;
/** The ramp from sharp to soft, as a fraction of the board's height. */
const FEATHER = 0.30;
/** The most of the soft copy that is ever shown. 1 would be fully out of focus. */
const MAX = 0.9;
/** The blur: the scene is drawn this small and blown back up. */
const SCALE = 0.11;
/**
 * A few degrees off level.
 *
 * The plane of focus in a real photograph is almost never square to the frame, and a
 * horizontal band on a square board reads as a UI element rather than as a lens. Small on
 * purpose: past about five degrees it stops being a camera and starts being a wipe.
 */
const TILT = 0.055;

/** One end of the gradient: an offset along it, and how soft it is there. */
export interface Stop { at: number; soft: number }

/**
 * Where the ramp turns over, in canvas fractions.
 *
 * Pure, so the geometry can be tested without a canvas: `top` and `bottom` are the board's
 * edges in the same units as `height`. The stops run down the gradient's own axis, which
 * passes through the middle of the canvas — the board is centred there, so the band is
 * measured from the thing it is about.
 */
export function bandStops(top: number, bottom: number, height: number): Stop[] {
  if (!(height > 0) || !(bottom > top)) return [{ at: 0, soft: 0 }, { at: 1, soft: 0 }];
  const board = bottom - top;
  const margin = board * SHARP_MARGIN;
  const feather = board * FEATHER;
  const sharpTop = top - margin;
  const sharpBottom = bottom + margin;
  const clamp = (v: number): number => Math.min(1, Math.max(0, v / height));
  // A feather that would run past the canvas edge is simply cut off there — a band that
  // reaches the edge still ramping — which is why the offsets are clamped rather than
  // scaled: a board taller than the canvas should stay sharp, not be squeezed into focus.
  const stops: Stop[] = [
    { at: 0, soft: MAX },
    { at: clamp(sharpTop - feather), soft: MAX },
    { at: clamp(sharpTop), soft: 0 },
    { at: clamp(sharpBottom), soft: 0 },
    { at: clamp(sharpBottom + feather), soft: MAX },
    { at: 1, soft: MAX },
  ];
  // A gradient refuses a stop that goes backwards, and rounding can put two on the same
  // offset; nudging keeps the sequence strictly increasing without moving anything visibly.
  // Clamping can push two stops onto the same offset (a board that fills the canvas puts
  // three at zero), which is a legal gradient and the right picture: no ramp, because
  // there is no room outside the board for one. What must never happen is an offset that
  // goes BACKWARDS, which reverses the blend either side of it.
  let last = 0;
  for (const stop of stops) {
    stop.at = last = Math.max(last, stop.at);
  }
  return stops;
}

/**
 * The one scratch canvas the effect needs, and the compositing.
 *
 * `compose` is called with the frame already finished on screen and paints the soft bands
 * over it. On a platform with no offscreen canvas — a node test, jsdom, a worker — it is a
 * no-op and the board simply has no depth of field: never a broken frame. That is the same
 * rule the scenery bake follows.
 */
export class TiltShift {
  private soft: HTMLCanvasElement | null = null;
  private softCtx: CanvasRenderingContext2D | null = null;
  /** Off once a canvas has refused us, so a dead platform is asked exactly once. */
  private usable = true;

  /**
   * Paint the soft bands over the finished frame.
   *
   * `canvas` is the one `ctx` belongs to — the source of the blur, since the picture to
   * blur is the one already drawn. `top` and `bottom` are the board's edges in CSS pixels.
   */
  compose(
    ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
    width: number, height: number, top: number, bottom: number,
  ): void {
    if (!this.usable || !(width > 0) || !(height > 0)) return;
    const dw = canvas.width, dh = canvas.height;
    if (dw < 2 || dh < 2) return;

    const soft = this.sized(dw, dh);
    const softCtx = this.softCtx;
    if (!soft || !softCtx) return;

    // THE SOFT COPY. Drawing the finished frame into a canvas a ninth the size IS the
    // blur; `imageSmoothingQuality` is what makes the browser average the pixels it drops
    // rather than picking one of them, which is the difference between a blur and a
    // mosaic — so this is the one draw here that is worth the quality.
    softCtx.setTransform(1, 0, 0, 1, 0, 0);
    softCtx.globalCompositeOperation = "source-over";
    softCtx.imageSmoothingEnabled = true;
    softCtx.imageSmoothingQuality = "high";
    softCtx.clearRect(0, 0, soft.width, soft.height);
    softCtx.drawImage(canvas, 0, 0, soft.width, soft.height);

    // THE MASK, at the same small size. `destination-in` keeps the soft copy only where
    // the gradient is opaque, so what is left is the out-of-focus part and nothing else.
    // The whole thing is rotated a few degrees about the middle, which is the tilt: the
    // gradient itself stays a plain vertical one, so the stops are exact in its own frame
    // rather than being a projection somebody has to reason about.
    const k = soft.height / height;
    const stops = bandStops(top * k, bottom * k, soft.height);
    softCtx.globalCompositeOperation = "destination-in";
    softCtx.save();
    softCtx.translate(soft.width / 2, soft.height / 2);
    softCtx.rotate(TILT);
    softCtx.translate(-soft.width / 2, -soft.height / 2);
    const grad = softCtx.createLinearGradient(0, 0, 0, soft.height);
    for (const stop of stops) grad.addColorStop(stop.at, `rgba(0,0,0,${stop.soft})`);
    softCtx.fillStyle = grad;
    // Oversized, because a rotated rect leaves the corners of the upright canvas uncovered
    // — and an uncovered corner is a hard square of perfectly sharp forest.
    softCtx.fillRect(-soft.width, -soft.height, soft.width * 3, soft.height * 3);
    softCtx.restore();
    softCtx.globalCompositeOperation = "source-over";

    // BACK ONTO THE SCREEN, over the two bands only. Everything between them is masked to
    // nothing, so painting it would be a full-canvas blend that changes no pixel. Device
    // pixels, so the visible canvas's own dpr transform does not resample it a second time.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    // Bilinear is enough coming back UP: the source is a ninth of the size, so it carries
    // no detail for a better filter to preserve, and this draw is the expensive one.
    ctx.imageSmoothingQuality = "low";
    for (const band of softBands(stops, soft.height, TILT, soft.width)) {
      const sy = band.from;
      const sh = band.to - band.from;
      if (sh <= 0) continue;
      ctx.drawImage(soft, 0, sy, soft.width, sh, 0, (sy / k) * (dh / height),
        dw, (sh / k) * (dh / height));
    }
    ctx.restore();
  }

  /** The scratch canvas, made on first use and resized only when the frame changes. */
  private sized(dw: number, dh: number): HTMLCanvasElement | null {
    if (!this.soft) {
      const made = make();
      if (!made) { this.usable = false; return null; }
      this.soft = made.canvas;
      this.softCtx = made.ctx;
    }
    const w = Math.max(2, Math.round(dw * SCALE));
    const h = Math.max(2, Math.round(dh * SCALE));
    if (this.soft.width !== w || this.soft.height !== h) {
      this.soft.width = w;
      this.soft.height = h;
    }
    return this.soft;
  }
}

/**
 * The rows of the small canvas that are not fully transparent.
 *
 * Two of them — above the plane of focus and below it — and everything between is masked
 * to nothing, so drawing it back is a full-canvas blend that cannot change a pixel. The
 * tilt slants the boundary, so each band is widened by how far the rotation carries it:
 * half the width times the tangent of the angle, which is exactly the drop from the middle
 * of the canvas to its edge.
 */
export function softBands(
  stops: Stop[], height: number, tilt: number, width: number,
): { from: number; to: number }[] {
  const slop = Math.abs(Math.tan(tilt)) * width / 2 + 1;
  let sharpFrom = height, sharpTo = 0;
  for (const stop of stops) {
    if (stop.soft === 0) {
      sharpFrom = Math.min(sharpFrom, stop.at * height);
      sharpTo = Math.max(sharpTo, stop.at * height);
    }
  }
  // No sharp band at all (a degenerate board) means the whole thing is soft: one band.
  if (sharpFrom > sharpTo) return [{ from: 0, to: height }];
  const cut = (v: number): number => Math.min(height, Math.max(0, Math.round(v)));
  return [
    { from: 0, to: cut(sharpFrom - slop) },
    { from: cut(sharpTo + slop), to: height },
  ];
}

function make(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}
