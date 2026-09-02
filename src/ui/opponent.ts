/**
 * WHERE THE ENEMY'S TURN COMES FROM.
 *
 * The match screen used to ask the local AI directly, which is the one thing standing
 * between this game and playing another person: there was no seam at all for a turn that
 * arrives from somewhere else. This is that seam.
 *
 * Both implementations answer the same question — "here is the board, what does the enemy
 * do?" — and both answer it the same way, with the BOARD THEY LEFT BEHIND plus the events
 * that got it there. That shape is the AI's already (`Thought`), and reusing it is what
 * lets a remote turn land through exactly the same code that lands a searched one: adopt
 * the board, consume the events, animate. No second landing path to keep in step.
 *
 * The TIMING is deliberately not here. How long the enemy appears to think, and how long
 * the reveal is given before the turn hands back, are drama and belong to the screen.
 */
import { applyMove, restore, snapshot } from "../engine";
import type { ActionContext, GameState, Move, Player, PlayerMods } from "../engine";
import type { Difficulty } from "../ai/search";
import { Thinker } from "../ai/thinker";
import type { Thought } from "../ai/thinker";

export interface OpponentSource {
  /**
   * Play the enemy's turn on a COPY, and hand back what happened.
   *
   * Resolves with `null` when there is no answer to give — the match was abandoned, or a
   * remote player disconnected. The screen drops a null rather than acting on it, the same
   * way it already drops an answer that arrives after the match ended.
   */
  takeTurn(state: GameState, signal: AbortSignal): Promise<Thought | null>;
  dispose(): void;
}

/** The opponent this game ships with: the local search. */
export class AiOpponent implements OpponentSource {
  private thinker = new Thinker();

  constructor(
    private me: Player,
    private difficulty: Difficulty,
    private ctx: ActionContext,
  ) {}

  async takeTurn(state: GameState, signal: AbortSignal): Promise<Thought | null> {
    const thought = await this.thinker.think(state, this.me, this.difficulty, this.ctx);
    return signal.aborted ? null : thought;
  }

  dispose(): void { this.thinker.dispose(); }
}

/**
 * A move arriving from somewhere else — the shape a real opponent will have.
 *
 * `next` is a transport: it resolves with the moves the other player made, in order, and
 * rejects or resolves empty if they never arrive. Everything about HOW those moves travel
 * — polling, a socket, a push — belongs in `platform/`, which is why this takes a function
 * rather than a client.
 *
 * The moves are applied through `applyMove` rather than the action functions directly, so
 * a turn that arrives from a stranger's phone is checked exactly as a server would check
 * it. A move this end refuses stops the turn: replaying the rest onto a board that has
 * diverged would put the two players on different boards, which is worse than a stall.
 */
export class RemoteOpponent implements OpponentSource {
  constructor(
    private me: Player,
    private next: (signal: AbortSignal) => Promise<readonly Move[]>,
    private mods: Record<Player, PlayerMods>,
    private ctx: ActionContext,
  ) {}

  async takeTurn(state: GameState, signal: AbortSignal): Promise<Thought | null> {
    const moves = await this.next(signal).catch(() => null);
    if (!moves || signal.aborted) return null;

    // On a copy, so a refused move leaves the live board exactly as it was.
    const board = structuredClone(state);
    const events: Thought["events"] = [];
    const played: Move[] = [];
    for (const move of moves) {
      const result = applyMove(board, this.me, move, this.mods, this.ctx);
      if (!result.ok) break;
      events.push(...result.events);
      // Only the moves that were ACCEPTED go into the record, so a replay of it cannot
      // contain a move the board refused.
      played.push(move);
    }
    return { events, next: board, moves: played };
  }

  dispose(): void { /* the transport owns its own lifetime */ }
}

/** Copy a board onto another, keeping the caller's object identity. Re-exported for tests. */
export const adoptBoard = (live: GameState, next: GameState): void => {
  if (live !== next) restore(live, snapshot(next));
};
