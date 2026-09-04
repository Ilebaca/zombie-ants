/**
 * THE GAME HAS TO BE INSTALLABLE, because the app asks players to install it.
 *
 * `ui/keepsafe.ts` walks an iPhone player through Add to Home Screen, and that is not a
 * nicety: Safari deletes a site's storage after about a week away and installing is the
 * only thing that exempts it (platform/persistence.ts). For months there was no manifest
 * and no icon at all, so following those instructions gave a blurry screenshot that opened
 * in browser chrome — and because it was not standalone, `isInstalled()` stayed false and
 * the warning kept nagging the one player who had already done what it asked.
 *
 * None of this is visible in the app, which is exactly why it needs a test: an icon that
 * goes missing or a manifest field that gets dropped breaks nothing anybody would notice
 * until a player's colony is gone.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const read = (file: string): string => readFileSync(resolve(root, file), "utf8");

interface Manifest {
  name: string;
  short_name: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  start_url: string;
  scope: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
}
const manifest = (): Manifest =>
  JSON.parse(read("public/manifest.webmanifest")) as Manifest;

const html = (): string => read("index.html");

describe("the web app manifest", () => {
  it("is valid JSON and names the game", () => {
    const m = manifest();
    expect(m.name).toBe("Zombie Ants");
    expect(m.short_name.length).toBeGreaterThan(0);
    // A long short_name is truncated under the icon; a phone shows about twelve characters.
    expect(m.short_name.length).toBeLessThanOrEqual(12);
  });

  /**
   * THE ONE FIELD THE APP'S OWN LOGIC DEPENDS ON. Without `display: standalone` an
   * installed app opens in browser chrome, `navigator.standalone` stays false, and
   * `isInstalled()` can never return true — so the save-at-risk prompt would nag for ever.
   */
  it("declares standalone, which is what makes isInstalled() answerable", () => {
    expect(manifest().display).toBe("standalone");
  });

  /** The game is portrait-only (CLAUDE.md), so an installed one must open that way. */
  it("locks to portrait, like the shade in index.html does", () => {
    expect(manifest().orientation).toBe("portrait");
  });

  /**
   * RELATIVE, never absolute. The build sets `base: "./"` so the same bundle runs under a
   * GitHub Pages project path AND inside a Capacitor shell, where an absolute
   * "/zombie-ants/" would point at nothing at all.
   */
  it("keeps every path relative, so Pages and a native shell both work", () => {
    const m = manifest();
    for (const path of [m.start_url, m.scope, ...m.icons.map((i) => i.src)]) {
      expect(path.startsWith("/"), `${path} is absolute`).toBe(false);
      expect(path.startsWith("http"), `${path} is absolute`).toBe(false);
    }
  });

  it("ships a maskable icon, or Android crops the ant's head off", () => {
    const maskable = manifest().icons.filter((i) => i.purpose === "maskable");
    expect(maskable.length).toBeGreaterThan(0);
    expect(maskable.some((i) => i.sizes === "512x512")).toBe(true);
  });
});

describe("the icons themselves", () => {
  const files = [
    ["public/icon-192.png", 192],
    ["public/icon-512.png", 512],
    ["public/icon-maskable-512.png", 512],
    ["public/apple-touch-icon.png", 180],
    ["public/favicon-64.png", 64],
  ] as const;

  /** A PNG's magic bytes, then the IHDR width and height — a real file, at its real size. */
  it("are real PNGs at the sizes they claim", () => {
    for (const [file, size] of files) {
      const buf = readFileSync(resolve(root, file));
      expect(buf.subarray(0, 8).toString("hex"), `${file} is not a PNG`)
        .toBe("89504e470d0a1a0a");
      expect(buf.readUInt32BE(16), `${file} is the wrong width`).toBe(size);
      expect(buf.readUInt32BE(20), `${file} is the wrong height`).toBe(size);
      // An icon that is mostly nothing is one that failed to draw.
      expect(buf.length, `${file} is suspiciously small`).toBeGreaterThan(1000);
    }
  });

  it("are all present, and every one the manifest names exists", () => {
    for (const [file] of files) expect(existsSync(resolve(root, file)), file).toBe(true);
    for (const icon of manifest().icons) {
      expect(existsSync(resolve(root, "public", icon.src)), icon.src).toBe(true);
    }
  });
});

describe("the tags in index.html", () => {
  it("links the manifest", () => {
    expect(html()).toContain('rel="manifest"');
    expect(html()).toContain("manifest.webmanifest");
  });

  /**
   * BOTH tags, because neither covers every phone: older iOS does not read the manifest
   * at all and needs `apple-mobile-web-app-capable` to open standalone.
   */
  it("asks iOS for a standalone app in the way iOS understands", () => {
    expect(html()).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html()).toContain('name="apple-mobile-web-app-title"');
  });

  /** iOS ignores an SVG here and substitutes a blurry screenshot of the page. */
  it("gives iOS a PNG touch icon", () => {
    const tag = /rel="apple-touch-icon"[^>]*href="([^"]+)"/.exec(html());
    expect(tag, "no apple-touch-icon").toBeTruthy();
    expect(tag?.[1]).toMatch(/\.png$/);
    expect(existsSync(resolve(root, "public", tag![1]!.replace("./", "")))).toBe(true);
  });

  it("has a favicon, so a browser tab is not blank", () => {
    expect(html()).toMatch(/rel="icon"/);
  });

  /** The status bar and the install splash should be the soil, not a black band. */
  it("wears the game's own ground as its theme colour", () => {
    const theme = /name="theme-color" content="([^"]+)"/.exec(html())?.[1];
    expect(theme).toBe(manifest().background_color);
  });
});
