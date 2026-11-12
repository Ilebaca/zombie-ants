/** Original supplied Anthill artwork, encoded as WebP without changing its design. */
import type { ChamberId } from "../platform";
import cover from "./anthill-art/cover.webp";
import brood from "./anthill-art/brood.webp";
import soldierCaste from "./anthill-art/soldier-caste.webp";
import cultivate from "./anthill-art/cultivation.webp";
import gland from "./anthill-art/gland.webp";
import royal from "./anthill-art/royal.webp";

export const anthillCover = cover;
export const chamberArt: Record<ChamberId, string> = {
  royal, brood, soldierCaste, gland, cultivate,
};
