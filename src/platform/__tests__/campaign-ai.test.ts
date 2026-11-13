import { describe, expect, it } from "vitest";
import { CHAMBER_MAX, NEUTRAL_MODS, SPECIES, combatPower } from "../../engine";
import type { SpeciesId } from "../../engine";
import { campaignOpponent, chapterLoadout } from "../campaign-ai";
import { slotsOpen, traitDef, totalsOf, combine } from "../traits";
import { modsFrom, ProfileStore } from "../profile";
import { MemoryStore } from "../storage";

describe("chapter campaign opponent", () => {
  it("starts with no research, chambers or traits", () => {
    const player = {...NEUTRAL_MODS,...CHAMBER_MAX,researchLevel:10,atkPct:30,defPct:30,boonPct:50};
    const bot = campaignOpponent(1,"fire","leafcutter",player);
    expect(bot.mods).toEqual({...NEUTRAL_MODS,researchLevel:0});
    expect(bot.traits.hill).toHaveLength(0);expect(bot.traits.species).toHaveLength(0);
    expect(bot.control).toEqual({version:1,chapter:1,skill:0});
  });
  it("grows the baseline legally across all fifty chapters and all species", () => {
    for(const species of Object.keys(SPECIES) as SpeciesId[]) {
      let last=0;
      for(let chapter=1;chapter<=50;chapter++) {
        const bot=chapterLoadout(chapter,species);
        const power=combatPower(species,bot.mods).total;
        expect(power).toBeGreaterThanOrEqual(last);last=power;
        expect(bot.mods.researchLevel).toBeLessThanOrEqual(10);
        for(const [key,max]of Object.entries(CHAMBER_MAX))expect(bot.mods[key as keyof typeof CHAMBER_MAX]).toBeLessThanOrEqual(max);
        expect(bot.traits.hill.length).toBeLessThanOrEqual(slotsOpen(chapter));
        expect(bot.traits.species.length).toBeLessThanOrEqual(slotsOpen(chapter));
        expect([...bot.traits.hill,...bot.traits.species].every(t=>!!traitDef(t.def))).toBe(true);
        const totals=combine(totalsOf(bot.traits.hill),totalsOf(bot.traits.species));
        expect(bot.mods.atkPct).toBe(totals.atkPct);
        expect(bot.mods.defPct).toBe(totals.defPct);
        expect(bot.mods.boonPct).toBe(totals.luckPct);
      }
      const end=chapterLoadout(50,species);
      expect(end.mods.researchLevel).toBe(10);
      expect(end.traits.hill).toHaveLength(5);expect(end.traits.species).toHaveLength(5);
      expect([...end.traits.hill,...end.traits.species].every(t=>t.tier==="mythic")).toBe(true);
    }
  });
  it("only reduces chapter gear for a weak loadout and never changes skill mid-match", () => {
    const weak=campaignOpponent(50,"fire","fire",NEUTRAL_MODS);
    const strongMods=chapterLoadout(50,"fire").mods;
    const strong=campaignOpponent(50,"fire","fire",strongMods);
    expect(weak.gearStep).toBeLessThan(strong.gearStep);
    expect(weak.control).toEqual(strong.control);
    expect(strong.gearStep).toBeLessThanOrEqual(49);
    expect(JSON.parse(JSON.stringify(strong))).toEqual(strong);
    expect(campaignOpponent(NaN,"fire","fire",NEUTRAL_MODS).control.chapter).toBe(1);
  });
  it("rates equipped active traits but not inventory, money, cosmetics or passive storage", () => {
    const s=new ProfileStore(new MemoryStore());
    const initial=s.powerFor("fire").total;
    s.update(p=>{p.mycel=999999;p.pheromone=999999;p.granary=7;p.bag=[{uid:"one",def:"u.mandible",tier:"mythic"}];});
    expect(s.powerFor("fire").total).toBe(initial);
    s.update(p=>{p.wearing.hill=["one"];});
    expect(s.powerFor("fire").total).toBeGreaterThan(initial);
    expect(s.powerFor("fire")).toEqual(combatPower("fire",modsFrom(s.get(),"fire")));
  });
});
