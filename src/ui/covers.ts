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
 * THERE ARE TWO SETS, AND THE DIFFERENCE IS THE GROUND THEY STAND ON.
 *
 * `covers/` is the painting as it was delivered — the ant on its own lit brown ground,
 * lamp and shadow and all. `covers-cut/` is the same ant CUT OUT on transparent ground,
 * so whatever is behind it shows through.
 *
 * Both exist because the two places a cover is shown are not the same box. The SPECIES
 * PAGE is a full-bleed hero across the top of a screen, and a cut-out there is an ant
 * floating in a flat rectangle of `#1a120a` — reported directly, and the reason the
 * originals came back. The SETUP RAIL is a rounded pane the player steps through, where
 * the lit ground reads as a photograph in a frame and the cut-out reads as the colony.
 *
 * So the rule is: the hero takes the PAINTED one, the rail takes the CUT one, and each
 * falls back to the other rather than to nothing — a colony with a file in one folder
 * and not the other is still shown everywhere, which is what let the cut-outs land for
 * the rail without a second set of eight being owed on the same day.
 *
 * THE FOLDER IS STILL THE TABLE, twice: `covers/fire.webp` and `covers-cut/fire.webp`
 * are the Fire Ant's, both resolved by a build-time glob, and dropping a file in is the
 * whole change. `covers.test.ts` holds that every CUT file really carries alpha — one
 * delivered with its background still on would sit in the rail as a brown rectangle on
 * a darker plate — and that the painted ones are never wider than the box.
 */
export const COVER_W = 1567;
export const COVER_H = 900;

const index = (files: Record<string, string>): Partial<Record<SpeciesId, string>> => {
  const found: Partial<Record<SpeciesId, string>> = {};
  for (const [path, url] of Object.entries(files)) {
    const id = /\/([a-z]+)\.webp$/.exec(path)?.[1] ?? "";
    if (id in SPECIES) found[id as SpeciesId] = url;
  }
  return found;
};

/** The delivered paintings, on their own ground. */
const PAINTED = index(import.meta.glob<string>("./covers/*.webp", {
  eager: true, query: "?url", import: "default",
}));

/** The same ants cut out, for a box that supplies its own ground. */
const CUT = index(import.meta.glob<string>("./covers-cut/*.webp", {
  eager: true, query: "?url", import: "default",
}));

/** How many colonies have a painting. Nothing but a test reads this. */
export const coversPainted = (): number => Object.keys(PAINTED).length;

/** How many have a cut-out. Nothing but a test reads this either. */
export const coversCut = (): number => Object.keys(CUT).length;

/**
 * This colony's cover, or null while it is still to be painted.
 *
 * The HERO's answer: the painting on its own ground, because a cut-out across the top
 * of the species page is an ant in a flat rectangle.
 */
export const coverFor = (id: SpeciesId): string | null => PAINTED[id] ?? CUT[id] ?? null;

/**
 * The RAIL's answer: the ant cut out, so the pane's own colour is the ground under it
 * and the colony reads as the thing being stepped through rather than as a photograph.
 */
export const cutCoverFor = (id: SpeciesId): string | null => CUT[id] ?? PAINTED[id] ?? null;
