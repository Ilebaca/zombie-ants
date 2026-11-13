import { describe, expect, it, vi } from "vitest";
import { createGame, defaultContext, snapshot, applyMove } from "../../engine";
import { aiTurn, profileFor } from "../search";
import { Thinker } from "../thinker";

describe("one chapter-scaled search", () => {
  it("raises tactical awareness and search budgets throughout fifty chapters", () => {
    let last=profileFor({version:1,chapter:1,skill:0});
    for(let chapter=2;chapter<=50;chapter++){
      const next=profileFor({version:1,chapter,skill:(chapter-1)/49});
      expect(next.depth).toBeGreaterThanOrEqual(last.depth);
      expect(next.nodeBudget).toBeGreaterThan(last.nodeBudget);
      expect(next.weights.hanging).toBeGreaterThan(last.weights.hanging);
      expect(next.timeBudgetMs).toBeLessThanOrEqual(180);
      last=next;
    }
    expect(last.gen).toEqual({travel:true,rally:true,reinforce:true,veinGuard:true});
    expect(last.searchAbility).toBe(true);
  });
  it("chooses reproducible legal turns without corrupting the board RNG", () => {
    const clock=vi.spyOn(Date,"now").mockReturnValue(0);
    try {
      for(const chapter of [1,10,25,50]){
        const ctx=defaultContext();
        const state=createGame({map:"small",species:{you:"fire",ai:"carpenter"},seed:1234,first:"ai"});
        const same=structuredClone(state),replayed=structuredClone(state);
        const control={version:1 as const,chapter,skill:(chapter-1)/49};
        const moves: import("../../engine").Move[]=[];
        aiTurn(state,"ai",control,ctx,moves);
        const again: import("../../engine").Move[]=[];
        aiTurn(same,"ai",control,ctx,again);
        expect(moves).toEqual(again);expect(moves.length).toBeGreaterThan(0);
        for(const move of moves)expect(applyMove(replayed,"ai",move,ctx.mods,ctx).ok).toBe(true);
        expect(snapshot(replayed)).toEqual(snapshot(state));
      }
    } finally {clock.mockRestore();}
  });
  it("carries the adaptive policy through the inline worker fallback", async () => {
    const clock=vi.spyOn(Date,"now").mockReturnValue(0);
    const thinker=new Thinker();
    try{
      const state=createGame({map:"small",species:{you:"fire",ai:"fire"},seed:55,first:"ai"});
      const before=snapshot(state),ctx=defaultContext();
      const thought=await thinker.think(state,"ai",{version:1,chapter:20,skill:19/49},ctx);
      expect(snapshot(state)).toEqual(before);
      expect(thought.moves.length).toBeGreaterThan(0);
    }finally{thinker.dispose();clock.mockRestore();}
  });
});
