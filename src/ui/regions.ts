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
 * ALL TEN ARE PAINTED. `ground.webp` survives as the fallback for a region that has no
 * file of its own — nothing can reach it while the ten are there, which is precisely why
 * it is a HALF-SIZE copy of the forest floor rather than a full picture: it has to be
 * something rather than a broken board, and it must not cost a quarter of a megabyte the
 * service worker precaches and nobody ever sees. An eleventh region added without art
 * would wear it, soft, and read as ground rather than as nothing.
 *
 * THE PICTURE CARRIES THE GRID. Every region is painted to one template — the
 * nine-by-nine grid of cells sits in a known rectangle of the file (`ART_GRID` in
 * `render/terrain.ts`) — and the renderer scales the picture until those painted cells
 * are the size of the board's. So the squares are IN the artwork, along with the rocks
 * and the gem seams, and the game draws none of them over a painted region. That is the
 * reverse of the rule that stood here while a picture was just ground, when nothing could
 * say where in a file the cells would land.
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

/**
 * The fallback ground. Named for the job rather than for the picture: what is in the file
 * has already changed once as the real grounds landed, and the one thing that will not is
 * that something has to be there when a region has nothing of its own.
 */
export const DEFAULT_GROUND = fallback;

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
