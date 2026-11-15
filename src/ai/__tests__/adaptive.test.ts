import { describe, expect, it, vi } from "vitest";
import { createGame, defaultContext, snapshot, applyMove, recomputeConnectivity } from "../../engine";
import { blankGame, put } from "../../engine/__tests__/helpers";
import { aiTurn, chooseMove, profileFor } from "../search";
import { Thinker } from "../thinker";

describe("one campaign search", () => {
  /**
   * THE PLAY STYLE IS THE SAME ON EVERY CHAPTER, and it is Normal.
   *
   * This used to assert the opposite — that each chapter searched deeper, on a bigger
   * budget, with a higher `hanging` weight than the one before it — and that curve is
   * what made chapter 1 the weakest search in the file (§ A CAMPAIGN OPPONENT PLAYS
   * NORMAL). What scales is the opponent's GEAR, which is `platform/campaign-ai.ts` and
   * has its own tests; nothing about how it thinks moves with the road.
   *
   * Deep-equal against the Normal profile rather than a list of fields: the fault being
   * guarded against is an interpolation creeping back, and a check that only reads
   * `depth` would pass against one that moved every other dial.
   */
  it("plays the Normal policy on every chapter of the road", () => {
    const normal=profileFor("normal");
    for(let chapter=1;chapter<=50;chapter++){
      const at=profileFor({version:1,chapter,skill:(chapter-1)/49});
      expect(at,`chapter ${chapter} does not play Normal`).toEqual(normal);
    }
    // And it is Normal rather than something that merely matches it today: the two
    // weaker-and-stronger neighbours must still be different players.
    expect(profileFor("easy")).not.toEqual(normal);
    expect(profileFor("hard")).not.toEqual(normal);
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

/**
 * THE FIRST CHAPTER GETS THE SAME PLAYER AS THE LAST.
 *
 * It used to get a different one, twice over: the policy was interpolated off the
 * chapter, and the root then threw its best move away with a chance of
 * `.72 * (1 - skill) ** 2` — which at chapter 1 is seven times in ten. Both are gone, so
 * the same position has to produce the same move at either end of the road.
 *
 * This is the assertion that catches the BLUNDER ROLL coming back on its own: the roll is
 * seeded off the position, so both calls here draw the same number and only the
 * skill-scaled threshold decides whether it fires — chapter 1 blunders where chapter 50
 * does not, and the two answers part company. The test it replaces asserted exactly that
 * parting as the feature.
 */
it("plays the same move on chapter 1 as on chapter 50", () => {
  const clock=vi.spyOn(Date,"now").mockReturnValue(0);
  try {
    const s=blankGame("small");
    put(s,0,0,{owner:"ai",struct:"nest",soldiers:10});
    for(const [c,r] of [[1,0],[2,0],[3,0],[1,1],[2,1],[3,1]] as const)
      put(s,c,r,{owner:"ai",struct:"stable",soldiers:8});
    put(s,4,0,{owner:"you",struct:"nest",soldiers:30});
    recomputeConnectivity(s);s.current="ai";
    const ctx=defaultContext(),before=snapshot(s);
    const first=chooseMove(s,"ai",{version:1,chapter:1,skill:0},ctx).move;
    const last=chooseMove(s,"ai",{version:1,chapter:50,skill:1},ctx).move;
    expect(first,"the campaign opponent played nothing").toBeTruthy();
    expect(first).toEqual(last);
    // And it is the move NORMAL would play, which is what "our previous normal mode" is.
    expect(first).toEqual(chooseMove(s,"ai","normal",ctx).move);
    expect(snapshot(s)).toEqual(before);
  }finally{clock.mockRestore();}
});
