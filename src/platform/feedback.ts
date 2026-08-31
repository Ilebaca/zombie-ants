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
 * THE BEDS ARE GENERATED, note by note, for the same reason the cues are: there is no asset
 * pipeline here, and a music file is a megabyte to download before the first screen.
 *
 * The first version was a four-bar loop of a pad, a bass and three fixed plucks, and it
 * sounded exactly like that — a short loop of bare oscillators. What makes music feel
 * ORGANIC is not more notes, it is four things this now has:
 *
 *  1. IT NEVER REPEATS. The harmony is a sixteen-bar round, and the melody on top is a
 *     random walk through a pentatonic scale — so it is always in key and never the same
 *     phrase twice. A loop a player can predict is a loop they start hearing.
 *  2. IT IS IN A SPACE. Everything goes through a reverb built from an exponentially
 *     decaying burst of noise, which is what turns a beep into an instrument in a clearing.
 *     This is the single biggest difference between the old bed and this one.
 *  3. THE VOICES BREATHE. Each is two oscillators a few cents apart through a lowpass, and
 *     the long ones carry a slow vibrato. Perfectly in tune and perfectly steady is the
 *     sound of a machine.
 *  4. THE FOREST IS UNDER IT. A continuous bed of filtered noise whose cutoff drifts — wind
 *     in leaves — and, every few seconds, a two-or-three note chirp high above the music.
 *
 * All of it is quiet and slow, because a game somebody has on in a room is a game whose
 * music has to be ignorable.
 */

/**
 * A natural minor scale, in semitones. THE WHOLE BED IS BUILT OUT OF THIS.
 *
 * Not out of chords with their own intervals: a round whose roots move and whose voicing
 * is a fixed number of semitones above each one leaves the key the moment the two disagree.
 * The first version of this did, and used ten of the twelve semitones — a random melody
 * over a chromatic accompaniment, which is the opposite of relaxing and is exactly what a
 * test that counts pitch classes catches and an ear catches faster.
 *
 * Stacking in SCALE STEPS instead means every note of every chord is diatonic by
 * construction, and there is no combination of round and voicing that can break it.
 */
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/**
 * The degrees the melody may walk: the minor pentatonic, which is a SUBSET of the scale
 * above, so the tune can never disagree with the chord under it.
 *
 * Pentatonic because the melody is CHOSEN AT RANDOM: with five notes and no semitone
 * clashes, a random walk cannot land on a wrong note, which is what lets the tune be
 * different every time without ever needing to be checked.
 */
const PENTATONIC = [0, 2, 3, 4, 6];

/** Equal temperament, from a root. */
const noteAt = (root: number, semis: number): number => root * Math.pow(2, semis / 12);

/**
 * The nth degree of the scale above a tonic, counting on past the octave.
 *
 * Everything pitched in this file goes through here, which is what keeps the bed in one
 * key: there is no other way to name a note.
 */
function degree(tonic: number, n: number): number {
  const i = ((n % MINOR.length) + MINOR.length) % MINOR.length;
  const octaves = Math.floor(n / MINOR.length);
  return noteAt(tonic, (MINOR[i] ?? 0) + 12 * octaves);
}

interface TrackDef {
  /** Seconds per beat. */
  beat: number;
  /** The tonic the whole bed is built on. */
  tonic: number;
  /**
   * The round: the scale degree each bar's chord is rooted on. Sixteen bars, so the
   * harmony comes back round about every minute rather than every ten seconds — a loop a
   * player can predict is a loop they start hearing.
   */
  round: readonly number[];
  /** How far above each chord's root the pad stacks, IN SCALE STEPS. */
  voicing: readonly number[];
  /** Chance per sixteenth that the melody plays a note. Sparse: this is a bed. */
  melody: number;
  /** Chance per sixteenth of a high droplet — water off a leaf. */
  droplet: number;
  /** Seconds of reverb tail. The clearing is bigger on the menu than over the board. */
  room: number;
  /** How loud the wind sits under everything. */
  wind: number;
  /** Average seconds between birdcalls. Zero for none. */
  chirp: number;
  /** A low pulse off the beat — the match bed has a heartbeat, the menu does not. */
  pulse: boolean;
  gain: number;
}

/**
 * A sixteen-bar round in A minor that never quite settles.
 *
 * i – VI – III – VII twice, then a phrase that starts on the iv and comes home by another
 * route: long enough that the ear stops predicting it, and low enough that it never demands
 * attention.
 */
const A = 110;
const ROUND = [
  0, 5, 2, 6,
  0, 5, 2, 6,
  3, 5, 2, 6,
  0, 2, 6, 5,
];

const TRACKS: Record<Track, TrackDef> = {
  menu: {
    beat: 0.78,
    tonic: A,
    round: ROUND,
    // Root, fifth, octave and the ninth above: open, and no third, so it never commits to
    // happy or sad. That ambiguity is most of why an ambient bed can run for an hour.
    voicing: [0, 4, 7, 8],
    melody: 0.16,
    droplet: 0.05,
    room: 2.6,
    wind: 0.055,
    chirp: 7,
    pulse: false,
    gain: 0.2,
  },
  match: {
    // The same round an octave lower and a shade quicker: under a board rather than in
    // front of one.
    beat: 0.66,
    tonic: A / 2,
    round: ROUND,
    voicing: [0, 4, 7, 9],
    melody: 0.1,
    droplet: 0.03,
    room: 1.8,
    wind: 0.04,
    chirp: 13,
    pulse: true,
    gain: 0.16,
  },
};

/** Sixteenths in a bar, and how far ahead the scheduler works. */
const STEPS_PER_BAR = 16;
const LOOKAHEAD = 0.4;
const TICK_MS = 60;

/**
 * A small seeded generator.
 *
 * Seeded rather than `Math.random` for the same reason the scenery is (CLAUDE.md §5): a
 * test can pin it, and a bed that is reproducible can be debugged. Reseeded per bed, so two
 * sessions do not open on the same phrase.
 */
function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The room: an impulse response made from noise that decays exponentially.
 *
 * A convolver needs a recording of a space, and there is no file to load one from — but a
 * burst of noise with the right decay IS one, and a very convincing one for anything
 * ambient. Two channels, decorrelated, so the tail spreads rather than sitting in the
 * middle of the head.
 */
function makeRoom(ctx: AudioContext, seconds: number): AudioBuffer | null {
  if (typeof ctx.createBuffer !== "function") return null;
  const rate = ctx.sampleRate || 44100;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  const rand = rng(0x5eed);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      // A slow attack on the tail as well as a decay: a real room takes a moment to fill.
      const t = i / len;
      data[i] = (rand() * 2 - 1) * Math.pow(1 - t, 2.4) * Math.min(1, t * 40);
    }
  }
  return buf;
}

/** Wind: a long loop of noise, lowpassed hard and drifting. Made once per bed. */
function makeWind(ctx: AudioContext, seconds = 4): AudioBuffer | null {
  if (typeof ctx.createBuffer !== "function") return null;
  const rate = ctx.sampleRate || 44100;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(1, len, rate);
  const data = buf.getChannelData(0);
  const rand = rng(0xa11ce);
  // Brown-ish noise: a running sum of white, which has far more weight low down and
  // sounds like moving air rather than like static.
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + (rand() * 2 - 1) * 0.08) * 0.985;
    data[i] = last;
  }
  return buf;
}

/**
 * Keep the melody walk inside two octaves of the scale.
 *
 * A random walk with no fence wanders off in one direction and stays there — ten minutes
 * in, the tune is either subsonic or a whistle.
 */
function clampTone(i: number): number {
  return Math.max(0, Math.min(PENTATONIC.length * 2 - 1, i));
}

/** The standing parts of one bed: where notes go, and the wind that never stops. */
interface Bed {
  /** Everything eventually arrives here; the reverb is fed from it. */
  out: GainNode;
  /** The same, through a lowpass: pads and bass, so they sit under the melody. */
  soft: AudioNode;
  wind: AudioBufferSourceNode | null;
}

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
  /** The standing parts of whatever bed is playing: the room, and the wind under it. */
  private bed: Bed | null = null;
  /** The bed's own generator: the melody, the droplets and the birds are all rolled off it. */
  private rand: () => number = rng(1);
  /** Where the melody's walk currently stands, as a degree of the scale. */
  private tone = 2;
  /** When the next birdcall is due, on the audio clock. */
  private nextChirp = 0;

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
    const def = TRACKS[want];
    const ctx = this.ctx;
    // A short fade in, or the bed arrives as a click on top of whatever else is playing.
    const now = ctx.currentTime;
    this.musicBus.gain.setValueAtTime(0.0001, now);
    this.musicBus.gain.exponentialRampToValueAtTime(def.gain, now + 0.9);
    this.bed = this.buildBed(ctx, this.musicBus, def);
    // Seeded off the clock, so two sessions do not open on the same phrase — but seeded,
    // so a test can pin one and read the notes back.
    this.rand = rng(Math.floor(now * 1000) ^ (want === "menu" ? 0x1eaf : 0x5011));
    this.tone = 2;
    this.nextChirp = now + def.chirp * 0.6;
    this.nextAt = now + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.pump(), TICK_MS);
    this.pump();
  }

  /**
   * The standing parts of a bed: the room it is played in, and the wind under it.
   *
   * Both are made ONCE per bed rather than per note. The impulse response is a second or
   * two of audio to generate and the wind is a four-second loop; doing either on the beat
   * would be the most expensive thing in the app.
   *
   * Every piece is feature-guarded, because this has to run on a fake context in tests and
   * on whatever a phone browser turns out to implement. A bed with no reverb and no wind is
   * a thinner bed, never a broken one.
   */
  private buildBed(ctx: AudioContext, bus: GainNode, def: TrackDef): Bed {
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(bus);

    // The pads and the bass go through a lowpass so they sit UNDER the melody. One filter
    // for all of them rather than one per note: a pad holds for four beats, so per-note
    // filters would be a few dozen live nodes for one shared answer.
    let soft: AudioNode = out;
    if (typeof ctx.createBiquadFilter === "function") {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      lp.Q.value = 0.5;
      lp.connect(out);
      soft = lp;
    }

    // The room. This is the single biggest difference between a beep and an instrument
    // standing in a clearing, so it is worth the buffer.
    if (typeof ctx.createConvolver === "function") {
      const room = makeRoom(ctx, def.room);
      if (room) {
        const verb = ctx.createConvolver();
        verb.buffer = room;
        const wet = ctx.createGain();
        wet.gain.value = 0.5;
        verb.connect(wet);
        wet.connect(bus);
        out.connect(verb);
      }
    }

    // Wind: a loop of brown noise whose cutoff drifts, so the bed is never quite still even
    // between notes. Silence between phrases is what made the old loop sound like a device.
    let wind: AudioBufferSourceNode | null = null;
    if (typeof ctx.createBufferSource === "function" && typeof ctx.createBiquadFilter === "function") {
      const buf = makeWind(ctx);
      if (buf) {
        wind = ctx.createBufferSource();
        wind.buffer = buf;
        wind.loop = true;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 420;
        const g = ctx.createGain();
        g.gain.value = def.wind;
        wind.connect(lp);
        lp.connect(g);
        g.connect(bus);
        try { wind.start(); } catch { wind = null; }
        if (wind) this.driftWind(ctx, lp);
      }
    }

    return { out, soft, wind };
  }

  /**
   * The wind's cutoff wanders between a hush and a gust over half a minute at a time.
   *
   * Scheduled well ahead on the AUDIO clock rather than nudged by the timer, for the same
   * reason the notes are: a throttled tab would otherwise freeze the wind mid-gust.
   */
  private driftWind(ctx: AudioContext, lp: BiquadFilterNode): void {
    let at = ctx.currentTime;
    const rand = rng(0xb1a5);
    for (let i = 0; i < 24; i++) {
      const span = 6 + rand() * 10;
      lp.frequency.linearRampToValueAtTime(260 + rand() * 520, at + span);
      at += span;
    }
  }

  private stopMusic(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.playing = null;
    const bed = this.bed;
    this.bed = null;
    if (this.musicBus && this.ctx) {
      const now = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value), now);
      this.musicBus.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    }
    if (bed?.wind) {
      // Stopped after the fade, or the wind cuts out a third of a second before the music.
      try { bed.wind.stop((this.ctx?.currentTime ?? 0) + 0.4); } catch { /* already stopped */ }
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
    const ctx = this.ctx, bed = this.bed, track = this.playing;
    if (!ctx || !bed || !track) return;
    if (ctx.state !== "running") return;
    const def = TRACKS[track];
    const sixteenth = def.beat / 4;
    // A tab that was away comes back to a clock far past `nextAt`; catch up rather than
    // scheduling a thousand notes at once.
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.05;
    while (this.nextAt < ctx.currentTime + LOOKAHEAD) {
      this.scheduleStep(ctx, bed, def, this.step, this.nextAt);
      this.step = (this.step + 1) % (STEPS_PER_BAR * def.round.length);
      this.nextAt += sixteenth;
    }
  }

  /**
   * One sixteenth: the round underneath, and whatever the walk decides to put on top.
   *
   * Nothing here is a fixed pattern except the harmony. The melody, the droplets and the
   * birds are all rolled per sixteenth, which is why the bed never plays the same phrase
   * twice and why it can be sparse without sounding like it has stopped.
   */
  private scheduleStep(
    ctx: AudioContext, bed: Bed, def: TrackDef, step: number, at: number,
  ): void {
    const inBar = step % STEPS_PER_BAR;
    const bar = Math.floor(step / STEPS_PER_BAR) % def.round.length;
    const tonic = def.tonic;
    // The bar's chord, named as a scale degree: everything below stacks off this in scale
    // steps, so no chord in the round can leave the key.
    const chord = def.round[bar] ?? 0;
    const root = degree(tonic, chord);
    const rand = this.rand;

    if (inBar === 0) {
      // The pad holds the whole bar and overlaps the next by a beat, so the harmony CROSS
      // FADES rather than switching. A chord that stops before the next starts is a gap,
      // and a gap in a pad is what makes a loop audible as a loop.
      for (const [i, steps] of def.voicing.entries()) {
        this.voice(ctx, bed.soft, "sine", degree(tonic, chord + steps), at, def.beat * 5, 0.05, {
          detune: (i % 2 === 0 ? 4 : -4) + (rand() * 4 - 2),
          vibrato: 0.12,
        });
      }
    }
    // The bass breathes twice a bar, off the bar line the second time, so the pulse is felt
    // rather than counted.
    if (inBar === 0 || inBar === 10) {
      this.voice(ctx, bed.soft, "triangle", root / 2, at, def.beat * 2.2, inBar === 0 ? 0.09 : 0.05);
    }
    if (def.pulse && inBar % 8 === 4) {
      this.voice(ctx, bed.soft, "sine", root / 2, at, def.beat * 0.6, 0.045);
    }

    // The melody: a random walk through the pentatonic, so it is always in key and never
    // the same phrase twice. It steps by ONE degree at a time — a walk that could jump
    // anywhere sounds like notes rather than like a tune.
    if (rand() < def.melody) {
      const drift = rand();
      this.tone = clampTone(this.tone + (drift < 0.4 ? -1 : drift < 0.8 ? 1 : 0));
      const note = PENTATONIC[this.tone % PENTATONIC.length] ?? 0;
      const octave = MINOR.length * (1 + Math.floor(this.tone / PENTATONIC.length));
      this.voice(ctx, bed.out, "triangle", degree(tonic, note + octave), at, def.beat * 1.9, 0.045, {
        detune: 3,
        vibrato: 0.2,
      });
    }
    // A droplet is a single high note off a leaf: no melody, no pattern, just somewhere for
    // the ear to go.
    if (rand() < def.droplet) {
      const note = PENTATONIC[Math.floor(rand() * PENTATONIC.length)] ?? 0;
      this.voice(ctx, bed.out, "sine", degree(tonic, note + MINOR.length * 3), at, def.beat * 0.8, 0.03);
    }
    // And a bird, every several seconds, well above everything else. Two or three notes
    // that slide, because a bird bends its pitch and a fixed one reads as a beep.
    if (def.chirp > 0 && at >= this.nextChirp) {
      this.chirp(ctx, bed.out, at, rand);
      this.nextChirp = at + def.chirp * (0.55 + rand() * 0.9);
    }
  }

  /** Two or three sliding notes high above the bed. */
  private chirp(ctx: AudioContext, out: AudioNode, at: number, rand: () => number): void {
    const notes = 2 + Math.floor(rand() * 2);
    const base = 2200 + rand() * 1400;
    for (let i = 0; i < notes; i++) {
      const from = base * (1 + rand() * 0.15);
      this.voice(ctx, out, "sine", from, at + i * 0.075, 0.07, 0.02, {
        glide: from * (rand() < 0.5 ? 1.35 : 0.75),
      });
    }
  }

  /**
   * One note, as a pair of oscillators a few cents apart.
   *
   * Two rather than one is the whole difference between a tone and an instrument: the pair
   * beat slowly against each other, which is what a struck or bowed thing does and what a
   * single perfect oscillator never does. Perfectly in tune and perfectly steady is the
   * sound of a machine, so the long ones carry a slow vibrato as well.
   */
  private voice(
    ctx: AudioContext, out: AudioNode, type: OscillatorType,
    freq: number, at: number, dur: number, gain: number,
    opts: { detune?: number; vibrato?: number; glide?: number } = {},
  ): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    // A soft attack and a long tail — a square-edged envelope on a pad clicks. The attack
    // scales with the note, so a droplet still arrives sharply.
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.4, dur * 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    g.connect(out);

    const spread = opts.detune ?? 0;
    for (const cents of spread ? [spread, -spread] : [0]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, at);
      if (opts.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.glide), at + dur);
      if (cents) osc.detune.setValueAtTime(cents, at);
      osc.connect(g);
      osc.start(at);
      osc.stop(at + dur + 0.05);
      if (opts.vibrato) this.vibrato(ctx, osc, at, dur, opts.vibrato);
    }
  }

  /** A slow, shallow wobble on a held note. Anything faster than this reads as a siren. */
  private vibrato(
    ctx: AudioContext, osc: OscillatorNode, at: number, dur: number, depth: number,
  ): void {
    if (typeof ctx.createOscillator !== "function") return;
    const lfo = ctx.createOscillator();
    const amt = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(4.2 + depth, at);
    // Depth in CENTS through `detune`, not in hertz through `frequency`: a fixed number of
    // hertz is a wide wobble on a bass note and inaudible on a high one.
    amt.gain.setValueAtTime(depth * 40, at);
    lfo.connect(amt);
    try { amt.connect(osc.detune); } catch { return; }
    lfo.start(at);
    lfo.stop(at + dur + 0.05);
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
