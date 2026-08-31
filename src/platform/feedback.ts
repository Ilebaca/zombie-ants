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

/**
 * The two beds. Menu is everything before a match; match is the board.
 *
 * Two rather than one, because they are doing different jobs: the menu bed is furniture for
 * a screen a player is reading, and the match bed is under a game they are thinking about.
 * Both are slow and quiet — a game somebody has on in a room is a game whose music has to
 * be ignorable.
 */
export type Track = "menu" | "match";

export interface Feedback {
  /** Mark a moment. Silent when muted, when unsupported, and before the first gesture. */
  play(cue: Cue): void;
  /**
   * Put a bed on, take it off, or leave it alone.
   *
   * Idempotent for the track already playing: navigation calls this constantly, and a bed
   * that restarted on every screen change would be a stutter rather than music.
   */
  setMusic(track: Track | null): void;
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

/* ------------------------------------------------------------------------ THE MUSIC */

/**
 * THE BEDS ARE GENERATED, note by note, for the same reason the cues are: there is no
 * asset pipeline here, and a music file is a megabyte to download before the first screen.
 *
 * A short progression, looped: a pad holding the chord, a bass note under it, and a sparse
 * pluck pattern over the top. Nothing clever — what makes it bearable for an hour is that
 * it is quiet, slow, and never resolves anywhere surprising.
 */
interface TrackDef {
  /** Seconds per beat. */
  beat: number;
  /** Root of each chord, in Hz, one per bar. */
  chords: readonly number[][];
  /** Which sixteenth-notes of a bar carry a pluck. */
  plucks: readonly number[];
  /** A low pulse on every beat — the match bed has one, the menu does not. */
  pulse: boolean;
  gain: number;
}

/** A minor ninth on A, then F, C, G: four bars that come back round without landing hard. */
const MENU_CHORDS = [
  [220, 261.6, 329.6],       // Am
  [174.6, 220, 261.6],       // F
  [130.8, 196, 261.6],       // C
  [196, 246.9, 293.7],       // G
];
/** The same harmony a fourth down, which sits under a board without pulling at it. */
const MATCH_CHORDS = [
  [110, 164.8, 196],
  [98, 146.8, 174.6],
  [123.5, 164.8, 246.9],
  [87.3, 130.8, 174.6],
];

const TRACKS: Record<Track, TrackDef> = {
  menu: { beat: 0.72, chords: MENU_CHORDS, plucks: [0, 6, 10], pulse: false, gain: 0.19 },
  match: { beat: 0.58, chords: MATCH_CHORDS, plucks: [0, 3, 8, 11], pulse: true, gain: 0.15 },
};

/** Sixteenths in a bar, and how far ahead the scheduler works. */
const STEPS_PER_BAR = 16;
const LOOKAHEAD = 0.4;
const TICK_MS = 60;

type ContextMaker = () => AudioContext;

export class WebFeedback implements Feedback {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** The beds run through their own gain, well under the cues, so one never buries the other. */
  private musicBus: GainNode | null = null;
  private sound = true;
  private haptics = true;
  /** Set once the device has told us it cannot do this, so we stop trying every cue. */
  private broken = false;
  /**
   * What should be playing.
   *
   * Held even before there is a device: the app asks for the menu bed at boot, which is
   * long before the first press, and losing that wish would leave the game silent until
   * the player happened to navigate somewhere.
   */
  private wanted: Track | null = null;
  private playing: Track | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** The next unscheduled sixteenth: its time, and which one of the loop it is. */
  private nextAt = 0;
  private step = 0;

  constructor(
    private makeContext: ContextMaker | null = defaultContext(),
    private vibrate: ((p: number | number[]) => void) | null = defaultVibrate(),
  ) {}

  setSound(on: boolean): void {
    this.sound = on;
    if (this.master && this.ctx) this.master.gain.value = on ? MASTER : 0;
    // Muting stops the bed rather than turning it down: an oscillator per sixteenth,
    // for ever, into a gain of zero is a phone warmed up for nothing.
    this.syncMusic();
  }

  setMusic(track: Track | null): void {
    this.wanted = track;
    this.syncMusic();
  }

  /** Bring what is playing into line with what is wanted. The only thing that starts a bed. */
  private syncMusic(): void {
    const want = this.sound && !this.broken ? this.wanted : null;
    if (want === this.playing) return;
    this.stopMusic();
    if (!want || !this.ctx || !this.musicBus) return;
    this.playing = want;
    // A short fade in, or the bed arrives as a click on top of whatever else is playing.
    const now = this.ctx.currentTime;
    this.musicBus.gain.setValueAtTime(0.0001, now);
    this.musicBus.gain.exponentialRampToValueAtTime(TRACKS[want].gain, now + 0.9);
    this.nextAt = now + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.pump(), TICK_MS);
    this.pump();
  }

  private stopMusic(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.playing = null;
    if (this.musicBus && this.ctx) {
      const now = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value), now);
      this.musicBus.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    }
  }

  /**
   * Schedule every sixteenth that falls inside the look-ahead.
   *
   * A timer cannot be trusted to fire on the beat — it drifts, and a backgrounded tab
   * throttles it to once a second. So the timer only decides WHEN TO SCHEDULE; the times
   * themselves come off the audio clock and advance by exactly one sixteenth each, which
   * is what keeps the loop from wandering over an hour.
   */
  private pump(): void {
    const ctx = this.ctx, bus = this.musicBus, track = this.playing;
    if (!ctx || !bus || !track) return;
    if (ctx.state !== "running") return;
    const def = TRACKS[track];
    const sixteenth = def.beat / 4;
    // A tab that was away comes back to a clock far past `nextAt`; catch up rather than
    // scheduling a thousand notes at once.
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.05;
    while (this.nextAt < ctx.currentTime + LOOKAHEAD) {
      this.scheduleStep(ctx, bus, def, this.step, this.nextAt);
      this.step = (this.step + 1) % (STEPS_PER_BAR * def.chords.length);
      this.nextAt += sixteenth;
    }
  }

  /** One sixteenth of the loop: the pad on a bar line, the bass under it, plucks over it. */
  private scheduleStep(
    ctx: AudioContext, bus: GainNode, def: TrackDef, step: number, at: number,
  ): void {
    const inBar = step % STEPS_PER_BAR;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const chord = def.chords[bar] ?? def.chords[0] as number[];

    if (inBar === 0) {
      // The pad: the whole chord, held for the bar, detuned a hair so it breathes.
      for (const [i, f] of chord.entries()) {
        this.voice(ctx, bus, "sine", f, at, def.beat * 4.1, 0.075, i * 1.6);
      }
      this.voice(ctx, bus, "triangle", (chord[0] ?? 220) / 2, at, def.beat * 1.6, 0.09);
    }
    if (def.pulse && inBar % 4 === 0 && inBar !== 0) {
      this.voice(ctx, bus, "sine", (chord[0] ?? 220) / 2, at, def.beat * 0.5, 0.05);
    }
    if (def.plucks.includes(inBar)) {
      const note = chord[(step + bar) % chord.length] ?? 220;
      this.voice(ctx, bus, "triangle", note * 2, at, def.beat * 0.9, 0.05);
    }
  }

  /** One note. Soft attack and a long tail — a square-edged envelope on a pad clicks. */
  private voice(
    ctx: AudioContext, bus: GainNode, type: OscillatorType,
    freq: number, at: number, dur: number, gain: number, detune = 0,
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (detune) osc.detune.setValueAtTime(detune, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.25, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
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
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0;
        this.musicBus.connect(this.master);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      // Whatever was asked for before there was a device to ask: start it now.
      this.syncMusic();
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
    this.stopMusic();
    this.wanted = null;
    try { void this.ctx?.close(); } catch { /* already gone */ }
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
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
  setMusic(_track: Track | null): void {}
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
