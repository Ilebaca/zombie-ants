import { describe, expect, it } from "vitest";
import {
  HATCH_AVATARS, MemoryStore, ProfileStore, hatchAvatarTier,
  lockedAvatars, rollDrop, rollHatchAvatar,
} from "../index";
import { BAG_MAX } from "../profile";
import { TIER_IDS } from "../../engine";

const store = (larva = 20): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => { p.colony = 2_000_000; p.larva = larva; p.unlocked = ["leafcutter", "fire"]; });
  return s;
};
const draws = (...values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++] ?? 0.5;
};
const tierRolls = [0.1, 0.7, 0.9, 0.97, 0.995];

describe("hatch payout distribution", () => {
  it("pays grey traits before the avatar collection is complete", () => {
    const s = store();
    const prize = s.hatch(draws(0.2, 0.1, 0.1));
    expect(prize?.kind).toBe("trait");
    if (prize?.kind === "trait") expect(prize.item.tier).toBe("common");
    expect(s.avatars).toEqual([]);
    expect(s.get().larva).toBe(19);
  });

  it("keeps the tier for both avatar and trait outcomes across Common–Rare", () => {
    for (let t = 0; t < 3; t++) {
      for (const gate of [0, 0.099999, 0.1, 0.999999]) {
        const s = store();
        const prize = s.hatch(draws(0.2, tierRolls[t]!, gate, 0.5));
        expect(prize?.kind).toBe(gate < 0.1 ? "avatar" : "trait");
        if (prize?.kind === "avatar") expect(hatchAvatarTier(prize.id)).toBe(TIER_IDS[t]);
        if (prize?.kind === "trait") expect(prize.item.tier).toBe(TIER_IDS[t]);
        expect(s.get().larva).toBe(19);
        expect(s.bag.length + s.avatars.length).toBe(1);
      }
    }
  });

  it("does not replace Exceptional or Mythic rewards with avatars", () => {
    for (const t of [3, 4]) {
      const s = store();
      const prize = s.hatch(draws(0.2, tierRolls[t]!, 0));
      expect(prize?.kind).toBe("skin");
      if (prize?.kind === "skin") expect(prize.look.tier).toBe(TIER_IDS[t]);
      expect(s.avatars).toEqual([]);
    }
  });

  it("falls back within an exhausted avatar rarity, even with other rarities unowned", () => {
    for (let t = 0; t < 3; t++) {
      const s = store();
      for (const id of lockedAvatars([], TIER_IDS[t]!)) s.findAvatar(id);
      const before = s.avatars.length;
      const prize = s.hatch(draws(0.2, tierRolls[t]!, 0, 0));
      expect(prize?.kind).toBe("trait");
      if (prize?.kind === "trait") expect(prize.item.tier).toBe(TIER_IDS[t]);
      expect(s.avatars.length).toBe(before);
      expect(before).toBeLessThan(HATCH_AVATARS.length);
      expect(s.get().larva).toBe(19);
    }
  });

  it("pays mixed batches exactly once per larva and preserves owned rewards on reload", () => {
    const storage = new MemoryStore();
    const s = new ProfileStore(storage);
    s.update((p) => { p.colony = 2_000_000; p.larva = 10; });
    const values = Array.from({ length: 10 }, (_, i) =>
      i % 3 === 0 ? [0.2, 0.1, 0, 0.5] : [0.2, 0.1, 0.5]).flat();
    const prizes = s.hatchMany(10, draws(...values));
    expect(prizes).toHaveLength(10);
    expect(prizes.filter((p) => p.kind === "trait")).toHaveLength(6);
    expect(prizes.filter((p) => p.kind === "avatar")).toHaveLength(4);
    expect(new Set(s.avatars).size).toBe(4);
    expect(s.get().larva).toBe(0);
    const reloaded = new ProfileStore(storage);
    expect(reloaded.avatars).toEqual(s.avatars);
    expect(reloaded.bag).toEqual(s.bag);
  });

  it("never spends larva on a trait that a full bag cannot hold", () => {
    const s = store();
    // Obtain a valid definition from the production hatch path.
    {
      const first = s.hatch(draws(0.2, 0.1, 0.5));
      if (first?.kind !== "trait") throw new Error("Missing trait");
      for (let i = s.bag.length; i < BAG_MAX; i++) s.findTrait(first.item.def, "common");
    }
    const before = s.get().larva;
    expect(s.bag).toHaveLength(BAG_MAX);
    expect(s.hatch(draws(0.2, 0.1, 0.5))).toBeNull();
    expect(s.hatchMany(10, draws(0.2, 0.1, 0.5))).toEqual([]);
    expect(s.get().larva).toBe(before);
    // Cosmetic awards remain collectible without a bag slot.
    expect(s.hatch(draws(0.2, 0.1, 0, 0))?.kind).toBe("avatar");
    expect(s.get().larva).toBe(before - 1);
  });

  it("matches the displayed rarity weights and the conditional 10% avatar rate in 100,000 rolls", () => {
    let seed = 20261115;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const tiers = Object.fromEntries(TIER_IDS.map((t) => [t, 0]));
    let avatars = 0, greyTraits = 0;
    const total = 100_000;
    for (let i = 0; i < total; i++) {
      const drop = rollDrop(random, [null, "leafcutter", "fire"])!;
      tiers[drop.tier]!++;
      // Fresh pools model a player with avatars still available: depletion must not
      // conceal an inflated avatar rate.
      const avatar = rollHatchAvatar(random, [], drop.tier);
      if (avatar) {
        avatars++;
        expect(hatchAvatarTier(avatar)).toBe(drop.tier);
      } else if (drop.tier === "common") greyTraits++;
    }
    const expected = [60, 25, 10, 4, 1];
    for (let i = 0; i < TIER_IDS.length; i++) {
      expect(Math.abs(tiers[TIER_IDS[i]!]! / total * 100 - expected[i]!)).toBeLessThan(0.5);
    }
    expect(Math.abs(avatars / total * 100 - 9.5)).toBeLessThan(0.5);
    expect(Math.abs(greyTraits / total * 100 - 54)).toBeLessThan(0.5);
    console.info("Hatch audit", { total, tiers, avatars, greyTraits });
  });
});
