import { describe, expect, it } from "vitest";
import { CHAMBER_MAX, RESEARCH_MAX, chamberCost } from "../../engine";
import { MemoryStore } from "../storage";
import { ProfileStore, defaultProfile, modsFrom, normalise } from "../profile";
import { ROAD_CHAPTER_STOPS, ROAD_STOPS, stopColony } from "../road";
import { COLONY_FLOOR, COLONY_START, grownColony, losses, winnings } from "../colony";

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
      expect(Number.isFinite(p.colony)).toBe(true);
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
  it("grows the colony on a win and shrinks it on a loss, never below the start", () => {
    const s = store();
    expect(s.get().colony).toBe(COLONY_START);

    s.recordResult(true, "fire");
    // The floor carries the opening matches: 14% of the starting size is under it.
    expect(s.get().colony).toBe(COLONY_START + COLONY_FLOOR);
    expect(s.get().stats.wins).toBe(1);

    for (let i = 0; i < 20; i++) s.recordResult(false, "fire");
    expect(s.get().colony).toBe(COLONY_START);        // a colony is never smaller than this
    expect(s.get().stats.games).toBe(21);
  });

  /** Past the floor a match moves the colony by what colony.ts prices it at. */
  it("pays a share of the colony once it is past the floor", () => {
    const big = 100_000;
    expect(grownColony(big, true)).toBe(big + winnings(big));
    expect(grownColony(big, false)).toBe(big - losses(big));
    expect(winnings(big)).toBeGreaterThan(COLONY_FLOOR);
  });

  /** A win-heavy career has to actually reach the sizes the road and the ladder show. */
  it("climbs into six figures over a career", () => {
    let colony = COLONY_START;
    for (let i = 0; i < 100; i++) colony = grownColony(colony, true);
    expect(colony).toBeGreaterThan(1e5);
  });

  /**
   * A CAREER IS COUNTED FROM WHAT A MATCH DID. Every one of these was in the save shape and
   * nothing wrote it, so the profile screen would have reported a career of zeroes.
   */
  it("records the turns, the clock, the queens and the nests", () => {
    const s = store();
    s.recordResult(true, "fire", 40, { playedMs: 240_000, queens: 2, byNest: true });
    s.recordResult(false, "fire", 25, { playedMs: 120_000, queens: 1, byNest: false });

    const stats = s.get().stats;
    expect(stats.turns, "turns are not accumulated").toBe(65);
    expect(stats.playedMs, "the clock is not accumulated").toBe(360_000);
    expect(stats.queens).toBe(3);
    expect(stats.nests, "a nest was credited for a match that was not won by one").toBe(1);
  });

  /** Ground taken is counted as it happens, not at the end: a match is many captures. */
  it("folds captures into the career total", () => {
    const s = store();
    s.recordCaptures(4);
    s.recordCaptures(3);
    s.recordCaptures(0);
    expect(s.get().stats.conquered).toBe(7);
  });

  it("keeps the fastest WIN, and never a loss or an untimed match", () => {
    const s = store();
    s.recordResult(false, "fire", 10, { playedMs: 5_000 });
    expect(s.get().stats.bestMs, "a loss set the record").toBe(0);

    s.recordResult(true, "fire", 10, { playedMs: 0 });
    expect(s.get().stats.bestMs, "a match with no clock set the record").toBe(0);

    s.recordResult(true, "fire", 10, { playedMs: 300_000 });
    expect(s.get().stats.bestMs).toBe(300_000);
    s.recordResult(true, "fire", 10, { playedMs: 400_000 });
    expect(s.get().stats.bestMs, "a slower win took the record").toBe(300_000);
    s.recordResult(true, "fire", 10, { playedMs: 90_000 });
    expect(s.get().stats.bestMs).toBe(90_000);
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
      "name", "colony", "mycel", "pheromone", "xp", "tourSeen",
      "lastSpecies", "lastMap", "lastShape", "difficulty", "pass",
    ] as const;
    for (const key of fields) expect(fresh[key], key).toEqual(base[key]);
  });

  /**
   * A SAVE OUTLIVES THE LADDER IT WAS WRITTEN ON. Players on the live build have a trophy
   * count and road claims keyed by trophy amount ("f500"); both have to land somewhere
   * sensible, because a save that converts badly is a career that reads as wiped.
   */
  it("converts a save from the trophy ladder", () => {
    const old = normalise({ trophies: 600, roadClaimed: ["f500", "p750"] });
    // The trophy count becomes troops rather than being thrown away.
    expect(old.colony).toBe(600);
    // ...and the claims come back as rung indices, so nothing on the lower road pays twice.
    expect(old.roadClaimed.every((k) => Number(k.slice(1)) <= ROAD_STOPS)).toBe(true);
    expect(old.roadClaimed).toContain(`f${ROAD_CHAPTER_STOPS}`);
    expect(old.roadClaimed.length).toBeGreaterThan(0);
    // Everything marked claimed is ground the converted colony has actually reached.
    for (const key of old.roadClaimed) {
      expect(stopColony(Number(key.slice(1))), key).toBeLessThanOrEqual(old.colony);
    }
  });

  it("keeps index-keyed claims from a save written after the rebrand", () => {
    expect(normalise({ colony: 5000, roadClaimed: ["f2", "p3"] }).roadClaimed)
      .toEqual(["f2", "p3"]);
  });

  it("still takes a saved balance over the default", () => {
    expect(normalise({ mycel: 7 }).mycel).toBe(7);
    expect(normalise({ mycel: 0 }).mycel).toBe(0);
    expect(normalise({ mycel: -5 }).mycel).toBe(0);
    expect(normalise({ mycel: "lots" }).mycel).toBe(defaultProfile().mycel);
  });
});
