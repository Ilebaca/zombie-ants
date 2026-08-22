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
 * The playfield is a DIORAMA: a rounded tray with a mossy rim, sitting on the same deep
 * forest the rest of the app uses. The surround matches the page, so the board reads as a
 * patch of bare soil cleared in the undergrowth rather than a window onto somewhere else.
 *
 * The ground is dark earth in two shades: two, because the checkerboard gives the eye a
 * grid without a single drawn line. Dark, so that the colonies are the brightest thing on
 * the board — every species colour has to sit on this and be the first thing seen.
 */
export const MAP = {
  /** Behind the tray — matches the page so the canvas has no visible seam. */
  surround: "#142318",
  /** The tray: a pale rim with a solid darker band beneath it, never a blurred shadow. */
  trayRim: "#3d5c44",
  trayEdge: "#0d1810",
  trayShade: "rgba(0,0,0,0.45)",

  /** The two checker shades, and the shadow objects cast onto them. */
  groundA: "#5c4a33",
  groundB: "#51402c",
  groundShade: "rgba(0,0,0,0.34)",
  /** A shade darker than groundB, for the tonal drift in the undergrowth. */
  groundDark: "#3d3122",
  /** The cleared patch the grid sits on — lighter than the ground around it. */
  clearing: "rgba(126,102,68,0.55)",

  /** Scenery: fallen logs and greenery in the margin, none of it interactive. */
  log: "#6b4f33",
  logTop: "#846544",
  logShade: "rgba(0,0,0,0.32)",
  logEnd: "#4d3823",
  leaf: "#4e7a3a",
  leafDark: "#37592a",

  motes: "rgba(190,235,160,0.20)",

  /** Stone: a cool grey-brown, the one desaturated thing on the board. */
  rock: "#5f6357",
  rockTop: "#787d6e",
  rockEdge: "#33362e",

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
