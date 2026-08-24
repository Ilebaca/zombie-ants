import { describe, expect, it } from "vitest";
import { CHAMBER_MAX, RESEARCH_MAX, TROPHY_LOSS, TROPHY_WIN, chamberCost } from "../../engine";
import { MemoryStore } from "../storage";
import { ProfileStore, defaultProfile, modsFrom, normalise } from "../profile";

const store = (): ProfileStore => new ProfileStore(new MemoryStore());

describe("profile persistence", () => {
  it("round-trips through the store", () => {
    const kv = new MemoryStore();
    new ProfileStore(kv).update((p) => { p.name = "Milan"; p.mycel = 120; });
    expect(new ProfileStore(kv).get().name).toBe("Milan");
    expect(new ProfileStore(kv).get().mycel).toBe(120);
  });

  it("boots from an empty store", () => {
    expect(store().get().unlocked.length).toBeGreaterThan(0);
  });

  /** Saves outlive code. Garbage on disk must degrade to defaults, never crash the boot. */
  it("survives corrupt or hostile saved data", () => {
    const kv = new MemoryStore();
    kv.set("zombie-ants.profile", "{not valid json");
    expect(() => new ProfileStore(kv).get()).not.toThrow();

    for (const junk of [null, 42, "text", [], { unlocked: "nope" }, { stats: 5 }]) {
      const p = normalise(junk);
      expect(p.unlocked.length).toBeGreaterThan(0);
      expect(Number.isFinite(p.trophies)).toBe(true);
      expect(Number.isFinite(p.stats.games)).toBe(true);
    }
  });

  it("clamps levels that would otherwise distort combat maths", () => {
    const p = normalise({
      hill: { royal: 999, gland: -4 },
      research: { fire: { reservoir: 99, mandible: NaN, cuticle: -2 } },
    });
    expect(p.hill.royal).toBe(CHAMBER_MAX.royal);
    expect(p.hill.gland).toBe(0);
    expect(p.research.fire?.reservoir).toBe(RESEARCH_MAX);
    expect(p.research.fire?.mandible).toBe(0);
    expect(p.research.fire?.cuticle).toBe(0);
  });

  it("never leaves the player with nothing to field", () => {
    const p = normalise({ unlocked: [], lastSpecies: "demon" });
    expect(p.unlocked.length).toBeGreaterThan(0);
    expect(p.unlocked).toContain(p.lastSpecies);
  });
});

describe("mods", () => {
  /** CLAUDE.md §4.8: the AI gets no anthill and no research, ever. */
  it("never gives the AI modifiers", () => {
    const s = store();
    s.update((p) => {
      p.hill.royal = 5; p.hill.brood = 5;
      p.research.fire = { reservoir: 5, mandible: 5, cuticle: 5 };
    });
    const mods = s.modsFor("fire");
    expect(mods.you.royal).toBe(5);
    expect(mods.you.mandible).toBe(5);
    for (const v of Object.values(mods.ai)) expect(v).toBe(0);
  });

  it("reads research per species, not globally", () => {
    const p = defaultProfile();
    p.research.fire = { reservoir: 3, mandible: 2, cuticle: 1 };
    expect(modsFrom(p, "fire").reservoir).toBe(3);
    expect(modsFrom(p, "ghost").reservoir).toBe(0);
  });
});

describe("progression", () => {
  it("awards and deducts trophies, floored at zero", () => {
    const s = store();
    s.recordResult(true, "fire");
    expect(s.get().trophies).toBe(TROPHY_WIN);
    expect(s.get().stats.wins).toBe(1);

    for (let i = 0; i < 5; i++) s.recordResult(false, "fire");
    expect(s.get().trophies).toBe(0);                 // never negative
    expect(s.get().stats.games).toBe(6);
    void TROPHY_LOSS;
  });

  it("buys a chamber only when affordable and uncapped", () => {
    const s = store();
    s.update((p) => { p.mycel = 0; });                // broke, which is where a profile starts
    expect(s.buyChamber("royal")).toBe(false);        // broke

    s.update((p) => { p.mycel = chamberCost(0); });
    expect(s.buyChamber("royal")).toBe(true);
    expect(s.get().hill.royal).toBe(1);
    expect(s.get().mycel).toBe(0);

    s.update((p) => { p.mycel = 1e6; });
    for (let i = 1; i < CHAMBER_MAX.royal; i++) expect(s.buyChamber("royal")).toBe(true);
    expect(s.get().hill.royal).toBe(CHAMBER_MAX.royal);
    expect(s.buyChamber("royal")).toBe(false);        // capped
  });

  it("does not spend currency on a refused purchase", () => {
    const s = store();
    s.update((p) => { p.mycel = 10; });
    expect(s.buyChamber("royal")).toBe(false);
    expect(s.get().mycel).toBe(10);
  });
});

describe("a brand-new profile", () => {
  it("has nothing to spend", () => {
    // A colony earns its first chamber from a match. The legacy build's 120-mycelium
    // welcome grant is gone deliberately, so the Anthill's first visit has a point.
    for (const p of [defaultProfile(), store().get(), normalise({}), normalise(null)]) {
      expect(p.mycel).toBe(0);
      expect(p.pheromone).toBe(0);
    }
  });

  /**
   * normalise() runs over every profile including the default one, so a fallback of its
   * own — a bare zero, an empty string — silently overrides whatever the default profile
   * says a new player starts with. It must fall back to the DEFAULT, field for field.
   */
  it("falls back to the default profile's values, never to its own", () => {
    const base = defaultProfile();
    const fresh = normalise({});
    const fields = [
      "name", "trophies", "mycel", "pheromone", "xp", "tourSeen",
      "lastSpecies", "lastMap", "lastShape", "difficulty", "pass",
    ] as const;
    for (const key of fields) expect(fresh[key], key).toEqual(base[key]);
  });

  it("still takes a saved balance over the default", () => {
    expect(normalise({ mycel: 7 }).mycel).toBe(7);
    expect(normalise({ mycel: 0 }).mycel).toBe(0);
    expect(normalise({ mycel: -5 }).mycel).toBe(0);
    expect(normalise({ mycel: "lots" }).mycel).toBe(defaultProfile().mycel);
  });
});
