/**
 * WHERE THE AUDIO COMES FROM.
 *
 * Everything this app plays is synthesised (`feedback.ts`) — there is no asset pipeline
 * here and no image file either, every picture is drawn by the code that owns it. That is
 * the right default: it works offline, it is a couple of hundred bytes of code per sound,
 * there is nothing to download before the first tap and nothing that can go stale.
 *
 * But synthesis has a ceiling. A recorded frame drum is a recorded frame drum, and no
 * amount of filtered noise is going to be one. So this file is the seam: a table of file
 * URLs, EMPTY by default, and anything named in it REPLACES the synthesised version.
 *
 * To use a real recording, drop the file in `public/audio/` and name it here:
 *
 *     export const SOUNDS: SoundManifest = {
 *       cues:   { destroy: "audio/collapse.mp3" },
 *       tracks: { match:   "audio/battle.mp3" },
 *     };
 *
 * That is the whole change. Nothing else moves:
 *
 *  - It is PER ENTRY, not all or nothing. A build can use a real drum loop for the match
 *    bed and keep every synthesised cue, which is what a real replacement actually looks
 *    like — they arrive one at a time, and a half-finished swap must never leave the game
 *    silent in the gaps.
 *  - Anything not named here falls through to the synthesiser, so this file being empty
 *    is a working game rather than a missing dependency.
 *  - A file that fails to load falls back the same way. A network that dropped, a path
 *    typed wrong, or a codec the phone will not decode gives the synthesised sound, never
 *    silence — the failure mode of an asset is the thing this whole design is avoiding.
 *
 * Paths are relative to the deployed base, so they work under a project page
 * (`/zombie-ants/`) as well as at a domain root.
 */
import type { Cue, Track } from "./feedback";

export interface SoundManifest {
  /** A file to play instead of the synthesised cue. */
  cues?: Partial<Record<Cue, string>>;
  /**
   * A file to LOOP instead of the synthesised bed. It loops seamlessly, so it wants to be
   * a piece that comes round — a track that ends is a gap in the middle of a match.
   */
  tracks?: Partial<Record<Track, string>>;
}

/** Nothing yet: the game is fully synthesised. See the note above to replace a sound. */
export const SOUNDS: SoundManifest = {
  cues: {},
  tracks: {},
};

/**
 * Resolve a manifest path against the page's base.
 *
 * `import.meta.env.BASE_URL` is what Vite substitutes for the deployed prefix, so a build
 * served from a project page finds its files without the manifest having to know where it
 * was deployed.
 */
export function soundUrl(path: string): string {
  if (/^(https?:)?\/\//.test(path) || path.startsWith("data:")) return path;
  const base = import.meta.env.BASE_URL || "/";
  return base.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}
