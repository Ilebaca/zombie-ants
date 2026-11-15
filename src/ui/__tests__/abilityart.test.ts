/**
 * THE PAINTING BELONGS TO THE ABILITY'S KIND, NOT TO ITS NAME.
 *
 * `kind` is the engine's own id — what every rule in `engine/abilities.ts` switches on —
 * and a NAME is copy with spaces in it that can be reworded without the ability changing.
 * Keyed by name, renaming "Feeding Swarm" would silently take the picture off the Army
 * Ant's card and nothing would fail.
 *
 * The art arrives one ability at a time, so this holds the rule at every stage of that:
 * what the folder holds is what the module found, an unpainted ability answers null, and
 * a file named after something the engine has never heard of is ignored.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SPECIES } from "../../engine";
import type { SpeciesId } from "../../engine";
import { abilityArtFor, abilityArtPainted } from "../abilityart";
import { buildSpeciesPage } from "../species";
import { ProfileStore } from "../../platform/profile";
import { MemoryStore } from "../../platform/storage";

const FOLDER = resolve(__dirname, "..", "abilities");
/** An ABSENT folder is an answer, not an error — see faces.test.ts for what that cost. */
const files = (): string[] => {
  try {
    return readdirSync(FOLDER).filter((f) => f.endsWith(".webp"));
  } catch {
    return [];
  }
};
const ALL = Object.keys(SPECIES) as SpeciesId[];

describe("an ability's painting", () => {
  it("finds exactly the files that are there, and nothing it cannot name", () => {
    expect(abilityArtPainted(), "the folder and the table disagree").toBe(files().length);
    const kinds = new Set(ALL.map((id) => SPECIES[id].ability.kind));
    for (const f of files()) {
      const kind = f.replace(/\.webp$/, "");
      expect([...kinds], `${f} is named after no ability in the game`).toContain(kind);
    }
  });

  it("gives each ability its own file, and null when there is none", () => {
    for (const id of ALL) {
      const { kind } = SPECIES[id].ability;
      const art = abilityArtFor(SPECIES[id].ability);
      if (files().includes(`${kind}.webp`)) expect(art, `${kind} did not resolve`).toBeTruthy();
      else expect(art, `${kind} invented a painting`).toBeNull();
    }
  });

  /** Two colonies may never share a kind, or one painting would stand for two abilities. */
  it("has one kind per colony", () => {
    const kinds = ALL.map((id) => SPECIES[id].ability.kind);
    expect(new Set(kinds).size, "two colonies share an ability kind").toBe(kinds.length);
  });

  /**
   * THE PICTURE IS SQUARE AND THE CARD READS ACROSS, asked for directly. It was a 2:1
   * band across the top — a centre CROP of a square file, so two thirds of every
   * painting was never shown, on a card twice as tall as it needed to be. The ratio and
   * the crop are asserted together because either alone is a letterbox or a stretched
   * painting, and the COLUMN with them because a square picture in a card that still
   * stacks is the 360px slab the crop existed to avoid.
   *
   * None of this is visible to a jsdom test: there is no layout, and the markup is the
   * same picture and the same sentence whichever way round they sit.
   */
  it("lays the square picture beside the words", () => {
    const css = readFileSync(resolve(__dirname, "..", "skin.css"), "utf8");
    const flat = (rule: string): string => rule.replace(/\s/g, "");

    const art = /\.spgability-art\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(art, "no .spgability-art rule").not.toBe("");
    expect(flat(art), "the painting is not square").toContain("aspect-ratio:1/1");
    expect(flat(art)).toContain("object-fit:cover");
    expect(flat(art)).toContain("width:100%");

    const card = /\.spgcard\.painted\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(card, "no .spgcard.painted rule").not.toBe("");
    expect(flat(card), "the card still stacks").toMatch(/grid-template-columns:[^;]+1fr/);
    // Whichever of the two is taller, the slack falls either side of the shorter one.
    expect(flat(card), "the two are not centred on each other").toContain("align-items:center");
  });

  /**
   * THE WORDS ARE ONE COLUMN. As direct children of a two-column grid the chips and the
   * sentence land in two different cells — the fault the wrapper exists to prevent, and
   * one a stylesheet read alone cannot see.
   */
  it("keeps the chips and the rule in one box", () => {
    const store = new ProfileStore(new MemoryStore());
    const page = buildSpeciesPage(store, { species: "fire", onBack: () => {} });
    const body = page.querySelector(".spgcard.painted > .spgability-body");
    expect(body, "the ability's words are not in their own box").toBeTruthy();
    expect(body?.querySelector(".spgchips"), "the chips are outside it").toBeTruthy();
    expect(body?.querySelector(".spgtext"), "the rule is outside it").toBeTruthy();
  });
});
