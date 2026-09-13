/**
 * THE GROUND A MATCH IS PLAYED ON, ONE PICTURE PER REGION.
 *
 * The board's ground is DRAWN — soil, a cleared patch, rocks and ferns scattered around it
 * (`render/terrain.ts`) — and it is the same forest floor on the first chapter and the
 * fiftieth. The road runs through ten places (`REGIONS` in `platform/road.ts`), five
 * chapters each, and this is where each of them gets its own painted ground.
 *
 * TEN AND NOT FIFTY, because ten is a set somebody can actually paint, and because a world
 * that changed every single chapter would change before the player had finished looking at
 * it. Five chapters is roughly a fortnight of play (§8c).
 *
 * THE FOLDER IS THE TABLE, exactly as the home artwork's is (`ui/backdrops.ts`):
 * `src/ui/regions/rg03.webp` IS the Volcano's ground, and the glob is resolved at BUILD
 * time — so dropping a file in with the right name is the whole change. The number is what
 * is read, so `rg03-volcano.webp` works too and says what it is in the folder listing.
 *
 * EVERY REGION WITHOUT A PICTURE WEARS `ground.webp`, which is the game's own drawn ground
 * exported through `tools/mapshot.ts`. So the board looks exactly as it always has until
 * the art lands, and each real one starts being used on the commit it arrives on.
 *
 * WHAT THE PICTURE IS NOT is the grid. The chequer that marks the cells is drawn OVER
 * whatever ground is underneath, because the tile size depends on the screen — squares
 * baked into a picture would line up on one phone and on no other. That is why the
 * exported placeholder has no chequer in it.
 */
import { REGIONS, regionOf } from "../platform";
import fallback from "./regions/ground.webp";

/**
 * What the build found, keyed by region.
 *
 * `eager`, because the ground is wanted the moment a match opens; a lazy import would
 * start the match on the drawn floor and swap it a beat later.
 */
const PAINTED: Record<number, string> = (() => {
  const found: Record<number, string> = {};
  const files = import.meta.glob<string>("./regions/rg*.webp", {
    eager: true, query: "?url", import: "default",
  });
  for (const [path, url] of Object.entries(files)) {
    const at = Number(/\brg(\d+)/.exec(path)?.[1]);
    // A file that does not follow the convention is IGNORED rather than guessed at: a
    // desert behind the volcano is worse than a volcano that has not been painted yet.
    if (Number.isInteger(at) && at >= 1 && at <= REGIONS.length) found[at] = url;
  }
  return found;
})();

/** The drawn ground, exported as a file — every region's fallback. */
export const DRAWN_GROUND = fallback;

/** How many regions have a picture of their own. Nothing but a test reads this. */
export const regionsPainted = (): number => Object.keys(PAINTED).length;

/** The ground for a region, 1-based. */
export function regionArt(region: number): string {
  const at = Math.min(REGIONS.length, Math.max(1, Math.round(region)));
  return PAINTED[at] ?? fallback;
}

/**
 * The ground for a chapter — what a match actually asks for.
 *
 * Two steps rather than one table keyed by chapter: which chapters make up a region is a
 * fact about the ROAD and lives there, and this file only knows how to find a picture.
 */
export const groundFor = (chapter: number): string => regionArt(regionOf(chapter));
