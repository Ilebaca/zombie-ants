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

// The one seeded generator, under its local name: this file rolls a melody rather
// than a board, but it is the same sequence and there is one of it (engine/random.ts).
import { seeded as rng } from "../engine";
import { SOUNDS, soundUrl } from "./sounds";

/** The moments worth marking. Named for what HAPPENED, never for how it sounds. */
export type Cue =
  | "tap"        // a tile picked up
  | "move"       // ground taken with no fight
  | "travel"     // a long send: the same movement, going much further
  | "fight"      // combat resolved
  | "destroy"    // a tile razed — a colony coming apart
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
  /**
   * Music apart from everything else.
   *
   * Two switches rather than one because they are two different irritations: a bed running
   * for an hour is the thing somebody turns off on a bus, and the cues are the thing they
   * still want when they do. One switch for both means turning the music off costs the
   * feedback with it.
   */
  setMusicEnabled(on: boolean): void;
  setHaptics(on: boolean): void;
  /** Release the audio device. A match screen torn down must not hold one open. */
  close(): void;
}

/** Milliseconds of vibration per cue. Zero means this cue does not buzz. */
const BUZZ: Record<Cue, number | number[]> = {
  tap: 0,                 // far too often to be anything but irritating
  move: 8,
  travel: [6, 30, 6],
  fight: 18,
  destroy: [24, 30, 40],
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
  tap: [{ type: "sine", from: 620, to: 720, dur: 0.05, gain: 0.256 }],
  // Movement and destruction are NOISE, not notes — see `scurry` and `crack` below. The
  // table only carries the cues that really are a pitch.
  move: [],
  travel: [],
  fight: [],
  destroy: [],
  // Rising, and in two parts: something was released rather than struck.
  ability: [
    { type: "sine", from: 330, to: 880, dur: 0.22, gain: 0.32 },
    { type: "triangle", from: 660, to: 1320, dur: 0.26, gain: 0.16, at: 0.06 },
  ],
  // The Hive is the biggest thing that can happen on a board, so it gets a chord.
  hive: [
    { type: "sine", from: 196, to: 196, dur: 0.5, gain: 0.288 },
    { type: "sine", from: 294, to: 294, dur: 0.5, gain: 0.224, at: 0.05 },
    { type: "sine", from: 392, to: 466, dur: 0.6, gain: 0.192, at: 0.1 },
  ],
  endTurn: [{ type: "sine", from: 300, to: 220, dur: 0.11, gain: 0.24 }],
  // Up: a major arpeggio, which is the shortest way to say "that went well".
  win: [
    { type: "triangle", from: 523, to: 523, dur: 0.16, gain: 0.32 },
    { type: "triangle", from: 659, to: 659, dur: 0.16, gain: 0.32, at: 0.12 },
    { type: "triangle", from: 784, to: 784, dur: 0.34, gain: 0.352, at: 0.24 },
  ],
  // Down, and slower. Not a buzzer: a defeat is disappointing, not an error.
  lose: [
    { type: "sine", from: 392, to: 392, dur: 0.2, gain: 0.288 },
    { type: "sine", from: 311, to: 233, dur: 0.5, gain: 0.288, at: 0.16 },
  ],
  claim: [
    { type: "sine", from: 784, to: 1046, dur: 0.1, gain: 0.288 },
    { type: "sine", from: 1046, to: 1318, dur: 0.14, gain: 0.224, at: 0.07 },
  ],
  // Flat and short. A refusal should be felt and forgotten, not announced.
  deny: [{ type: "square", from: 160, to: 120, dur: 0.09, gain: 0.192 }],
};

/** How loud the whole thing is, before anything else. Quiet by design. */
const MASTER = 0.5;

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
  /**
   * How loud the sustained chord is.
   *
   * Its own number because the two beds want opposite things from it: in the menus the pad
   * IS the music, and over a board it has to get out of the way of the drum. One level for
   * both is what made the match bed sound like the menu bed with something faint under it.
   */
  pad: number;
  /**
   * Change chord every HALF bar rather than every bar.
   *
   * The single most audible difference between the two beds after the drum: the same round,
   * pushed through twice as fast, is a harmony that will not settle — which is the whole
   * feeling wanted over a board.
   */
  half: boolean;
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
  /**
   * DRIVE: the match bed is a war, not furniture.
   *
   * The two beds were the same music at two speeds, which said the same thing on the home
   * screen and over a board somebody is losing. With this on, the bed gets a drum under it,
   * an eighth-note ostinato on the chord root, and a far busier melody — the harmony and
   * the key are the same, so it is recognisably the same world, but it is pushing.
   */
  drive: boolean;
  /** Bars of drums alone before the music enters. Zero for a bed that just starts. */
  openBars: number;
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
    pad: 0.075,
    half: false,
    melody: 0.16,
    droplet: 0.05,
    room: 2.6,
    wind: 0.16,
    chirp: 7,
    drive: false,
    openBars: 0,
    gain: 3.0,
  },
  match: {
    // The same round, half again as fast: the same forest, at war in it.
    //
    // NOT an octave lower, which is where this started. A phone speaker has next to nothing
    // below about 400 Hz, so dropping the whole bed an octave for gravity took the match
    // music out of the only range the device can reproduce — measured, it had ten decibels
    // LESS midrange than the menu bed, which is why the war bed was reported as sounding
    // no different and, if anything, thinner. Weight here has to come from the drum and the
    // ostinato, never from pitch.
    beat: 0.44,
    tonic: A,
    round: ROUND,
    voicing: [0, 4, 7, 9],
    // Under the drum, not over it.
    pad: 0.038,
    half: true,
    melody: 0.24,
    droplet: 0.02,
    room: 1.5,
    // The wind and the birds pull back. A battle is not the moment to be pointing out the
    // scenery, and they were the first things fighting the drum for room.
    wind: 0.08,
    chirp: 22,
    drive: true,
    openBars: 1,
    gain: 1.75,
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

/**
 * A second of white noise, for every percussive sound in the app.
 *
 * Windowed through a bandpass this is a stick, a rim, a twig or a footfall depending only
 * on where the band sits and how fast the envelope closes, which is why there is not one
 * audio file in this project.
 */
function makeNoise(ctx: AudioContext, seconds = 1): AudioBuffer | null {
  if (typeof ctx.createBuffer !== "function") return null;
  const rate = ctx.sampleRate || 44100;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(1, len, rate);
  const data = buf.getChannelData(0);
  const rand = rng(0xc0ffee);
  for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
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

/**
 * A decoded file from the manifest, or the fact that it could not be had.
 *
 * `null` means "asked for, and it is not coming" — a fetch that failed, a codec the phone
 * refused, or a context with no decoder. It is cached as firmly as a success, so a broken
 * path is one failed request rather than one per tap, and the synthesiser takes over.
 */
type Sample = AudioBuffer | null;

export class WebFeedback implements Feedback {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** The beds run through their own gain, well under the cues, so one never buries the other. */
  private musicBus: GainNode | null = null;
  private sound = true;
  private music = true;
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
  /** Set when a bed is armed and cleared by the pump that opens it up. */
  private fading = false;
  /**
   * Sixteenths since this bed began, never wrapped.
   *
   * `step` wraps with the round, so it cannot say whether the bed has just started — and
   * the opening has to happen ONCE, not every time the round comes back to bar one.
   */
  private played = 0;
  /**
   * A second of white noise, made once at unlock.
   *
   * Every percussive sound in the app is a window onto this through a bandpass — the
   * scurry, the crack, the rubble, the drums under the match bed. One buffer rather than
   * one per hit, because a hit lasts a hundredth of a second and generating a buffer does
   * not.
   */
  private noise: AudioBuffer | null = null;
  /** Files from the manifest, once fetched. See `platform/sounds.ts`. */
  private samples = new Map<string, Sample>();
  /** The looping source for a bed that is a FILE rather than a synthesised round. */
  private trackSource: AudioBufferSourceNode | null = null;

  constructor(
    private makeContext: ContextMaker | null = defaultContext(),
    private vibrate: ((p: number | number[]) => void) | null = defaultVibrate(),
  ) {}

  setMusicEnabled(on: boolean): void {
    this.music = on;
    this.syncMusic();
  }

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
    const want = this.sound && this.music && !this.broken ? this.wanted : null;
    if (want === this.playing) return;
    this.stopMusic();
    if (!want || !this.ctx || !this.musicBus) return;
    this.playing = want;
    const def = TRACKS[want];
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // CANCEL FIRST. `stopMusic` just scheduled a ramp down to silence a third of a second
    // out, and the timeline keeps it: without this the new bed fades UP and is then pulled
    // straight back down by the previous bed's fade-out, which is silence when the two
    // lengths happen to line up and a slow, unexplained arrival when they do not.
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setValueAtTime(0.0001, now);
    // The fade is armed here and RUN from the first pump that actually schedules something.
    // Running it here cost the bed a second of nothing every time: a context still waking
    // up from `resume()` has a clock that has not started, so the ramp was already over by
    // the time a note existed to hear through it. And 0.9s of fade on top of that is most
    // of why the music was reported as arriving several seconds late.
    this.fading = true;

    // A file named in the manifest REPLACES the synthesised bed: no round, no drums, no
    // wind — a recorded piece already has all of that in it, and running the generator
    // underneath would be two pieces of music at once.
    const file = SOUNDS.tracks?.[want];
    const buf = file ? this.sample(file) : null;
    if (buf) {
      this.trackSource = this.playSample(buf, this.musicBus, now, true);
      if (this.trackSource) {
        // Still on the pump, because the pump is what runs the fade — and it is what
        // notices the clock has finally started on a context that was waking up.
        this.timer = setInterval(() => this.pump(), TICK_MS);
        this.pump();
        return;
      }
    }

    this.bed = this.buildBed(ctx, this.musicBus, def);
    // Seeded off the clock, so two sessions do not open on the same phrase — but seeded,
    // so a test can pin one and read the notes back.
    this.rand = rng(Math.floor(now * 1000) ^ (want === "menu" ? 0x1eaf : 0x5011));
    this.tone = 2;
    this.nextChirp = now + def.chirp * 0.6;
    this.nextAt = now + 0.02;
    this.step = 0;
    this.played = 0;
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
    if (this.trackSource) {
      try { this.trackSource.stop((this.ctx?.currentTime ?? 0) + 0.4); } catch { /* gone */ }
      this.trackSource = null;
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
    const ctx = this.ctx, bed = this.bed, bus = this.musicBus, track = this.playing;
    if (!ctx || !bus || !track) return;
    if (ctx.state !== "running") return;
    const def = TRACKS[track];
    // A sampled bed has nothing to schedule; it only wants the fade.
    if (!bed) {
      if (this.fading) {
        this.fading = false;
        bus.gain.cancelScheduledValues(ctx.currentTime);
        bus.gain.setValueAtTime(0.0001, ctx.currentTime);
        bus.gain.exponentialRampToValueAtTime(def.gain, ctx.currentTime + 0.25);
      }
      return;
    }
    const sixteenth = def.beat / 4;
    // A tab that was away comes back to a clock far past `nextAt`; catch up rather than
    // scheduling a thousand notes at once.
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.05;
    if (this.fading) {
      // Short, and only now: this is the first moment the clock is really running, so the
      // fade covers the first note rather than a second of silence before it.
      this.fading = false;
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setValueAtTime(0.0001, ctx.currentTime);
      bus.gain.exponentialRampToValueAtTime(def.gain, ctx.currentTime + 0.25);
    }
    while (this.nextAt < ctx.currentTime + LOOKAHEAD) {
      this.scheduleStep(ctx, bed, def, this.step, this.nextAt);
      this.step = (this.step + 1) % (STEPS_PER_BAR * def.round.length);
      this.played++;
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
    // A "bar" here is however long a chord lasts, which is half a bar in the match bed.
    const barSteps = def.half ? STEPS_PER_BAR / 2 : STEPS_PER_BAR;
    const inBar = step % STEPS_PER_BAR;
    const bar = Math.floor(step / barSteps) % def.round.length;
    // THE OPENING: a bar of drums alone before anything else arrives. A match starts, and
    // what starts it is a drum being struck — the music walks in on top of it. Counted off
    // `played` rather than `step`, so it happens once at the top of the bed and never again
    // when the round comes back round to bar one.
    const opening = def.openBars * STEPS_PER_BAR;
    if (this.played < opening) {
      this.opener(ctx, bed, def, this.played, opening, at);
      return;
    }
    const tonic = def.tonic;
    // The bar's chord, named as a scale degree: everything below stacks off this in scale
    // steps, so no chord in the round can leave the key.
    const chord = def.round[bar] ?? 0;
    const root = degree(tonic, chord);
    const rand = this.rand;

    if (step % barSteps === 0) {
      // The pad holds the whole bar and overlaps the next by a beat, so the harmony CROSS
      // FADES rather than switching. A chord that stops before the next starts is a gap,
      // and a gap in a pad is what makes a loop audible as a loop.
      for (const [i, steps] of def.voicing.entries()) {
        this.voice(ctx, bed.soft, "sine", degree(tonic, chord + steps), at, def.beat * (def.half ? 2.6 : 5), def.pad, {
          detune: (i % 2 === 0 ? 4 : -4) + (rand() * 4 - 2),
          vibrato: 0.12,
        });
      }
    }
    // The bass breathes twice a bar, off the bar line the second time, so the pulse is felt
    // rather than counted.
    const onChord = step % barSteps === 0;
    if (onChord || inBar % barSteps === 10 % barSteps) {
      this.voice(ctx, bed.soft, "triangle", root / 2, at, def.beat * 2.2, onChord ? 0.16 : 0.09);
    }
    if (def.drive) this.warKit(ctx, bed, def, inBar, at, root);

    // The melody: a random walk through the pentatonic, so it is always in key and never
    // the same phrase twice. It steps by ONE degree at a time — a walk that could jump
    // anywhere sounds like notes rather than like a tune.
    if (rand() < def.melody) {
      const drift = rand();
      this.tone = clampTone(this.tone + (drift < 0.4 ? -1 : drift < 0.8 ? 1 : 0));
      const note = PENTATONIC[this.tone % PENTATONIC.length] ?? 0;
      const octave = MINOR.length * (1 + Math.floor(this.tone / PENTATONIC.length));
      this.voice(ctx, bed.out, "triangle", degree(tonic, note + octave), at, def.beat * 1.9, 0.085, {
        detune: 3,
        vibrato: 0.2,
      });
    }
    // A droplet is a single high note off a leaf: no melody, no pattern, just somewhere for
    // the ear to go.
    if (rand() < def.droplet) {
      const note = PENTATONIC[Math.floor(rand() * PENTATONIC.length)] ?? 0;
      this.voice(ctx, bed.out, "sine", degree(tonic, note + MINOR.length * 3), at, def.beat * 0.8, 0.055);
    }
    // And a bird, every several seconds, well above everything else. Two or three notes
    // that slide, because a bird bends its pitch and a fixed one reads as a beep.
    if (def.chirp > 0 && at >= this.nextChirp) {
      this.chirp(ctx, bed.out, at, rand);
      this.nextChirp = at + def.chirp * (0.55 + rand() * 0.9);
    }
  }

  /**
   * The match bed's engine: a drum, and an ostinato that will not sit still.
   *
   * All of it is the same noise buffer the cues use, through different bands — a kick is a
   * low band closing fast, a hat is a high one closing faster. Written as a pattern rather
   * than rolled at random, because this half of the bed is the part that has to feel
   * DELIBERATE: the rest of the music wanders, and something underneath has to be marching.
   */
  private warKit(
    ctx: AudioContext, bed: Bed, def: TrackDef, inBar: number, at: number, root: number,
  ): void {
    // Kick on one and on the and-of-three: a pulse that leans forward rather than sitting
    // squarely on the bar.
    // A HAND DRUM, NOT A DRUM MACHINE.
    //
    // Two rules make the difference between this and a beatbox. Every hit is a pitched
    // MEMBRANE that falls — a skin under tension, which is what a struck drum is — with
    // the noise part rolled OFF rather than a bright click on top; and nothing lands
    // exactly on the grid. A drummer is a few milliseconds early or late every time and
    // never hits twice at the same weight, and perfect timing at a constant level is the
    // single most digital thing a piece of music can do.
    //
    // It is also tuned for a PHONE SPEAKER, which has next to nothing below about 400 Hz:
    // every part has something in the midrange to be heard by, and the low end is what a
    // real speaker adds rather than what any of it depends on.
    const rand = this.rand;
    const human = (): number => at + (rand() - 0.5) * 0.014;
    const weight = (): number => 0.85 + rand() * 0.3;

    // The low drum: on the bar, and leaning forward off the beat rather than sitting square.
    if (inBar === 0 || inBar === 6 || inBar === 10) {
      const t = human(), w = weight();
      this.noteAtGain(ctx, bed.out, "sine", 210, 66, t, 0.22, 0.85 * w);
      // The skin, not a beater: lowpassed, so it is the sound of a hand rather than a stick.
      this.tick(ctx, bed.out, t, 420, 0.05, 1.2 * w, 0.5, 150);
    }
    // The open slap: the higher drum of the pair, and the one that answers.
    if (inBar === 4 || inBar === 12) {
      const t = human(), w = weight();
      this.noteAtGain(ctx, bed.out, "triangle", 520, 260, t, 0.11, 0.42 * w);
      this.tick(ctx, bed.out, t, 1500, 0.13, 1.1 * w, 0.35, 520);
    }
    // A shaker on every eighth, so the bar is always being counted by something.
    if (inBar % 2 === 0) {
      this.tick(ctx, bed.out, human(), 6400, 0.028, (inBar % 4 === 0 ? 0.8 : 0.42) * weight(), 1.1);
    }
    // The ostinato is PLUCKED, not driven. A sawtooth here was the other half of what read
    // as digital: it is a triangle with a fast decay now, which is a thumb piano rather
    // than a synth line, and it is doubled an octave up every other beat so the figure
    // moves instead of repeating.
    if (inBar % 2 === 0) {
      const t = human();
      this.voice(ctx, bed.out, "triangle", root * 2, t, def.beat * 0.34, 0.09 * weight(), { detune: 5 });
      if (inBar % 8 === 4) this.voice(ctx, bed.out, "sine", root * 4, t, def.beat * 0.3, 0.045);
    }
  }

  /**
   * The drum opening: one bar, alone, building.
   *
   * A roll that thickens and gets louder as it goes, ending on the downbeat the music
   * enters on — so the bed does not fade up out of nothing, it is COUNTED IN. This is the
   * whole of what a listener hears in the first two seconds of a match, so it is the part
   * that has to say "something is starting".
   */
  private opener(
    ctx: AudioContext, bed: Bed, def: TrackDef, played: number, total: number, at: number,
  ): void {
    const rand = this.rand;
    const through = played / total;
    const t = at + (rand() - 0.5) * 0.012;
    // The roll fills in: quarters, then eighths, then every sixteenth by the end.
    const every = through < 0.4 ? 4 : through < 0.75 ? 2 : 1;
    if (played % every === 0) {
      const w = (0.35 + through * 0.85) * (0.85 + rand() * 0.3);
      // Accented on each beat, so the bar can be counted rather than just heard.
      const beat = played % 4 === 0;
      this.noteAtGain(ctx, bed.out, "sine", beat ? 230 : 330, beat ? 70 : 150, t, beat ? 0.2 : 0.09, (beat ? 0.9 : 0.4) * w);
      this.tick(ctx, bed.out, t, beat ? 430 : 1300, beat ? 0.05 : 0.04, (beat ? 1.3 : 0.8) * w, 0.4, beat ? 150 : 500);
    }
    // And the last two sixteenths are the pickup into the downbeat.
    if (played === total - 2 || played === total - 1) {
      this.tick(ctx, bed.out, t, 2000, 0.05, 1.2, 0.35, 700);
    }
  }

  /** Two or three sliding notes high above the bed. */
  private chirp(ctx: AudioContext, out: AudioNode, at: number, rand: () => number): void {
    const notes = 2 + Math.floor(rand() * 2);
    const base = 2200 + rand() * 1400;
    for (let i = 0; i < notes; i++) {
      const from = base * (1 + rand() * 0.15);
      this.voice(ctx, out, "sine", from, at + i * 0.075, 0.07, 0.04, {
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
    const spread = opts.detune ?? 0;
    const pair = spread ? 2 : 1;

    const g = ctx.createGain();
    // ATTACK, HOLD, RELEASE — and the hold is the whole point.
    //
    // The first version ramped straight from the attack down to silence, which sounds like
    // a decaying pluck however long the note is: an exponential from 0.05 to 0.0001 is
    // four fifths of the way down after a quarter of its length. So a "pad" held for five
    // beats was a tick, the bed measured about −54 dBFS at the speaker, and the honest
    // report from the phone was that there was nothing there at all. A held note has to
    // actually hold.
    const attack = Math.min(0.5, dur * 0.25);
    const release = Math.min(1.2, dur * 0.45);
    // The pair sums before this gain, so halve it — otherwise `gain` means one thing for a
    // detuned note and twice that for a plain one.
    const peak = gain / pair;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.setValueAtTime(peak, at + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    g.connect(out);

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
        // A LIMITER ON THE WAY OUT.
        //
        // The match bed is a drum kit, an ostinato, a pad and a melody, and a cue can land
        // on top of all four — measured, that hit twice full scale, which a browser clips
        // into distortion. A compressor is the difference between turning everything down
        // until the worst moment fits (a bed nobody can hear, which is where this started)
        // and holding the loud moments down so the rest can be loud. It is also most of
        // what makes a drum feel like it is hitting something.
        let out: AudioNode = this.ctx.destination;
        if (typeof this.ctx.createDynamicsCompressor === "function") {
          const limiter = this.ctx.createDynamicsCompressor();
          limiter.threshold.value = -16;
          limiter.knee.value = 8;
          limiter.ratio.value = 7;
          limiter.attack.value = 0.003;
          limiter.release.value = 0.12;
          limiter.connect(this.ctx.destination);
          out = limiter;
        }
        this.master.connect(out);
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0;
        this.musicBus.connect(this.master);
        this.noise = makeNoise(this.ctx);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      // Whatever was asked for before there was a device to ask: start it now.
      this.syncMusic();
    } catch {
      // No audio on this device, or the browser refused. Everything else still works.
      this.broken = true;
    }
  }

  /**
   * MOVEMENT IS A SCURRY, NOT A NOTE.
   *
   * A rising blip is what a puzzle game does when a piece lands. What is actually moving
   * here is a column of ants, and the sound of that is a great many tiny impacts very close
   * together — a stick tapped gently on a surface, over and over, filling the time the move
   * takes. So a move is a burst of very short filtered noise ticks rather than a tone, and
   * a long send is the same burst spread over the longer distance.
   *
   * The gaps are jittered off the seeded generator. Evenly spaced ticks are a machine gun;
   * uneven ones are feet.
   */
  private scurry(ctx: AudioContext, out: AudioNode, at: number, span: number, ticks: number): void {
    const rand = this.rand;
    for (let i = 0; i < ticks; i++) {
      const t = at + (span * i) / ticks + rand() * (span / ticks) * 0.6;
      // Quieter as the column thins out, so the burst has a shape rather than being a flat
      // rattle.
      const fade = 1 - (i / ticks) * 0.45;
      // SMALL AND SOFT. High, because a tiny thing makes a high sound; very short, because
      // a foot is not a drum; and a wide, gentle filter, because a narrow one RINGS and a
      // ring is what made the first version read as hard. Many of them quietly is a
      // column of ants — a few of them loudly is somebody knocking.
      this.tick(ctx, out, t, 3200 + rand() * 3400, 0.007, 0.85 * fade, 0.9);
    }
  }

  /**
   * DESTRUCTION IS A CRACK AND THEN A COLLAPSE.
   *
   * Three parts, because a single burst of noise is a hiss and not a thing breaking: the
   * SNAP is a short band of noise whose filter drops fast, which is what a stick does; the
   * THUD under it is what gives the snap a size; and the RUBBLE afterwards is a handful of
   * scattered ticks, which is the part that says something fell apart rather than merely
   * being hit.
   */
  private crack(ctx: AudioContext, out: AudioNode, at: number, size: number): void {
    const rand = this.rand;
    this.tick(ctx, out, at, 1400 * size, 0.07 * size, 3.4, 0.7, 200 * size);
    this.noteAtGain(ctx, out, "square", 150 * size, 40, at, 0.22 * size, 0.6);
    const bits = Math.round(6 * size) + 4;
    for (let i = 0; i < bits; i++) {
      const t = at + 0.04 + rand() * 0.32 * size;
      this.tick(ctx, out, t, 500 + rand() * 2200, 0.025, 2.2 * (1 - i / bits), 1.8);
    }
  }

  /**
   * One filtered burst of noise: the whole percussion set is this function.
   *
   * A bandpass over noise is a stick, a rim, a twig or a footfall depending only on where
   * the band sits and how fast the envelope closes — which is why there are no samples here
   * and no need for any.
   */
  private tick(
    ctx: AudioContext, out: AudioNode, at: number,
    freq: number, dur: number, gain: number, q: number, sweepTo = 0,
  ): void {
    const buf = this.noise;
    if (!buf || typeof ctx.createBufferSource !== "function") return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // Start somewhere random in the buffer, or every tick is the identical waveform and the
    // burst rings like a tone.
    const offset = this.rand() * Math.max(0, buf.duration - dur - 0.01);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(freq, at);
    if (sweepTo) band.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), at + dur);
    band.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(band);
    band.connect(g);
    g.connect(out);
    try { src.start(at, offset, dur + 0.02); } catch { return; }
  }

  /** A pitched note straight onto a bus, for the body under a percussive hit. */
  private noteAtGain(
    ctx: AudioContext, out: AudioNode, type: OscillatorType,
    from: number, to: number, at: number, dur: number, gain: number,
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /**
   * Fetch and decode a manifest file, once.
   *
   * Everything here fails SOFT. A sound is a nicety; a promise rejection that escapes is a
   * crash. So the result — success or failure — is cached under the path, and the caller
   * reads the cache: the very first play of a sampled cue is synthesised while the file is
   * still in the air, which is right, because a cue that arrives late is worse than one
   * that arrived synthesised (the same rule as playing before the first gesture).
   */
  private sample(path: string): Sample {
    const cached = this.samples.get(path);
    if (cached !== undefined) return cached;
    const ctx = this.ctx;
    if (!ctx || typeof ctx.decodeAudioData !== "function") return null;
    // Mark it in flight so a burst of taps does not start a dozen fetches.
    this.samples.set(path, null);
    void (async () => {
      try {
        const res = await fetch(soundUrl(path));
        if (!res.ok) return;
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        this.samples.set(path, buf);
      } catch {
        // Left as null: the synthesiser has it from here, for good.
      }
    })();
    return null;
  }

  /** Play a decoded file at `at`. Returns false when there is nothing to play. */
  private playSample(buf: AudioBuffer, out: AudioNode, at: number, loop = false): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    if (!ctx || typeof ctx.createBufferSource !== "function") return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.connect(out);
    try { src.start(at); } catch { return null; }
    return src;
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
      // A file named in the manifest REPLACES the synthesised cue entirely.
      const file = SOUNDS.cues?.[cue];
      const buf = file ? this.sample(file) : null;
      if (buf && this.playSample(buf, master, now)) return;
      // The percussive cues are noise, and are built rather than looked up.
      if (cue === "move") this.scurry(ctx, master, now, 0.24, 22);
      else if (cue === "travel") this.scurry(ctx, master, now, 0.62, 48);
      else if (cue === "fight") this.crack(ctx, master, now, 0.8);
      else if (cue === "destroy") this.crack(ctx, master, now, 1.35);
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
  setMusicEnabled(_on: boolean): void {}
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
