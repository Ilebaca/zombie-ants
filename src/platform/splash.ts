/**
 * TAKING THE COVER DOWN (the `#splash` block in `index.html`).
 *
 * The cover exists because `#app` is empty until the bundle has been fetched, parsed and
 * run — a bare dark rectangle for most of a second on a phone, with nothing saying the game
 * was starting. It lives in the document with its styles inline, so it is on screen from the
 * first frame rather than after a hundred kilobytes of JavaScript; all that is left for the
 * app is knowing when to stop showing it.
 *
 * IT IS REMOVED, NEVER HIDDEN. A full-screen element left behind with `opacity: 0` still
 * takes every tap on the home screen, which is a far worse fault than the blank moment this
 * was added to fix.
 *
 * AND IT COMES DOWN ON A FAILURE TOO. `catchCrashes` calls this before it puts its panel up:
 * a boot that threw would otherwise leave the cover sitting over the one screen that says
 * what went wrong. The watchdog in `index.html` is the last resort under both of those — a
 * cover that can outlive the app is worse than no cover.
 */
const ID = "splash";
/** Matches the `transition` on `#splash` in index.html. Kept in step by a test. */
const FADE_MS = 280;

let going = false;

/**
 * Fade the cover out and take it out of the document.
 *
 * Safe to call twice, and safe to call when there is no cover at all — a test, or a host
 * page that does not carry one. It waits a frame first: `start()` builds the home screen
 * synchronously, so calling this in the same tick begins the fade before the screen
 * underneath has been painted, and the player watches the cover dissolve into nothing.
 */
export function hideSplash(): void {
  if (going) return;
  const el = document.getElementById(ID);
  if (!el) return;
  going = true;
  requestAnimationFrame(() => {
    el.classList.add("gone");
    // Removed on a timer rather than on `transitionend`: that event never fires at all if
    // the element is display:none, if the tab is in the background, or if the player has
    // asked for reduced motion and the transition is skipped.
    setTimeout(() => el.remove(), FADE_MS + 60);
  });
}

/** Take it down NOW, with no fade. For a boot that failed (platform/crash.ts). */
export function dropSplash(): void {
  going = true;
  document.getElementById(ID)?.remove();
}

/** For tests: forget that the cover has already been taken down. */
export function resetSplash(): void {
  going = false;
}
