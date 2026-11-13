import { afterEach, expect, it, vi } from "vitest";
import { buildAntarium } from "../antarium";
import { buildSpeciesPage } from "../species";
import { buildSetup } from "../setup";
import { MatchmakingScreen } from "../matchmaking";
import { powerTag, updatePowerTag } from "../power-tag";
import { MemoryStore, ProfileStore, campaignOpponent } from "../../platform";
import type { Choices } from "../setup";
import type { Opponent } from "../../platform";
HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];
afterEach(()=>{document.body.replaceChildren();vi.useRealTimers();});

it("updates only the number and accessible name while retaining the attached flame",()=>{
  const tag=powerTag(1234,{context:"Fire Ant"});
  expect(tag.getAttribute("aria-label")).toBe("Fire Ant: Total power 1,234");
  const flame=tag.querySelector("svg");
  updatePowerTag(tag,1450);
  expect(tag.dataset.power).toBe("1450");
  expect(tag.querySelector(".power-tag__value")?.textContent).toBe("1,450");
  expect(tag.querySelector("svg")).toBe(flame);
  expect(powerTag(1234,{compact:true}).querySelector(".power-tag__value")?.textContent).toBe("1234");
});

it("shows the same total on collection cards, selected preview, detail and setup preview",()=>{
  const s=new ProfileStore(new MemoryStore());
  s.update(p=>{p.research.fire={level:4};p.hill.brood=2;});
  const power=String(s.powerFor("fire").total);
  const collection=buildAntarium(s,{onOpenSpecies:()=>{}});
  document.body.appendChild(collection);
  collection.querySelector<HTMLElement>('[data-ant="fire"]')?.click();
  expect(collection.querySelector('[data-ant="fire"] .power-tag')?.getAttribute("data-power")).toBe(power);
  expect(collection.querySelector("#antBanner .power-tag")?.getAttribute("data-power")).toBe(power);
  const detail=buildSpeciesPage(s,{species:"fire",onBack:()=>{}});
  expect(detail.querySelector("#speciesPower")?.getAttribute("data-power")).toBe(power);
  const choices:Choices={species:"fire",map:"small",shape:"wedge"};
  const setup=buildSetup({choices,profile:s,onBack:()=>{},onBegin:()=>{}});
  setup.querySelector<HTMLButtonElement>("#setupGo")?.click();
  expect(setup.querySelector("#setupPower")?.getAttribute("data-power")).toBe(power);
  setup.querySelector<HTMLButtonElement>("#pickNext")?.click();
  expect(setup.querySelector("#setupPower")?.getAttribute("data-power")).toBe(String(s.powerFor(choices.species).total));
});

it("shows the found opponent's adjusted equipment power and retains the two-second hold",async()=>{
  vi.useFakeTimers();
  const s=new ProfileStore(new MemoryStore());
  const mods=s.modsFor("fire").you;
  const foe:Opponent={name:"Rival",colony:2000000,species:"carpenter",human:false};
  const expected=campaignOpponent(35,foe.species,"fire",mods).power.total;
  const host=document.createElement("div");document.body.appendChild(host);
  const found=vi.fn();
  const screen=new MatchmakingScreen(host,{you:{name:"Player",colony:80,species:"fire",power:s.powerFor("fire").total},
    roster:[foe],search:async()=>foe,onFound:found,
    opponentPower:f=>campaignOpponent(35,f.species,"fire",mods).power.total});
  screen.start();await vi.advanceTimersByTimeAsync(1);
  expect(host.querySelector(".mmk-you .power-tag")?.getAttribute("data-power")).toBe(String(s.powerFor("fire").total));
  expect(host.querySelector(".mmk-found .power-tag")?.getAttribute("data-power")).toBe(String(expected));
  expect(found).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);expect(found).toHaveBeenCalledWith(foe);screen.destroy();
});
