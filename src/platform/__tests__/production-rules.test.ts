import { expect, it } from "vitest";
import { createGame, applyMove, replayMatch, snapshot, tile, NEUTRAL_MODS } from "../../engine";
import type { MatchSetup, Move } from "../../engine";
import { MemoryStore } from "../storage";
import { SuspendStore, suspendKey } from "../suspend";
import { PROFILE_KEY, ProfileStore } from "../profile";
import { addToHistory } from "../history";

it("keeps an archived board exact, then resumes with uniform output and a replayable boundary",()=>{
  const setup:MatchSetup={map:"small",species:{you:"bullet",ai:"pharaoh"},seed:991,first:"you"};
  const old=createGame({...setup,rulesVersion:1}),moves:Move[]=[];
  for(let i=0;i<20;i++){const move:Move={do:"end"};expect(applyMove(old,old.current,move).ok).toBe(true);moves.push(move);}
  const before=snapshot(old),kv=new MemoryStore();
  kv.set(suspendKey(PROFILE_KEY),JSON.stringify({setup,moves,turn:old.turn,playedMs:1000,queens:0,difficulty:"normal",at:1}));
  const store=new SuspendStore(kv,PROFILE_KEY),resumed=store.resume();
  expect(resumed).not.toBeNull();
  expect(resumed?.state.rulesVersion).toBe(2);
  expect(resumed?.setup.ruleChanges).toEqual([{after:moves.length,rulesVersion:2}]);
  expect(snapshot(resumed!.state)).toEqual({...before,rulesVersion:2});
  const opening=tile(resumed!.state,1,resumed!.state.size-1).soldiers;
  for(let i=0;i<2;i++){const move:Move={do:"end"};expect(applyMove(resumed!.state,resumed!.state.current,move).ok).toBe(true);moves.push(move);}
  expect(tile(resumed!.state,1,resumed!.state.size-1).soldiers).toBe(opening+1);
  const record={setup:resumed!.setup,moves};
  const replay=replayMatch(record);
  expect(replay.refused).toBeNull();expect(snapshot(replay.state)).toEqual(snapshot(resumed!.state));
  store.save({...resumed!,moves});
  expect(store.resume()?.setup.ruleChanges).toHaveLength(1);
});

it("marks current saved matches and history records with current rules",()=>{
  const setup:MatchSetup={map:"small",species:{you:"fire",ai:"fire"},seed:99,first:"you"};
  const kv=new MemoryStore(),store=new SuspendStore(kv,PROFILE_KEY);
  store.save({setup,moves:[],turn:1,playedMs:0,queens:0,difficulty:"normal",at:1});
  expect(store.peek()?.setup.rulesVersion).toBe(2);
  const log={id:"new",at:1,map:"small" as const,you:"fire" as const,foe:"fire" as const,foeName:"Rival",human:false,winner:null,reason:null,turns:1,playedMs:0,colonyBefore:80,colonyAfter:80,record:{setup,moves:[]}};
  expect(addToHistory([],log)[0]?.record?.setup.rulesVersion).toBe(2);
  const profile=new ProfileStore(kv);
  profile.update(p=>{p.history=[log];});
  expect(profile.history[0]?.record?.setup.rulesVersion).toBe(1);
  expect(createGame(setup).rulesVersion).toBe(2);
  expect(NEUTRAL_MODS.brood).toBe(0);
});
