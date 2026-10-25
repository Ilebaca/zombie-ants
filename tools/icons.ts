/**
 * THE APP ICON, CUT FROM THE PAINTING AT `assets/icon.png`.
 *
 * Almost every picture in this project is drawn at runtime by the code that owns it, and
 * an icon is the one thing that cannot be: the operating system needs a real raster file
 * before a single line of our script has run, and iOS wants PNG specifically — an SVG
 * apple-touch-icon is ignored, and what a player gets instead is a blurry screenshot of
 * the page. So the PNGs in `public/` are committed, and this is what makes them.
 *
 * IT USED TO RENDER THE GAME'S OWN `antHead` through this same browser, so the icon could
 * not drift from the drawing on the board. It is a PAINTING now, like the regions and the
 * home artwork (CLAUDE.md), and the argument reverses: a mark somebody painted cannot be
 * derived from anything, so the SOURCE is committed beside the output and this tool only
 * cuts it to size. There is still exactly one icon, in one place, and no second drawing.
 *
 * It is a TOOL, not a build step: an icon has to be stable, because people find an app by
 * its icon. Run it by hand when the mark is meant to change:
 *
 *     npx tsx tools/icons.ts
 *
 * It is EXCLUDED from the typecheck and the lint, because it imports Playwright — which is
 * deliberately not a dependency of this project (CLAUDE.md §11: install it in a scratch
 * directory and point it at the preinstalled Chromium rather than adding tooling Milan
 * would have to run). Every browser drive in this repo works the same way.
 */
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../public");
const SOURCE = resolve(HERE, "../assets/icon.png");

/**
 * Every size the manifest and the iOS meta tag ask for — all of them the WHOLE painting.
 *
 * The maskable one used to be inset on three sides, with the margin stretched out of the
 * picture's own edge, because Android may crop to a circle inscribed in the middle 80% and
 * the antennae reached within a few percent of the corners. The painting carries that
 * margin itself now, so insetting again would be padding a picture that is already padded
 * — asked for directly ("do not expand it yourself further").
 */
const SIZES = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  // iOS crops nothing and rounds the corners itself, so the picture reaches the edges.
  { file: "apple-touch-icon.png", size: 180 },
  { file: "icon-maskable-512.png", size: 512 },
  { file: "favicon-64.png", size: 64 },
];

async function main(): Promise<void> {
  const src = `data:image/png;base64,${(await readFile(SOURCE)).toString("base64")}`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage();
  await page.setContent("<canvas id=c></canvas>");
  await mkdir(OUT, { recursive: true });

  for (const { file, size } of SIZES) {
    const data = await page.evaluate(
      async ({ src, size }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = document.getElementById("c") as HTMLCanvasElement;
        canvas.width = size; canvas.height = size;
        const g = canvas.getContext("2d")!;
        g.drawImage(img, 0, 0, size, size);
        return canvas.toDataURL("image/png");
      },
      { src, size },
    );
    await writeFile(resolve(OUT, file), Buffer.from(data.split(",")[1] ?? "", "base64"));
    console.log(`${file}  ${size}x${size}`);
  }
  await browser.close();
}

void main();
