/**
 * THE PLAYER'S OWN PICTURE, ONE FILE PER AVATAR.
 *
 * An avatar is the one thing in this game a player collects that says nothing about the
 * COLONY — it is the face beside their name on the top bar, on the profile, and one day
 * across the board from somebody else. The skins answer "what does my colony look like";
 * this answers "who am I", which is a different question and is why it is not a look.
 *
 * THE FOLDER IS THE TABLE, the seventh time in this app: `src/ui/avatars/av43.webp` IS
 * avatar `av43`, the glob resolves at BUILD time, and dropping a file in with the right
 * name is the whole of adding one. A file whose name is not in the catalogue
 * (`platform/avatars.ts`) is IGNORED rather than guessed at, and an id in the catalogue
 * with no file keeps the drawn head — the same null fallback the chrome marks and the
 * colony cards already follow, which is what lets the art and the table land apart.
 *
 * AND THE ART IS HERE WHILE THE TABLE IS IN `platform/`, which is the split every
 * collectable in this app already has. Which avatar is free, which chapter of the road
 * pays which, and how rare one is in the hatch are PROGRESSION decisions that will be
 * retuned; where the picture lives is not. `platform/` holds ids and never a url, so it
 * never has to know this folder exists.
 */

const PAINTED: Record<string, string> = (() => {
  const found: Record<string, string> = {};
  const files = import.meta.glob<string>("./avatars/*.webp", {
    eager: true, query: "?url", import: "default",
  });
  for (const [path, url] of Object.entries(files)) {
    const id = /\/(av\d+)\.webp$/.exec(path)?.[1];
    if (id) found[id] = url;
  }
  return found;
})();

/** How many avatars have art. Nothing but a test reads this. */
export const avatarsPainted = (): number => Object.keys(PAINTED).length;

/** This avatar's picture, or null when there is no file for it. */
export const avatarArt = (id: string): string | null => PAINTED[id] ?? null;
