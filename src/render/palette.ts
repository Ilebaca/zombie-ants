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
 * The playfield is a DIORAMA: a rounded tray with a pale rim, sitting on the same warm
 * cream the rest of the app uses. Daylight, not a dungeon — the surround matches the page
 * so the board reads as a sunlit patch of ground someone set down on the table.
 *
 * The ground is a warm sand in two shades: two, because the checkerboard gives the eye a
 * grid without a single drawn line. Its value is set by what has to sit ON it — every
 * species colour and every neutral object — so it stays mid-toned. Darker and the whole
 * board reads as a hole punched in a bright page; lighter and the pale colonies (Ghost,
 * Carpenter) stop reading as colonies at all, which is the harder failure of the two.
 */
export const MAP = {
  /** Behind the tray — matches the page so the canvas has no visible seam. */
  surround: "#f8e8ce",
  /** The tray: a pale rim with a solid darker band beneath it, never a blurred shadow. */
  trayRim: "#fffaf0",
  trayEdge: "#dcbe93",
  trayShade: "rgba(150,110,60,0.22)",

  /** The two checker shades, and the shadow objects cast onto them. */
  groundA: "#e0b98a",
  groundB: "#d3a974",
  groundShade: "rgba(140,95,45,0.24)",

  motes: "rgba(255,255,255,0.40)",

  /** Stone: a cool grey-brown, the one desaturated thing on the board. */
  rock: "#9c8a78",
  rockTop: "#b8a795",
  rockEdge: "#6f5e4d",

  /**
   * Resources are a turquoise crystal, not a gold one. Gold on sand is barely a step in
   * value, and it collided with the gold the interface uses for "spend"; turquoise is the
   * one hue that stays clear of both colony colours AND the ground.
   */
  resCell: "rgba(34,193,214,0.12)",
  resEdge: "rgba(13,142,163,0.55)",
  gem: "#22c1d6",
  gemTop: "#7fe6f2",
  gemEdge: "#0d8ea3",

  water: "#35a7e8",
  waterEdge: "#1b7cb5",
} as const;

const VAR_NAMES = [
  "you", "you-glow", "you-dark",
  "ai", "ai-glow", "ai-dark",
  "gold", "gold-glow",
  "hive", "hive-glow", "hive-soft", "hive-dim",
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
