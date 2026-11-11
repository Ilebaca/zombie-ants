import { describe, expect, it } from "vitest";
import {
  NEUTRAL_MODS, RESEARCH_STAT_CAP, SPECIES, SPECIES_LEVEL_MAX, abilityCooldown,
  attackMultiplier, cooldownChance, createGame, defenceMultiplier, endTurn,
  nextRandom, researchBoost, researchedStats, restore, snapshot, startTurn,
} from "../index";
import type { PlayerMods, SpeciesId } from "../index";

const mods = (researchLevel: number): PlayerMods => ({ ...NEUTRAL_MODS, researchLevel });

describe("unified species levels", () => {
  it("raises every species gradually from its base to capped attack, defence and cooldown chance", () => {
    for (const id of Object.keys(SPECIES) as SpeciesId[]) {
      const state = createGame({ map: "small", species: { you: id, ai: "fire" }, first: "you" });
      for (let level = 0; level <= SPECIES_LEVEL_MAX; level++) {
        const stats = researchedStats(id, level);
        expect(stats.attack).toBeCloseTo(SPECIES[id].atk * (1 + RESEARCH_STAT_CAP * level / 10));
        expect(stats.defence).toBeCloseTo(SPECIES[id].def * (1 + RESEARCH_STAT_CAP * level / 10));
        expect(stats.cooldown).toBe(level);
        expect(attackMultiplier(state, "you", mods(level))).toBe(stats.attack);
        expect(defenceMultiplier(state, "you", mods(level))).toBe(stats.defence);
      }
    }
    expect(researchBoost(999)).toBe(1.25);
    expect(cooldownChance(999)).toBe(10);
    expect(researchBoost(NaN)).toBe(1);
    expect(cooldownChance(-2)).toBe(0);
  });

  it("uses the new level instead of accidentally stacking legacy research", () => {
    const state = createGame({ map: "small", species: { you: "fire", ai: "carpenter" } });
    const mixed = { ...mods(10), mandible: 5, cuticle: 5, reservoir: 5 };
    expect(attackMultiplier(state, "you", mixed)).toBeCloseTo(SPECIES.fire.atk * 1.25);
    expect(defenceMultiplier(state, "you", mixed)).toBeCloseTo(SPECIES.fire.def * 1.25);
    expect(abilityCooldown(SPECIES.fire.ability, mixed)).toBe(SPECIES.fire.ability.cooldown);
  });

  it("preserves old match modifiers when the unified level is absent", () => {
    const state = createGame({ map: "small", species: { you: "fire", ai: "carpenter" } });
    const legacy = { ...NEUTRAL_MODS, mandible: 3, cuticle: 2, reservoir: 5 };
    expect(attackMultiplier(state, "you", legacy)).toBeCloseTo(SPECIES.fire.atk * 1.15);
    expect(defenceMultiplier(state, "you", legacy)).toBeCloseTo(SPECIES.fire.def * 1.1);
    expect(abilityCooldown(SPECIES.fire.ability, legacy)).toBe(SPECIES.fire.ability.cooldown - 1);
  });
});

describe("per-turn cooldown chance", () => {
  const state = () => {
    const s = createGame({ map: "small", species: { you: "fire", ai: "carpenter" }, first: "you" });
    s.cooldown = { you: 6, ai: 6 };
    return s;
  };
  // Choose both sides of a known threshold without making a probabilistic assertion.
  const seedFor = (hit: boolean, threshold = 0.1): number => {
    for (let seed = 1; seed < 10000; seed++) {
      if ((nextRandom({ rng: seed }) < threshold) === hit) return seed;
    }
    throw new Error("No deterministic fixture found");
  };

  it("removes precisely one extra turn on success, only from the current player", () => {
    const s = state();
    s.rng = seedFor(true);
    startTurn(s, { you: mods(10), ai: mods(10) });
    expect(s.cooldown).toEqual({ you: 4, ai: 6 });
    s.rng = seedFor(true);
    endTurn(s, { you: mods(10), ai: mods(10) });
    expect(s.cooldown).toEqual({ you: 4, ai: 4 });
  });

  it("uses the ordinary countdown when a roll misses", () => {
    const s = state();
    s.rng = seedFor(false);
    startTurn(s, { you: mods(10), ai: mods(10) });
    expect(s.cooldown.you).toBe(5);
  });

  it("uses the intermediate level's actual chance and caps oversized inputs at ten percent", () => {
    const seed = seedFor(true);
    const roll = nextRandom({ rng: seed }) * 100;
    const low = Math.floor(roll);
    const high = low + 1;
    const a = state(), b = state();
    a.rng = seed; b.rng = seed;
    startTurn(a, { you: mods(low), ai: mods(0) });
    startTurn(b, { you: mods(high), ai: mods(0) });
    expect(a.cooldown.you).toBe(5);
    expect(b.cooldown.you).toBe(4);
    const capped = state();
    capped.rng = seedFor(false);
    startTurn(capped, { you: mods(999), ai: mods(0) });
    expect(capped.cooldown.you).toBe(5);
  });

  it("does not roll at zero level, on a ready ability or once ordinary recharge reaches zero", () => {
    for (const [level, cooldown] of [[0, 6], [10, 0], [10, 1]]) {
      const s = state();
      s.cooldown.you = cooldown!;
      const before = s.rng;
      startTurn(s, { you: mods(level!), ai: mods(0) });
      expect(s.rng).toBe(before);
      expect(s.cooldown.you).toBe(Math.max(0, cooldown! - 1));
    }
  });

  it("restores cooldown and randomness after AI simulation, then produces the same turn", () => {
    const s = state();
    s.rng = seedFor(true);
    const before = snapshot(s);
    const events = startTurn(s, { you: mods(10), ai: mods(0) });
    const after = snapshot(s);
    restore(s, before);
    expect(snapshot(s)).toEqual(before);
    expect(startTurn(s, { you: mods(10), ai: mods(0) })).toEqual(events);
    expect(snapshot(s)).toEqual(after);
  });
});
