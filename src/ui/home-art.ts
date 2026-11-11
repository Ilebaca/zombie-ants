/** Refresh Home's scene in place; only the header and artwork depend on troop gains. */
import { chapterOf } from "../platform";
import { groundReady } from "../render";
import { backdropFor } from "./backdrops";
import { groundFor } from "./regions";

const requested = new Set<string>();

function warmBackdrop(chapter: number): void {
  const url = backdropFor(chapter);
  if (requested.has(url)) return;
  requested.add(url);
  const image = new Image();
  image.decoding = "async";
  image.onload = () => { void image.decode?.().catch(() => {}); };
  image.onerror = () => { requested.delete(url); };
  image.src = url;
}

export function updateHomeArtwork(root: HTMLElement, colony: number, incoming = 0): void {
  const chapter = chapterOf(colony);
  if (root.dataset.chapter !== String(chapter)) {
    root.dataset.chapter = String(chapter);
    root.style.backgroundImage =
      `linear-gradient(180deg, rgba(0,0,0,0) 74.5%, rgba(0,0,0,.4) 82.3%), ` +
      `url("${backdropFor(chapter)}")`;
    void groundReady(groundFor(chapter));
  }
  // Warm both the next chapter and the one a full developing-unit store can reach.
  // URLs are remembered, not decoded image objects, so old chapters can leave memory.
  warmBackdrop(chapter + 1);
  warmBackdrop(chapterOf(colony + Math.max(0, Math.floor(incoming))));
}
