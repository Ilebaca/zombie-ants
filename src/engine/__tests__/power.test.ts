import { describe, expect, it } from "vitest";
import { CHAMBER_MAX, NEUTRAL_MODS, SPECIES, combatPower } from "../index";
import type { PlayerMods, SpeciesId } from "../index";

describe("universal combat loadout power", () => {
  it("rates every species from its own combat statistics", () => {
    const ratings = Object.keys(SPECIES).map(id => combatPower(id as SpeciesId, NEUTRAL_MODS));
    expect(ratings.every(r => r.version === 3 && Number.isFinite(r.total) && r.total > 0)).toBe(true);
    expect(new Set(ratings.map(r => r.total)).size).toBeGreaterThan(5);
    for (const r of ratings) expect(r.total).toBe(Math.round(r.attack+r.defence+r.economy+r.ability+r.opening));
  });
  it("accounts for every upgrade and capped trait bonus", () => {
    const base = combatPower("fire", {...NEUTRAL_MODS,researchLevel:0}).total;
    for (const [key, value] of Object.entries({...CHAMBER_MAX,researchLevel:10,atkPct:30,defPct:30,boonPct:50})) {
      expect(combatPower("fire", {...NEUTRAL_MODS,researchLevel:0,[key]:value}).total,key).toBeGreaterThan(base);
    }
  });
  it("never decreases when a legal level or bonus rises", () => {
    for (const species of Object.keys(SPECIES) as SpeciesId[]) {
      for (const [key,max] of Object.entries({...CHAMBER_MAX,researchLevel:10,atkPct:30,defPct:30,boonPct:50})) {
        let last = 0;
        for(let n=0;n<=max;n++) {
          const next = combatPower(species,{...NEUTRAL_MODS,researchLevel:0,[key]:n}).total;
          expect(next).toBeGreaterThanOrEqual(last); last=next;
        }
      }
    }
  });
  it("bounds malformed inputs and supports older research records", () => {
    const corrupt = Object.fromEntries(Object.keys(NEUTRAL_MODS).map(k=>[k,Infinity])) as unknown as PlayerMods;
    expect(Number.isFinite(combatPower("ghost",corrupt).total)).toBe(true);
    expect(combatPower("fire",{...NEUTRAL_MODS,mandible:5}).attack)
      .toBe(combatPower("fire",{...NEUTRAL_MODS,researchLevel:10}).attack);
  });
});

it("gives every species identical production power for the same shared upgrades", () => {
  const base=Object.keys(SPECIES).map(id=>combatPower(id as SpeciesId,NEUTRAL_MODS).economy);
  expect(new Set(base)).toEqual(new Set([300]));
  for(const id of Object.keys(SPECIES) as SpeciesId[])
    expect(combatPower(id,{...NEUTRAL_MODS,brood:2,cultivate:1}).economy).toBe(400);
});

it("values ten percent CDR at twenty utility points for every species", () => {
  for (const species of Object.keys(SPECIES) as SpeciesId[]) {
    const base = combatPower(species, {...NEUTRAL_MODS,researchLevel:0});
    const trait = combatPower(species, {...NEUTRAL_MODS,researchLevel:0,boonPct:10});
    expect(trait.ability - base.ability).toBeCloseTo(20);
    expect(trait.total - base.total).toBe(20);
    expect(trait.attack).toBe(base.attack);
    expect(trait.defence).toBe(base.defence);
    const research = combatPower(species, {...NEUTRAL_MODS,researchLevel:10});
    const both = combatPower(species, {...NEUTRAL_MODS,researchLevel:10,boonPct:10});
    expect(both.ability - research.ability).toBeCloseTo(20);
  }
});

it("caps CDR utility consistently and ignores invalid chance inputs", () => {
  const rate = (boonPct: number) => combatPower("fire", {...NEUTRAL_MODS,researchLevel:0,boonPct});
  expect(rate(500).total).toBe(rate(50).total);
  for (const invalid of [-10,NaN,Infinity]) expect(rate(invalid).total).toBe(rate(0).total);
});
