/**
 * ONE PICTURE PER REGION, AND NO CHAPTER WITHOUT ONE.
 *
 * The artwork arrives file by file (§ THE HOME ARTWORK), and it arrives in five-chapter
 * BANDS — the same ones the board's ground follows, so home and the match behind it are
 * the same place. What must never happen is a chapter resolving to nothing (a home screen
 * with no ground), so every one of the fifty is asked for here, including the ones either
 * side of the road's ends.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { REGIONS, REGION_CHAPTERS, ROAD_CHAPTERS, regionOf } from "../../platform";
import { HOME_BACKDROP, backdropFor, backdropsDrawn, bandsDrawn } from "../backdrops";

const FOLDER = resolve(__dirname, "..", "backdrops");
const banded = (): string[] => readdirSync(FOLDER).filter((f) => /^rg\d+/.test(f));

describe("the home artwork follows the chapter", () => {
  it("answers for every chapter on the road", () => {
    for (let at = 1; at <= ROAD_CHAPTERS; at++) {
      expect(backdropFor(at), `chapter ${at} has no ground`).toBeTruthy();
    }
  });

  /** A colony past the last rung, or a chapter read off a broken save, still gets ground. */
  it("clamps rather than answering with nothing", () => {
    expect(backdropFor(0)).toBe(backdropFor(1));
    expect(backdropFor(ROAD_CHAPTERS + 40)).toBe(backdropFor(ROAD_CHAPTERS));
    expect(backdropFor(Number.NaN)).toBe(HOME_BACKDROP);
  });

  /**
   * THE FALLBACK IS THE POINT OF THE STRUCTURE. A chapter with neither its own picture
   * nor its region's wears the one the game ships with, which is what let the feature
   * land before the art did. All ten regions are painted now, so on the road this passes
   * by having nothing to check; `backdropFor(NaN)` is where it is still exercised.
   */
  it("falls back to the shipped artwork where there is nothing else", () => {
    const own = readdirSync(FOLDER);
    expect(backdropsDrawn(), "the folder and the table disagree")
      .toBe(own.filter((f) => /^ch\d+/.test(f)).length);
    expect(bandsDrawn(), "the folder and the bands disagree").toBe(banded().length);
    for (let at = 1; at <= ROAD_CHAPTERS; at++) {
      const painted = own.includes(`ch${String(at).padStart(2, "0")}.webp`)
        || banded().some((f) => Number(/^rg(\d+)/.exec(f)?.[1]) === regionOf(at));
      if (!painted) expect(backdropFor(at), `chapter ${at} invented a picture`).toBe(HOME_BACKDROP);
    }
  });

  /**
   * AND ALL TEN REGIONS ARE PAINTED, which is the claim the folder makes. A file deleted
   * or misnamed falls silently back to the placeholder — home still draws, so nothing
   * else in the suite would say a word about it.
   */
  it("has a picture for every region", () => {
    expect(bandsDrawn()).toBe(REGIONS.length);
    for (let at = 1; at <= ROAD_CHAPTERS; at++) {
      expect(backdropFor(at), `chapter ${at} is not painted`).not.toBe(HOME_BACKDROP);
    }
  });

  /** Five chapters in a row are one picture — that is the whole of "per region". */
  it("gives a region's five chapters the same artwork", () => {
    for (let region = 1; region <= REGIONS.length; region++) {
      const first = (region - 1) * REGION_CHAPTERS + 1;
      for (let at = first; at < first + REGION_CHAPTERS; at++) {
        expect(backdropFor(at), `chapter ${at} left its region`).toBe(backdropFor(first));
      }
    }
  });

  /** Ten pictures, not one: the road has to actually LOOK like it goes somewhere. */
  it("changes at every region boundary", () => {
    const seen = new Set<string>();
    for (let region = 1; region <= REGIONS.length; region++) {
      seen.add(backdropFor((region - 1) * REGION_CHAPTERS + 1));
    }
    expect(seen.size).toBe(REGIONS.length);
  });

  /**
   * NO CHAPTER HAS A PICTURE OF ITS OWN YET, and this says so OUT LOUD rather than
   * quietly looping over nothing. The per-chapter tier outranks the region's and is kept
   * for the rung that one day deserves its own picture — but with the folder empty there
   * is no precedence to exercise, and a test that walks an empty list is a test that
   * passes against a mutation reversing it. So this fails on the day somebody adds the
   * first `ch<NN>.webp`, which is the day to replace it with the real precedence test.
   */
  it("has no per-chapter artwork to override a band with", () => {
    expect(backdropsDrawn(), "write the precedence test now").toBe(0);
  });

  /** And the shipped one is a real file the build will emit, not an empty string. */
  it("ships a default", () => {
    expect(HOME_BACKDROP).toMatch(/\.webp/);
  });
});
