/**
 * The AI, off the main thread.
 *
 * Hard searches for around a third of a second and it does it synchronously, so on the main
 * thread every one of its turns froze the whole page for that long — and once the board
 * carried a constant animation (the marching ants) that freeze became the most visible
 * thing in the game, landing right as the player's move finished filling in.
 *
 * Nothing about the search had to change to move it here. The engine is pure and seeded
 * (CLAUDE.md §3/§4.1), so a copy of the state searched in a worker reaches exactly the same
 * answer as the original would have, and the mutated copy comes back to be adopted whole.
 */
/// <reference lib="webworker" />
import { aiTurn } from "./search";
import type { Difficulty } from "./search";
import type { ActionContext, EngineEvent, GameState, Player } from "../engine";

export interface ThinkRequest {
  id: number;
  state: GameState;
  me: Player;
  difficulty: Difficulty;
  ctx: ActionContext;
}

export interface ThinkReply {
  id: number;
  state: GameState;
  events: EngineEvent[];
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener("message", (e: MessageEvent<ThinkRequest>) => {
  const { id, state, me, difficulty, ctx } = e.data;
  const events = aiTurn(state, me, difficulty, ctx);
  scope.postMessage({ id, state, events } satisfies ThinkReply);
});
