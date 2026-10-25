/**
 * THE HOME ARTWORK, ONE PICTURE PER REGION — WITH ROOM FOR ONE PER CHAPTER.
 *
 * Home is one full-screen picture (§ THE HOME ARTWORK), and it used to be the same picture
 * on the first day and on the five-millionth troop — so the one screen a player opens every
 * time said nothing about how far they had come. It follows the road now, and it follows it
 * in the same five-chapter bands the BOARD's ground does (`ui/regions.ts`): the home screen
 * and the board a player reaches from it are the same place, which they would not be if one
 * changed every chapter and the other every five.
 *
 * THE FOLDER IS THE TABLE, TWICE OVER. `src/ui/backdrops/rg03.webp` IS the Volcano's — every
 * chapter in region three — and `src/ui/backdrops/ch07.webp` IS chapter seven's alone, which
 * BEATS its region. Both globs resolve at BUILD time, so dropping a file in with the right
 * name is the whole change: no import to add, no list to keep in step, and no chance of a
 * table naming a file that is not there. The NUMBER is what is read, so `rg03-volcano.webp`
 * works too and says what it is in the folder listing.
 *
 * THE PER-CHAPTER TIER IS KEPT ON PURPOSE even though nothing uses it today. Fifty pictures
 * is not a set somebody paints, and ten is — but a single chapter that deserves its own
 * (the last rung, say) should cost one file rather than a change of shape here.
 *
 * ANYTHING WITH NEITHER FALLS BACK TO `home.webp`, a painted PLACEHOLDER. That is what made
 * this safe to land before the art existed, when all fifty wore it; with all ten regions
 * painted nothing reaches it any more, and it stays because `skin.css` names it directly —
 * the screen is never bare if the script never runs.
 *
 * The files are bundled from `src/ui/` rather than dropped in `public/` for the same three
 * reasons the first one was: Vite hashes the name so a cached picture cannot go stale, it
 * emits a RELATIVE url (`base: "./"`, or the Capacitor shell points at nothing), and the
 * service worker precaches everything the build emitted — so the artwork comes with the
 * offline install rather than being the one thing missing from it.
 */
import { REGIONS, ROAD_CHAPTERS, regionOf } from "../platform";
import fallback from "./backdrops/home.webp";

/**
 * Pull `<prefix><NN>…` out of a glob's paths, keyed by the number.
 *
 * A file whose name does not follow the convention is IGNORED rather than guessed at: a
 * desert behind the volcano is worse than a volcano that has not been painted yet.
 */
function byNumber(files: Record<string, string>, prefix: string, last: number): Record<number, string> {
  const found: Record<number, string> = {};
  for (const [path, url] of Object.entries(files)) {
    const at = Number(new RegExp(`\\b${prefix}(\\d+)`).exec(path)?.[1]);
    if (Number.isInteger(at) && at >= 1 && at <= last) found[at] = url;
  }
  return found;
}

/**
 * What the build actually found, keyed by chapter.
 *
 * `eager` because the picture is wanted the moment home is built — a lazy import would
 * paint the screen, then swap the ground under it a frame later.
 */
const DRAWN: Record<number, string> = byNumber(
  import.meta.glob<string>("./backdrops/ch*.webp", { eager: true, query: "?url", import: "default" }),
  "ch", ROAD_CHAPTERS,
);

/** And what it found per REGION — five chapters each, which is how the art is painted. */
const BANDS: Record<number, string> = byNumber(
  import.meta.glob<string>("./backdrops/rg*.webp", { eager: true, query: "?url", import: "default" }),
  "rg", REGIONS.length,
);

/** The default ground — the picture the game shipped with, and every chapter's fallback. */
export const HOME_BACKDROP = fallback;

/** How many chapters have artwork of their own. Nothing but a test reads this. */
export const backdropsDrawn = (): number => Object.keys(DRAWN).length;

/** How many regions have artwork of their own. Nothing but a test reads this. */
export const bandsDrawn = (): number => Object.keys(BANDS).length;

/**
 * The picture behind home for a colony this far along.
 *
 * It takes the CHAPTER rather than the colony: home already knows which chapter it is
 * announcing in the banner above the picture, and two places computing that from the
 * colony is two places to disagree.
 */
export function backdropFor(chapter: number): string {
  const at = Math.min(ROAD_CHAPTERS, Math.max(1, Math.round(chapter)));
  // The chapter's own picture outranks its region's, so one special rung costs one file.
  return DRAWN[at] ?? BANDS[regionOf(at)] ?? fallback;
}
