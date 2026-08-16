/**
 * App entry point.
 *
 * Boots straight into a match for now — the meta screens (home, setup, shop) are the next
 * slice of the port, and will own species/map/formation selection before this point.
 */
import { createGame, defaultContext, NEUTRAL_MODS } from "./engine";
import type { MapId, Player, PlayerMods, SpeciesId } from "./engine";
import { MatchScreen } from "./ui/match";
import "./ui/theme.css";

const MAP: MapId = "small";
const SPECIES: Record<Player, SpeciesId> = { you: "fire", ai: "leafcutter" };

const mods: Record<Player, PlayerMods> = {
  you: { ...NEUTRAL_MODS },
  ai: { ...NEUTRAL_MODS },   // the AI never gets upgrades (CLAUDE.md §4.8)
};

const host = document.getElementById("app");
if (!host) throw new Error("#app host element is missing");
host.replaceChildren();

const state = createGame({ map: MAP, species: SPECIES });

const match = new MatchScreen(host, {
  state,
  mods,
  ctx: defaultContext(),
  difficulty: "normal",
  map: MAP,
});
match.start();
