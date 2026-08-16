/**
 * App entry point.
 *
 * The renderer and meta UI are not built yet — this boots the engine and prints a
 * self-check so `npm run dev` proves the port works end to end.
 */
import {
  createGame, endTurn, incomeOf, ownedCount, armyOf, NEUTRAL_MODS, defaultContext,
} from "./engine";
import { aiTurn } from "./ai/search";
import type { Player, PlayerMods } from "./engine";

const mods: Record<Player, PlayerMods> = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };
const ctx = defaultContext();

const state = createGame({ map: "small", species: { you: "leafcutter", ai: "fire" } });

// Play a short AI-vs-AI demo to prove the engine + search are wired up.
let guard = 0;
while (!state.over && guard++ < 60) {
  state.current = "ai"; aiTurn(state, "ai", "normal", ctx);
  if (state.over) break;
  state.current = "you"; aiTurn(state, "you", "easy", ctx);
  if (state.over) break;
  endTurn(state, mods);
}

const el = document.querySelector<HTMLDivElement>(".boot");
if (el) {
  el.innerHTML = `
    <strong>Zombie Ants — engine online</strong><br>
    <small>
      turn ${state.turn} · ${state.over ? `winner: ${state.winner}` : "in progress"}<br>
      you: ${ownedCount(state, "you")} tiles, ${armyOf(state, "you")} army, +${incomeOf(state, "you", mods.you)}<br>
      ai: ${ownedCount(state, "ai")} tiles, ${armyOf(state, "ai")} army, +${incomeOf(state, "ai", mods.ai)}<br>
      <em>renderer &amp; UI next</em>
    </small>`;
}
