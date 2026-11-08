import { BUILD } from "../platform/build";
import { isNative } from "../platform/native";

interface DisplaySample {
  event: string;
  time: number;
  mode: string;
  fullscreen: boolean;
  hidden: boolean;
  focused: boolean;
  window: number[];
  visual: number[] | null;
  app: number[] | null;
  navigation: number[] | null;
  frameHeight: string;
  insets: string[] | null;
}
const samples: DisplaySample[] = [];
const LIMIT = 24;

/** Local, bounded diagnostics only. No save data, URLs, storage or network access. */
export function recordDisplay(event: string, probe?: HTMLElement): void {
  if (event === "launch") samples.length = 0;
  const rect = (selector: string): number[] | null => {
    const r = document.querySelector(selector)?.getBoundingClientRect();
    return r ? [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10) : null;
  };
  const visual = window.visualViewport;
  const safe = probe ? getComputedStyle(probe) : null;
  samples.push({
    event, time: Math.round(performance.now()),
    mode: ["fullscreen", "standalone", "minimal-ui"].find(
      (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches,
    ) ?? "browser",
    fullscreen: !!document.fullscreenElement,
    hidden: document.hidden, focused: document.hasFocus(),
    window: [window.innerWidth, window.innerHeight,
      document.documentElement.clientWidth, document.documentElement.clientHeight,
      window.outerWidth, window.outerHeight, window.screenX, window.screenY],
    visual: visual ? [visual.width, visual.height, visual.offsetLeft, visual.offsetTop, visual.scale] : null,
    app: rect("#app"), navigation: rect("#mainNav"),
    frameHeight: document.documentElement.style.getPropertyValue("--installed-height"),
    insets: safe ? [safe.paddingTop, safe.paddingBottom] : null,
  });
  if (samples.length > LIMIT) samples.splice(1, 1);
}

export function displayReport(): string {
  recordDisplay("report");
  return JSON.stringify({
    build: BUILD, browser: navigator.userAgent, native: isNative(),
    screen: [screen.width, screen.height, screen.availWidth, screen.availHeight],
    pixelRatio: window.devicePixelRatio, orientation: screen.orientation?.type,
    // Coordinates are CSS pixels: window = inner size, client size, outer size, origin;
    // rects = x/y/width/height; visual = width/height/left/top/scale.
    events: samples,
  }, null, 2);
}

/** Observe actual window changes even if the home-screen shortcut is not installed mode. */
export function watchDisplay(probe?: HTMLElement): () => void {
  let active = true;
  const inspect = (event: Event): void => {
    // Let the layout handlers settle before reading their resulting geometry.
    queueMicrotask(() => { if (active) recordDisplay(event.type, probe); });
  };
  const listeners: [EventTarget, string][] = [
    [window, "resize"], [window, "focus"], [window, "blur"],
    [document, "fullscreenchange"], [document, "visibilitychange"],
  ];
  if (window.visualViewport) {
    listeners.push([window.visualViewport, "resize"], [window.visualViewport, "scroll"]);
  }
  recordDisplay("launch", probe);
  for (const [target, event] of listeners) target.addEventListener(event, inspect);
  return () => {
    active = false;
    for (const [target, event] of listeners) target.removeEventListener(event, inspect);
  };
}
