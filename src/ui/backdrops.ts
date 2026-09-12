/**
 * THE HOME ARTWORK, ONE PICTURE PER CHAPTER.
 *
 * Home is one full-screen picture (§ THE HOME ARTWORK), and it is the same picture on the
 * first day and on the five-millionth troop — so the one screen a player opens every time
 * says nothing about how far they have come. A chapter is the road's own unit (`chapterOf`
 * in `platform/road.ts`), there are fifty of them, and each gets its own ground.
 *
 * THE FOLDER IS THE TABLE. `src/ui/backdrops/ch07.webp` IS chapter seven's artwork: the
 * glob below is resolved at BUILD time, so dropping a file in with the right name is the
 * whole change — no import to add, no list to keep in step, and no chance of a table
 * naming a file that is not there. The convention is `ch<NN>.webp`, two digits, 01 to 50.
 *
 * EVERY CHAPTER THAT HAS NO PICTURE YET FALLS BACK TO `home.webp`, which is the one the
 * game ships with today. That is what makes this safe to land before the art exists: fifty
 * chapters, fifty entries, and all of them currently the same image — a build is never
 * missing a background, and each real one starts being used on the commit it arrives on.
 *
 * The files are bundled from `src/ui/` rather than dropped in `public/` for the same three
 * reasons the first one was: Vite hashes the name so a cached picture cannot go stale, it
 * emits a RELATIVE url (`base: "./"`, or the Capacitor shell points at nothing), and the
 * service worker precaches everything the build emitted — so the artwork comes with the
 * offline install rather than being the one thing missing from it.
 */
import { ROAD_CHAPTERS } from "../platform";
import fallback from "./backdrops/home.webp";

/**
 * What the build actually found, keyed by chapter.
 *
 * `eager` because the picture is wanted the moment home is built — a lazy import would
 * paint the screen, then swap the ground under it a frame later.
 */
const DRAWN: Record<number, string> = (() => {
  const found: Record<number, string> = {};
  const files = import.meta.glob<string>("./backdrops/ch*.webp", {
    eager: true, query: "?url", import: "default",
  });
  for (const [path, url] of Object.entries(files)) {
    const at = Number(/ch(\d+)\.webp$/.exec(path)?.[1]);
    // A file whose name does not follow the convention is IGNORED rather than guessed at:
    // a picture landing on the wrong chapter is worse than one not landing at all.
    if (Number.isInteger(at) && at >= 1 && at <= ROAD_CHAPTERS) found[at] = url;
  }
  return found;
})();

/** The default ground — the picture the game shipped with, and every chapter's fallback. */
export const HOME_BACKDROP = fallback;

/** How many chapters have artwork of their own. Nothing but a test reads this. */
export const backdropsDrawn = (): number => Object.keys(DRAWN).length;

/**
 * The picture behind home for a colony this far along.
 *
 * It takes the CHAPTER rather than the colony: home already knows which chapter it is
 * announcing in the banner above the picture, and two places computing that from the
 * colony is two places to disagree.
 */
export function backdropFor(chapter: number): string {
  const at = Math.min(ROAD_CHAPTERS, Math.max(1, Math.round(chapter)));
  return DRAWN[at] ?? fallback;
}
