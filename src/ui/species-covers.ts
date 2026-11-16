/** Cover scenes and page colours used only by individual species screens.
 * Shared preview/setup artwork remains in covers.ts and covers-cut/.
 */
import type { SpeciesId } from "../engine";

export const SPECIES_SCREEN_BACKGROUNDS: Readonly<Record<SpeciesId, string>> = {
  carpenter: "#50271B",
  leafcutter: "#844523",
  fire: "#5E372F",
  pharaoh: "#A66016",
  ghost: "#533846",
  bullet: "#693B28",
  army: "#683A27",
  demon: "#4E1720",
};

const SCENES = import.meta.glob<string>("./species-covers/*.webp", {
  eager: true, query: "?url", import: "default",
});

export const speciesCoverFor = (id: SpeciesId): string | null =>
  SCENES[`./species-covers/${id}.webp`] ?? null;
