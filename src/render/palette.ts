/**
 * Colours for the board.
 *
 * The palette lives in CSS custom properties (see index.html) and is read into `COL`
 * here, exactly as the legacy build did. Keeping CSS as the source of truth is what lets
 * a species swap recolour the whole UI — HUD chips, buttons and canvas — in one write.
 */
import type { Player, SpeciesId } from "../engine";

/** [ base, vivid (buttons/highlights/glow), dark ] */
export const SPECIES_COL: Record<SpeciesId, readonly [string, string, string]> = {
  ghost:      ["#c5d0e6", "#eaf2ff", "#6f7c95"],
  pharaoh:    ["#e7a93a", "#ffc62f", "#9c6f17"],
  leafcutter: ["#4fae46", "#56d840", "#266a22"],
  fire:       ["#ff7a45", "#ff8f43", "#b8431d"],
  army:       ["#7d5733", "#cf9354", "#482d13"],
  weaver:     ["#ef8a2b", "#ffa636", "#8f4d0f"],
  carpenter:  ["#5a6173", "#a3adc4", "#2c313d"],
  bullet:     ["#9a2740", "#ec4763", "#56101f"],
  demon:      ["#c220a0", "#ff54d4", "#730f5c"],
};

/**
 * The board's palette.
 *
 * The playfield is a DIORAMA: a rounded tray with a pale rim, sitting on the same deep
 * plum the rest of the app uses. That surround is what makes the warm ground and the
 * colony colours read — on a mid-green field they all fight each other.
 *
 * The ground is a warm earth in two shades. Warm and mid-toned rather than dark, because
 * a near-black field made the whole board read as a hole; two shades, because the
 * checkerboard gives the eye a grid without a single drawn line. The upper bound is set
 * by the colony colours — the ground has to stay darker than every species base so the
 * owned tiles keep reading as raised blocks on top of it.
 */
export const MAP = {
  /** Behind the tray — matches the page so the canvas has no visible seam. */
  surround: "#1b1024",
  /** The tray: a pale rim with a solid darker band beneath it, never a blurred shadow. */
  trayRim: "#f3e3c8",
  trayEdge: "#b9a184",
  trayShade: "rgba(12,6,18,0.45)",

  /** The two checker shades, and the shadow objects cast onto them. */
  groundA: "#7d5f42",
  groundB: "#6e5239",
  groundShade: "rgba(38,20,10,0.30)",

  motes: "rgba(255,240,206,0.20)",

  rock: "#6d5b74",
  rockTop: "#8a7591",
  rockEdge: "#43354b",

  resCell: "rgba(255,197,61,0.10)",
  resEdge: "rgba(255,197,61,0.5)",
  gem: "#ffc53d",
  gemTop: "#ffe08a",
  gemEdge: "#c8901a",

  water: "#56d9c0",
  waterEdge: "#2c9c88",
} as const;

const VAR_NAMES = [
  "you", "you-glow", "you-dark",
  "ai", "ai-glow", "ai-dark",
  "gold", "gold-glow",
  "hive", "hive-glow", "hive-dim",
  "ink", "muted", "line", "bg1", "bg2",
] as const;

export type ColourName = (typeof VAR_NAMES)[number];

export const COL: Record<string, string> = {};

const readVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function loadColors(): void {
  for (const n of VAR_NAMES) COL[n] = readVar("--" + n);
}

/** Repaint one faction in its species colours. Rewrites the CSS vars, then reloads `COL`. */
export function setFactionColor(faction: Player, species: SpeciesId): void {
  const pal = SPECIES_COL[species] ?? SPECIES_COL.fire;
  const s = document.documentElement.style;
  s.setProperty("--" + faction, pal[0]);
  s.setProperty("--" + faction + "-glow", pal[1]);
  s.setProperty("--" + faction + "-dark", pal[2]);
  loadColors();
}

/** `which` picks the variant: undefined = base, "glow" = vivid, "dark" = shadow. */
export function ownerCol(owner: Player | null, which?: "glow" | "dark"): string {
  if (owner === "you") return COL[which ? "you-" + which : "you"] ?? "#ff7a45";
  if (owner === "ai") return COL[which ? "ai-" + which : "ai"] ?? "#27d3bd";
  return COL.line ?? "#26344c";
}

/** Add an alpha channel to a hex colour. Passes rgb()/rgba() strings through untouched. */
export function hexA(colour: string, a: number): string {
  const raw = colour.trim();
  if (!raw.startsWith("#")) return raw;
  let hex = raw.slice(1);
  if (hex.length === 3) hex = hex.split("").map((x) => x + x).join("");
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
