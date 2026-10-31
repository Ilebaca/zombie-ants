/**
 * THE PAINTED MARKS, ONE FILE PER MARK.
 *
 * Every other picture in this app is DRAWN — `ui/icons.ts` is one family of solid shapes
 * on a 24 grid in `currentColor`, which is what keeps the chrome looking like one app
 * instead of a row of emoji from seven illustrators (§10). The redesign changes that for
 * the chrome's own marks, and only for those: the tab bar, and whatever else of the HUD
 * gets painted next. They arrive as artwork and there is nothing to derive them from.
 *
 * THE FOLDER IS THE TABLE, the same rule the home artwork, the region grounds and the
 * colony covers all follow: `src/ui/hud/shop.webp` IS the Shop tab's mark, resolved by a
 * build-time glob, and the name is the one `ui/icons.ts` already uses for the drawn one.
 * So a mark is painted by dropping a file in, and nothing else moves.
 *
 * AND A MISSING FILE IS NOT A HOLE. `hudIcon` answers null and the caller draws the mark
 * it always drew — which is what let the tab bar land while the five files were still
 * being painted, and is what the currency chips and the three buttons are still doing.
 * A chrome that half-renders is worse than one that is consistently drawn.
 */

/**
 * What the build found, keyed by mark.
 *
 * `eager`, because these are the chrome: they are on screen from the first frame, and a
 * lazy import would open the app on the drawn marks and swap them a beat later.
 */
const PAINTED: Record<string, string> = (() => {
  const found: Record<string, string> = {};
  const files = import.meta.glob<string>("./hud/*.webp", {
    eager: true, query: "?url", import: "default",
  });
  for (const [path, url] of Object.entries(files)) {
    const name = /\/([\w-]+)\.webp$/.exec(path)?.[1];
    if (name) found[name] = url;
  }
  return found;
})();

/** How many marks are painted. Nothing but a test reads this. */
export const hudPainted = (): number => Object.keys(PAINTED).length;

/** The painted mark for a name, or null where there is no file and the drawn one stands. */
export const hudIcon = (name: string): string | null => PAINTED[name] ?? null;
