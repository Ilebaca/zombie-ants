import { describe, expect, it } from "vitest";
import { CHAMBER_MAX, NEUTRAL_MODS, SPECIES, combatPower } from "../index";
import type { PlayerMods, SpeciesId } from "../index";

describe("universal combat loadout power", () => {
  it("rates every species from its own combat statistics", () => {
    const ratings = Object.keys(SPECIES).map(id => combatPower(id as SpeciesId, NEUTRAL_MODS));
    expect(ratings.every(r => r.version === 1 && Number.isFinite(r.total) && r.total > 0)).toBe(true);
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
