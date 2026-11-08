import { afterEach, describe, expect, it } from "vitest";
import {
  CHAMBER_MAX, RESEARCH_MAX, NEUTRAL_MODS, allTiles, applyMove, defaultContext,
  endTurn, opponentModifiers, recomputeConnectivity, snapshot, tile,
} from "../../engine";
import type { GameState, Move, SpeciesId } from "../../engine";
import { blankGame, put } from "../../engine/__tests__/helpers";
import { aiTurn, PROFILES } from "../search";
import { evaluateImpossible, executePlannedTurn, planImpossibleTurn } from "../impossible";

const budget = { depth: 3, branching: 8, nodeBudget: 6000, timeBudgetMs: 60_000 };
const context = defaultContext();
const original = { ...PROFILES.impossible };
afterEach(() => { Object.assign(PROFILES.impossible, original); });

function position(species: SpeciesId = "fire"): GameState {
  const state = blankGame("small", { you: species, ai: "fire" });
  for (const t of allTiles(state)) t.terrain = "blocked";
  state.cooldown = { you: 9, ai: 9 };
  return state;
}
function finish(state: GameState): GameState {
  recomputeConnectivity(state);
  return state;
}

describe("Impossible planning", () => {
  it("takes an immediate nest win without spending a cooldown", () => {
    const state = position("carpenter");
    put(state, 0, 0, { owner: "you", struct: "nest", soldiers: 100, terrain: "ground" });
    put(state, 1, 0, { owner: "ai", struct: "nest", soldiers: 2, terrain: "ground" });
    state.cooldown.you = 0;
    finish(state);
    const decision = planImpossibleTurn(state, "you", context, budget);
    executePlannedTurn(state, "you", decision.plan, context);
    expect(state.winner).toBe("you");
    expect(state.cooldown.you).toBe(0);
  });

  it("reinforces a threatened queen instead of abandoning her", () => {
    const state = position();
    put(state, 0, 0, { owner: "you", struct: "nest", soldiers: 2, terrain: "ground" });
    put(state, 0, 1, { owner: "you", struct: "stable", soldiers: 30, terrain: "ground" });
    put(state, 1, 0, { owner: "ai", struct: "stable", soldiers: 18, terrain: "ground" });
    put(state, 2, 0, { owner: "ai", struct: "nest", soldiers: 8, terrain: "ground" });
    finish(state);
    const decision = planImpossibleTurn(state, "you", context, budget);
    executePlannedTurn(state, "you", decision.plan, context);
    expect(tile(state, 0, 0).soldiers).toBeGreaterThan(2);
    endTurn(state, context.mods);
    applyMove(state, "ai", { do: "move", from: { c: 1, r: 0 }, to: { c: 0, r: 0 } }, context.mods);
    expect(state.winner).not.toBe("ai");
  });

  it("claims a resource over equally reachable plain ground, even late in a match", () => {
    for (const turn of [1, 200]) {
      const state = position();
      put(state, 0, 0, { owner: "you", struct: "nest", soldiers: 12, terrain: "ground" });
      put(state, 0, 1, { terrain: "resource" });
      put(state, 1, 0, { terrain: "ground" });
      put(state, 8, 8, { owner: "ai", struct: "nest", soldiers: 10, terrain: "ground" });
      state.turn = turn;
      finish(state);
      const decision = planImpossibleTurn(state, "you", context, budget);
      executePlannedTurn(state, "you", decision.plan, context);
      expect(tile(state, 0, 1).owner).toBe("you");
    }
  });

  it("never changes the board or its scatter stream while planning", () => {
    const state = blankGame("small", { you: "bullet", ai: "leafcutter" });
    state.cooldown.you = 0;
    const before = snapshot(state);
    const decision = planImpossibleTurn(state, "you", context, { ...budget, nodeBudget: 400 });
    expect(snapshot(state)).toEqual(before);
    expect(decision.nodes).toBeLessThanOrEqual(400);
  });

  it("executes a post-move ability in legal order and reproduces it through the protocol", () => {
    const state = blankGame("small", { you: "carpenter", ai: "fire" });
    put(state, 0, 0, { owner: "you", struct: "nest", soldiers: 20 });
    put(state, 8, 8, { owner: "ai", struct: "nest", soldiers: 20 });
    state.cooldown.you = 0;
    finish(state);
    const copy = structuredClone(state);
    const moves: Move[] = [];
    const events = executePlannedTurn(state, "you", {
      action: { kind: "move", from: { c: 0, r: 0 }, to: { c: 1, r: 0 } }, after: {},
    }, context, moves);
    expect(events.some((event) => event.type === "fortified")).toBe(true);
    expect(moves.map((move) => move.do)).toEqual(["move", "ability"]);
    for (const move of moves) expect(applyMove(copy, "you", move, context.mods).ok).toBe(true);
    expect(snapshot(copy)).toEqual(snapshot(state));
  });

  it("does not dig and march in the same turn", () => {
    const state = blankGame("small", { you: "ghost", ai: "fire" });
    put(state, 0, 0, { owner: "you", struct: "nest", soldiers: 20 });
    put(state, 8, 8, { owner: "ai", struct: "nest", soldiers: 20 });
    state.cooldown.you = 0;
    finish(state);
    const moves: Move[] = [];
    executePlannedTurn(state, "you", {
      before: { target: { c: 2, r: 0 } },
      action: { kind: "move", from: { c: 0, r: 0 }, to: { c: 1, r: 0 } },
    }, context, moves);
    expect(moves).toEqual([{ do: "ability", at: { c: 2, r: 0 } }]);
  });

  it("uses the Impossible planner through the real AI-turn entry point", () => {
    Object.assign(PROFILES.impossible, { ...budget, nodeBudget: 400 });
    const state = position();
    put(state, 0, 0, { owner: "you", struct: "nest", soldiers: 100, terrain: "ground" });
    put(state, 1, 0, { owner: "ai", struct: "nest", soldiers: 2, terrain: "ground" });
    finish(state);
    expect(aiTurn(state, "you", "impossible", context).length).toBeGreaterThan(0);
    expect(state.winner).toBe("you");
  });

  it("values upgraded resource production for both sides", () => {
    const state = position();
    put(state, 0, 0, { owner: "you", struct: "nest", soldiers: 10, terrain: "ground" });
    put(state, 0, 1, { owner: "you", struct: "stable", soldiers: 10, terrain: "resource" });
    put(state, 8, 8, { owner: "ai", struct: "nest", soldiers: 10, terrain: "ground" });
    finish(state);
    const neutral = defaultContext();
    const enhanced = defaultContext();
    enhanced.mods.you = opponentModifiers("impossible");
    expect(evaluateImpossible(state, "you", enhanced)).toBeGreaterThan(evaluateImpossible(state, "you", neutral));
  });
});

it("caps every Impossible chamber/research level without changing the other difficulties", () => {
  const mods = opponentModifiers("impossible");
  for (const id of Object.keys(CHAMBER_MAX) as Array<keyof typeof CHAMBER_MAX>)
    expect(mods[id]).toBe(CHAMBER_MAX[id]);
  for (const id of ["reservoir", "mandible", "cuticle"] as const) expect(mods[id]).toBe(RESEARCH_MAX);
  for (const difficulty of ["easy", "normal", "hard"] as const)
    expect(opponentModifiers(difficulty)).toEqual(NEUTRAL_MODS);
});
