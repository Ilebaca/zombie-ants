import { lockPortrait } from "../platform/orientation";
import { recordDisplay, watchDisplay } from "./display-report";

/**
 * An installed game has one layout surface. Transient system bars and keyboards
 * may cover it, but must not rearrange it. Ordinary browser tabs remain responsive.
 */
export function stabilizeInstalledViewport(): () => void {
  const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!standalone && !window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches) {
    return watchDisplay();
  }

  // Manifest fullscreen is owned by the Android host. Do not layer the DOM
  // Fullscreen API over it: the two modes have separate lifecycle/inset handling.
  const hostFullscreen = window.matchMedia("(display-mode: fullscreen)").matches;
  const root = document.documentElement;
  const android = /Android/i.test(navigator.userAgent);
  const alignFullscreenWindow = (): void => {
    root.classList.toggle("android-fullscreen", android
      && (hostFullscreen || document.fullscreenElement === root));
  };
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
    // WebKit may publish its notch/home-indicator insets after the first layout.
    // Keep CSS env() live on iOS; Android retains its calibrated transient-bar policy.
    if (!ios) {
      root.style.setProperty("--safe-top", safe.paddingTop || "0px");
      root.style.setProperty("--safe-bottom", safe.paddingBottom || "0px");
    }
  };

  const resize = (): void => { measure(); };
  const fullscreen = (): void => {
    alignFullscreenWindow();
    if (document.fullscreenElement === root) {
      measure(true);
      lockPortrait();
    }
  };
  const awake = (): void => {
    if (document.hidden) return;
    // Returning from another app permits a fresh request on the next game tap.
    // Never request fullscreen from a resize, a system gesture or visibility itself.
    attempted = false;
    measure();
  };
  const immerse = (event: Event): void => {
    if (hostFullscreen || window.matchMedia("(display-mode: fullscreen)").matches
      || attempted || document.hidden || document.fullscreenElement
      || !document.fullscreenEnabled || !android) return;
    if (navigator.userActivation?.isActive === false) return;
    const target = event.target;
    if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
    attempted = true;
    try {
      // Ask explicitly for the full screen with navigation UI hidden. This is
      // separate from the manifest launch mode, and requires a game gesture.
      recordDisplay("fullscreen-request", probe);
      void root.requestFullscreen({ navigationUI: "hide" }).catch(() => {
        recordDisplay("fullscreen-refused", probe);
        // Unsupported or refused: keep the installed layout, without repeated asks.
      });
    } catch {
      recordDisplay("fullscreen-unavailable", probe);
      // Older embedded browsers may expose an unusable implementation.
    }
  };

  measure();
  alignFullscreenWindow();
  root.classList.add("installed-frame");
  const stopReport = watchDisplay(probe);
  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", fullscreen);
  document.addEventListener("visibilitychange", awake);
  document.addEventListener("click", immerse, true);

  return () => {
    disposed = true;
    window.removeEventListener("resize", resize);
    stopReport();
    document.removeEventListener("fullscreenchange", fullscreen);
    document.removeEventListener("visibilitychange", awake);
    document.removeEventListener("click", immerse, true);
    probe.remove();
    root.classList.remove("installed-frame", "android-fullscreen");
    for (const name of ["--installed-height", "--game-vh", "--safe-top", "--safe-bottom"]) {
      root.style.removeProperty(name);
    }
  };
}
