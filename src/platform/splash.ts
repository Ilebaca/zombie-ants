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

/**
 * THE COVER IS UP FOR AT LEAST THIS LONG, HOWEVER FAST THE GAME LOADS.
 *
 * Asked for directly, and it is the artwork that makes it worth having: a cover carrying a
 * painting that flashes past in two hundred milliseconds on a warm cache is a picture
 * nobody sees and a game that looks like it stuttered on the way in. A floor also hides
 * the SPREAD — the same boot is a blink on a desktop and most of a second on a phone — so
 * the game opens the same way every time rather than at whatever speed the device managed.
 *
 * It is a FLOOR, not a delay: a boot that takes longer still takes longer, and nothing
 * waits for it except the cover coming down.
 */
const MIN_MS = 2000;

let going = false;

/**
 * When the cover went up, so the floor can be measured against it.
 *
 * ZERO in the app, because `performance.now()` is already "milliseconds since this page
 * started" — which is the quantity, not the time since this module happened to evaluate.
 * `resetSplash` rebases it so a test's floor runs from the test rather than from whenever
 * the suite booted.
 */
let base = 0;

/** How long the cover has been up. */
const upFor = (): number => performance.now() - base;

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
  // THE REMAINDER OF THE FLOOR IS WORKED OUT ONCE, never re-checked on a tick. A loop that
  // asked `upFor()` again each time would never finish under a test's fake clock, where
  // the timers advance and `performance.now()` need not: one subtraction, one timer, and
  // the same arithmetic whichever clock is running.
  const wait = Math.max(0, MIN_MS - upFor());
  setTimeout(() => requestAnimationFrame(() => {
    el.classList.add("gone");
    // Removed on a timer rather than on `transitionend`: that event never fires at all if
    // the element is display:none, if the tab is in the background, or if the player has
    // asked for reduced motion and the transition is skipped.
    setTimeout(() => el.remove(), FADE_MS + 60);
  }), wait);
}

/**
 * Take it down NOW, with no fade — and with no floor either.
 *
 * For a boot that FAILED (platform/crash.ts). The two seconds are there so a picture can
 * be looked at; two seconds of looking at it on top of the one screen that says what went
 * wrong is the fault the cover's watchdog exists to prevent, arrived at deliberately.
 */
export function dropSplash(): void {
  going = true;
  document.getElementById(ID)?.remove();
}

/** For tests: forget that the cover has been taken down, and restart its floor. */
export function resetSplash(): void {
  going = false;
  base = performance.now();
}
