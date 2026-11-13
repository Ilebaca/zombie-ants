/** Seeded, paired-side campaign audit. No human win-rate claims are inferred from self-play. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  NEUTRAL_MODS, createGame, defaultContext, endTurn, replayMatch, snapshot,
} from "../src/engine";
import type { AdaptiveControl, MatchSetup, Move, Player, PlayerMods, SpeciesId } from "../src/engine";
import { aiTurn } from "../src/ai/search";
import { campaignOpponent, chapterLoadout } from "../src/platform/campaign-ai";
import { botsForChapter } from "../src/platform/matchmaking";

interface Agent { species:SpeciesId; mods:PlayerMods; control:AdaptiveControl }
const control = (skill:number):AdaptiveControl => ({version:1,chapter:1+Math.round(skill*49),skill});
function game(player:Agent, enemy:Agent, seed:number, playerSide:Player) {
  const agents = playerSide === "you" ? {you:player,ai:enemy} : {you:enemy,ai:player};
  const setup:MatchSetup={map:"small",species:{you:agents.you.species,ai:agents.ai.species},
    mods:{you:agents.you.mods,ai:agents.ai.mods},seed,first:"you"};
  const state=createGame(setup),ctx={...defaultContext(),mods:setup.mods ?? defaultContext().mods};
  const moves:Move[]=[];
  let turns=0, maxThinkMs=0;
  while(!state.over && state.turn<=80 && turns++<500) {
    const before=performance.now(),p=state.current;
    aiTurn(state,p,agents[p].control,ctx,moves);
    maxThinkMs=Math.max(maxThinkMs,performance.now()-before);
    if(!state.over) {endTurn(state,ctx.mods);moves.push({do:"end"});}
  }
  const replay=replayMatch({setup,moves});
  assert.equal(replay.refused,null,"illegal recorded turn");
  assert.deepEqual(snapshot(replay.state),snapshot(state),"record diverged");
  return {score:state.over?(state.winner===playerSide?1:0):.5,
    decisive:state.over, rounds:state.turn, maxThinkMs:Math.round(maxThinkMs)};
}

const from=Number(process.argv[2]??1);
const to=Math.min(50,from+4);
const realClock=Date.now;
// Default to the shipped clock/node limits. --nodes isolates search quality at full
// node budgets for repeatable diagnostics, but is intentionally much more expensive.
if(process.argv.includes("--nodes"))Date.now=()=>0;
const began=performance.now();
const chapters=[];
try {
  for(let chapter=from;chapter<=to;chapter++){
    const p=(chapter-1)/49;
    const available:SpeciesId[]=chapter<8?["fire","leafcutter","carpenter"]:
      chapter<16?["fire","leafcutter","carpenter","ghost","pharaoh"]:
        ["fire","leafcutter","carpenter","ghost","pharaoh","army","bullet"];
    const results=[];
    for(let sample=0;sample<2;sample++){
      const species=available[(chapter+sample*3)%available.length]??"fire";
      const rival=botsForChapter(chapter)[(chapter*3+sample*7)%20];
      assert.ok(rival);
      const playerMods=chapterLoadout(chapter,species).mods;
      const bot=campaignOpponent(chapter,rival.species,species,playerMods);
      const player:Agent={species,mods:playerMods,control:control(.12+.80*p)};
      const enemy:Agent={species:rival.species,mods:bot.mods,control:bot.control};
      for(const side of ["you","ai"] as const) {
        results.push({...game(player,enemy,180000+chapter*97+sample*199,side),sample,side,
          playerSpecies:species,enemySpecies:rival.species,playerPower:bot.playerPower.total,
          enemyPower:bot.power.total,gearStep:bot.gearStep,skill:bot.control.skill,
          traitCount:bot.traits.hill.length+bot.traits.species.length});
      }
    }
    chapters.push({chapter,results});
  }
  const shard=Math.floor((from-1)/5),pair=Math.floor(shard/2),side:Player=shard%2?"ai":"you";
  const species:SpeciesId=(["fire","leafcutter","carpenter","ghost","army"] as const)[pair]??"fire";
  const neutral={...NEUTRAL_MODS,researchLevel:0};
  const skill=game({species,mods:neutral,control:control(1)},{species,mods:neutral,control:control(0)},700000+pair,side);
  const gear=game({species,mods:chapterLoadout(50,species).mods,control:control(.55)},
    {species,mods:neutral,control:control(.55)},800000+pair,side);
  const report={from,to,chapters,skillAblation:{...skill,species,side},gearAblation:{...gear,species,side},
    elapsedSeconds:Math.round((performance.now()-began)/1000)};
  mkdirSync("reports",{recursive:true});
  writeFileSync(`reports/chapter-${from}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({from,to,seconds:report.elapsedSeconds,
    chapters:chapters.map(c=>({chapter:c.chapter,playerScore:c.results.reduce((n,r)=>n+r.score,0)/c.results.length,
      draws:c.results.filter(r=>!r.decisive).length})),skillScore:skill.score,gearScore:gear.score}));
} finally {Date.now=realClock;}
