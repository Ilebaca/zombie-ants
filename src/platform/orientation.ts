/**
 * THE GAME IS PLAYED UPRIGHT.
 *
 * The board is square and the whole interface is a single column, so a phone on its side
 * gives the board a third of the pixels it should have and spreads the rest as empty width.
 * This is a portrait game.
 *
 * There are two halves to holding that, and neither is enough alone:
 *
 *  - `screen.orientation.lock()` is the real thing, and it is the one to use where it is
 *    allowed: installed as an app, or fullscreen on Android. It is REFUSED in an ordinary
 *    browser tab and iOS Safari does not implement it at all — so it is attempted, quietly,
 *    and its failure is expected rather than exceptional.
 *  - The shade in `index.html` is what actually holds the line on most devices. It is in
 *    the document rather than built here so it is on screen before any script has run.
 *
 * When this build is wrapped with Capacitor (roadmap step 4) the honest lock is a line of
 * Android manifest — `android:screenOrientation="portrait"` — and both of these become
 * belt and braces. They should stay: the game is also served on the web.
 */

/** What `screen.orientation` looks like where it exists. Narrow on purpose. */
interface Lockable {
  lock?: (orientation: string) => Promise<void>;
}

/**
 * Ask for portrait, once, and never mind if the answer is no.
 *
 * Called from the first gesture rather than at boot for the same reason audio is: a browser
 * that grants this at all grants it to a user action. A rejected promise here is the NORMAL
 * case in a browser tab, so it is swallowed — an unhandled rejection in the console on
 * every load would be noise reporting a thing that is working as designed.
 */
export function lockPortrait(): void {
  try {
    const orientation = (globalThis as { screen?: { orientation?: Lockable } }).screen?.orientation;
    void orientation?.lock?.("portrait").catch(() => {
      // Refused, which is what an ordinary browser tab does. The shade covers it.
    });
  } catch {
    // Not implemented at all (iOS Safari). Same answer.
  }
}
