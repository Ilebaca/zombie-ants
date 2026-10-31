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

  /**
   * EVERY CHAPTER HAS ITS OWN PICTURE NOW, and that is the thing the per-chapter tier was
   * held open for. The five in a region are the same SCENE with the path walked one mound
   * further, so they are fifty different files rather than ten — a test cannot see a
   * scene, but it can hold that no two chapters share a url and that nobody fell back.
   */
  it("gives every chapter a picture of its own", () => {
    expect(backdropsDrawn(), "a chapter lost its artwork").toBe(ROAD_CHAPTERS);
    const seen = new Set<string>();
    for (let at = 1; at <= ROAD_CHAPTERS; at++) seen.add(backdropFor(at));
    expect(seen.size, "two chapters share one picture").toBe(ROAD_CHAPTERS);
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
   * THE CHAPTER'S OWN PICTURE BEATS ITS REGION'S, which is the precedence the two tiers
   * exist for. This stood for months as "the folder is empty, write the real test the day
   * somebody drops a file in" — that day came with all fifty at once, so what it holds now
   * is that no chapter resolves to the band sitting behind it. Both tiers are present for
   * every chapter on the road, so a mutation reversing the two is caught fifty times.
   */
  it("prefers a chapter's own picture to its region's", () => {
    expect(bandsDrawn(), "there is no band left to be overridden").toBe(REGIONS.length);
    const bands = new Set(
      Array.from({ length: REGIONS.length }, (_, i) => (i + 1))
        .map((region) => banded().find((f) => Number(/^rg(\d+)/.exec(f)?.[1]) === region) ?? ""),
    );
    for (let at = 1; at <= ROAD_CHAPTERS; at++) {
      const url = backdropFor(at);
      expect(url, `chapter ${at} is wearing its region's picture`)
        .toContain(`ch${String(at).padStart(2, "0")}`);
      for (const band of bands) {
        expect(url, `chapter ${at} fell back to ${band}`).not.toContain(band.replace(/\.webp$/, ""));
      }
    }
  });

  /** And the shipped one is a real file the build will emit, not an empty string. */
  it("ships a default", () => {
    expect(HOME_BACKDROP).toMatch(/\.webp/);
  });
});
