/** Extended, paired-side skill audit with identical equipment. */
import { NEUTRAL_MODS, createGame, defaultContext, endTurn, armyOf, incomeOf, nestTile, allTiles, replayMatch, snapshot } from "../src/engine";
import type { MatchSetup, Move, Player, SpeciesId } from "../src/engine";
import { aiTurn } from "../src/ai/search";
import { mkdirSync,writeFileSync } from "node:fs";
import assert from "node:assert/strict";
// Use the same wall-clock and node limits as the shipped worker.
if(process.argv.includes("--nodes"))Date.now=()=>0;
const shard=Number(process.argv[2]??0),pair=Math.floor(shard/2);
const species:SpeciesId=(["fire","leafcutter","carpenter","ghost","army"] as const)[pair]??"fire";
const strong:Player=shard%2?"ai":"you";
const setup:MatchSetup={map:"small",species:{you:species,ai:species},seed:700000+pair,first:"you"};
const s=createGame(setup),ctx=defaultContext(),moves:Move[]=[];
const metrics=(p:Player)=>({army:armyOf(s,p),income:incomeOf(s,p,NEUTRAL_MODS),
 nest:nestTile(s,p)?.soldiers,largest:allTiles(s).filter(t=>t.owner===p).sort((a,b)=>b.soldiers-a.soldiers).slice(0,3).map(t=>({c:t.c,r:t.r,n:t.soldiers})),
 tiles:allTiles(s).filter(t=>t.owner===p).length});
const log=[];
while(!s.over&&s.turn<=160){
 const at=moves.length,p=s.current;
 aiTurn(s,p,{version:1,chapter:p===strong?50:1,skill:p===strong?1:0},ctx,moves);
 if(s.turn%10===0)log.push({turn:s.turn,p,moves:moves.slice(at),you:metrics("you"),ai:metrics("ai")});
 if(!s.over){endTurn(s,ctx.mods);moves.push({do:"end"});}
}
const replay=replayMatch({setup,moves});assert.equal(replay.refused,null);assert.deepEqual(snapshot(replay.state),snapshot(s));
const report={shard,species,strong,score:s.over?(s.winner===strong?1:0):.5,decisive:s.over,turn:s.turn,winner:s.winner,you:metrics("you"),ai:metrics("ai"),log};
mkdirSync("reports",{recursive:true});writeFileSync(`reports/skill-${shard}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,log:undefined}));
