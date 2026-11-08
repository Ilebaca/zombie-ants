import { afterEach, describe, expect, it, vi } from "vitest";
import { loadColors } from "../palette";
import { canvasFont } from "../typography";

afterEach(() => { vi.unstubAllGlobals(); });

describe("canvas typography", () => {
  it("resolves the display family once and uses its real weight", () => {
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) => name === "--font-display" ? "Poetsen, Nunito, sans-serif" : "",
    }));
    loadColors();
    expect(canvasFont(18)).toBe("400 18px Poetsen, Nunito, sans-serif");
    expect(canvasFont(18)).not.toContain("var(");
  });

  it("keeps a usable font when the stylesheet is unavailable", () => {
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
    loadColors();
    expect(canvasFont(12)).toBe("400 12px Poetsen, Nunito, sans-serif");
  });
});
