import { describe, expect, it } from "vitest";
import { RESEARCH_MAX, SPECIES, chamberCost, researchCost } from "../../engine";
import type { SpeciesId } from "../../engine";
import { MemoryStore } from "../storage";
import { ProfileStore, normalise } from "../profile";
import { CHAMBERS, RESEARCH_TRACKS, SPECIES_ORDER, SPECIES_UNLOCK } from "../catalogue";
import {
  ROAD_CHAPTER, ROAD_MAX, ROAD_STEP, freeReward, passReward, rewardFor, roadKey, roadStops,
} from "../road";

const store = (): ProfileStore => new ProfileStore(new MemoryStore());
const rich = (mycel = 100000, pheromone = 100000): ProfileStore => {
  const s = store();
  s.update((p) => { p.mycel = mycel; p.pheromone = pheromone; });
  return s;
};

describe("catalogue", () => {
  it("prices every species, and every starter at zero", () => {
    for (const id of Object.keys(SPECIES) as SpeciesId[]) {
      expect(SPECIES_UNLOCK[id], `${id} has no price`).toBeTypeOf("number");
      expect(SPECIES_UNLOCK[id]).toBeGreaterThanOrEqual(0);
    }
    // Whatever the profile hands out for free must cost nothing, or the Antarium would
    // offer to sell a species the player already owns.
    for (const id of store().get().unlocked) expect(SPECIES_UNLOCK[id]).toBe(0);
  });

  it("lists every species exactly once, in price order", () => {
    expect(SPECIES_ORDER.length).toBe(Object.keys(SPECIES).length);
    expect(new Set(SPECIES_ORDER).size).toBe(SPECIES_ORDER.length);
    const prices = SPECIES_ORDER.map((id) => SPECIES_UNLOCK[id]);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("covers every chamber and research track the engine reads", () => {
    const chambers = CHAMBERS.map((c) => c.id).sort();
    expect(chambers).toEqual(["brood", "cultivate", "gland", "royal", "soldierCaste"]);
    expect(RESEARCH_TRACKS.map((t) => t.id).sort()).toEqual(["cuticle", "mandible", "reservoir"]);
  });

  it("describes every level of every chamber without gaps", () => {
    for (const ch of CHAMBERS) {
      for (let l = 1; l <= ch.max; l++) expect(ch.effect(l).length).toBeGreaterThan(0);
    }
  });
});

describe("buying chambers and research", () => {
  it("charges the listed price and raises the level", () => {
    const s = rich();
    const before = s.get().mycel;
    expect(s.buyChamber("royal")).toBe(true);
    expect(s.get().hill.royal).toBe(1);
    expect(s.get().mycel).toBe(before - chamberCost(0));
  });

  it("refuses what the player cannot afford, and spends nothing", () => {
    const s = store();                                   // a fresh profile is broke
    expect(s.buyChamber("royal")).toBe(false);
    expect(s.get().hill.royal ?? 0).toBe(0);
    expect(s.get().mycel).toBe(0);

    expect(s.buyResearch("fire", "mandible")).toBe(false);
    expect(s.get().research.fire?.mandible).toBe(0);
    expect(s.get().pheromone).toBe(0);
  });

  it("stops at the cap instead of charging for a level that does nothing", () => {
    const s = rich();
    for (const ch of CHAMBERS) {
      for (let l = 0; l < ch.max; l++) expect(s.buyChamber(ch.id)).toBe(true);
      const banked = s.get().mycel;
      expect(s.buyChamber(ch.id)).toBe(false);
      expect(s.get().hill[ch.id]).toBe(ch.max);
      expect(s.get().mycel).toBe(banked);
    }
  });

  it("pays for research in pheromone, never in mycel", () => {
    const s = rich();
    const mycel = s.get().mycel;
    expect(s.buyResearch("fire", "cuticle")).toBe(true);
    expect(s.get().mycel).toBe(mycel);
    expect(s.get().pheromone).toBe(100000 - researchCost(0));
  });

  it("keeps research per species — levelling Fire leaves Ghost untouched", () => {
    const s = rich();
    s.buyResearch("fire", "mandible");
    expect(s.get().research.fire?.mandible).toBe(1);
    expect(s.get().research.ghost?.mandible).toBe(0);
  });

  it("caps research and feeds the capped level through to mods", () => {
    const s = rich();
    for (let l = 0; l < RESEARCH_MAX; l++) expect(s.buyResearch("fire", "mandible")).toBe(true);
    expect(s.buyResearch("fire", "mandible")).toBe(false);
    expect(s.modsFor("fire").you.mandible).toBe(RESEARCH_MAX);
    // The AI never sees a point of it (CLAUDE.md §4.8).
    expect(s.modsFor("fire").ai.mandible).toBe(0);
  });
});

describe("species unlocks", () => {
  it("sells a locked species for its listed price", () => {
    const s = rich();
    expect(s.isUnlocked("weaver")).toBe(false);
    expect(s.unlockSpecies("weaver")).toBe(true);
    expect(s.isUnlocked("weaver")).toBe(true);
    expect(s.get().mycel).toBe(100000 - SPECIES_UNLOCK.weaver);
  });

  it("will not sell a premium species for soft currency", () => {
    const s = rich();
    expect(s.canUnlock("demon")).toBe(false);
    expect(s.unlockSpecies("demon")).toBe(false);
    expect(s.isUnlocked("demon")).toBe(false);
    // ...but the shop can still grant it outright.
    s.grantSpecies("demon");
    expect(s.isUnlocked("demon")).toBe(true);
  });

  it("never charges twice for the same species", () => {
    const s = rich();
    s.unlockSpecies("weaver");
    const banked = s.get().mycel;
    expect(s.unlockSpecies("weaver")).toBe(false);
    expect(s.get().mycel).toBe(banked);
    expect(s.get().unlocked.filter((id) => id === "weaver").length).toBe(1);
  });

  it("refuses a species the player cannot afford", () => {
    const s = store();
    expect(s.unlockSpecies("bullet")).toBe(false);
    expect(s.isUnlocked("bullet")).toBe(false);
  });
});

describe("trophy road layout", () => {
  it("runs from the first step to the last with no gaps", () => {
    const stops = roadStops();
    expect(stops[0]?.trophies).toBe(ROAD_STEP);
    expect(stops[stops.length - 1]?.trophies).toBe(ROAD_MAX);
    stops.forEach((s, i) => expect(s.trophies).toBe((i + 1) * ROAD_STEP));
  });

  it("pays the free track once per chapter and the pass track every step", () => {
    for (const stop of roadStops()) {
      expect(!!stop.free).toBe(stop.trophies % ROAD_CHAPTER === 0);
      expect(!!stop.pass).toBe(true);
    }
  });

  it("always pays something when it pays at all", () => {
    for (const stop of roadStops()) {
      for (const r of [stop.free, stop.pass]) {
        if (!r) continue;
        expect((r.mycel ?? 0) + (r.pheromone ?? 0)).toBeGreaterThan(0);
      }
    }
  });

  it("resolves a claim key back to the same reward the road showed", () => {
    for (const stop of roadStops().slice(0, 20)) {
      expect(rewardFor(roadKey("pass", stop.trophies))).toEqual(passReward(stop.trophies));
      expect(rewardFor(roadKey("free", stop.trophies))).toEqual(freeReward(stop.trophies));
    }
    for (const junk of ["", "x100", "f", "fNaN", "f-250", "f7"]) {
      expect(rewardFor(junk)).toBeNull();
    }
  });
});

describe("claiming trophy road rewards", () => {
  const withTrophies = (n: number, pass = false): ProfileStore => {
    const s = store();
    s.update((p) => { p.trophies = n; p.pass = pass; });
    return s;
  };

  it("pays a reached free reward exactly once", () => {
    const s = withTrophies(600);
    const key = roadKey("free", 500);
    expect(s.canClaimRoad(key)).toBe(true);
    expect(s.claimRoad(key)).toBe(true);
    expect(s.get().mycel + s.get().pheromone).toBeGreaterThan(0);
    const banked = s.get().mycel + s.get().pheromone;
    expect(s.claimRoad(key)).toBe(false);
    expect(s.get().mycel + s.get().pheromone).toBe(banked);
  });

  it("will not pay a reward the player has not reached", () => {
    const s = withTrophies(400);
    expect(s.claimRoad(roadKey("free", 500))).toBe(false);
    expect(s.get().mycel).toBe(0);
  });

  it("locks the pass track until the pass is owned", () => {
    const s = withTrophies(600);
    const key = roadKey("pass", 500);
    expect(s.claimRoad(key)).toBe(false);
    s.grantPass();
    expect(s.claimRoad(key)).toBe(true);
  });

  /** Trophies fall on a loss. A reward already banked must not be revoked or re-payable. */
  it("keeps a claim after the trophies that earned it are lost", () => {
    const s = withTrophies(600);
    const key = roadKey("free", 500);
    s.claimRoad(key);
    const banked = s.get().mycel + s.get().pheromone;
    s.update((p) => { p.trophies = 0; });
    expect(s.get().roadClaimed).toContain(key);
    expect(s.claimRoad(key)).toBe(false);
    expect(s.get().mycel + s.get().pheromone).toBe(banked);
  });

  it("survives a save carrying junk claim keys", () => {
    const p = normalise({ roadClaimed: ["f500", "f500", "nonsense", 7, null, "p250"] });
    expect(p.roadClaimed).toEqual(["f500", "p250"]);
  });

  it("persists claims across a reload", () => {
    const kv = new MemoryStore();
    const first = new ProfileStore(kv);
    first.update((p) => { p.trophies = 600; });
    first.claimRoad(roadKey("free", 500));
    expect(new ProfileStore(kv).get().roadClaimed).toContain("f500");
  });
});
