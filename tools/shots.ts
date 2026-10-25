/**
 * EXPORT EVERY SCREEN IN THE GAME AS A PNG, AT PHONE SIZE.
 *
 *     npx tsx tools/shots.ts [outdir] [width] [height] [scale]
 *
 * Defaults to `export/screens` at 360x800, one output pixel per CSS pixel — the size that
 * was asked for. `scale 2` doubles it for anything that has to stand up to a store listing.
 *
 * It drives a real Vite dev server and a real browser against the real app, the same way
 * `tools/mapshot.ts` does, so an export cannot be a picture of a screen the game no longer
 * has: `tools/shots/main.ts` imports `ui/app.ts` itself and walks the router.
 *
 * A SCREEN TALLER THAN A PHONE IS SHOT IN SEVERAL FRAMES (`-2`, `-3`, …) rather than in one
 * stretched viewport. The shop, the manual and the Colony Road are each several screens
 * long, and a 360x800 picture of the top of one is not an export of it.
 *
 * The second half of the job is the SHEETS: every icon, portrait, skin, trait, formation and
 * board element, each group on one large page (`tools/shots/sheets.ts`).
 *
 * TOOL, NOT BUILD STEP: excluded from the typecheck and the lint for the same reason
 * `tools/icons.ts` and `tools/mapshot.ts` are — it imports Playwright, which is
 * deliberately not a dependency of this project (CLAUDE.md §11).
 */
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const PORT = 5198;
const CHROME = process.env.CHROMIUM
  ?? "/opt/pw-browsers/chromium";
/**
 * How many 360x800 frames one screen may be walked through.
 *
 * The Colony Road is a hundred rungs and the manual is ten sections, so a low ceiling
 * silently exports the top of the two longest screens in the game and nothing else.
 */
const MAX_FRAMES = 14;

interface SceneMeta { wait: number; still: boolean }

async function settle(page: Page, ms: number): Promise<void> {
  // Two frames, then the scene's own wait: a rebuilt screen needs a layout pass and the
  // board needs a frame of its own to draw into.
  await page.evaluate(() => new Promise<void>((done) => {
    requestAnimationFrame(() => requestAnimationFrame(() => done()));
  }));
  await page.waitForTimeout(ms);
}

async function screens(page: Page, out: string): Promise<number> {
  await page.goto(`http://localhost:${PORT}/tools/shots/index.html`);
  await page.waitForFunction(() => (window as any).shotsReady, null, { timeout: 30_000 });
  // The typeface is ours and it is a real download; a shot taken before it lands is a shot
  // of the fallback stack.
  await page.evaluate(() => document.fonts.ready);

  const names: string[] = await page.evaluate(() => (window as any).shots.names);
  const meta: SceneMeta[] = await page.evaluate(() => (window as any).shots.meta);
  let written = 0;

  for (let i = 0; i < names.length; i++) {
    const name = names[i] as string;
    const info = meta[i] as SceneMeta;
    let ok: unknown = true;
    try {
      ok = await page.evaluate((n: number) => (window as any).shots.run(n), i);
    } catch (err) {
      console.log(`  !! ${name}  ${(err as Error).message.split("\n")[0]}`);
      continue;
    }
    // A scene that answers `false` had nothing to show — a tour that has already ended,
    // say. A blank frame in the middle of a numbered walk is worse than a gap.
    if (ok === false) continue;
    await settle(page, info.wait);
    let last = await page.screenshot();
    await writeFile(resolve(out, `${name}.png`), last);
    written++;
    let frame = 1;
    // Anything that is a board, a camera or an overlay is shot once: there is nothing
    // under it to scroll to, and a drag on it is not what the player does.
    while (!info.still && frame < MAX_FRAMES) {
      const more = await page.evaluate(() => (window as any).shots.scroll());
      if (!more) break;
      await settle(page, 180);
      const shot = await page.screenshot();
      // A SCROLL THAT MOVED NOTHING IS NOT A FRAME. The page can report a scroll it then
      // bounces back from, and two identical files of one screen is somebody checking
      // twice whether they are looking at the same picture.
      if (shot.equals(last)) break;
      last = shot;
      frame++;
      await writeFile(resolve(out, `${name}-${frame}.png`), shot);
      written++;
    }
    console.log(`  ${name}${frame > 1 ? `  (${frame} frames)` : ""}`);
  }
  return written;
}

async function sheets(browser: Browser, out: string, width: number): Promise<number> {
  const page = await browser.newPage({ viewport: { width, height: 1200 }, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${PORT}/tools/shots/sheets.html`);
  await page.waitForFunction(() => (window as any).sheetsReady, null, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  const names: string[] = await page.evaluate(() => (window as any).sheets.names);
  let written = 0;
  for (let i = 0; i < names.length; i++) {
    const name = names[i] as string;
    await page.evaluate((n: number) => (window as any).sheets.show(n), i);
    await settle(page, 400);
    const box = await page.$("#sheet");
    await box?.screenshot({ path: resolve(out, `${name}.png`) });
    written++;
    console.log(`  ${name}`);
  }
  await page.close();
  return written;
}

async function main(): Promise<void> {
  const [dir = "export", w = "360", h = "800", scale = "1"] = process.argv.slice(2);
  const shotDir = resolve(process.cwd(), dir, "screens");
  const sheetDir = resolve(process.cwd(), dir, "sheets");
  await mkdir(shotDir, { recursive: true });
  await mkdir(sheetDir, { recursive: true });

  const server = await createServer({ server: { port: PORT }, logLevel: "warn" });
  await server.listen();
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [
      "--no-sandbox",
      // A throttled page stops answering `requestAnimationFrame`, and the board draws on
      // nothing else — without these a headless export hands back a blank canvas.
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: Number(w), height: Number(h) },
      deviceScaleFactor: Number(scale),
      // The game is a touch app and two rules key off it: the rotate shade is gated on a
      // coarse pointer, and the deck claims a swipe rather than a drag.
      hasTouch: true,
      isMobile: true,
      reducedMotion: "no-preference",
    });
    page.on("pageerror", (e) => console.log(`  (page error) ${e.message.split("\n")[0]}`));
    const shots = await screens(page, shotDir);
    await page.close();
    const pages = await sheets(browser, sheetDir, 1200);
    await writeFile(resolve(process.cwd(), dir, "README.txt"),
      `Zombie Ants export\n\nscreens/  ${shots} files at ${w}x${h}`
      + `${Number(scale) > 1 ? ` (x${scale})` : ""}\n`
      + `          a screen taller than a phone is shot in several frames: -2, -3, ...\n`
      + `sheets/   ${pages} sheets at 1200px wide, x2 — icons, portraits, skins, traits,\n`
      + `          abilities, formations, board elements, chambers and the shop.\n\n`
      + `Re-made by:  npx tsx tools/shots.ts\n`);
    console.log(`\n${shots} screens -> ${shotDir}\n${pages} sheets  -> ${sheetDir}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

void main();
