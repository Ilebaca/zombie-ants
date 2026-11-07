/**
 * THE GAME IS STILL RUNNING; IT IS JUST NOT ON SCREEN.
 *
 * Switching to another app does not close this one — that is the point of switching
 * rather than closing, and the game should be there the moment it is switched back to.
 * What must NOT keep going is the music: a phone playing a forest bed out of an app
 * nobody is looking at is the game talking over whatever the person actually opened.
 *
 * This asks ONE question and reports the answer: is the game on screen? The app decides
 * what to do about it, which here is suspending the audio device (platform/feedback.ts).
 *
 * `visibilitychange`, NEVER `blur`. A window loses focus for a notification, a dev-tools
 * panel or a second window beside it — all of which leave the game perfectly visible, and
 * cutting the music for any of them is the feature firing when nothing has happened.
 * Visibility is the browser's own answer to "is this page being shown", and it is what
 * both a WebView backgrounded by the OS and a tab switched away from report.
 */

/** Called with `true` when the game is on screen and `false` when it is not. */
export type AwakeHandler = (awake: boolean) => void;

/**
 * Watch whether the game is on screen. Returns a function that stops watching.
 *
 * It does NOT fire on registration: the caller's audio is already in whatever state boot
 * left it in, and announcing "visible" at boot would resume a device that no gesture has
 * unlocked yet. The first call is the first CHANGE.
 */
export function onAwake(handler: AwakeHandler): () => void {
  if (typeof document === "undefined") return () => {};
  const fire = (): void => {
    // A HANDLER THAT THROWS MUST NOT REACH THE CRASH PANEL. An exception out of a
    // listener does not unregister it — the browser catches it and reports it on
    // `window.onerror`, which in this app is `platform/crash.ts` putting a full-screen
    // "something went wrong" panel over the game. Switching apps is not a crash, and a
    // panel raised by one is far worse than the music it failed to mute.
    try { handler(!document.hidden); } catch { /* the next change still gets a go */ }
  };
  document.addEventListener("visibilitychange", fire);
  return () => { document.removeEventListener("visibilitychange", fire); };
}
