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
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { SUPPORT_EMAIL } from "../../platform";

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

/**
 * THE PRIVACY POLICY (`public/privacy.html`).
 *
 * A Play listing has to point at a policy URL that works whether or not anybody has
 * installed the game, so it is a plain static page that ships with the build rather than a
 * screen in the app. What is worth holding is that it does not go stale in the two ways a
 * hand-written page goes stale: a contact address that no longer matches the one the app
 * prints, and a claim about behaviour the code no longer has.
 */
describe("the privacy policy", () => {
  const page = readFileSync(resolve(__dirname, "../../../public/privacy.html"), "utf8");

  it("ships with the build, at a URL of its own", () => {
    expect(page).toContain("<title>");
    expect(page.toLowerCase()).toContain("privacy");
  });

  /**
   * ONE CONTACT ADDRESS. Two copies is one that goes stale, and the stale one is always
   * the one in the policy — where it is also the only route somebody has to ask about it.
   */
  it("names the same address the app prints", () => {
    expect(page).toContain(SUPPORT_EMAIL);
  });

  /**
   * IT CLAIMS NO ANALYTICS, so nothing may be added that would make that a lie. This is
   * the assertion that catches it: a tracker arrives as a script tag or a fetch to
   * somewhere, and the shipped source has neither.
   */
  it("is telling the truth about there being no analytics", () => {
    // Past the file's own comment, which explains the same thing to whoever edits it.
    const body = page.slice(page.indexOf("<body"));
    expect(body).toMatch(/no analytics/i);
    const src = shipped(resolve(__dirname, "../..")).map((f) => readFileSync(f, "utf8")).join("\n");
    for (const tracker of ["google-analytics", "gtag(", "googletagmanager", "sentry", "mixpanel", "amplitude", "posthog"]) {
      expect(src.toLowerCase(), `${tracker} is in the app, and the policy says it is not`)
        .not.toContain(tracker);
    }
  });

  /** Relative, like every path in this build: one bundle runs under a project path and
   *  inside the Capacitor shell. */
  it("is linked from the app by a relative path", () => {
    const support = readFileSync(resolve(__dirname, "../support.ts"), "utf8");
    expect(support).toContain('"./privacy.html"');
  });
});

/** Every `.ts` the app ships, minus the tests that describe it. */
function shipped(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "__tests__") shipped(path, out);
    } else if (name.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

/**
 * THE TYPEFACE IS OURS, and that is a privacy fix before it is a performance one.
 *
 * It came from Google's CDN, which meant every player's IP address reached Google before a
 * line of the game ran — no consent asked for and none of it necessary, which is the
 * textbook GDPR problem with hosted webfonts. It was also the app's only third-party embed,
 * and the reason the privacy page had to list Google as a recipient at all.
 */
describe("the typeface", () => {
  const html = readFileSync(resolve(root, "index.html"), "utf8");

  it("is served from this build rather than from a CDN", () => {
    // Past the comments: the one above the @font-face block explains what was removed and
    // names the CDN to do it. Same trap the service worker's rules have.
    const markup = html.replace(/<!--[\s\S]*?-->/g, "");
    expect(markup).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(html).toContain("@font-face");
    expect(html).toMatch(/url\(\.\/fonts\/nunito-latin\.woff2\)/);
  });

  it("ships the files it names", () => {
    for (const f of ["fonts/nunito-latin.woff2", "fonts/nunito-latin-ext.woff2"]) {
      expect(existsSync(resolve(root, "public", f)), `${f} is missing`).toBe(true);
    }
  });

  /** Precached like everything else now — a first launch with no network should not render
   *  in Arial. It could not be, while it lived on somebody else's server. */
  it("is precached by the offline worker", () => {
    const config = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    expect(config).toContain("./fonts/nunito-latin.woff2");
  });

  /** And the policy no longer claims a request that does not happen. A privacy page that
   *  over-discloses is as wrong as one that under-discloses. */
  it("is no longer named as a third party in the privacy policy", () => {
    const page = readFileSync(resolve(root, "public/privacy.html"), "utf8");
    const body = page.slice(page.indexOf("<body"));
    expect(body).not.toMatch(/loads its typeface from Google/i);
  });
});

/**
 * THE TERMS, beside the privacy policy. A store listing has a field for the URL and Apple
 * expects an app that sells anything to point at them; like the policy it is a plain static
 * page that ships with the build rather than a screen in the app.
 */
describe("the terms of use", () => {
  const page = readFileSync(resolve(root, "public/terms.html"), "utf8");

  it("ships with the build, at a URL of its own", () => {
    expect(page).toContain("<title>");
    expect(page.toLowerCase()).toContain("terms");
  });

  it("names the same address the app prints", () => {
    expect(page).toContain(SUPPORT_EMAIL);
  });

  /**
   * THE PARTS A PLAYER ACTUALLY NEEDS. Refunds go through the store, because we take no
   * payment and hold no card details — and saying where is the whole point of the section.
   */
  it("says who handles refunds and where to ask", () => {
    expect(page).toMatch(/refund/i);
    expect(page).toContain("reportaproblem.apple.com");
    expect(page).toMatch(/google play/i);
  });

  /** It must not contradict the game: the odds are printed, and the opponents are not
   *  people. Two claims the app makes on screen, restated where they are binding. */
  it("agrees with what the game says about odds and opponents", () => {
    expect(page).toMatch(/odds are printed|odds.*printed/i);
    expect(page).toMatch(/every opponent is the computer/i);
  });

  it("is linked from the app by a relative path", () => {
    const support = readFileSync(resolve(root, "src/ui/support.ts"), "utf8");
    expect(support).toContain('"./terms.html"');
  });
});
