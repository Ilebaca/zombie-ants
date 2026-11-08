import { lockPortrait } from "../platform/orientation";

/**
 * An installed game has one layout surface. Transient system bars and keyboards
 * may cover it, but must not rearrange it. Ordinary browser tabs remain responsive.
 */
export function stabilizeInstalledViewport(): () => void {
  if (!window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches) {
    return () => {};
  }

  const root = document.documentElement;
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;"
    + "padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  let width = 0;
  let height = 0;
  let attempted = false;
  let disposed = false;

  const measure = (enteredFullscreen = false): void => {
    if (disposed || document.hidden) return;
    const nextWidth = window.innerWidth;
    const nextHeight = window.innerHeight;
    if (nextWidth <= 0 || nextHeight <= 0) return;
    const resized = nextWidth !== width;
    // Start with the actual window, not 100lvh: a large viewport can include space
    // the installed browser has reserved for its bars, clipping the whole tab bar.
    if (!resized && !enteredFullscreen && nextHeight <= height) return;
    width = nextWidth;
    height = resized ? nextHeight : Math.max(height, nextHeight);
    const safe = getComputedStyle(probe);
    root.style.setProperty("--installed-height", `${height}px`);
    root.style.setProperty("--game-vh", `${height / 100}px`);
    root.style.setProperty("--safe-top", safe.paddingTop || "0px");
    root.style.setProperty("--safe-bottom", safe.paddingBottom || "0px");
  };

  const resize = (): void => { measure(); };
  const fullscreen = (): void => {
    if (document.fullscreenElement !== root) return;
    measure(true);
    lockPortrait();
  };
  const awake = (): void => {
    if (document.hidden) return;
    // Returning from another app permits a fresh request on the next game tap.
    // Never request fullscreen from a resize, a system gesture or visibility itself.
    attempted = false;
    measure();
  };
  const immerse = (event: Event): void => {
    if (attempted || document.hidden || document.fullscreenElement
      || !document.fullscreenEnabled || !/Android/i.test(navigator.userAgent)) return;
    const target = event.target;
    if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
    attempted = true;
    try {
      // Ask explicitly for the full screen with navigation UI hidden. This is
      // separate from the manifest launch mode, and requires a game gesture.
      void root.requestFullscreen({ navigationUI: "hide" }).catch(() => {
        // Unsupported or refused: keep the installed layout, without repeated asks.
      });
    } catch {
      // Older embedded browsers may expose an unusable implementation.
    }
  };

  measure();
  root.classList.add("installed-frame");
  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", fullscreen);
  document.addEventListener("visibilitychange", awake);
  document.addEventListener("click", immerse, true);

  return () => {
    disposed = true;
    window.removeEventListener("resize", resize);
    document.removeEventListener("fullscreenchange", fullscreen);
    document.removeEventListener("visibilitychange", awake);
    document.removeEventListener("click", immerse, true);
    probe.remove();
    root.classList.remove("installed-frame");
    for (const name of ["--installed-height", "--game-vh", "--safe-top", "--safe-bottom"]) {
      root.style.removeProperty(name);
    }
  };
}
