/**
 * EXPORT THE MAP'S BACKGROUND AS A PNG.
 *
 * The home screen's artwork is a file now, one per chapter (`src/ui/backdrops.ts`), and
 * the board's ground is the obvious next picture somebody will want to paint. This hands
 * out what the game draws today: the soil, the clearing, the chequer and the scenery, at
 * whatever size is asked for, with NOTHING on it — no tiles, no colonies, no veins, no
 * hive, no chrome.
 *
 *     npx tsx tools/mapshot.ts [out.png] [width] [height] [scale]
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
import { resolve } from "node:path";

async function main(): Promise<void> {
  const [out = "map-background.png", w = "1000", h = "1300", scale = "2"] = process.argv.slice(2);

  const server = await createServer({ server: { port: 5199 }, logLevel: "warn" });
  await server.listen();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  try {
    const page = await browser.newPage();
    const url = `http://localhost:5199/tools/mapshot/index.html?w=${w}&h=${h}&scale=${scale}`;
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { mapshotReady?: boolean }).mapshotReady);
    const canvas = await page.$("#plate");
    if (!canvas) throw new Error("the page drew nothing");
    await canvas.screenshot({ path: resolve(process.cwd(), out) });
    const size = await page.evaluate(() => {
      const c = document.getElementById("plate") as HTMLCanvasElement;
      return `${c.width}x${c.height}`;
    });
    console.log(`${out}  ${size}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

void main();
