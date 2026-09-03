/** Public render surface. UI code should import from here, not from the internals. */
export { BoardRenderer } from "./renderer";
export type { RendererOptions } from "./renderer";
export { Layout } from "./layout";
export { animate, sourceOf } from "./animate";
export {
  antGlyph, antSkinOverlay, antHead, antHeadSkin, nestArt, basicLook, looksFor,
} from "./art";
export type { Look, HillStyle, SkinStyle } from "./art";
export { COL, MAP, SPECIES_COL, hexA, loadColors, lookCol, ownerCol, setFactionColor } from "./palette";
export { drawSnapshot } from "./snapshot";
export type { SnapshotOptions } from "./snapshot";
