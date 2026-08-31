/**
 * SOUND AND HAPTICS.
 *
 * The sound is synthesised rather than shipped — there is no asset pipeline here and no
 * image file either — so what there is to test is not a waveform but the RULES around it,
 * every one of which is a way a player gets a broken game rather than a quiet one:
 *
 *   - a browser will not start audio without a gesture, and a cue before that is DROPPED
 *     rather than queued, because a sound arriving after the thing it marks is worse;
 *   - a device with no audio, or one that refuses, must not take the rest of the app down;
 *   - muted means silent, and it must still buzz if haptics are on, and the reverse.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SilentFeedback, WebFeedback } from "../feedback";
import type { Cue } from "../feedback";

/**
 * A recording stand-in for AudioContext: enough surface for the synthesiser to run on.
 *
 * `full` is the difference between a phone that can do convolution and buffer sources and
 * one that cannot. Both have to work — the room and the wind are what make the bed sound
 * like a place rather than a device, but a browser without them gets a thinner bed and
 * never a broken one — so the default here is the POOR device, and every existing test
 * runs on it.
 */
function fakeAudio(state: AudioContextState = "running", full = false) {
  const started: number[] = [];
  const gains: number[] = [];
  const freqs: number[] = [];
  const envelopes: { kind: "set" | "ramp"; v: number; t: number }[][] = [];
  const nodes = { convolver: 0, buffers: 0, sources: 0, filters: 0, loops: 0, limiter: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime: () => {},
    cancelScheduledValues: () => {},
    linearRampToValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  });
  const ctx: Record<string, unknown> & {
    state: AudioContextState; currentTime: number; closed: boolean;
  } = {
    state,
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    closed: false,
    resume: vi.fn(() => { ctx.state = "running"; return Promise.resolve(); }),
    close: vi.fn(() => { ctx.closed = true; return Promise.resolve(); }),
    createGain: () => {
      // Every automation point on every note, in order: the ENVELOPE, which is what
      // decides whether a held note is a pad or a tick.
      const env: { kind: "set" | "ramp"; v: number; t: number }[] = [];
      envelopes.push(env);
      return {
        gain: {
          value: 0,
          setValueAtTime: (v: number, t: number) => { env.push({ kind: "set", v, t }); },
          // A REAL timeline: cancelling drops everything scheduled at or after that time.
          // Modelling this as a no-op is what let the bed's fade bug hide — the fade-out
          // the old bed scheduled outlives the new bed's fade-in unless it is cancelled,
          // and a fake that forgets automation cannot show that.
          cancelScheduledValues: (t: number) => {
            for (let i = env.length - 1; i >= 0; i--) if ((env[i]?.t ?? 0) >= t) env.splice(i, 1);
          },
          exponentialRampToValueAtTime: (v: number, t: number) => {
            gains.push(v);
            env.push({ kind: "ramp", v, t });
          },
        },
        connect: () => {},
      };
    },
    createOscillator: () => ({
      type: "sine" as OscillatorType,
      frequency: {
        setValueAtTime: (v: number) => { freqs.push(v); },
        exponentialRampToValueAtTime: () => {},
      },
      detune: { setValueAtTime: () => {} },
      connect: () => {},
      start: (t: number) => { started.push(t); },
      stop: () => {},
    }),
  };
  if (full) {
    ctx.createBuffer = (ch: number, len: number) => {
      nodes.buffers++;
      const data = Array.from({ length: ch }, () => new Float32Array(len));
      return { getChannelData: (i: number) => data[i] as Float32Array, length: len };
    };
    ctx.createConvolver = () => { nodes.convolver++; return { buffer: null, connect: () => {} }; };
    ctx.createBufferSource = () => {
      nodes.sources++;
      return {
        buffer: null,
        set loop(v: boolean) { if (v) nodes.loops++; },
        get loop() { return true; },
        connect: () => {},
        start: (t: number) => { started.push(t); },
        stop: () => {},
      };
    };
    ctx.createDynamicsCompressor = () => {
      nodes.limiter++;
      return {
        threshold: param(), knee: param(), ratio: param(),
        attack: param(), release: param(), connect: () => {},
      };
    };
    ctx.createBiquadFilter = () => {
      nodes.filters++;
      return { type: "lowpass", frequency: param(), Q: param(), connect: () => {} };
    };
  }
  return { ctx, started, gains, freqs, nodes, envelopes };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const CUES: Cue[] = [
  "tap", "move", "travel", "fight", "destroy", "ability", "hive", "endTurn",
  "win", "lose", "claim", "deny",
];

describe("before the first gesture", () => {
  /** A browser refuses to start audio without one, and a queued sound is a late sound. */
  it("drops every cue rather than queueing it", () => {
    const { ctx, started } = fakeAudio();
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    for (const c of CUES) fb.play(c);
    expect(started, "a cue played before the device existed").toEqual([]);
  });

  it("builds the device on unlock, and plays from then on", () => {
    const { ctx, started } = fakeAudio();
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    fb.unlock();
    fb.play("fight");
    expect(started.length).toBeGreaterThan(0);
  });

  // A context created before the gesture, or suspended by a backgrounded tab, is silent
  // until something resumes it — and nothing else will.
  it("resumes a suspended device instead of leaving it mute", () => {
    const { ctx, started } = fakeAudio("suspended");
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    fb.unlock();
    expect(ctx.resume).toHaveBeenCalled();
    fb.play("win");
    expect(started.length).toBeGreaterThan(0);
  });

  /**
   * `resume()` is ASYNCHRONOUS. Between the press and the device actually running, the
   * context is still suspended — and scheduling a note on a suspended context does not play
   * it late, it plays it at the wrong time when the clock starts. Dropped, again.
   */
  it("drops a cue in the gap while the device is still waking up", () => {
    const { ctx, started } = fakeAudio("suspended");
    ctx.resume = vi.fn(() => new Promise<void>(() => {}));   // never settles
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    fb.unlock();
    fb.play("fight");
    expect(started, "a cue was scheduled on a device that was not running").toEqual([]);
  });

  it("builds the device once, however many presses arrive", () => {
    const make = vi.fn(() => fakeAudio().ctx as unknown as AudioContext);
    const fb = new WebFeedback(make, () => {});
    fb.unlock(); fb.unlock(); fb.unlock();
    expect(make).toHaveBeenCalledTimes(1);
  });
});

describe("a device that cannot do this", () => {
  it("stays silent rather than throwing, with no audio at all", () => {
    const buzzed: (number | number[])[] = [];
    const fb = new WebFeedback(null, (p) => buzzed.push(p));
    expect(() => { fb.unlock(); for (const c of CUES) fb.play(c); }).not.toThrow();
    // ...and haptics still work, because they are a separate capability.
    expect(buzzed.length).toBeGreaterThan(0);
  });

  it("gives up quietly when the browser refuses", () => {
    const fb = new WebFeedback(() => { throw new Error("blocked"); }, () => {});
    expect(() => { fb.unlock(); fb.play("win"); }).not.toThrow();
  });

  it("survives a device that will not vibrate", () => {
    const { ctx } = fakeAudio();
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {
      throw new Error("no motor");
    });
    fb.unlock();
    expect(() => fb.play("fight")).not.toThrow();
  });
});

describe("the switches", () => {
  const rig = () => {
    const { ctx, started } = fakeAudio();
    const buzzed: (number | number[])[] = [];
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, (p) => buzzed.push(p));
    fb.unlock();
    return { fb, started, buzzed };
  };

  it("plays nothing with the sound off, and still buzzes", () => {
    const { fb, started, buzzed } = rig();
    fb.setSound(false);
    fb.play("fight");
    expect(started, "muted and still making noise").toEqual([]);
    expect(buzzed.length, "vibration went off with the sound").toBeGreaterThan(0);
  });

  it("buzzes nothing with haptics off, and still plays", () => {
    const { fb, started, buzzed } = rig();
    fb.setHaptics(false);
    fb.play("fight");
    expect(buzzed).toEqual([]);
    expect(started.length).toBeGreaterThan(0);
  });

  it("comes back on", () => {
    const { fb, started } = rig();
    fb.setSound(false);
    fb.play("fight");
    fb.setSound(true);
    fb.play("fight");
    expect(started.length).toBeGreaterThan(0);
  });
});

describe("the cues themselves", () => {
  it("gives every moment a sound", () => {
    // The full device, because four of these cues are NOISE rather than notes — the scurry
    // a column of ants makes and the crack of ground coming apart are windows onto a noise
    // buffer, and a context with no buffer sources cannot make one.
    const { ctx, started } = fakeAudio("running", true);
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    fb.unlock();
    for (const c of CUES) {
      const before = started.length;
      fb.play(c);
      expect(started.length, `${c} made no sound`).toBeGreaterThan(before);
    }
  });

  /**
   * MOVEMENT IS A SCURRY. What moves on this board is a column of ants, and the sound of
   * that is a great many tiny impacts filling the time the move takes — not one blip. A
   * long send is the same thing over a longer distance, so it has to be MORE of them.
   */
  it("moves as a burst of small taps, and a long send as a longer burst", () => {
    const { ctx, started } = fakeAudio("running", true);
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    fb.unlock();
    const count = (c: Cue): number => {
      const before = started.length;
      fb.play(c);
      return started.length - before;
    };
    const move = count("move");
    const travel = count("travel");
    expect(move, "a move is one blip, not a column of ants").toBeGreaterThan(4);
    expect(travel, "a long send sounds the same as a short one").toBeGreaterThan(move);
  });

  /** And destruction is bigger than a fight, because it is: the ground itself went. */
  it("gives destruction more debris than a fight", () => {
    const { ctx, started } = fakeAudio("running", true);
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    fb.unlock();
    const count = (c: Cue): number => {
      const before = started.length;
      fb.play(c);
      return started.length - before;
    };
    expect(count("destroy")).toBeGreaterThan(count("fight"));
  });

  /** A tile picked up happens constantly. A buzz on every one is not feedback, it is a fault. */
  it("does not buzz on the things that happen constantly", () => {
    let hits = 0;
    const fb = new WebFeedback(null, () => { hits++; });
    const buzzes = (c: Cue): boolean => {
      const before = hits;
      fb.play(c);
      return hits > before;
    };
    expect(buzzes("tap"), "every tile picked up buzzed the phone").toBe(false);
    expect(buzzes("endTurn")).toBe(false);
    expect(buzzes("fight")).toBe(true);
    expect(buzzes("win")).toBe(true);
  });

  it("releases the audio device when it is closed", () => {
    const { ctx } = fakeAudio();
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    fb.unlock();
    fb.close();
    expect(ctx.close).toHaveBeenCalled();
  });
});

describe("the way out", () => {
  /**
   * A LIMITER, and it is not a nicety.
   *
   * The match bed is a drum kit, an ostinato, a pad and a melody, and a cue can land on top
   * of all four: measured in a browser that hit twice full scale, which a browser clips
   * into distortion. The alternative is turning everything down until the worst moment
   * fits, which is a bed nobody can hear — where this whole thing started.
   */
  it("holds the loud moments down so the rest can be loud", () => {
    const { ctx, nodes } = fakeAudio("running", true);
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    fb.unlock();
    expect(nodes.limiter, "nothing is stopping the output clipping").toBe(1);
    fb.close();
  });

  /** And a device without one still plays. Every part of this is feature-guarded. */
  it("plays without one on a device that has none", () => {
    const { ctx, started } = fakeAudio();
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    fb.unlock();
    fb.play("win");
    expect(started.length).toBeGreaterThan(0);
  });
});

describe("the silent one", () => {
  // Not a stub for something missing: it is the honest implementation for a device that
  // cannot do this, and every test in the suite runs on it.
  it("answers every call and does nothing", () => {
    const fb = new SilentFeedback();
    expect(() => {
      fb.unlock();
      for (const c of CUES) fb.play(c);
      fb.setSound(true); fb.setHaptics(false); fb.close();
    }).not.toThrow();
  });
});

/**
 * THE BEDS.
 *
 * Generated note by note for the same reason the cues are: there is no asset pipeline here,
 * and a music file is a megabyte before the first screen. What matters is the plumbing —
 * a bed that restarts on every screen change is a stutter, one that keeps scheduling into a
 * muted bus is a phone warmed up for nothing, and a wish made before the first press has to
 * survive until there is a device to grant it.
 */
describe("the music", () => {
  const rig = (state: AudioContextState = "running") => {
    const { ctx, started, gains, freqs, nodes, envelopes } = fakeAudio(state);
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    return { fb, ctx, started, gains, freqs, nodes, envelopes };
  };

  /**
   * Run the audio clock and the timer together, the way a browser does.
   *
   * Advancing one without the other is what a naive test does, and it measures nothing: the
   * scheduler looks a fraction of a second ahead, so a jump of two seconds with one tick
   * behind it lands between notes as often as on one.
   */
  const runClock = (ctx: { currentTime: number }, seconds: number): void => {
    for (let t = 0; t < seconds; t += 0.05) {
      ctx.currentTime += 0.05;
      vi.advanceTimersByTime(60);
    }
  };

  /** The app asks for the menu bed at boot, which is long before the first press. */
  it("remembers a bed asked for before there was a device", () => {
    const { fb, started } = rig();
    fb.setMusic("menu");
    expect(started, "music started with no device").toEqual([]);
    fb.unlock();
    vi.advanceTimersByTime(0);
    expect(started.length, "the bed was forgotten at unlock").toBeGreaterThan(0);
  });

  it("keeps scheduling as the clock runs on", () => {
    const { fb, ctx, started } = rig();
    fb.unlock();
    fb.setMusic("menu");
    const first = started.length;
    runClock(ctx, 4);
    expect(started.length, "the bed ran out of notes").toBeGreaterThan(first);
  });

  /** Navigation calls this constantly. Restarting on each call would be a stutter. */
  it("does nothing when asked for the bed already playing", () => {
    const { fb, ctx, started } = rig();
    fb.unlock();
    fb.setMusic("menu");
    runClock(ctx, 1);
    const before = started.length;
    fb.setMusic("menu");
    fb.setMusic("menu");
    expect(started.length, "the bed restarted on a repeat request").toBe(before);
  });

  it("changes bed for the board, and back again", () => {
    const { fb, ctx, started } = rig();
    fb.unlock();
    fb.setMusic("menu");
    const a = started.length;
    runClock(ctx, 1);
    fb.setMusic("match");
    runClock(ctx, 2);
    expect(started.length).toBeGreaterThan(a);
    expect(() => fb.setMusic("menu")).not.toThrow();
  });

  it("stops when asked for nothing", () => {
    const { fb, ctx, started } = rig();
    fb.unlock();
    fb.setMusic("menu");
    fb.setMusic(null);
    const before = started.length;
    runClock(ctx, 4);
    expect(started.length, "a stopped bed carried on playing").toBe(before);
  });

  /**
   * Muting STOPS it rather than turning it down. An oscillator per sixteenth, for ever,
   * into a gain of zero is a phone kept awake for nothing.
   */
  it("stops the bed when the sound is switched off, and brings it back", () => {
    const { fb, ctx, started } = rig();
    fb.unlock();
    fb.setMusic("menu");
    fb.setSound(false);
    const muted = started.length;
    runClock(ctx, 4);
    expect(started.length, "a muted bed was still making oscillators").toBe(muted);

    fb.setSound(true);
    runClock(ctx, 4);
    expect(started.length).toBeGreaterThan(muted);
  });

  it("schedules nothing while the device is still waking up", () => {
    const { fb, ctx, started } = rig("suspended");
    ctx.resume = vi.fn(() => new Promise<void>(() => {}));
    fb.unlock();
    fb.setMusic("menu");
    runClock(ctx, 3);
    expect(started).toEqual([]);
  });

  it("catches up rather than dumping a thousand notes after a tab was away", () => {
    const { fb, ctx, started } = rig();
    fb.unlock();
    fb.setMusic("menu");
    const before = started.length;
    ctx.currentTime += 600;                 // ten minutes in the background
    vi.advanceTimersByTime(100);
    expect(started.length - before, "the bed scheduled the whole gap at once")
      .toBeLessThan(60);
  });

  /**
   * The harmony is a sixteen-bar round, not a four-bar loop.
   *
   * A loop a player can predict is a loop they start hearing, and this bed is meant to run
   * for an hour under a game. Counted off the notes rather than off the table, so a change
   * to the round that shortened it back to a phrase would fail here.
   */
  it("moves through more than one chord before it comes round", () => {
    const { fb, ctx, freqs } = rig();
    fb.unlock();
    fb.setMusic("menu");
    runClock(ctx, 40);
    // Counted off the BASS, which is one note per bar at the chord's root and the only
    // voice below the tonic. Counting every pitch instead proves nothing: the melody is a
    // random walk, so it fills the histogram whatever the harmony is doing — which is
    // exactly what a collapsed round hid behind the first time this was written.
    const bass = new Set(freqs.filter((f) => f > 30 && f < 110).map((f) => Math.round(f)));
    expect(bass.size, "the bed sat on one chord").toBeGreaterThanOrEqual(4);
  });

  /**
   * The melody is CHOSEN AT RANDOM, so the only thing keeping it in tune is the scale.
   * Every pitch has to be a pentatonic degree of the bed's own tonic, or a walk that
   * wandered off the scale would be audible as a wrong note and invisible here.
   */
  it("never plays a note outside the key", () => {
    const { fb, ctx, freqs } = rig();
    fb.unlock();
    fb.setMusic("menu");
    runClock(ctx, 40);
    // Birds are not in the band: they slide, and they sit far above the music. Nor are
    // the vibrato LFOs, which are a few hertz and are not heard as pitch at all.
    const notes = freqs.filter((f) => f > 30 && f < 2000);
    expect(notes.length, "nothing was scheduled").toBeGreaterThan(20);
    // A natural minor, and nothing else. Five of the twelve semitones are excluded, and
    // this is the assertion that caught the first version of the bed: its round moved the
    // chord roots while the voicing stacked a fixed number of SEMITONES above them, so ten
    // of the twelve turned up — a random melody over a chromatic accompaniment.
    const scale = [0, 2, 3, 5, 7, 8, 10];
    for (const f of notes) {
      const semis = 12 * Math.log2(f / 110);
      const near = Math.round(semis);
      expect(Math.abs(semis - near), `${f}Hz is between two notes`).toBeLessThan(0.01);
      expect(scale, `${f}Hz is not in the scale`).toContain(((near % 12) + 12) % 12);
    }
  });

  /**
   * A phone that can convolve gets the room and the wind. Both are what turn a beep into
   * an instrument standing in a clearing, and both are built ONCE — a per-note impulse
   * response would be the most expensive thing in the app.
   */
  it("builds the room and the wind once for a bed that can have them", () => {
    const { ctx, nodes } = fakeAudio("running", true);
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    fb.unlock();
    fb.setMusic("menu");
    runClock(ctx, 8);
    expect(nodes.convolver, "no room").toBe(1);
    expect(nodes.sources, "no wind").toBe(1);
    expect(nodes.loops, "the wind does not loop, so it stops after four seconds").toBe(1);
    fb.close();
  });

  /** And a phone that cannot gets a thinner bed, never a broken one. */
  it("still plays on a device with no convolver and no buffers", () => {
    const { fb, ctx, started } = rig();
    fb.unlock();
    fb.setMusic("match");
    runClock(ctx, 6);
    expect(started.length, "a poor device got silence").toBeGreaterThan(10);
  });

    /**
   * A HELD NOTE HAS TO HOLD, and this is the test that would have caught it not doing.
   *
   * The bed's envelope ramped straight from its attack down to silence, which sounds like a
   * decaying pluck however long the note is written to be: an exponential from 0.075 to
   * 0.0001 is four fifths of the way down a quarter of the way through. So the pads were
   * ticks, the whole bed measured about −54 dBFS at the speaker, and the report from the
   * phone was that there was no music at all. Every test in this file passed.
   */
  it("holds a long note rather than decaying it away", () => {
    const { fb, ctx, envelopes } = rig();
    fb.unlock();
    fb.setMusic("menu");
    runClock(ctx, 8);
    // The pad is the longest thing in the bed: five beats. Find the envelopes that span it.
    const long = envelopes.filter((e) => e.length >= 3 && (e[e.length - 1]?.t ?? 0) - (e[0]?.t ?? 0) > 2);
    expect(long.length, "nothing in the bed is held for long").toBeGreaterThan(3);
    for (const env of long) {
      const start = env[0]?.t ?? 0;
      const end = env[env.length - 1]?.t ?? 0;
      const top = Math.max(...env.map((p) => p.v));
      // The last point at full level: everything before it is attack, everything after is
      // release. A note that is still at its peak past the halfway mark is a note that is
      // sounding, not one that faded out under the next.
      const held = Math.max(...env.filter((p) => p.v >= top * 0.99).map((p) => p.t));
      const through = (held - start) / (end - start);
      expect(through, "the note starts fading before it is half over").toBeGreaterThan(0.5);
    }
  });

  /**
   * And it has to be LOUD ENOUGH to hear over a phone speaker in a room. Measured off the
   * envelope peaks rather than off a rendered waveform, which is as close as a fake context
   * gets — the real level was checked in a browser with an analyser on the destination.
   */
  it("plays the bed at a level a speaker can carry", () => {
    const { fb, ctx, gains } = rig();
    fb.unlock();
    fb.setMusic("menu");
    runClock(ctx, 8);
    const bus = Math.max(...gains);
    expect(bus, "the whole bed is turned down to nothing").toBeGreaterThan(0.5);
  });

    /**
   * THE BED HAS TO ARRIVE AT ONCE, and this is the bug that stopped it.
   *
   * `stopMusic` schedules a ramp down to silence a third of a second out, and the timeline
   * KEEPS it. So the new bed faded up into a fade-down that was still coming — which was
   * a bed that took seconds to appear when the two lengths missed each other, and one that
   * never appeared at all when they lined up. Cancelling first is the whole fix.
   */
  it("cancels the old bed's fade before opening the new one", () => {
    const { fb, ctx, envelopes } = rig();
    fb.unlock();
    fb.setMusic("menu");
    runClock(ctx, 2);
    fb.setMusic("match");
    runClock(ctx, 2);
    // The bus is the one gain node that outlives every note: it is made at unlock, before
    // any bed exists. Read IN TIME ORDER, not in the order the calls were made — the stale
    // ramp is scheduled first and lands last, which is the whole shape of the bug.
    const bus = [...(envelopes[1] ?? [])].sort((a, z) => a.t - z.t);
    const last = bus[bus.length - 1];
    expect(last?.v ?? 0, "the new bed was left fading to silence").toBeGreaterThan(0.5);
  });

  /** And it has to arrive NOW: the fade is a quarter of a second, not most of a second. */
  it("opens the bed within a quarter second of the first note", () => {
    const { fb, ctx, envelopes } = rig();
    fb.unlock();
    fb.setMusic("menu");
    runClock(ctx, 1);
    const bus = envelopes[1] ?? [];
    const open = bus.find((p) => p.v > 0.5);
    const start = bus[0]?.t ?? 0;
    expect(open, "the bed never opened up").toBeDefined();
    expect((open?.t ?? 99) - start, "the bed takes too long to arrive").toBeLessThanOrEqual(0.3);
  });

    /**
   * THE MATCH BED IS A WAR, NOT FURNITURE.
   *
   * The two beds were the same music at two speeds, which says the same thing on the home
   * screen and over a board somebody is losing. Same key, same round — so it is
   * recognisably the same world — but under the board there is a drum and an ostinato, and
   * far more happens per second.
   */
  it("plays a busier, harder bed over the board than in the menus", () => {
    const busy = (track: "menu" | "match"): { bar: number; drums: number } => {
      const { ctx, nodes, envelopes } = fakeAudio("running", true);
      const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
      fb.unlock();
      fb.setMusic(track);
      // The wind is one buffer source per bed; everything past it is percussion.
      const wind = nodes.sources;
      for (let t = 0; t < 12; t += 0.05) { ctx.currentTime += 0.05; vi.advanceTimersByTime(60); }
      // The pad is the LONGEST voice in either bed and it fires once on each bar line, so
      // the gap between those is the bar, and the bar is the tempo. Found by length rather
      // than by a fixed threshold: the two beds run at different speeds, which is the
      // whole point, so any fixed number picks a different voice in each of them.
      const spans = envelopes.map((e) => ({ t: e[0]?.t ?? 0, d: (e[e.length - 1]?.t ?? 0) - (e[0]?.t ?? 0) }));
      const longest = Math.max(...spans.map((v) => v.d));
      const pads = spans
        .filter((v) => v.d > longest * 0.95)
        .map((v) => v.t)
        .sort((a, z) => a - z);
      const gaps = pads.slice(1).map((t, i) => t - (pads[i] ?? 0)).filter((g) => g > 0.01);
      fb.close();
      return { bar: Math.min(...gaps), drums: nodes.sources - wind };
    };
    const menu = busy("menu");
    const match = busy("match");
    expect(menu.drums, "the menu bed has a drum kit under it").toBe(0);
    expect(match.drums, "the match bed has no drum under it").toBeGreaterThan(20);
    expect(match.bar, "the match bed is no quicker than the menu").toBeLessThan(menu.bar * 0.8);
  });

    it("takes the bed down when it is closed", () => {
    const { fb, ctx, started } = rig();
    fb.unlock();
    fb.setMusic("menu");
    fb.close();
    const before = started.length;
    runClock(ctx, 4);
    expect(started.length).toBe(before);
  });
});
