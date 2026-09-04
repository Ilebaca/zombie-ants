/**
 * THE APP ICON, RENDERED FROM THE GAME'S OWN DRAWING CODE.
 *
 * Every other picture in this project is drawn at runtime and there is no image file
 * anywhere (CLAUDE.md) — an icon is the one thing that cannot be. The operating system
 * needs a real raster file before a single line of our script has run, and iOS wants PNG
 * specifically: an SVG apple-touch-icon is ignored, and what a player gets instead is a
 * blurry screenshot of the page.
 *
 * So the PNGs in `public/` are committed, and this is what makes them. It is a build TOOL,
 * not a build STEP: an icon has to be stable, because people find an app by its icon, and
 * one that quietly redrew itself whenever `render/art.ts` changed would be a different app
 * on the home screen every few weeks. Run it by hand when the mark is meant to change:
 *
 *     npx tsx tools/icons.ts
 *
 * It is EXCLUDED from the typecheck and the lint, because it imports Playwright — which is
 * deliberately not a dependency of this project (CLAUDE.md §11: install it in a scratch
 * directory and point it at the preinstalled Chromium rather than adding tooling Milan
 * would have to run). Every browser drive in this repo works the same way.
 *
 * It drives the same `antHead` the board, the portraits and the pickers draw, in the Fire
 * Ant's palette — the colony a new player starts on — so the icon is the game's own art
 * rather than a second drawing of it that can drift.
 */
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../public");

/** Every size the manifest and the iOS meta tag ask for. */
const SIZES = [
  { file: "icon-192.png", size: 192, pad: 0.22 },
  { file: "icon-512.png", size: 512, pad: 0.22 },
  // iOS crops nothing and rounds the corners itself, so the mark sits further in and the
  // plate reaches the edges — a transparent apple-touch-icon is composited onto black.
  { file: "apple-touch-icon.png", size: 180, pad: 0.24 },
  // Maskable: Android may crop to a circle, so everything important stays inside the
  // middle 80% and the background runs right to the corners.
  { file: "icon-maskable-512.png", size: 512, pad: 0.32 },
  { file: "favicon-64.png", size: 64, pad: 0.18 },
];

async function main(): Promise<void> {
  const art = await Bun_readArt();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });
  const page = await browser.newPage();
  await page.setContent("<canvas id=c></canvas>");
  await mkdir(OUT, { recursive: true });

  for (const { file, size, pad } of SIZES) {
    const data = await page.evaluate(
      ({ src, size, pad }) => {
        const canvas = document.getElementById("c") as HTMLCanvasElement;
        canvas.width = size; canvas.height = size;
        const g = canvas.getContext("2d")!;
        // The soil the whole game is played on, so the icon reads as this app at a glance.
        g.fillStyle = "#142318";
        g.fillRect(0, 0, size, size);
        new Function("g", "X", "Y", "S", "pal", "TAU", src)(
          // Nudged DOWN, because the head is not symmetrical about its centre: the
          // antennae reach well above it and the mandibles barely below, so centring the
          // drawing's origin clips the one feature that says "ant" at a glance.
          g, size / 2, size * 0.56, size * (1 - pad * 2), ["#ff7a45", "#ff8f43", "#b8431d"], 6.283,
        );
        return canvas.toDataURL("image/png");
      },
      { src: art, size, pad },
    );
    await writeFile(resolve(OUT, file), Buffer.from(data.split(",")[1] ?? "", "base64"));
    console.log(`${file}  ${size}x${size}`);
  }
  await browser.close();
}

/**
 * `antHead`'s body, as source, so the icon is drawn by the SAME code the game is.
 *
 * Read out of the file rather than imported because this runs in the browser's context,
 * where the module system is not ours — and copying the drawing here instead would be a
 * second ant that drifts from the first, which is the whole thing this avoids.
 */
async function Bun_readArt(): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const file = await readFile(resolve(HERE, "../src/render/art.ts"), "utf8");
  const start = file.indexOf("export function antHead(");
  const open = file.indexOf("{", file.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < file.length; i++) {
    if (file[i] === "{") depth++;
    else if (file[i] === "}" && --depth === 0) {
      // `TAU` and the optional `look` are the only two names the body reaches for outside
      // its own arguments; both are passed in instead of the module scope it normally has.
      const body = file.slice(open + 1, i).replace(/look\?\.style \?\? null/, "null");
      // Stripped of its types, because this runs in a browser rather than through the
      // bundler — esbuild is already here as one of Vite's own dependencies.
      const { transformSync } = await import("esbuild");
      return transformSync(body, { loader: "ts", format: "esm" }).code;
    }
  }
  throw new Error("antHead not found in src/render/art.ts");
}

void main();
