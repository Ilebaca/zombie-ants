/**
 * TEN PLACES, FIFTY CHAPTERS, AND NO BOARD WITHOUT GROUND.
 *
 * The ground a match is played on is painted per REGION (`ui/regions.ts`), and the art
 * arrives file by file — so for most of this feature's life most regions have no picture.
 * What must never happen is a chapter resolving to nothing: a board with no ground at all.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { REGIONS, REGION_CHAPTERS, ROAD_CHAPTERS, regionName, regionOf } from "../../platform";
import { DRAWN_GROUND, groundFor, regionArt, regionsPainted } from "../regions";

const FOLDER = resolve(__dirname, "..", "regions");
const painted = (): string[] => readdirSync(FOLDER).filter((f) => /^rg\d+/.test(f));

describe("the road runs through ten places", () => {
  /** Ten regions of five, and nothing left over — the whole road is somewhere. */
  it("covers every chapter exactly once", () => {
    expect(REGIONS.length * REGION_CHAPTERS).toBe(ROAD_CHAPTERS);
    for (let at = 1; at <= ROAD_CHAPTERS; at++) {
      const region = regionOf(at);
      expect(region, `chapter ${at} is nowhere`).toBeGreaterThanOrEqual(1);
      expect(region, `chapter ${at} is past the last region`).toBeLessThanOrEqual(REGIONS.length);
    }
  });

  /** The boundaries Milan gave: 1–5 the forest floor, 6–10 the desert, 46–50 the bloom. */
  it("puts the boundaries where they were asked for", () => {
    expect(regionName(regionOf(1))).toBe("Forest floor");
    expect(regionName(regionOf(5))).toBe("Forest floor");
    expect(regionName(regionOf(6))).toBe("Desert");
    expect(regionName(regionOf(10))).toBe("Desert");
    expect(regionName(regionOf(11))).toBe("Volcano");
    expect(regionName(regionOf(46))).toBe("Fungal bloom");
    expect(regionName(regionOf(50))).toBe("Fungal bloom");
  });

  /** A colony past the last rung, or a chapter read off a broken save, still gets ground. */
  it("clamps rather than answering with nothing", () => {
    expect(regionOf(0)).toBe(1);
    expect(regionOf(-4)).toBe(1);
    expect(regionOf(ROAD_CHAPTERS + 20)).toBe(REGIONS.length);
    expect(groundFor(Number.NaN)).toBe(DRAWN_GROUND);
  });
});

describe("the ground a match is played on", () => {
  it("answers for every chapter on the road", () => {
    for (let at = 1; at <= ROAD_CHAPTERS; at++) {
      expect(groundFor(at), `chapter ${at} has no ground`).toBeTruthy();
    }
  });

  /**
   * THE FALLBACK IS THE POINT OF THE STRUCTURE. Until a region is painted it wears the
   * game's own drawn ground, exported through `tools/mapshot.ts`, so the board looks
   * exactly as it always has and the feature can land before the art does.
   */
  it("falls back to the drawn ground for a region that has none", () => {
    expect(regionsPainted(), "the folder and the table disagree").toBe(painted().length);
    for (let at = 1; at <= REGIONS.length; at++) {
      const own = painted().some((f) => Number(/^rg(\d+)/.exec(f)?.[1]) === at);
      if (!own) {
        expect(regionArt(at), `region ${at} invented a picture`).toBe(DRAWN_GROUND);
      }
    }
  });

  /** And the drawn one is a real file the build emits, not an empty string. */
  it("ships the drawn ground as a file", () => {
    expect(DRAWN_GROUND).toMatch(/\.webp/);
    expect(readdirSync(FOLDER)).toContain("ground.webp");
  });

  /** Five chapters in a row are one picture — that is the whole of "per region". */
  it("gives five chapters the same ground", () => {
    for (let region = 1; region <= REGIONS.length; region++) {
      const first = (region - 1) * REGION_CHAPTERS + 1;
      for (let at = first; at < first + REGION_CHAPTERS; at++) {
        expect(groundFor(at), `chapter ${at} left ${regionName(region)}`).toBe(regionArt(region));
      }
    }
  });
});
