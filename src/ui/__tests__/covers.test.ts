/**
 * ONE PAINTING PER COLONY, AND NO PAGE WITHOUT A COVER BOX.
 *
 * The art arrives colony by colony (§ THE FOLDER IS THE TABLE), so for most of this
 * feature's life some colonies have no painting. What must never happen is a page that
 * changes SHAPE depending on whether one has landed — the box holds the ratio either way,
 * and a colony with no file of its own draws its head on the plate instead.
 *
 * The other half is the one that would be silent: a file named after something that is
 * not a colony, or a cover resolving onto the wrong one. A player cannot tell a Bullet
 * Ant's painting on the Army Ant's page from a deliberate choice.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { SPECIES } from "../../engine";
import type { SpeciesId } from "../../engine";
import { COVER_H, COVER_W, coverFor, coversPainted } from "../covers";

const FOLDER = resolve(__dirname, "..", "covers");
const files = (): string[] => readdirSync(FOLDER).filter((f) => f.endsWith(".webp"));
const ALL = Object.keys(SPECIES) as SpeciesId[];

describe("a colony's cover", () => {
  it("answers for every colony, with a picture or with null", () => {
    for (const id of ALL) {
      const art = coverFor(id);
      expect(art === null || typeof art === "string", `${id} answered something else`).toBe(true);
      if (art) expect(art, `${id}`).toMatch(/\.webp/);
    }
  });

  /** The folder IS the table: what is in it and what the module found cannot differ. */
  it("finds exactly the files that are there", () => {
    expect(coversPainted(), "the folder and the table disagree").toBe(files().length);
    for (const f of files()) {
      const id = f.replace(/\.webp$/, "") as SpeciesId;
      expect(ALL, `${f} is named after no colony in the game`).toContain(id);
      expect(coverFor(id), `${id} did not resolve to its own file`).toBeTruthy();
    }
  });

  /** A colony with no file of its own invents nothing. */
  it("answers null for a colony that has not been painted", () => {
    for (const id of ALL) {
      if (files().includes(`${id}.webp`)) continue;
      expect(coverFor(id), `${id} invented a cover`).toBeNull();
    }
  });

  /**
   * THE RATIO IS WRITTEN IN TWO PLACES AND HAS TO MATCH: the constant the paintings are
   * delivered at, and the box that shows them. A box at a different ratio crops or
   * letterboxes artwork, which is exactly the kind of fault nobody reading either file
   * would notice.
   */
  it("shows a cover at the ratio the paintings are drawn at", () => {
    const css = readFileSync(resolve(__dirname, "..", "skin.css"), "utf8");
    const rule = /\.spgcover\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule, "the cover box has no aspect ratio").toMatch(
      new RegExp(`aspect-ratio:\\s*${COVER_W}\\s*/\\s*${COVER_H}`),
    );
    // And the picture fills it rather than being stretched into it.
    expect(/\.spgcover-img\s*\{([^}]*)\}/.exec(css)?.[1] ?? "").toMatch(/object-fit:\s*cover/);
  });

  /** Every file really is that shape, or the box crops a painting nobody meant to crop. */
  it("ships files at that ratio", () => {
    for (const f of files()) {
      const d = readFileSync(resolve(FOLDER, f));
      const tag = d.subarray(12, 16).toString("latin1");
      let w = 0, h = 0;
      if (tag === "VP8X") {
        w = d.readUIntLE(24, 3) + 1;
        h = d.readUIntLE(27, 3) + 1;
      } else if (tag === "VP8L") {
        const v = d.readUInt32LE(21);
        w = (v & 0x3fff) + 1;
        h = ((v >> 14) & 0x3fff) + 1;
      } else {
        w = d.readUInt16LE(26) & 0x3fff;
        h = d.readUInt16LE(28) & 0x3fff;
      }
      expect(w / h, `${f} is ${w}x${h}, which is not the cover ratio`)
        .toBeCloseTo(COVER_W / COVER_H, 2);
    }
  });
});
