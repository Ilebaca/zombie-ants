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
import { COVER_H, COVER_W, coverFor, coversCut, coversPainted, cutCoverFor } from "../covers";

const FOLDER = resolve(__dirname, "..", "covers");
const CUTS = resolve(__dirname, "..", "covers-cut");
const webps = (dir: string): string[] =>
  readdirSync(dir).filter((f) => f.endsWith(".webp"));
const files = (): string[] => webps(FOLDER);
const ALL = Object.keys(SPECIES) as SpeciesId[];

describe("a colony's cover", () => {
  it("answers for every colony, with a picture or with null", () => {
    for (const id of ALL) {
      const art = coverFor(id);
      expect(art === null || typeof art === "string", `${id} answered something else`).toBe(true);
      if (art) expect(art, `${id}`).toMatch(/\.webp/);
    }
  });

  /**
   * TWO SETS, AND EACH SCREEN TAKES THE RIGHT ONE.
   *
   * The species page is a full-bleed hero and takes the PAINTING on its own lit ground;
   * the setup rail supplies its own ground and takes the CUT-OUT. Swapping them is
   * exactly what was reported twice — an ant floating in a flat rectangle on the hero,
   * and a brown plate behind a transparent picture on the rail — and nothing but the
   * folder a url came out of can tell the two apart.
   */
  it("hands the hero the painting and the rail the cut-out", () => {
    for (const id of ALL) {
      if (!files().includes(`${id}.webp`)) continue;
      expect(coverFor(id), `${id}'s hero took a cut-out`).toContain("/covers/");
    }
    for (const id of ALL) {
      if (!webps(CUTS).includes(`${id}.webp`)) continue;
      expect(cutCoverFor(id), `${id}'s rail took a painting`).toContain("/covers-cut/");
    }
  });

  /** Both folders are complete, so neither fallback is reachable today. */
  it("has a painting and a cut-out for every colony", () => {
    expect(coversPainted(), "a colony lost its painting").toBe(ALL.length);
    expect(coversCut(), "a colony lost its cut-out").toBe(ALL.length);
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

  /** A colony with no file in EITHER folder invents nothing. */
  it("answers null for a colony that has not been painted", () => {
    for (const id of ALL) {
      if (files().includes(`${id}.webp`) || webps(CUTS).includes(`${id}.webp`)) continue;
      expect(coverFor(id), `${id} invented a cover`).toBeNull();
      expect(cutCoverFor(id), `${id} invented a cut-out`).toBeNull();
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

  /**
   * IT IS FULL BLEED, and the way it gets there is that THE SCREEN HAS NO GUTTER.
   * The cover is a plain 100%; the gutter lives on the blocks instead. Pulling it out
   * with negative margins instead looked identical in the DOM — the box really was the
   * width of the glass — and painted 16px short at both ends, because the clip that
   * stops the page being dragged sideways ate the overhang. Nothing but a pixel told
   * the difference, so the rules that make it work are held here.
   */
  it("is full bleed because the screen carries no gutter", () => {
    const css = readFileSync(resolve(__dirname, "..", "skin.css"), "utf8");
    const rule = /\.spgcover\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule, "the cover is not a plain full-width block").toMatch(/width:\s*100%/);
    expect(rule, "the cover escapes with margins again").not.toMatch(/margin-inline/);
    // No card dressing: it is the top of the screen, not a panel on it.
    expect(rule, "the cover is a card again").not.toMatch(/border(-radius)?:/);
    // And the gutter it used to escape is on the blocks around it.
    const screen = /#antup\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(screen, "the screen kept its padding").toMatch(/padding-inline:\s*0/);
    // And it stands on the ground the paintings are lit on rather than the app's
    // green, so the cover meets the page instead of being a window cut into it.
    expect(screen, "the colony page went back to the app's green")
      .toMatch(/background-color:\s*#1d140d/i);
    expect(css, "the blocks were not given the gutter back")
      .toMatch(/#antup \.spgwrap > \*:not\(\.spgcover\)/);
  });

  /**
   * A FILE MAY BE TALLER THAN THE BOX AND MUST NEVER BE WIDER.
   *
   * `object-fit: cover` never stretches, so the only way a cover can go wrong is WHERE it
   * crops. A painting taller than the box loses sky off the top and ground off the bottom,
   * which is what these are composed to survive; one WIDER than the box is cropped at the
   * SIDES instead, and what is at the sides of every one of them is the ant's head and its
   * gaster. The ratio moved from 1567x1254 to 1567x900 with the paintings already in, so
   * this is the rule that actually matters rather than "every file is exactly the box".
   */
  it("ships files the box can only crop top and bottom", () => {
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
      expect(w / h, `${f} is ${w}x${h} — wider than the box, so it loses its head`)
        .toBeLessThanOrEqual(COVER_W / COVER_H + 0.001);
    }
  });

  /**
   * EVERY COVER IS A CUT-OUT.
   *
   * The paintings stand on TRANSPARENT ground and the colour behind them is the box's
   * own `#1a120a` (ui/covers.ts). A file delivered with its background still baked in
   * would sit inside that box as a brown rectangle on a darker plate — a frame around
   * the ant that no rule in the stylesheet admits to, and the kind of fault that looks
   * like a considered choice. Read off the WebP header: an extended (`VP8X`) file
   * carries its alpha flag in the feature byte at offset 20, and a plain lossy one has
   * no alpha channel at all.
   */
  it("ships cut-outs with no background on them", () => {
    for (const f of webps(CUTS)) {
      const d = readFileSync(resolve(CUTS, f));
      const extended = d.subarray(12, 16).toString("latin1") === "VP8X";
      const features = extended ? d.readUInt8(20) : 0;
      const alpha = (features & 0x10) !== 0;
      expect(alpha, `${f} carries its own background — it has to be a cut-out`).toBe(true);
    }
  });
});
