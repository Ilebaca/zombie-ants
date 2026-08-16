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
 * Outdoor map palette. The board is the "outside world" — the dark nest theme belongs to
 * the home screen, so these are deliberately not CSS variables.
 */
export const MAP = {
  fieldCenter: "#5f9248",
  fieldEdge: "#365a2a",
  vignette: "rgba(16,30,12,0.55)",
  grid: "rgba(30,56,22,0.28)",
  motes: "rgba(245,255,225,0.20)",
  cell: "rgba(120,160,92,0.22)",
  cellEdge: "rgba(235,250,215,0.10)",
  rock: "rgba(120,112,96,0.95)",
  rockTop: "rgba(156,148,130,0.95)",
  resCell: "rgba(255,214,90,0.14)",
  resEdge: "rgba(255,214,90,0.55)",
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
