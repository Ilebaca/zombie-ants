/**
 * A recording stand-in for CanvasRenderingContext2D.
 *
 * The renderer is otherwise unverifiable without eyes on a screen. Recording the draw calls
 * lets us assert the *structure* of a frame — that a vein draws bars rather than a filled
 * cell, that a nest draws its illustration, that a count pill is stamped — which is exactly
 * the class of mistake a port introduces.
 */
export interface Call { fn: string; args: unknown[]; fill?: string; stroke?: string }

/** Numeric context properties worth asserting on — `lineDashOffset` is what makes ants march. */
const NUMBERS = ["lineDashOffset", "lineWidth", "globalAlpha"] as const;
type NumberProp = (typeof NUMBERS)[number];

export interface Recorder {
  ctx: CanvasRenderingContext2D;
  calls: Call[];
  /** Last value written to a numeric property. */
  num(prop: NumberProp): number;
  /** Every call by name. */
  of(fn: string): Call[];
  /** Fill styles used by `fillRect`/`fill`/`fillText`, lowercased. */
  fills(): string[];
  texts(): string[];
  has(fn: string): boolean;
}

const METHODS = [
  "save", "restore", "beginPath", "closePath", "moveTo", "lineTo", "arc", "arcTo", "ellipse",
  "rect", "fill", "stroke", "fillRect", "strokeRect", "clearRect", "clip", "fillText",
  "strokeText", "setLineDash", "quadraticCurveTo", "bezierCurveTo", "translate", "rotate",
  "scale", "setTransform", "resetTransform",
] as const;

export function makeRecorder(): Recorder {
  const calls: Call[] = [];
  const state = { fillStyle: "", strokeStyle: "" };
  const numbers: Record<string, number> = { lineDashOffset: 0, lineWidth: 1, globalAlpha: 1 };

  const target: Record<string, unknown> = {
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };

  for (const m of METHODS) {
    target[m] = (...args: unknown[]) => {
      calls.push({ fn: m, args, fill: state.fillStyle, stroke: state.strokeStyle });
    };
  }

  const ctx = new Proxy(target, {
    get(obj, prop: string) {
      if (prop === "fillStyle") return state.fillStyle;
      if (prop === "strokeStyle") return state.strokeStyle;
      if (prop in numbers) return numbers[prop];
      if (prop in obj) return obj[prop];
      return undefined;
    },
    set(_obj, prop: string, value: unknown) {
      if (prop === "fillStyle") state.fillStyle = String(value);
      else if (prop === "strokeStyle") state.strokeStyle = String(value);
      else if (prop in numbers) numbers[prop] = Number(value);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    calls,
    of: (fn) => calls.filter((c) => c.fn === fn),
    fills: () => calls
      .filter((c) => c.fn === "fill" || c.fn === "fillRect" || c.fn === "fillText")
      .map((c) => (c.fill ?? "").toLowerCase()),
    texts: () => calls.filter((c) => c.fn === "fillText").map((c) => String(c.args[0])),
    num: (prop) => numbers[prop] ?? 0,
    has: (fn) => calls.some((c) => c.fn === fn),
  };
}
