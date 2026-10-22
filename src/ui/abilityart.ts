/**
 * AN ABILITY'S PAINTING — the picture on the card that describes it.
 *
 * Each colony's ability is written on its own page in the Antarium, where the player is
 * deciding whether to spend on that colony (CLAUDE.md: the manual deliberately does NOT
 * describe the abilities, so this card is the one place each is explained). It was a row
 * of chips and a sentence; a painting of the thing is what tells eight of them apart at a
 * glance.
 *
 * THE FOLDER IS THE TABLE, the same rule the covers, the faces, the region grounds and
 * the home artwork follow: `src/ui/abilities/venom.webp` IS Venom Rain's picture, the
 * glob resolves at BUILD time, and dropping a file in is the whole change.
 *
 * KEYED ON THE ABILITY'S KIND, NEVER ITS NAME. `kind` is the engine's own stable id and
 * it is what every rule in `engine/abilities.ts` switches on; a NAME is copy, it has
 * spaces in it, and it can be retuned without the picture meaning anything different. A
 * file named after something that is not an ability kind is IGNORED rather than guessed
 * at — a painting on the wrong ability is worse than none.
 *
 * AN ABILITY WITH NO PAINTING ANSWERS NULL and the card is simply the card it already
 * was, which is what let this land before all eight existed.
 */
import { SPECIES } from "../engine";
import type { Ability } from "../engine";

/** Every ability kind the engine has, as a set to check a filename against. */
const KINDS = new Set<string>(Object.values(SPECIES).map((s) => s.ability.kind));

/** What the build found, keyed by ability kind. */
const PAINTED: Record<string, string> = (() => {
  const found: Record<string, string> = {};
  const files = import.meta.glob<string>("./abilities/*.webp", {
    eager: true, query: "?url", import: "default",
  });
  for (const [path, url] of Object.entries(files)) {
    const kind = /\/([a-z]+)\.webp$/.exec(path)?.[1] ?? "";
    if (KINDS.has(kind)) found[kind] = url;
  }
  return found;
})();

/** How many abilities have a painting. Nothing but a test reads this. */
export const abilityArtPainted = (): number => Object.keys(PAINTED).length;

/** This ability's painting, or null while it is still to be painted. */
export const abilityArtFor = (ability: Ability): string | null =>
  PAINTED[ability.kind] ?? null;
