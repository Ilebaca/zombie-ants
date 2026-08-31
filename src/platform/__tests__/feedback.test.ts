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

/** A recording stand-in for AudioContext: enough surface for the synthesiser to run on. */
function fakeAudio(state: AudioContextState = "running") {
  const started: number[] = [];
  const gains: number[] = [];
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    closed: false,
    resume: vi.fn(() => { ctx.state = "running"; return Promise.resolve(); }),
    close: vi.fn(() => { ctx.closed = true; return Promise.resolve(); }),
    createGain: () => ({
      gain: {
        value: 0,
        setValueAtTime: () => {},
        cancelScheduledValues: () => {},
        exponentialRampToValueAtTime: (v: number) => { gains.push(v); },
      },
      connect: () => {},
    }),
    createOscillator: () => ({
      type: "sine" as OscillatorType,
      frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      detune: { setValueAtTime: () => {} },
      connect: () => {},
      start: (t: number) => { started.push(t); },
      stop: () => {},
    }),
  };
  return { ctx, started, gains };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const CUES: Cue[] = [
  "tap", "move", "fight", "ability", "hive", "endTurn", "win", "lose", "claim", "deny",
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
    const { ctx, started } = fakeAudio();
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    fb.unlock();
    for (const c of CUES) {
      const before = started.length;
      fb.play(c);
      expect(started.length, `${c} made no sound`).toBeGreaterThan(before);
    }
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
    const { ctx, started } = fakeAudio(state);
    const fb = new WebFeedback(() => ctx as unknown as AudioContext, () => {});
    return { fb, ctx, started };
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
