/** Solid backgrounds for each five-chapter area; pass is exactly the left half. */
interface RoadPalette { normal: string; pass: string }

const PALETTES: readonly [RoadPalette, ...RoadPalette[]] = [
  { normal: "#153b2b", pass: "#214d38" },
  { normal: "#453b32", pass: "#584b3f" },
  { normal: "#292830", pass: "#3b363f" },
  { normal: "#123e32", pass: "#1d5141" },
  { normal: "#1b3d45", pass: "#2b5159" },
  { normal: "#343d29", pass: "#495339" },
  { normal: "#24263f", pass: "#353851" },
  { normal: "#213d55", pass: "#30516d" },
  { normal: "#443326", pass: "#594432" },
  { normal: "#35253f", pass: "#4a3457" },
];

export function roadPalette(region: number): RoadPalette {
  return PALETTES[region - 1] ?? PALETTES[0];
}
