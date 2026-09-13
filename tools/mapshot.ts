/**
 * EXPORT THE MAP'S BACKGROUND AS A PNG.
 *
 * The home screen's artwork is a file now, one per chapter (`src/ui/backdrops.ts`), and
 * the board's ground is the obvious next picture somebody will want to paint. This hands
 * out what the game draws today: the soil, the clearing, the chequer and the scenery, at
 * whatever size is asked for, with NOTHING on it — no tiles, no colonies, no veins, no
 * hive, no chrome.
 *
 *     npx tsx tools/mapshot.ts [out.png|out.webp] [width] [height] [scale] [grid]
 *
 * The file type follows the extension — webp for anything that ships in the bundle (the
 * placeholder every region wears is a couple of hundred KB that way and several megabytes
 * as a PNG), png for a picture somebody is going to paint over. `grid` puts the chequer
 * back; without it the export is the ground alone, which is what a region picture is.
 *
 * It is a TOOL, not a build step, and it is EXCLUDED from the typecheck and the lint for
 * the same reason `tools/icons.ts` is: it imports Playwright, which is deliberately not a
 * dependency of this project (CLAUDE.md §11).
 *
 * It drives a real Vite dev server and a real browser rather than reimplementing any of
 * the drawing, so the export cannot drift from the board: `tools/mapshot/main.ts` imports
 * `render/terrain.ts` itself.
 */
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main(): Promise<void> {
  const [out = "map-background.png", w = "1000", h = "1300", scale = "2", grid = "0"]
    = process.argv.slice(2);
  const type = out.endsWith(".webp") ? "image/webp" : "image/png";

  const server = await createServer({ server: { port: 5199 }, logLevel: "warn" });
  await server.listen();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  try {
    const page = await browser.newPage();
    const url = `http://localhost:5199/tools/mapshot/index.html`
      + `?w=${w}&h=${h}&scale=${scale}&grid=${grid === "1" ? 1 : 0}`;
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { mapshotReady?: boolean }).mapshotReady);
    // The canvas encodes itself rather than being screenshotted: a screenshot is always a
    // PNG, and the placeholder that ships in the bundle has to be a webp.
    const shot = await page.evaluate((mime: string) => {
      const c = document.getElementById("plate") as HTMLCanvasElement;
      return { data: c.toDataURL(mime, 0.9), size: `${c.width}x${c.height}` };
    }, type);
    await writeFile(resolve(process.cwd(), out),
      Buffer.from(shot.data.split(",")[1] ?? "", "base64"));
    console.log(`${out}  ${shot.size}  ${type}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

void main();
