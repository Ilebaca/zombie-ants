import { watchDisplay } from "./display-report";

/**
 * Installed mobile games use one launch-calibrated surface. The host owns fullscreen;
 * system bars, keyboards and the app switcher cover that surface without resizing it.
 * Browser tabs and desktop windows keep their normal responsive layout.
 */
export function stabilizeInstalledViewport(): () => void {
  const root = document.documentElement;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const installed = standalone
    || window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches;
  const mobile = /Android|iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!installed || !mobile) return watchDisplay();

  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;"
    + "padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);"
    + "box-sizing:border-box";
  document.body.appendChild(probe);
  const geometry = (): string => `${screen.width}:${screen.height}:${screen.orientation?.type ?? ""}`;
  let screenKey = geometry();
  let width = 0, height = 0, top = 0, bottom = 0;
  let sealed = false, disposed = false;
  let poll = 0, deadline = 0;

  const calibrate = (): void => {
    if (disposed || sealed || document.hidden || !document.hasFocus()
      || window.innerWidth > window.innerHeight) return;
    const safe = getComputedStyle(probe);
    // The actual launch window bounds the surface: a hypothetical 100lvh can
    // include permanently reserved host bars and hide the entire navigation tray.
    width = Math.max(width, window.innerWidth);
    height = Math.max(height, window.innerHeight);
    top = Math.max(top, parseFloat(safe.paddingTop) || 0);
    bottom = Math.max(bottom, parseFloat(safe.paddingBottom) || 0);
    if (!(width > 0 && height > 0)) return;
    root.style.setProperty("--installed-width", `${width}px`);
    root.style.setProperty("--frame-width", `${width}px`);
    root.style.setProperty("--installed-height", `${height}px`);
    root.style.setProperty("--game-vh", `${height / 100}px`);
    root.style.setProperty("--safe-top", `${top}px`);
    root.style.setProperty("--safe-bottom", `${bottom}px`);
    root.classList.add("installed-frame");
    root.classList.toggle("android-fullscreen", /Android/i.test(navigator.userAgent)
      && window.matchMedia("(display-mode: fullscreen)").matches);
  };
  const seal = (): void => {
    sealed = true;
    window.clearInterval(poll);
    window.clearTimeout(deadline);
  };
  const begin = (): void => {
    sealed = false;
    // WebKit can publish hardware insets after its first layout. This bounded
    // calibration runs under the launch splash; returning from another app never
    // restarts it or requests DOM fullscreen.
    calibrate();
    poll = window.setInterval(() => {
      if (document.hasFocus()) calibrate();
    }, 100);
    deadline = window.setTimeout(seal, 1000);
  };
  const resize = (): void => {
    if (document.hidden || !document.hasFocus()) return;
    const nextKey = geometry();
    if (!width || nextKey !== screenKey) {
      seal();
      screenKey = nextKey;
      width = height = top = bottom = 0;
      begin();
    } else if (!sealed) calibrate();
  };
  const visibility = (): void => {
    if (document.hidden) seal();
    else if (!width) resize();
  };
  begin();
  const stopReport = watchDisplay(probe);
  window.addEventListener("resize", resize);
  window.addEventListener("blur", seal);
  window.addEventListener("focus", resize);
  window.addEventListener("pageshow", resize);
  document.addEventListener("visibilitychange", visibility);
  screen.orientation?.addEventListener?.("change", resize);
  return () => {
    disposed = true;
    seal();
    stopReport();
    window.removeEventListener("resize", resize);
    window.removeEventListener("blur", seal);
    window.removeEventListener("focus", resize);
    window.removeEventListener("pageshow", resize);
    document.removeEventListener("visibilitychange", visibility);
    screen.orientation?.removeEventListener?.("change", resize);
    probe.remove();
    root.classList.remove("installed-frame", "android-fullscreen");
    for (const name of ["--installed-width", "--frame-width", "--installed-height",
      "--game-vh", "--safe-top", "--safe-bottom"]) root.style.removeProperty(name);
  };
}
