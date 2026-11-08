/** Generated chapter-divider artwork and matching palettes, one per five-chapter area. */
import forest from "./road-art/area-01-forest.webp";
import desert from "./road-art/area-02-desert.webp";
import volcano from "./road-art/area-03-volcano.webp";
import rainforest from "./road-art/area-04-rainforest.webp";
import mangrove from "./road-art/area-05-mangrove.webp";
import savanna from "./road-art/area-06-savanna.webp";
import cave from "./road-art/area-07-cave.webp";
import permafrost from "./road-art/area-08-permafrost.webp";
import amber from "./road-art/area-09-amber.webp";
import fungal from "./road-art/area-10-fungal.webp";

interface RoadTheme {
  divider: string;
  /** Base, depth and highlight. */
  colors: readonly [string, string, string];
}

const THEMES: readonly RoadTheme[] = [
  { divider: forest, colors: ["#24593d", "#102d24", "#488751"] },
  { divider: desert, colors: ["#846044", "#352d30", "#bb9657"] },
  { divider: volcano, colors: ["#493337", "#211f2d", "#8b493c"] },
  { divider: rainforest, colors: ["#13634d", "#0b302c", "#2d9c65"] },
  { divider: mangrove, colors: ["#225a5d", "#112f38", "#438477"] },
  { divider: savanna, colors: ["#5e6238", "#2b3528", "#9d9650"] },
  { divider: cave, colors: ["#393557", "#181c31", "#655b91"] },
  { divider: permafrost, colors: ["#285570", "#172d48", "#679dab"] },
  { divider: amber, colors: ["#79502f", "#372a2b", "#b9853c"] },
  { divider: fungal, colors: ["#63366e", "#281e43", "#995195"] },
];

/** Region ids come from platform/road; invalid ids use the first area. */
export function roadTheme(region: number): RoadTheme {
  return THEMES[region - 1] ?? THEMES[0]!;
}
