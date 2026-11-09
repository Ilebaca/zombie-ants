import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stabilizeInstalledViewport } from "../installed-viewport";

let stop: (() => void) | undefined;
let installed = true, hostFullscreen = true, hidden = false, focused = true;
let largeWidth = 0, largeHeight = 0;
let safe: { paddingTop: string; paddingBottom: string };
const request = vi.fn();
const value = (name: string): string => document.documentElement.style.getPropertyValue(name);
const viewport = (width: number, height: number): void => {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  window.dispatchEvent(new Event("resize"));
};
const snapshot = (): string[] => ["--installed-width", "--installed-height", "--game-vh",
  "--frame-width", "--safe-top", "--safe-bottom"].map(value);

beforeEach(() => {
  vi.useFakeTimers();
  installed = hostFullscreen = focused = true;
  hidden = false;
  largeWidth = largeHeight = 0;
  safe = { paddingTop: "52px", paddingBottom: "0px" };
  request.mockReset();
  vi.stubGlobal("screen", {
    width: 390, height: 800, availWidth: 390, availHeight: 800,
    orientation: Object.assign(new EventTarget(), { type: "portrait-primary" }),
  });
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: installed && (query === "(display-mode: fullscreen)" ? hostFullscreen : true),
  })));
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android");
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(window, "getComputedStyle").mockImplementation(() => safe as CSSStyleDeclaration);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({
    width: largeWidth, height: largeHeight,
  } as DOMRect));
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    value: request, configurable: true,
  });
  viewport(390, 800);
});

afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.replaceChildren();
  Reflect.deleteProperty(document.documentElement, "requestFullscreen");
  Reflect.deleteProperty(navigator, "standalone");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("installed mobile layout surface", () => {
  it("never sizes the frame beyond the actual launch window", () => {
    largeWidth = 390;
    largeHeight = 844;
    stop = stabilizeInstalledViewport();
    expect(value("--installed-width")).toBe("390px");
    expect(value("--installed-height")).toBe("800px");
    expect(value("--game-vh")).toBe("8px");
  });

  it("falls back to the actual launch window on older engines", () => {
    stop = stabilizeInstalledViewport();
    expect(value("--installed-height")).toBe("800px");
    expect(value("--frame-width")).toBe("390px");
  });

  it("does not change for smaller OR larger same-screen resize events after launch", () => {
    stop = stabilizeInstalledViewport();
    vi.advanceTimersByTime(1100);
    const before = snapshot();
    for (const [width, height] of [[390, 740], [300, 500], [430, 900], [390, 844], [390, 800]]) {
      safe.paddingTop = "0px";
      viewport(width!, height!);
      expect(snapshot()).toEqual(before);
    }
  });

  it("preserves the complete frame across blur, app switcher, resume, pageshow and taps", () => {
    stop = stabilizeInstalledViewport();
    const before = snapshot();
    focused = false;
    window.dispatchEvent(new Event("blur"));
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    viewport(280, 450);
    hidden = false;
    focused = true;
    // A foreground notification can precede restoration of the real viewport.
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pageshow"));
    safe.paddingTop = "0px";
    viewport(390, 838);
    document.body.click();
    document.dispatchEvent(new Event("fullscreenchange"));
    vi.advanceTimersByTime(2000);
    expect(snapshot()).toEqual(before);
    expect(request).not.toHaveBeenCalled();
  });

  it("captures late iPhone hardware insets during launch, then freezes them on resume", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone");
    safe.paddingTop = safe.paddingBottom = "0px";
    stop = stabilizeInstalledViewport();
    safe.paddingTop = "47px";
    safe.paddingBottom = "34px";
    vi.advanceTimersByTime(200);
    expect(value("--safe-top")).toBe("47px");
    expect(value("--safe-bottom")).toBe("34px");
    vi.advanceTimersByTime(1000);
    const before = snapshot();
    safe.paddingTop = safe.paddingBottom = "0px";
    viewport(390, 740);
    window.dispatchEvent(new Event("pageshow"));
    vi.advanceTimersByTime(1000);
    expect(snapshot()).toEqual(before);
  });

  it("recalibrates only when physical display geometry changes", () => {
    stop = stabilizeInstalledViewport();
    vi.advanceTimersByTime(1100);
    Object.defineProperties(screen, {
      width: { value: 360, configurable: true },
      height: { value: 740, configurable: true },
    });
    viewport(360, 740);
    expect(value("--installed-width")).toBe("360px");
    expect(value("--installed-height")).toBe("740px");
  });

  it("recognizes older iPhone Home Screen launches", () => {
    installed = false;
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone");
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    stop = stabilizeInstalledViewport();
    expect(document.documentElement.classList.contains("installed-frame")).toBe(true);
  });

  it("never layers DOM fullscreen requests over installed host fullscreen", () => {
    hostFullscreen = false;
    stop = stabilizeInstalledViewport();
    document.body.click();
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    document.body.click();
    expect(request).not.toHaveBeenCalled();
  });

  it("leaves browser tabs and desktop windows responsive", () => {
    installed = false;
    stop = stabilizeInstalledViewport();
    viewport(300, 500);
    expect(value("--installed-height")).toBe("");
    stop();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Desktop Chrome");
    installed = true;
    stop = stabilizeInstalledViewport();
    expect(value("--installed-width")).toBe("");
  });

  it("disposes timers, listeners, classes, probes and inline geometry", () => {
    stop = stabilizeInstalledViewport();
    stop();
    stop = undefined;
    viewport(300, 500);
    vi.advanceTimersByTime(2000);
    expect(snapshot()).toEqual(["", "", "", "", "", ""]);
    expect(document.body.children).toHaveLength(0);
    expect(document.documentElement.classList.contains("installed-frame")).toBe(false);
    expect(document.documentElement.classList.contains("android-fullscreen")).toBe(false);
  });
});
