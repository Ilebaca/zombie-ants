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
import { describe, expect, it, vi } from "vitest";
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
        exponentialRampToValueAtTime: (v: number) => { gains.push(v); },
      },
      connect: () => {},
    }),
    createOscillator: () => ({
      type: "sine" as OscillatorType,
      frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
      start: (t: number) => { started.push(t); },
      stop: () => {},
    }),
  };
  return { ctx, started, gains };
}

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
