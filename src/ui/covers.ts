/**
 * A COLONY'S COVER — the painting at the top of its own page.
 *
 * The species page opened on a portrait: the colony's head, drawn by `render/art.ts` at
 * 240px, beside its name and its two bars. That head is the right mark in a ROW — it is
 * what a friend row, the reel and the result card all wear — and it is not a picture of
 * the animal. This is: one painted ant per colony, across the top of the page a player
 * opens when they are deciding whether to spend on it.
 *
 * THE FOLDER IS THE TABLE, the same rule the home artwork and the region grounds follow
 * (`ui/backdrops.ts`, `ui/regions.ts`): `src/ui/covers/fire.webp` IS the Fire Ant's cover,
 * the glob is resolved at BUILD time, and dropping a file in named after the colony is the
 * whole change — no import to add, no list to keep in step, and no way for a table to name
 * a picture that is not there.
 *
 * A COLONY WITH NO PAINTING YET ANSWERS NULL, and the screen draws its head on the plate
 * instead. That is what let this land before the art was finished: every page has the same
 * shape at the same ratio from the first commit, and each real painting starts being used
 * on the commit it arrives on. A file named after something that is not a colony is
 * IGNORED rather than guessed at — a cover on the wrong species is worse than none.
 *
 * Bundled from `src/ui/` rather than dropped in `public/` for the three reasons every
 * other picture here is: Vite hashes the name so a cached file cannot go stale, the url it
 * emits is RELATIVE (`base: "./"`, or the Capacitor shell points at nothing), and the
 * service worker precaches everything the build emitted — so the art comes with the
 * offline install rather than being the one thing missing from it.
 */
import { SPECIES } from "../engine";
import type { SpeciesId } from "../engine";

/**
 * The aspect every cover is drawn and shown at.
 *
 * Stated here as the two numbers rather than as a decimal, because it is the size the
 * paintings are delivered at and `skin.css` writes the same pair into `aspect-ratio` —
 * a box that disagreed with the file would letterbox or crop somebody's artwork.
 *
 * AND THE PAINTINGS ARE CUT-OUTS: an ant on TRANSPARENT ground, so the colour behind
 * them is the BOX's. That used to be belt and braces — the files carried their own lit
 * brown ground and `#1a120a` was only there for the colonies that had none — and it is
 * now the whole backdrop, on both screens that show a cover (the species page and the
 * setup rail). Two things follow. A screen that puts a cover on any other colour shows
 * the ant standing on that colour, so the two boxes have to agree; and the frame is OURS
 * rather than the artist's, which is why the delivered 1402x1122 is re-framed into this
 * box here rather than the box being changed to fit it — padding transparent ground
 * costs nothing, and a near-square painting across the top of the page would be mostly
 * empty. `covers.test.ts` holds that every file really does carry alpha: one delivered
 * with its background still on would sit in the box as a brown rectangle.
 */
export const COVER_W = 1567;
export const COVER_H = 900;

/** What the build found, keyed by colony. */
const PAINTED: Partial<Record<SpeciesId, string>> = (() => {
  const found: Partial<Record<SpeciesId, string>> = {};
  const files = import.meta.glob<string>("./covers/*.webp", {
    eager: true, query: "?url", import: "default",
  });
  for (const [path, url] of Object.entries(files)) {
    const id = /\/([a-z]+)\.webp$/.exec(path)?.[1] ?? "";
    if (id in SPECIES) found[id as SpeciesId] = url;
  }
  return found;
})();

/** How many colonies have a painting. Nothing but a test reads this. */
export const coversPainted = (): number => Object.keys(PAINTED).length;

/** This colony's cover, or null while it is still to be painted. */
export const coverFor = (id: SpeciesId): string | null => PAINTED[id] ?? null;
