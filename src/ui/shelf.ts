/**
 * THE SHOP'S PAINTED GOODS, ONE FILE PER PRODUCT.
 *
 * The design draws every shelf as a 70px painting — a chest for the daily gift, a heap of
 * larva that grows with the price, a pile of crystals, a pile of mycelium, the pass. Those
 * are artwork and there is nothing to derive them from, so this is the same table the
 * chrome's marks, the home artwork, the region grounds and the colony covers all are:
 * **the folder IS the table.** `src/ui/shelf/mycel-220.webp` IS the 220-mycelium tile, and
 * painting a shelf is dropping a file in.
 *
 * THE KEY IS THE PRODUCT ID WITH ITS DOT HYPHENATED (`mycel.220` → `mycel-220`), because a
 * dot in a filename is an extension to anything reading one — the glob's own name pattern
 * would stop at it, and so does half the tooling that will ever touch this folder.
 *
 * AND A MISSING FILE IS NOT A HOLE: `shelfArt` answers null and the caller falls back to
 * the currency's own chrome mark, which is already painted. That is what let this screen
 * land before any of the shelf artwork existed — a shop showing its currencies at 70px is
 * a shop mid-redesign, where a shop showing nine empty boxes is a broken one.
 */

/** What the build found, keyed by the hyphenated product id. */
const PAINTED: Record<string, string> = (() => {
  const found: Record<string, string> = {};
  const files = import.meta.glob<string>("./shelf/*.webp", {
    eager: true, query: "?url", import: "default",
  });
  for (const [path, url] of Object.entries(files)) {
    const name = /\/([\w-]+)\.webp$/.exec(path)?.[1];
    if (name) found[name] = url;
  }
  return found;
})();

/**
 * The name a product's painting is filed under — the ONE place the dot rule lives, so
 * the lookup and anything checking the folder cannot disagree about it.
 */
export const shelfKey = (id: string): string => id.replace(/\./g, "-");

/** How many shelves are painted. Nothing but a test reads this. */
export const shelfPainted = (): number => Object.keys(PAINTED).length;

/** The painting for a product id, or null where there is no file and the mark stands. */
export const shelfArt = (id: string): string | null => PAINTED[shelfKey(id)] ?? null;
