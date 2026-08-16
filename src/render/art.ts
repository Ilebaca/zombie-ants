/**
 * Ant and nest illustrations.
 *
 * Pure canvas drawing on a caller-supplied context: no game state, no layout. The meta
 * screens reuse these for species cards, so they must stay free of board assumptions.
 */
import type { SpeciesId } from "../engine";

/** Cosmetic skin overlay drawn on top of the base ant body. */
export type SkinStyle = "lava" | "leaves" | "ghost" | "glyph" | "camo" | "devil" | null;

/** Which structure a colony's nest is drawn as. */
export type HillStyle = "mound" | "tree" | "volcano" | "pyramid" | "bunker" | "horn";

export interface Look {
  id: string;
  name: string;
  style: SkinStyle;
  hill: HillStyle;
}

/**
 * Unlockable looks per species. Index 0 is the basic look — the AI always fields it, and
 * it is what a player sees before any cosmetics are equipped.
 */
export const RACE_SKINS: Record<SpeciesId, readonly Look[]> = {
  leafcutter: [{ id: "lc_b", name: "Basic", style: null, hill: "mound" },
               { id: "lc_leaf", name: "Leaf Bearers", style: "leaves", hill: "tree" }],
  fire:       [{ id: "fi_b", name: "Basic", style: null, hill: "mound" },
               { id: "fi_lava", name: "Molten", style: "lava", hill: "volcano" }],
  ghost:      [{ id: "gh_b", name: "Basic", style: null, hill: "mound" },
               { id: "gh_sheet", name: "Haunting", style: "ghost", hill: "mound" }],
  pharaoh:    [{ id: "ph_b", name: "Basic", style: null, hill: "mound" },
               { id: "ph_glyph", name: "Hieroglyph", style: "glyph", hill: "pyramid" }],
  army:       [{ id: "ar_b", name: "Basic", style: null, hill: "mound" },
               { id: "ar_camo", name: "Camouflage", style: "camo", hill: "bunker" }],
  demon:      [{ id: "dm_b", name: "Basic", style: null, hill: "mound" },
               { id: "dm_dev", name: "Infernal", style: "devil", hill: "horn" }],
  weaver:     [{ id: "we_b", name: "Basic", style: null, hill: "mound" }],
  carpenter:  [{ id: "ca_b", name: "Basic", style: null, hill: "mound" }],
  bullet:     [{ id: "bu_b", name: "Basic", style: null, hill: "mound" }],
};

export function looksFor(species: SpeciesId): readonly Look[] {
  return RACE_SKINS[species];
}

export function basicLook(species: SpeciesId): Look {
  const list = looksFor(species);
  return list[0] as Look;
}

const TAU = 6.283;

/** Three rounded body segments, six legs and two eyes, with an optional skin overlay. */
export function antGlyph(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, s: number,
  colour: string, style: SkinStyle = null, seed = 0,
): void {
  if (!(s > 0)) return;                        // never hand a negative radius to ellipse()
  const body = style === "lava" ? "#6d1608" : colour;   // molten shell reads dark, cracks glow

  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.30, s * 0.34, s * 0.42, 0, 0, TAU); ctx.fill();  // abdomen
  ctx.beginPath(); ctx.ellipse(x, y - 0.02 * s, s * 0.24, s * 0.26, 0, 0, TAU); ctx.fill();  // thorax
  ctx.beginPath(); ctx.ellipse(x, y - s * 0.34, s * 0.26, s * 0.24, 0, 0, TAU); ctx.fill();  // head

  ctx.strokeStyle = body;
  ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.lineCap = "round";
  for (const dy of [-0.04, 0.10, 0.24]) {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.18, y + dy * s); ctx.lineTo(x - s * 0.42, y + (dy - 0.06) * s);
    ctx.moveTo(x + s * 0.18, y + dy * s); ctx.lineTo(x + s * 0.42, y + (dy - 0.06) * s);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.beginPath(); ctx.arc(x - s * 0.09, y - s * 0.36, s * 0.05, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + s * 0.09, y - s * 0.36, s * 0.05, 0, TAU); ctx.fill();

  if (style) antSkinOverlay(ctx, x, y, s, style, seed);
}

export function antSkinOverlay(
  g: CanvasRenderingContext2D, x: number, y: number, s: number, style: SkinStyle, seed = 0,
): void {
  if (!style) return;
  g.save();

  if (style === "lava") {                          // bright cracks across the dark shell
    g.strokeStyle = "#ff7a2a"; g.lineWidth = Math.max(1, s * 0.055); g.lineCap = "round";
    g.shadowColor = "#ff5a10"; g.shadowBlur = s * 0.5;
    g.beginPath();
    g.moveTo(x - s * 0.18, y + s * 0.12); g.lineTo(x - s * 0.04, y + s * 0.30); g.lineTo(x - s * 0.14, y + s * 0.50);
    g.moveTo(x + s * 0.16, y + s * 0.16); g.lineTo(x + s * 0.04, y + s * 0.34);
    g.moveTo(x - s * 0.10, y - s * 0.02); g.lineTo(x + s * 0.08, y - s * 0.06);
    g.stroke();
    g.shadowBlur = 0; g.fillStyle = "#ffcf5a";
    g.beginPath(); g.arc(x - s * 0.04, y + s * 0.30, s * 0.05, 0, TAU); g.fill();

  } else if (style === "leaves") {                 // ~1 in 3 carries a cut leaf overhead
    if (seed % 3 !== 0) { g.restore(); return; }
    g.translate(x, y - s * 0.72); g.rotate(-0.28);
    const lw = s * 0.52, lh = s * 0.30;
    g.fillStyle = "#4fbf5a";
    g.beginPath(); g.ellipse(0, 0, lw, lh, 0, 0, TAU); g.fill();
    g.strokeStyle = "#2f7c37"; g.lineWidth = Math.max(1, s * 0.045);
    g.beginPath(); g.moveTo(-lw, 0); g.lineTo(lw, 0); g.stroke();

  } else if (style === "ghost") {                  // a sheet with two eye holes
    g.fillStyle = "rgba(238,246,255,0.93)";
    g.beginPath();
    g.moveTo(x - s * 0.46, y + s * 0.42);
    g.lineTo(x - s * 0.46, y - s * 0.22);
    g.quadraticCurveTo(x, y - s * 0.86, x + s * 0.46, y - s * 0.22);
    g.lineTo(x + s * 0.46, y + s * 0.42);
    for (let i = 0; i < 4; i++) {
      const xa = x + s * 0.46 - (i * s * 0.23), xb = xa - s * 0.115, xc = xa - s * 0.23;
      g.quadraticCurveTo(xb, y + s * (i % 2 ? 0.60 : 0.24), xc, y + s * 0.42);
    }
    g.closePath(); g.fill();
    g.fillStyle = "rgba(10,16,26,0.9)";
    g.beginPath(); g.ellipse(x - s * 0.15, y - s * 0.16, s * 0.09, s * 0.12, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(x + s * 0.15, y - s * 0.16, s * 0.09, s * 0.12, 0, 0, TAU); g.fill();

  } else if (style === "glyph") {                  // carved marks on the gaster
    g.strokeStyle = "rgba(20,14,4,0.85)"; g.fillStyle = "rgba(20,14,4,0.85)";
    g.lineWidth = Math.max(1, s * 0.05); g.lineCap = "round";
    g.beginPath(); g.arc(x - s * 0.12, y + s * 0.22, s * 0.07, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(x - s * 0.20, y + s * 0.22); g.lineTo(x - s * 0.04, y + s * 0.22); g.stroke();
    g.fillRect(x + s * 0.04, y + s * 0.14, s * 0.05, s * 0.22);
    g.beginPath(); g.moveTo(x + s * 0.02, y + s * 0.42); g.lineTo(x + s * 0.16, y + s * 0.42); g.stroke();
    g.beginPath(); g.moveTo(x - s * 0.16, y + s * 0.44); g.lineTo(x - s * 0.06, y + s * 0.36); g.stroke();

  } else if (style === "camo") {                   // disruptive olive/khaki patches
    const P = ["rgba(72,88,46,0.92)", "rgba(122,132,74,0.9)", "rgba(46,56,34,0.92)"];
    const blobs: ReadonlyArray<readonly [number, number, number]> = [
      [-0.14, 0.16, 0.15], [0.13, 0.30, 0.13], [-0.05, 0.44, 0.11], [0.10, 0.06, 0.10], [-0.14, -0.34, 0.09],
    ];
    blobs.forEach((b, i) => {
      g.fillStyle = P[i % 3] as string;
      g.beginPath(); g.ellipse(x + s * b[0], y + s * b[1], s * b[2], s * b[2] * 0.78, i * 0.9, 0, TAU); g.fill();
    });

  } else if (style === "devil") {                  // horns + a hard brow
    g.fillStyle = "#c8332a";
    for (const d of [-1, 1]) {
      g.beginPath();
      g.moveTo(x + d * s * 0.16, y - s * 0.46);
      g.quadraticCurveTo(x + d * s * 0.36, y - s * 0.72, x + d * s * 0.22, y - s * 0.84);
      g.quadraticCurveTo(x + d * s * 0.26, y - s * 0.62, x + d * s * 0.08, y - s * 0.50);
      g.closePath(); g.fill();
    }
    g.strokeStyle = "#8e1d16"; g.lineWidth = Math.max(1, s * 0.06); g.lineCap = "round";
    g.beginPath();
    g.moveTo(x - s * 0.17, y - s * 0.42); g.lineTo(x - s * 0.04, y - s * 0.36);
    g.moveTo(x + s * 0.17, y - s * 0.42); g.lineTo(x + s * 0.04, y - s * 0.36);
    g.stroke();
    g.fillStyle = "#ff4a3a";
    g.beginPath(); g.arc(x - s * 0.09, y - s * 0.34, s * 0.045, 0, TAU); g.fill();
    g.beginPath(); g.arc(x + s * 0.09, y - s * 0.34, s * 0.045, 0, TAU); g.fill();
  }

  g.restore();
}

/** The nest illustration. Only a colony's base carries one. */
export function nestArt(
  g: CanvasRenderingContext2D, x: number, y: number, s: number, hill: HillStyle, colour: string,
): void {
  g.save();

  if (hill === "tree") {
    g.fillStyle = "#6b4a2a"; g.fillRect(x - s * 0.09, y - s * 0.05, s * 0.18, s * 0.55);
    g.fillStyle = "#3f9e4d";
    g.beginPath(); g.arc(x, y - s * 0.28, s * 0.42, 0, TAU); g.fill();
    g.beginPath(); g.arc(x - s * 0.32, y - s * 0.06, s * 0.28, 0, TAU); g.fill();
    g.beginPath(); g.arc(x + s * 0.32, y - s * 0.06, s * 0.28, 0, TAU); g.fill();

  } else if (hill === "volcano") {
    g.fillStyle = "#4a2016";
    g.beginPath();
    g.moveTo(x - s * 0.62, y + s * 0.48); g.lineTo(x - s * 0.20, y - s * 0.42);
    g.lineTo(x + s * 0.20, y - s * 0.42); g.lineTo(x + s * 0.62, y + s * 0.48);
    g.closePath(); g.fill();
    g.fillStyle = "#ff6a20"; g.shadowColor = "#ff5a10"; g.shadowBlur = s * 0.8;
    g.beginPath(); g.ellipse(x, y - s * 0.42, s * 0.20, s * 0.09, 0, 0, TAU); g.fill();
    g.fillStyle = "#ffb03a";
    g.beginPath();
    g.moveTo(x - s * 0.10, y - s * 0.40); g.lineTo(x - s * 0.02, y + s * 0.12); g.lineTo(x + s * 0.08, y - s * 0.38);
    g.closePath(); g.fill();

  } else if (hill === "pyramid") {
    g.fillStyle = "#d9b163";
    g.beginPath(); g.moveTo(x, y - s * 0.52); g.lineTo(x + s * 0.62, y + s * 0.46); g.lineTo(x - s * 0.62, y + s * 0.46); g.closePath(); g.fill();
    g.fillStyle = "rgba(120,86,32,0.55)";
    g.beginPath(); g.moveTo(x, y - s * 0.52); g.lineTo(x + s * 0.62, y + s * 0.46); g.lineTo(x, y + s * 0.46); g.closePath(); g.fill();
    g.strokeStyle = "rgba(90,64,22,0.5)"; g.lineWidth = Math.max(1, s * 0.05);
    for (let i = 1; i < 3; i++) {
      const f = i / 3, yy = y - s * 0.52 + f * s * 0.98, hw = f * s * 0.62;
      g.beginPath(); g.moveTo(x - hw, yy); g.lineTo(x + hw, yy); g.stroke();
    }

  } else if (hill === "bunker") {
    g.fillStyle = "#5d6350";
    g.beginPath();
    g.moveTo(x - s * 0.58, y + s * 0.46); g.lineTo(x - s * 0.44, y - s * 0.26);
    g.lineTo(x + s * 0.44, y - s * 0.26); g.lineTo(x + s * 0.58, y + s * 0.46);
    g.closePath(); g.fill();
    g.fillStyle = "#767c66";
    g.beginPath(); g.ellipse(x, y - s * 0.26, s * 0.46, s * 0.20, 0, Math.PI, 0); g.fill();
    g.fillStyle = "#141a14"; g.fillRect(x - s * 0.26, y + s * 0.02, s * 0.52, s * 0.13);
    g.fillStyle = "rgba(255,255,255,.13)"; g.fillRect(x - s * 0.44, y + s * 0.30, s * 0.88, s * 0.05);

  } else if (hill === "horn") {
    g.fillStyle = "#7e1a16"; g.strokeStyle = "#3d0b09"; g.lineWidth = Math.max(1, s * 0.05);
    for (const d of [-1, 1]) {
      g.beginPath();
      g.moveTo(x + d * s * 0.14, y + s * 0.46);
      g.quadraticCurveTo(x + d * s * 0.74, y + s * 0.06, x + d * s * 0.40, y - s * 0.56);
      g.quadraticCurveTo(x + d * s * 0.52, y + s * 0.04, x + d * s * 0.02, y + s * 0.46);
      g.closePath(); g.fill(); g.stroke();
    }

  } else {                                          // classic soil mound with a tunnel mouth
    g.fillStyle = "#8a6438";
    g.beginPath();
    g.moveTo(x - s * 0.66, y + s * 0.44);
    g.quadraticCurveTo(x - s * 0.30, y - s * 0.50, x, y - s * 0.52);
    g.quadraticCurveTo(x + s * 0.30, y - s * 0.50, x + s * 0.66, y + s * 0.44);
    g.closePath(); g.fill();
    g.fillStyle = "rgba(60,40,18,0.55)";
    g.beginPath();
    g.moveTo(x, y - s * 0.52);
    g.quadraticCurveTo(x + s * 0.30, y - s * 0.50, x + s * 0.66, y + s * 0.44);
    g.lineTo(x, y + s * 0.44); g.closePath(); g.fill();
    g.fillStyle = "#241608";
    g.beginPath(); g.ellipse(x, y + s * 0.20, s * 0.20, s * 0.13, 0, 0, TAU); g.fill();
    g.fillStyle = colour || "#d0a86a";
    g.beginPath(); g.ellipse(x, y + s * 0.16, s * 0.11, s * 0.07, 0, 0, TAU); g.fill();
  }

  g.restore();
}
