/**
 * THE BOARD'S GROUND, DRAWN BY THE GAME'S OWN CODE, WITH NOTHING ON IT.
 *
 * The page half of `tools/mapshot.ts` — see that file for why this exists. It builds the
 * real `Layout` the match uses and calls the real `drawTerrain`, so what comes out is the
 * ground a player actually sees rather than a second drawing of it. Nothing else is drawn:
 * no tiles, no colonies, no veins, no hive, no chrome.
 *
 * It exports the WHOLE PLATE, overhang included. The scenery is baked bigger than the
 * canvas so the opening camera never sees its edge (render/terrain.ts), and that overhang
 * is real ground — cropping to the canvas would hand back less picture than the game has.
 *
 * And it leaves the CHEQUER OFF by default (`grid=1` puts it back). What this exports is a
 * REGION PICTURE (`ui/regions.ts`): the ground, with the board's own markings drawn over it
 * at the tile size of whatever screen it is played on. Squares baked into the picture would
 * line up on exactly one phone.
 */
import { MAPS } from "../../src/engine";
import { Layout } from "../../src/render";
import { drawTerrain, terrainBleed } from "../../src/render/terrain";

const q = new URLSearchParams(location.search);
const num = (k: string, fallback: number): number => Number(q.get(k) ?? fallback) || fallback;

const w = num("w", 1000);           // the match canvas, in CSS pixels
const h = num("h", 1300);
const scale = num("scale", 2);      // how many output pixels per CSS pixel
const grid = q.get("grid") === "1";  // the cells marked, as the game draws them

// A canvas the shape of the one the match draws into, measured exactly as the renderer
// measures it — the board's size and origin are what decide where the clearing lands.
const shape = document.createElement("canvas");
const layout = new Layout(MAPS.small.size);
layout.measure(shape, w, h);

const bleed = terrainBleed(layout);
const plate = document.getElementById("plate") as HTMLCanvasElement;
plate.width = Math.round((w + bleed * 2) * scale);
plate.height = Math.round((h + bleed * 2) * scale);
const ctx = plate.getContext("2d");
if (ctx) {
  // `drawTerrain` blits its plate at (-bleed, -bleed) of the current transform, so the
  // translate is what puts the overhang inside the picture instead of off the edge of it.
  ctx.setTransform(scale, 0, 0, scale, bleed * scale, bleed * scale);
  drawTerrain(ctx, layout, [], { grid });
}

// The driver waits on this rather than on a timeout: the bake is synchronous, but a page
// screenshotted before its module has run is a black rectangle with nothing to say why.
(window as unknown as { mapshotReady: boolean }).mapshotReady = true;
