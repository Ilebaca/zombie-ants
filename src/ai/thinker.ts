/**
 * Ask the AI for its turn without stopping the world.
 *
 * The search runs in a worker when the platform has one, and inline when it does not — a
 * jsdom test, or a webview with workers disabled. Either way the caller awaits a result and
 * decides whether to adopt it, so a match that ended while the AI was thinking can drop the
 * answer instead of resurrecting itself with it.
 */
import { restore, snapshot } from "../engine";
import type { ActionContext, EngineEvent, GameState, Player } from "../engine";
import { aiTurn } from "./search";
import type { Difficulty } from "./search";
import type { ThinkReply, ThinkRequest } from "./worker";

export interface Thought {
  events: EngineEvent[];
  /**
   * The board the AI left behind. The same object the caller passed in when the search ran
   * inline; a copy when it ran in a worker — `adopt` folds one into the other.
   */
  next: GameState;
}

/** Copy a searched board back onto the live one, keeping the caller's object identity. */
export function adopt(live: GameState, next: GameState): void {
  if (live === next) return;
  restore(live, snapshot(next));
}

export class Thinker {
  private worker: Worker | null = null;
  /** In-flight asks, each holding what it needs to answer inline if the worker dies. */
  private pending = new Map<number, { land: (t: Thought) => void; inline: () => Thought }>();
  private nextId = 1;

  constructor() {
    if (typeof Worker === "undefined") return;
    try {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      this.worker.addEventListener("message", (e: MessageEvent<ThinkReply>) => {
        const ask = this.pending.get(e.data.id);
        if (!ask) return;
        this.pending.delete(e.data.id);
        ask.land({ events: e.data.events, next: e.data.state });
      });
      // A worker that will not start is not worth reporting to the player: fall back to
      // thinking inline, which is exactly how the game ran before. Whatever it was already
      // holding has to be answered too, or the AI simply never takes its turn.
      this.worker.addEventListener("error", () => this.giveUpOnWorker());
    } catch {
      this.worker = null;
    }
  }

  think(state: GameState, me: Player, difficulty: Difficulty, ctx: ActionContext): Promise<Thought> {
    const worker = this.worker;
    if (!worker) return Promise.resolve({ events: aiTurn(state, me, difficulty, ctx), next: state });

    const id = this.nextId++;
    const inline = (): Thought => ({ events: aiTurn(state, me, difficulty, ctx), next: state });
    return new Promise<Thought>((resolve) => {
      this.pending.set(id, { land: resolve, inline });
      try {
        // A structured clone of the board: plain data plus the connectivity Sets, all of
        // which clone. The reply carries the whole board back rather than an action to
        // replay, so the two sides can never drift.
        worker.postMessage({ id, state, me, difficulty, ctx } satisfies ThinkRequest);
      } catch {
        this.pending.delete(id);
        this.giveUpOnWorker();
        resolve(inline());
      }
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }

  private giveUpOnWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    const stranded = [...this.pending.values()];
    this.pending.clear();
    for (const ask of stranded) ask.land(ask.inline());
  }
}
