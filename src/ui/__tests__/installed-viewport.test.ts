import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stabilizeInstalledViewport } from "../installed-viewport";

let stop: (() => void) | undefined;
let installed = true;
let hidden = false;
let full: Element | null = null;
let enabled = true;
const request = vi.fn<() => Promise<void>>();
const viewport = (width: number, height: number): void => {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  window.dispatchEvent(new Event("resize"));
};
const value = (name: string): string => document.documentElement.style.getPropertyValue(name);
const tap = (): void => { document.body.click(); };

beforeEach(() => {
  installed = true;
  hidden = false;
  full = null;
  enabled = true;
  request.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: installed })));
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android");
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  Object.defineProperty(document, "fullscreenElement", {
    get: () => full, configurable: true,
  });
  Object.defineProperty(document, "fullscreenEnabled", {
    get: () => enabled, configurable: true,
  });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    value: request, configurable: true,
  });
  viewport(390, 800);
});

afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.replaceChildren();
  delete (document.documentElement as Partial<HTMLElement>).requestFullscreen;
  delete (document as Partial<Document>).fullscreenElement;
  delete (document as Partial<Document>).fullscreenEnabled;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("installed game viewport", () => {
  it("starts inside the actual window, without measuring a larger hypothetical viewport", () => {
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({ height: 880 } as DOMRect);
    stop = stabilizeInstalledViewport();
    expect(value("--installed-height")).toBe("800px");
    expect(value("--game-vh")).toBe("8px");
    expect(rect).not.toHaveBeenCalled();
  });

  it("does not reflow for bars, keyboard, or their repeated animation frames", () => {
    stop = stabilizeInstalledViewport();
    const safeTop = value("--safe-top"), safeBottom = value("--safe-bottom");
    for (const height of [780, 760, 500, 750, 800, 760, 800]) {
      viewport(390, height);
      expect(value("--installed-height")).toBe("800px");
      expect(value("--game-vh")).toBe("8px");
      expect(value("--safe-top")).toBe(safeTop);
      expect(value("--safe-bottom")).toBe(safeBottom);
    }
  });

  it("accepts more available space and a real width change", () => {
    stop = stabilizeInstalledViewport();
    viewport(390, 844);
    expect(value("--installed-height")).toBe("844px");
    viewport(360, 740);
    expect(value("--installed-height")).toBe("740px");
  });

  it("ignores app-switcher measurements while the document is hidden", () => {
    stop = stabilizeInstalledViewport();
    hidden = true;
    viewport(300, 500);
    expect(value("--installed-height")).toBe("800px");
    hidden = false;
    viewport(390, 800);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(value("--installed-height")).toBe("800px");
  });

  it("leaves ordinary browser tabs responsive", () => {
    installed = false;
    stop = stabilizeInstalledViewport();
    viewport(390, 700);
    tap();
    expect(document.documentElement.classList.contains("installed-frame")).toBe(false);
    expect(value("--installed-height")).toBe("");
    expect(request).not.toHaveBeenCalled();
  });

  it("removes listeners, the measurement probe, and layout overrides on disposal", () => {
    stop = stabilizeInstalledViewport();
    stop();
    stop = undefined;
    viewport(390, 900);
    tap();
    expect(value("--installed-height")).toBe("");
    expect(document.documentElement.classList.contains("installed-frame")).toBe(false);
    expect(document.body.children).toHaveLength(0);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("Android immersive fullscreen", () => {
  it("requests hidden navigation UI on a game tap, never during bar resizes", () => {
    stop = stabilizeInstalledViewport();
    viewport(390, 760);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(request).not.toHaveBeenCalled();
    tap();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ navigationUI: "hide" });
    full = document.documentElement;
    viewport(390, 844);
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(value("--installed-height")).toBe("844px");
    full = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    viewport(390, 760);
    tap();
    expect(request).toHaveBeenCalledTimes(1);
    expect(value("--installed-height")).toBe("844px");
  });

  it("swallows rejection and does not repeatedly ask in the same foreground session", async () => {
    request.mockRejectedValue(new Error("Denied"));
    stop = stabilizeInstalledViewport();
    tap();
    await Promise.resolve();
    tap();
    viewport(390, 760);
    expect(request).toHaveBeenCalledTimes(1);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(request).toHaveBeenCalledTimes(1);
    tap();
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not interrupt typing or request unsupported fullscreen", () => {
    stop = stabilizeInstalledViewport();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.click();
    expect(request).not.toHaveBeenCalled();
    enabled = false;
    tap();
    expect(request).not.toHaveBeenCalled();
  });

  it("does not invoke Android fullscreen behavior on other platforms", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone");
    stop = stabilizeInstalledViewport();
    tap();
    expect(request).not.toHaveBeenCalled();
  });
});
