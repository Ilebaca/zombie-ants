import { describe, expect, it } from "vitest";
import { RESEARCH_MAX, SPECIES, chamberCost, researchCost } from "../../engine";
import type { SpeciesId } from "../../engine";
import { MemoryStore } from "../storage";
import { ProfileStore, normalise } from "../profile";
import { CHAMBERS, RESEARCH_TRACKS, SPECIES_ORDER, SPECIES_UNLOCK } from "../catalogue";
import {
  ROAD_CHAPTER_STOPS, ROAD_FIRST, ROAD_LAST, ROAD_STOPS, freeReward, passReward, rewardFor,
  roadColony, roadKey, roadStops, stopColony, stopReached,
} from "../road";

/** A profile with nothing banked — the starting grant would mask "cannot afford" cases. */
const store = (): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => { p.mycel = 0; p.pheromone = 0; });
  return s;
};
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
    expect(s.get().mycel).toBe(0);
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

  it("pays for research in mycelium, as the colony screens do throughout", () => {
    const s = rich();
    const pheromone = s.get().pheromone;
    expect(s.buyResearch("fire", "cuticle")).toBe(true);
    expect(s.get().mycel).toBe(100000 - researchCost(0));
    expect(s.get().pheromone).toBe(pheromone);
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

/**
 * THE ROAD COMPOUNDS, because the colony does. It used to be a hundred rungs two hundred
 * and fifty trophies apart — even spacing for an even ladder — and a colony that multiplies
 * would clear the whole thing in a few dozen matches and then have nowhere to go.
 */
describe("colony road layout", () => {
  it("runs from the first rung to the last, every one bigger than the last", () => {
    const stops = roadStops();
    expect(stops.length).toBe(ROAD_STOPS);
    expect(stops[0]?.colony).toBe(ROAD_FIRST);
    // Rounded to three significant figures, so the last rung lands near rather than on.
    expect(stops[stops.length - 1]?.colony).toBeCloseTo(ROAD_LAST, -4);
    stops.forEach((stop, i) => {
      expect(stop.index).toBe(i + 1);
      if (i > 0) {
        expect(stop.colony, `rung ${i + 1} is not past rung ${i}`)
          .toBeGreaterThan((stops[i - 1] as { colony: number }).colony);
      }
    });
  });

  /**
   * The road has to end where a real career ends. It used to run to two trillion — the
   * shape of a flat compounding win rate — and the last chapter paid a hundred and
   * thirty-six billion troops for one victory (§8a).
   */
  it("ends at a size a career actually reaches", () => {
    const last = roadStops()[ROAD_STOPS - 1] as { colony: number };
    expect(last.colony).toBeGreaterThan(1e6);
    expect(last.colony, "the last rung is past what a career climbs to").toBeLessThan(5e7);
    expect(stopReached(50), "a new colony is already on a rung").toBe(0);
    expect(stopReached(ROAD_FIRST)).toBe(1);
    expect(stopReached(1e15), "a colony past the end is not on the last rung").toBe(ROAD_STOPS);
  });

  it("pays the free track once per chapter and the pass track every rung", () => {
    for (const stop of roadStops()) {
      expect(!!stop.free).toBe(stop.index % ROAD_CHAPTER_STOPS === 0);
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

  /**
   * A rung is named by its INDEX, not its size. On a geometric ladder the size is a
   * rounded number that a retune would move, and a claim key has to outlive that.
   */
  it("resolves a claim key back to the same reward the road showed", () => {
    for (const stop of roadStops().slice(0, 20)) {
      expect(rewardFor(roadKey("pass", stop.index))).toEqual(passReward(stop.index));
      expect(rewardFor(roadKey("free", stop.index))).toEqual(freeReward(stop.index));
      expect(roadColony(roadKey("free", stop.index))).toBe(stopColony(stop.index));
    }
    for (const junk of ["", "x100", "f", "fNaN", "f-250", "f0", "f999"]) {
      expect(rewardFor(junk), `"${junk}" paid something`).toBeNull();
    }
  });
});

describe("claiming colony road rewards", () => {
  const withColony = (n: number, pass = false): ProfileStore => {
    const s = store();
    s.update((p) => { p.colony = n; p.pass = pass; });
    return s;
  };
  /** Rung 4 is the first that pays on BOTH tracks, so one size serves every case here. */
  const RUNG = 4;
  const REACHED = stopColony(RUNG);

  it("pays a reached free reward exactly once", () => {
    const s = withColony(REACHED);
    const key = roadKey("free", RUNG);
    expect(s.canClaimRoad(key)).toBe(true);
    expect(s.claimRoad(key)).toBe(true);
    expect(s.get().mycel + s.get().pheromone).toBeGreaterThan(0);
    const banked = s.get().mycel + s.get().pheromone;
    expect(s.claimRoad(key)).toBe(false);
    expect(s.get().mycel + s.get().pheromone).toBe(banked);
  });

  it("will not pay a reward the player has not reached", () => {
    const s = withColony(REACHED - 1);
    expect(s.claimRoad(roadKey("free", RUNG))).toBe(false);
    expect(s.get().mycel).toBe(0);
  });

  it("locks the pass track until the pass is owned", () => {
    const s = withColony(REACHED);
    const key = roadKey("pass", RUNG);
    expect(s.claimRoad(key)).toBe(false);
    s.grantPass();
    expect(s.claimRoad(key)).toBe(true);
  });

  /** The colony shrinks on a loss. A banked reward must not be revoked or re-payable. */
  it("keeps a claim after the colony that earned it is lost", () => {
    const s = withColony(REACHED);
    const key = roadKey("free", RUNG);
    s.claimRoad(key);
    const banked = s.get().mycel + s.get().pheromone;
    s.update((p) => { p.colony = 0; });
    expect(s.get().roadClaimed).toContain(key);
    expect(s.claimRoad(key)).toBe(false);
    expect(s.get().mycel + s.get().pheromone).toBe(banked);
  });

  it("survives a save carrying junk claim keys", () => {
    const p = normalise({ roadClaimed: ["f4", "f4", "nonsense", 7, null, "p4"] });
    expect(p.roadClaimed).toEqual(["f4", "p4"]);
  });

  it("persists claims across a reload", () => {
    const kv = new MemoryStore();
    const first = new ProfileStore(kv);
    first.update((p) => { p.colony = REACHED; });
    first.claimRoad(roadKey("free", RUNG));
    expect(new ProfileStore(kv).get().roadClaimed).toContain(roadKey("free", RUNG));
  });
});
