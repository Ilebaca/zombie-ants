/**
 * ONE PICTURE PER CHAPTER, AND NO CHAPTER WITHOUT ONE.
 *
 * The artwork arrives file by file (§ THE HOME ARTWORK), so for most of this feature's
 * life most chapters have no picture of their own. What must never happen is a chapter
 * resolving to nothing — a home screen with no ground — so every one of the fifty is
 * asked for here, including the ones either side of the road's ends.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ROAD_CHAPTERS } from "../../platform";
import { HOME_BACKDROP, backdropFor, backdropsDrawn } from "../backdrops";

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
   * THE FALLBACK IS THE POINT OF THE STRUCTURE. Until a chapter's own picture exists it
   * wears the one the game ships with, so the feature can land before the art does.
   */
  it("falls back to the shipped artwork for a chapter that has none", () => {
    const drawn = readdirSync(resolve(__dirname, "..", "backdrops"))
      .filter((f) => /^ch\d+\.webp$/.test(f)).length;
    expect(backdropsDrawn(), "the folder and the table disagree").toBe(drawn);
    for (let at = 1; at <= ROAD_CHAPTERS; at++) {
      const own = readdirSync(resolve(__dirname, "..", "backdrops"))
        .includes(`ch${String(at).padStart(2, "0")}.webp`);
      if (!own) expect(backdropFor(at), `chapter ${at} invented a picture`).toBe(HOME_BACKDROP);
    }
  });

  /** And the shipped one is a real file the build will emit, not an empty string. */
  it("ships a default", () => {
    expect(HOME_BACKDROP).toMatch(/\.webp/);
  });
});
