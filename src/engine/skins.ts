/**
 * SKINS — what a colony LOOKS like.
 *
 * Every colony has three looks: the one it is born with and two that are found. A look
 * changes nothing about the game — no stat, no rule, no number that reaches `fight()` —
 * and that is the whole point of it. It is the one thing a player can collect that costs
 * an opponent nothing.
 *
 * WHY THE CATALOGUE IS IN THE ENGINE, when the drawing is in `render/` and the ownership
 * is in `platform/`. Those two layers may not import each other (eslint.config.js), and
 * both need this table: the renderer to draw a look, and the profile to refuse a save
 * claiming a skin that does not exist. A shared table has to sit under both, and under
 * both is the engine. It is the same kind of thing `SPECIES` already is — a name, a line
 * of copy and some tags the engine itself never reads — and it belongs here for a second
 * reason too: a match record carries the setup, and a replay of somebody else's match
 * should be able to show the colony they actually fielded.
 *
 * A LOOK IS THREE TAGS, and every one of them is drawn rather than loaded:
 *
 *   style   an overlay on the ant itself — molten cracks, a sheet, carved glyphs
 *   hill    the shape of the nest on the board
 *   pal     an optional recolour of the whole colony
 *
 * `pal` is the one that carries furthest. An overlay is a few pixels on a portrait; a
 * palette is every tile the colony holds, on a board the player stares at for ten
 * minutes. So the second skin of every colony is a colourway, and the first is the drawn
 * one — between them a player can tell two colonies of the same species apart at a
 * glance, which is what a skin is for.
 *
 * The palette lives ON the look rather than in a table beside it, because a look's name
 * and a look's colour are one decision and two tables are two chances to disagree.
 *
 * NO SKIN MAY LOOK LIKE ANOTHER COLONY. An opponent always fields its basic look, so a
 * palette that lands on some other species' own colours is not a skin — it is a colony
 * you cannot identify across the board. Two of these were exactly that on the first pass:
 * a pink Leafcutter read as a Demon Ant and a gold Weaver read as a Pharaoh. A third was
 * only caught by the test that was written for the first two: a cream Leafcutter sat on
 * the Ghost Ant's near-white. `skins.test.ts` holds the whole set apart now, which is the
 * only way this stays true through a retune of any species' own colours.
 */
import type { SpeciesId } from "./types";

/** The overlay drawn on top of the ant's body. `null` is the bare species. */
export type SkinStyle =
  | "lava" | "leaves" | "ghost" | "glyph" | "camo" | "devil"
  | "silk" | "bark" | "banded"
  | null;

/** Which structure a colony's nest is drawn as. */
export type HillStyle = "mound" | "tree" | "volcano" | "pyramid" | "bunker" | "horn";

export interface Look {
  id: string;
  name: string;
  /** The colony it belongs to. A look never fits a bench it was not made for. */
  species: SpeciesId;
  style: SkinStyle;
  hill: HillStyle;
  /**
   * `[line, body, dark]`, recolouring the whole colony — its tiles, its nest and its
   * portrait. Absent means the species' own colours, which is what a basic look is.
   */
  pal?: readonly [string, string, string];
}

/**
 * Three looks per colony, and index 0 is always the basic one.
 *
 * The AI always fields index 0. That is not a rule about fairness — a skin cannot affect
 * a fight — it is so an opponent reads as the species it is, and so the one colony on
 * screen wearing something found is the player's.
 *
 * Each colony's second look is DRAWN (an overlay and usually its own nest) and its third
 * is a COLOURWAY. Both are unlockable; neither is better than the other, and a player who
 * finds only one still has something nobody else on their screen is wearing.
 */
export const LOOKS: Record<SpeciesId, readonly Look[]> = {
  leafcutter: [
    { id: "lc_b", name: "Basic", species: "leafcutter", style: null, hill: "mound" },
    { id: "lc_leaf", name: "Leaf Bearers", species: "leafcutter", style: "leaves", hill: "tree" },
    { id: "lc_night", name: "Nightshade", species: "leafcutter", style: null, hill: "tree",
      pal: ["#5b4bc4", "#8a7ae8", "#2a2170"] },
  ],
  fire: [
    { id: "fi_b", name: "Basic", species: "fire", style: null, hill: "mound" },
    { id: "fi_lava", name: "Molten", species: "fire", style: "lava", hill: "volcano" },
    // Ice, on the Fire Ant, on purpose. The warm half of the wheel is already four
    // colonies deep — and a GREY colony is worse than a crowded one: the board greys out
    // tiles it has cut off, so a grey colony reads as permanently disconnected.
    { id: "fi_frost", name: "Frostbite", species: "fire", style: null, hill: "volcano",
      pal: ["#1f9fc4", "#3fd0f0", "#0d5570"] },
  ],
  ghost: [
    { id: "gh_b", name: "Basic", species: "ghost", style: null, hill: "mound" },
    { id: "gh_sheet", name: "Haunting", species: "ghost", style: "ghost", hill: "mound" },
    { id: "gh_glass", name: "Glasswing", species: "ghost", style: null, hill: "mound",
      pal: ["#6fd3cb", "#c2fbf4", "#357670"] },
  ],
  pharaoh: [
    { id: "ph_b", name: "Basic", species: "pharaoh", style: null, hill: "mound" },
    { id: "ph_glyph", name: "Hieroglyph", species: "pharaoh", style: "glyph", hill: "pyramid" },
    { id: "ph_lapis", name: "Lapis", species: "pharaoh", style: null, hill: "pyramid",
      pal: ["#4a6ed6", "#7fa6ff", "#20306e"] },
  ],
  army: [
    { id: "ar_b", name: "Basic", species: "army", style: null, hill: "mound" },
    { id: "ar_camo", name: "Camouflage", species: "army", style: "camo", hill: "bunker" },
    { id: "ar_night", name: "Night Raid", species: "army", style: null, hill: "bunker",
      pal: ["#3a3f8f", "#5b62e0", "#171a44"] },
  ],
  weaver: [
    { id: "we_b", name: "Basic", species: "weaver", style: null, hill: "mound" },
    { id: "we_silk", name: "Silk Weavers", species: "weaver", style: "silk", hill: "tree" },
    { id: "we_verdigris", name: "Verdigris", species: "weaver", style: null, hill: "tree",
      pal: ["#2f9a92", "#57d6cb", "#14524d"] },
  ],
  carpenter: [
    { id: "ca_b", name: "Basic", species: "carpenter", style: null, hill: "mound" },
    { id: "ca_bark", name: "Heartwood", species: "carpenter", style: "bark", hill: "tree" },
    { id: "ca_iron", name: "Ironclad", species: "carpenter", style: null, hill: "bunker",
      pal: ["#5d80a0", "#9fc9e4", "#283c4c"] },
  ],
  bullet: [
    { id: "bu_b", name: "Basic", species: "bullet", style: null, hill: "mound" },
    { id: "bu_band", name: "Warning", species: "bullet", style: "banded", hill: "mound" },
    { id: "bu_jade", name: "Jade Sting", species: "bullet", style: null, hill: "horn",
      pal: ["#25977a", "#45dcac", "#0f4a3b"] },
  ],
  demon: [
    { id: "dm_b", name: "Basic", species: "demon", style: null, hill: "mound" },
    { id: "dm_dev", name: "Infernal", species: "demon", style: "devil", hill: "horn" },
    { id: "dm_void", name: "Void", species: "demon", style: null, hill: "horn",
      pal: ["#6b34a4", "#a96cf0", "#2e1152"] },
  ],
};

/** Every look a colony has, basic first. */
export const looksFor = (species: SpeciesId): readonly Look[] => LOOKS[species];

/** What a colony wears before it has found anything. Never null: index 0 always exists. */
export const basicLook = (species: SpeciesId): Look => LOOKS[species][0] as Look;

/** Everything a player can find — the basic looks are not among them. */
export const UNLOCKABLE_LOOKS: readonly Look[] =
  Object.values(LOOKS).flatMap((list) => list.slice(1));

/**
 * A look by id, or null.
 *
 * Null is the answer a save gets when it names a skin this build no longer has, which is
 * the reason this returns rather than throws: a profile outlives the code that wrote it.
 */
export function lookById(id: string): Look | null {
  for (const list of Object.values(LOOKS)) {
    for (const look of list) if (look.id === id) return look;
  }
  return null;
}
