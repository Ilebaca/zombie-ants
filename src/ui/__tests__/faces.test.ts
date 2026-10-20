/**
 * THE PAINTED ICON IS THE BASIC LOOK, AND ONLY THE BASIC LOOK.
 *
 * A colony's face is drawn (`render/art.ts`) and the drawing is what carries a SKIN — a
 * colourway recolours the whole head and a Mythic look paints an overlay on it. A painted
 * icon is one picture of one colony, so handing it to a colony wearing something found
 * would make wearing a skin do nothing at all on every screen that shows a face, silently
 * and only for the colonies that happen to have been painted.
 *
 * The art arrives colony by colony, so this holds the rule at every stage of that: while
 * nothing is painted every face is still drawn, and the moment one lands it is used for
 * the basic look and refused for the other two.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { SPECIES, basicLook, looksFor } from "../../engine";
import type { SpeciesId } from "../../engine";
import { antPortrait } from "../chrome";
import { faceFor, facesPainted, paintedFaces } from "../faces";

const FOLDER = resolve(__dirname, "..", "faces");
/**
 * What is in the folder — AND AN ABSENT FOLDER IS AN ANSWER, not an error.
 *
 * Git does not track an empty directory, so a feature that lands before its art does
 * reaches CI with no folder at all: it existed on the machine it was written on and
 * nowhere else. `readdirSync` throws ENOENT on that, which failed a deploy with every
 * other test passing. Nothing painted is the state this whole file is about.
 */
const files = (): string[] => {
  try {
    return readdirSync(FOLDER).filter((f) => f.endsWith(".webp"));
  } catch {
    return [];
  }
};
const ALL = Object.keys(SPECIES) as SpeciesId[];

describe("a colony's painted icon", () => {
  /** The folder IS the table: what is in it and what the module found cannot differ. */
  it("finds exactly the files that are there, and nothing it cannot name", () => {
    expect(facesPainted(), "the folder and the table disagree").toBe(files().length);
    for (const f of files()) {
      const id = f.replace(/\.webp$/, "") as SpeciesId;
      expect(ALL, `${f} is named after no colony in the game`).toContain(id);
      expect(faceFor(id), `${id} did not resolve to its own file`).toBeTruthy();
    }
    expect(Object.keys(paintedFaces()).sort())
      .toEqual(files().map((f) => f.replace(/\.webp$/, "")).sort());
  });

  it("answers null for a colony that has not been painted", () => {
    for (const id of ALL) {
      if (files().includes(`${id}.webp`)) continue;
      expect(faceFor(id), `${id} invented an icon`).toBeNull();
    }
  });

  /**
   * THE RULE. A painted colony shows its painting for the look it was born with and its
   * DRAWN head for either of the two that are found — and an unpainted one is drawn
   * whatever it is wearing.
   */
  it("gives the painting to the basic look and the drawing to a skin", () => {
    for (const id of ALL) {
      const painted = !!faceFor(id);
      const basic = antPortrait(id, 64, undefined, basicLook(id));
      expect(basic.tagName, `${id} basic`).toBe(painted ? "IMG" : "CANVAS");
      // The default is the basic look, so no argument must answer the same way.
      expect(antPortrait(id, 64).tagName, `${id} with no look`).toBe(basic.tagName);
      for (const look of looksFor(id)) {
        if (look.id === basicLook(id).id) continue;
        expect(antPortrait(id, 64, undefined, look).tagName, `${id} wearing ${look.id}`)
          .toBe("CANVAS");
      }
    }
  });

  /** Painted or drawn, it is silent: the face always sits inside something already named. */
  it("says nothing to a screen reader either way", () => {
    for (const id of ALL) {
      expect(antPortrait(id, 64).getAttribute("aria-hidden"), id).toBe("true");
    }
  });
});
