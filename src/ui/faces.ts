/**
 * A COLONY'S FACE — the painted icon, where there is one.
 *
 * Every screen in this app that names a colony puts its head beside the name: the profile,
 * the Antarium, a friend row, the ladder, the opponent search, the result card. That head
 * is DRAWN (`render/art.ts`), which is what let eight of them exist before any art did and
 * is why a skin can recolour one. These are paintings of the same thing, and where one
 * exists it is the better picture.
 *
 * THE FOLDER IS THE TABLE, as it is for the covers, the region grounds and the home
 * artwork: `src/ui/faces/fire.webp` IS the Fire Ant's icon, the glob resolves at BUILD
 * time, and a file named after something that is not a colony is ignored rather than
 * guessed at.
 *
 * A COLONY WITH NO PAINTING KEEPS ITS DRAWN HEAD, which is also what makes this safe to
 * land before the art does — and the drawn head is not going anywhere for a second reason
 * (see `antPortrait`): it is the only one of the two that can wear a SKIN.
 */
import { SPECIES } from "../engine";
import type { SpeciesId } from "../engine";

const PAINTED: Partial<Record<SpeciesId, string>> = (() => {
  const found: Partial<Record<SpeciesId, string>> = {};
  const files = import.meta.glob<string>("./faces/*.webp", {
    eager: true, query: "?url", import: "default",
  });
  for (const [path, url] of Object.entries(files)) {
    const id = /\/([a-z]+)\.webp$/.exec(path)?.[1] ?? "";
    if (id in SPECIES) found[id as SpeciesId] = url;
  }
  return found;
})();

/** How many colonies have a painted icon. Nothing but a test reads this. */
export const facesPainted = (): number => Object.keys(PAINTED).length;

/** This colony's painted icon, or null while it is still drawn. */
export const faceFor = (id: SpeciesId): string | null => PAINTED[id] ?? null;

/** Every painted icon, for the board — which cannot import this layer (§3). */
export const paintedFaces = (): Partial<Record<SpeciesId, string>> => ({ ...PAINTED });
