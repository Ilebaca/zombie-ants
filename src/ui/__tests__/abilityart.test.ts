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
   * THE BAND IS A CROP, and the files are square. A rule that let the picture keep its
   * own shape would put a 360px square in the middle of a page that already opens on a
   * cover — so the ratio and the crop are asserted together, because either alone is
   * a letterbox or a stretched painting.
   */
  it("shows the square file as a cropped band", () => {
    const css = readFileSync(resolve(__dirname, "..", "skin.css"), "utf8");
    const rule = /\.spgability-art\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule, "no .spgability-art rule").not.toBe("");
    expect(rule.replace(/\s/g, "")).toContain("aspect-ratio:2/1");
    expect(rule.replace(/\s/g, "")).toContain("object-fit:cover");
    expect(rule.replace(/\s/g, "")).toContain("width:100%");
  });
});
