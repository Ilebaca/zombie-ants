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
 * Every size the manifest and the iOS meta tag ask for.
 *
 * `inset` is how much of the frame is given up to margin on each side. The painting is
 * composed to the edges, so almost everywhere it is zero and the picture is simply the
 * icon. The MASKABLE one is the exception: Android may crop it to a circle inscribed in
 * the middle 80%, and the antenna tips reach within a few percent of the corners — at a
 * 0.80 scale the tip sits exactly on that circle, so it comes in a little further.
 */
const SIZES = [
  { file: "icon-192.png", size: 192, inset: 0 },
  { file: "icon-512.png", size: 512, inset: 0 },
  // iOS crops nothing and rounds the corners itself, so the picture reaches the edges.
  { file: "apple-touch-icon.png", size: 180, inset: 0 },
  { file: "icon-maskable-512.png", size: 512, inset: 0.08 },
  { file: "favicon-64.png", size: 64, inset: 0 },
];

async function main(): Promise<void> {
  const src = `data:image/png;base64,${(await readFile(SOURCE)).toString("base64")}`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage();
  await page.setContent("<canvas id=c></canvas>");
  await mkdir(OUT, { recursive: true });

  for (const { file, size, inset } of SIZES) {
    const data = await page.evaluate(
      async ({ src, size, inset }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = document.getElementById("c") as HTMLCanvasElement;
        canvas.width = size; canvas.height = size;
        const g = canvas.getContext("2d")!;
        // The picture is inset on three sides and FLUSH WITH THE BOTTOM, where the
        // ant's body already runs off the edge of the painting. Inset there too and the
        // clamp below stretches that body into a red block with a step at each side; let
        // it bleed and the only margins left are the soft blue vignette, which extends
        // with no seam at all.
        const at = Math.round(size * inset);
        const inner = size - at * 2;
        const top = size - inner;
        if (at > 0) {
          // THE MARGIN IS THE PAINTING'S OWN EDGE, STRETCHED OUT — a nine-slice off its
          // one-pixel border rather than a flat fill, a guessed gradient or a blurred
          // blow-up of the whole picture. A clamped border continues the vignette
          // exactly; a blurred copy drags the ant's reds out into the margin and leaves
          // the inset picture sitting on it as a visible square.
          const w = img.naturalWidth, h = img.naturalHeight;
          g.drawImage(img, 0, 0, 1, 1, 0, 0, at, top);
          g.drawImage(img, w - 1, 0, 1, 1, size - at, 0, at, top);
          g.drawImage(img, 0, 0, w, 1, at, 0, inner, top);
          g.drawImage(img, 0, 0, 1, h, 0, top, at, inner);
          g.drawImage(img, w - 1, 0, 1, h, size - at, top, at, inner);
        }
        g.drawImage(img, at, top, inner, inner);
        return canvas.toDataURL("image/png");
      },
      { src, size, inset },
    );
    await writeFile(resolve(OUT, file), Buffer.from(data.split(",")[1] ?? "", "base64"));
    console.log(`${file}  ${size}x${size}`);
  }
  await browser.close();
}

void main();
