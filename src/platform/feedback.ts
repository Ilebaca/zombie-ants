/**
 * SOUND AND HAPTICS.
 *
 * The app had neither, which is why Settings' two switches were disabled buttons over
 * nothing and were removed. This is what goes behind them.
 *
 * THE SOUND IS SYNTHESISED, NOT SHIPPED. There is no asset pipeline in this project and no
 * image file either — every picture is drawn by the code that owns it (CLAUDE.md: the
 * pickers show the game, the manual's figures, the news heroes). A sound file has the same
 * problems and two more: it is a download before the first tap, and it is a decode on a
 * phone. Each cue here is a few oscillators and an envelope, which is a couple of hundred
 * bytes of code, works offline, and cannot go stale.
 *
 * A BROWSER WILL NOT LET AUDIO START WITHOUT A GESTURE. The context is created lazily on
 * `unlock()` — called from the first press anywhere — and every cue before that is dropped
 * rather than queued: a sound that arrives late is worse than one that never came.
 *
 * `Feedback` is the seam, as everywhere else in this layer. `SilentFeedback` is what tests
 * and a platform with neither capability get, and it is not a stub for something missing —
 * it is the honest implementation for a device that cannot do this.
 */

/** The moments worth marking. Named for what HAPPENED, never for how it sounds. */
export type Cue =
  | "tap"        // a tile picked up
  | "move"       // ground taken with no fight
  | "fight"      // combat resolved
  | "ability"    // an ability cast
  | "hive"       // the Hive queen taken — the biggest thing on a board
  | "endTurn"
  | "win"
  | "lose"
  | "claim"      // a reward collected: quest, road, granary, gift
  | "deny";      // a tap the game refused

export interface Feedback {
  /** Mark a moment. Silent when muted, when unsupported, and before the first gesture. */
  play(cue: Cue): void;
  /** Called from the first press: browsers refuse to start audio without one. */
  unlock(): void;
  setSound(on: boolean): void;
  setHaptics(on: boolean): void;
  /** Release the audio device. A match screen torn down must not hold one open. */
  close(): void;
}

/** Milliseconds of vibration per cue. Zero means this cue does not buzz. */
const BUZZ: Record<Cue, number | number[]> = {
  tap: 0,                 // far too often to be anything but irritating
  move: 8,
  fight: 18,
  ability: [12, 40, 12],
  hive: [20, 60, 30],
  endTurn: 0,
  win: [30, 80, 30, 80, 60],
  lose: 90,
  claim: 14,
  deny: [8, 30, 8],
};

/** One voice: a tone that slides from `from` to `to` over `dur`, shaped by an envelope. */
interface Voice {
  type: OscillatorType;
  from: number;
  to: number;
  /** Seconds. */
  dur: number;
  /** Peak gain, before the master. Kept low: these stack. */
  gain: number;
  /** Seconds to wait before this voice starts, so a cue can be a little phrase. */
  at?: number;
}

/**
 * What each cue is made of.
 *
 * Deliberately short and low — a game a player has on in a room is a game whose sounds have
 * to be ignorable. Nothing here runs past a third of a second except the two that end a
 * match, which have earned it.
 */
const VOICES: Record<Cue, Voice[]> = {
  tap: [{ type: "sine", from: 620, to: 720, dur: 0.05, gain: 0.16 }],
  move: [{ type: "triangle", from: 380, to: 560, dur: 0.09, gain: 0.2 }],
  // A bite: a hard square dropping fast, which reads as an impact rather than a note.
  fight: [
    { type: "square", from: 220, to: 70, dur: 0.13, gain: 0.22 },
    { type: "sawtooth", from: 90, to: 50, dur: 0.16, gain: 0.14 },
  ],
  // Rising, and in two parts: something was released rather than struck.
  ability: [
    { type: "sine", from: 330, to: 880, dur: 0.22, gain: 0.2 },
    { type: "triangle", from: 660, to: 1320, dur: 0.26, gain: 0.1, at: 0.06 },
  ],
  // The Hive is the biggest thing that can happen on a board, so it gets a chord.
  hive: [
    { type: "sine", from: 196, to: 196, dur: 0.5, gain: 0.18 },
    { type: "sine", from: 294, to: 294, dur: 0.5, gain: 0.14, at: 0.05 },
    { type: "sine", from: 392, to: 466, dur: 0.6, gain: 0.12, at: 0.1 },
  ],
  endTurn: [{ type: "sine", from: 300, to: 220, dur: 0.11, gain: 0.15 }],
  // Up: a major arpeggio, which is the shortest way to say "that went well".
  win: [
    { type: "triangle", from: 523, to: 523, dur: 0.16, gain: 0.2 },
    { type: "triangle", from: 659, to: 659, dur: 0.16, gain: 0.2, at: 0.12 },
    { type: "triangle", from: 784, to: 784, dur: 0.34, gain: 0.22, at: 0.24 },
  ],
  // Down, and slower. Not a buzzer: a defeat is disappointing, not an error.
  lose: [
    { type: "sine", from: 392, to: 392, dur: 0.2, gain: 0.18 },
    { type: "sine", from: 311, to: 233, dur: 0.5, gain: 0.18, at: 0.16 },
  ],
  claim: [
    { type: "sine", from: 784, to: 1046, dur: 0.1, gain: 0.18 },
    { type: "sine", from: 1046, to: 1318, dur: 0.14, gain: 0.14, at: 0.07 },
  ],
  // Flat and short. A refusal should be felt and forgotten, not announced.
  deny: [{ type: "square", from: 160, to: 120, dur: 0.09, gain: 0.12 }],
};

/** How loud the whole thing is, before anything else. Quiet by design. */
const MASTER = 0.45;

type ContextMaker = () => AudioContext;

export class WebFeedback implements Feedback {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sound = true;
  private haptics = true;
  /** Set once the device has told us it cannot do this, so we stop trying every cue. */
  private broken = false;

  constructor(
    private makeContext: ContextMaker | null = defaultContext(),
    private vibrate: ((p: number | number[]) => void) | null = defaultVibrate(),
  ) {}

  setSound(on: boolean): void {
    this.sound = on;
    if (this.master && this.ctx) this.master.gain.value = on ? MASTER : 0;
  }

  setHaptics(on: boolean): void { this.haptics = on; }

  /**
   * Create the audio device, on a gesture.
   *
   * Also RESUMES it: a context created before the gesture — or suspended when the tab went
   * to the background — is silent until something resumes it, and nothing else will.
   */
  unlock(): void {
    if (this.broken || !this.makeContext) return;
    try {
      if (!this.ctx) {
        this.ctx = this.makeContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.sound ? MASTER : 0;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      // No audio on this device, or the browser refused. Everything else still works.
      this.broken = true;
    }
  }

  play(cue: Cue): void {
    this.buzz(cue);
    if (!this.sound || this.broken) return;
    const ctx = this.ctx, master = this.master;
    // Dropped, never queued: a sound that arrives after the thing it marks is worse than
    // no sound at all.
    if (!ctx || !master || ctx.state !== "running") return;
    try {
      const now = ctx.currentTime;
      for (const v of VOICES[cue]) {
        const at = now + (v.at ?? 0);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = v.type;
        osc.frequency.setValueAtTime(v.from, at);
        if (v.to !== v.from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, v.to), at + v.dur);
        // A short attack and a long-ish tail: a square-edged envelope clicks.
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(v.gain, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + v.dur);
        osc.connect(gain);
        gain.connect(master);
        osc.start(at);
        osc.stop(at + v.dur + 0.02);
      }
    } catch {
      this.broken = true;
    }
  }

  private buzz(cue: Cue): void {
    if (!this.haptics || !this.vibrate) return;
    const pattern = BUZZ[cue];
    if (pattern === 0) return;
    try { this.vibrate(pattern); } catch { /* a device that will not buzz is not an error */ }
  }

  close(): void {
    try { void this.ctx?.close(); } catch { /* already gone */ }
    this.ctx = null;
    this.master = null;
  }
}

/**
 * Neither capability, and that is a complete answer rather than a missing one.
 *
 * The parameters are spelled out even though nothing reads them: a caller holding one of
 * these directly should still be type-checked against the real contract.
 */
export class SilentFeedback implements Feedback {
  play(_cue: Cue): void {}
  unlock(): void {}
  setSound(_on: boolean): void {}
  setHaptics(_on: boolean): void {}
  close(): void {}
}

function defaultContext(): ContextMaker | null {
  const Ctor = typeof window !== "undefined"
    ? (window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : undefined;
  return Ctor ? (): AudioContext => new Ctor() : null;
}

function defaultVibrate(): ((p: number | number[]) => void) | null {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return null;
  return (p) => { navigator.vibrate(p); };
}

/** The one a platform gets: real where the browser can, silent where it cannot. */
export const makeFeedback = (): Feedback =>
  defaultContext() || defaultVibrate() ? new WebFeedback() : new SilentFeedback();
