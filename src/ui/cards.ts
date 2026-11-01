/**
 * THE COLLECTION CARD'S PICTURE, ONE FILE PER COLONY.
 *
 * The Antarium draws a colony as a tile of its rarity's colour with the ant standing on
 * it, filling the whole square — which is DIFFERENT ART from `src/ui/faces/`. A face is a
 * 512px close crop of the head, drawn into a row beside a name; this is a full body on a
 * coloured ground, bleeding to the tile's edges. Cutting one out of the other would be an
 * upscale of a third of the picture, which is the same reason the covers and the faces are
 * two sets rather than one.
 *
 * THE FOLDER IS THE TABLE, the sixth time in this app: `src/ui/cards/fire.webp` IS the
 * Fire Ant's card art, the glob resolves at BUILD time, and a file named after something
 * that is not a colony is ignored rather than guessed at.
 *
 * AND A MISSING FILE IS NOT A HOLE — it is the tile's own colour, which is most of what
 * the design is. That is why this could land before any of the art existed, and it is
 * what was asked for directly: "you can just add colored background and later we place
 * portraits on top of it." The drawn head is deliberately NOT the fallback here. It is a
 * head on a transparent ground sized for a 40px row, and blown up to fill a 108px tile it
 * reads as a mistake where a flat colour reads as a tile waiting for its picture.
 */
import { SPECIES } from "../engine";
import type { SpeciesId } from "../engine";

const PAINTED: Partial<Record<SpeciesId, string>> = (() => {
  const found: Partial<Record<SpeciesId, string>> = {};
  const files = import.meta.glob<string>("./cards/*.webp", {
    eager: true, query: "?url", import: "default",
  });
  for (const [path, url] of Object.entries(files)) {
    const id = /\/([a-z]+)\.webp$/.exec(path)?.[1] ?? "";
    if (id in SPECIES) found[id as SpeciesId] = url;
  }
  return found;
})();

/** How many colonies have card art. Nothing but a test reads this. */
export const cardsPainted = (): number => Object.keys(PAINTED).length;

/** This colony's card picture, or null while the tile is still bare colour. */
export const cardArt = (id: SpeciesId): string | null => PAINTED[id] ?? null;
