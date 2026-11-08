/** Road background colors, one palette for each five-chapter area. */
const PALETTES = [
  ["#24593d", "#102d24", "#488751"],
  ["#846044", "#352d30", "#bb9657"],
  ["#493337", "#211f2d", "#8b493c"],
  ["#13634d", "#0b302c", "#2d9c65"],
  ["#225a5d", "#112f38", "#438477"],
  ["#5e6238", "#2b3528", "#9d9650"],
  ["#393557", "#181c31", "#655b91"],
  ["#285570", "#172d48", "#679dab"],
  ["#79502f", "#372a2b", "#b9853c"],
  ["#63366e", "#281e43", "#995195"],
] as const;

/** Base, depth and highlight. Invalid region ids use the first area. */
export function roadPalette(region: number): readonly [string, string, string] {
  return PALETTES[region - 1] ?? PALETTES[0];
}
