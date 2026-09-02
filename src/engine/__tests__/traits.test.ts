/**
 * WHAT A TRAIT DOES TO THE GAME.
 *
 * The engine owns exactly three things about traits: a percentage on attack, a percentage
 * on defence, and a chance — drawn ONCE per match off the seeded stream — that the ability
 * comes back a turn sooner. Everything else about them is progression.
 *
 * The thing this file exists to hold is that none of it broke determinism. Combat is still
 * pure arithmetic, the boon is still the same for the whole match, and search still cannot
 * see a different roll from the one the real board is playing on.
 */
import { describe, expect, it } from "vitest";
import { NEUTRAL_MODS, SPECIES, TRAIT_PCT_CAP } from "..";
import { attackMultiplier, defenceMultiplier } from "../combat";
import { abilityCooldown } from "../abilities";
import { createGame, restore, snapshot } from "../state";
import type { PlayerMods } from "../types";

const mods = (over: Partial<PlayerMods> = {}): PlayerMods => ({ ...NEUTRAL_MODS, ...over });

const game = (over: Partial<PlayerMods> = {}, seed = 7) => createGame({
  map: "small",
  species: { you: "fire", ai: "ghost" },
  seed,
  mods: { you: mods(over), ai: mods() },
});

describe("a percentage on a fight", () => {
  it("multiplies attack and defence by what the traits add", () => {
    const state = game();
    const base = attackMultiplier(state, "you", mods());
    expect(attackMultiplier(state, "you", mods({ atkPct: 10 }))).toBeCloseTo(base * 1.1, 6);
    const baseDef = defenceMultiplier(state, "you", mods());
    expect(defenceMultiplier(state, "you", mods({ defPct: 25 }))).toBeCloseTo(baseDef * 1.25, 6);
  });

  it("leaves the fight alone when there are no traits", () => {
    const state = game();
    expect(attackMultiplier(state, "you", mods())).toBe(SPECIES.fire.atk);
  });

  /**
   * The tier table is DATA and it lives in the progression layer, which will be retuned by
   * somebody who has never read the engine. This is the floor under that: no table, and no
   * hand-edited save, may double a colony's punch.
   */
  it("refuses to let any table past the engine's own ceiling", () => {
    const state = game();
    const base = attackMultiplier(state, "you", mods());
    const absurd = attackMultiplier(state, "you", mods({ atkPct: 5000 }));
    expect(absurd).toBeCloseTo(base * (1 + TRAIT_PCT_CAP / 100), 6);
  });

  it("treats a negative percentage as none, never as a penalty", () => {
    const state = game();
    expect(attackMultiplier(state, "you", mods({ atkPct: -50 })))
      .toBe(attackMultiplier(state, "you", mods()));
  });

  // Combat is counted out by the player before they commit. A trait changes the numbers
  // that go IN; it may never change how the sum resolves.
  it("is still the same answer every time", () => {
    const state = game();
    const m = mods({ atkPct: 7 });
    const first = attackMultiplier(state, "you", m);
    for (let i = 0; i < 50; i++) expect(attackMultiplier(state, "you", m)).toBe(first);
  });
});

describe("the cooldown boon", () => {
  it("shaves a turn when the roll came in, and never more than one", () => {
    const ability = SPECIES.fire.ability;
    expect(abilityCooldown(ability, mods(), 0)).toBe(ability.cooldown);
    expect(abilityCooldown(ability, mods(), 1)).toBe(ability.cooldown - 1);
    expect(abilityCooldown(ability, mods(), 5)).toBe(ability.cooldown - 1);
  });

  it("stacks with maxed research, and still never goes under two turns", () => {
    const ability = SPECIES.ghost.ability;
    const maxed = mods({ reservoir: 5 });
    expect(abilityCooldown(ability, maxed, 1)).toBe(Math.max(2, ability.cooldown - 2));
    expect(abilityCooldown({ ...ability, cooldown: 2 }, maxed, 1)).toBe(2);
  });

  it("never rolls the boon for a colony with no cooldown traits", () => {
    for (let seed = 0; seed < 40; seed++) expect(game({}, seed).boon.you).toBe(0);
  });

  it("always rolls it for a colony that cannot miss", () => {
    for (let seed = 0; seed < 40; seed++) expect(game({ boonPct: 100 }, seed).boon.you).toBe(1);
  });

  /** A chance is a chance: over many seeds it lands about as often as it says. */
  it("lands about as often as the percentage says", () => {
    let hits = 0;
    for (let seed = 0; seed < 400; seed++) if (game({ boonPct: 50 }, seed).boon.you) hits++;
    expect(hits).toBeGreaterThan(140);
    expect(hits).toBeLessThan(260);
  });

  /**
   * ROLLED ONCE, FOR THE MATCH. A chance re-drawn on every cast would bring the same
   * ability back at a different speed each time, which reads as a bug rather than as luck.
   */
  it("is the same for the whole match", () => {
    const state = game({ boonPct: 60 }, 3);
    const was = state.boon.you;
    for (let i = 0; i < 20; i++) expect(state.boon.you).toBe(was);
  });

  /**
   * The stream is advanced whether or not there is anything to roll. A colony with no
   * cooldown traits that SKIPPED its draw would shift every later scatter in the match,
   * so two players with different traits would see different ability scatter from the
   * same seed — and the replay of one would not rebuild the other.
   */
  it("costs the same number of draws whether or not there is a chance", () => {
    expect(game({ boonPct: 0 }, 11).rng).toBe(game({ boonPct: 100 }, 11).rng);
  });

  /** Search must see the roll the real board is playing on, not one of its own. */
  it("travels with a snapshot", () => {
    const state = game({ boonPct: 100 }, 5);
    expect(state.boon.you).toBe(1);
    const saved = snapshot(state);
    state.boon.you = 0;
    restore(state, saved);
    expect(state.boon.you).toBe(1);
  });

  it("gives the same match from the same seed", () => {
    expect(game({ boonPct: 40 }, 99).boon).toEqual(game({ boonPct: 40 }, 99).boon);
  });
});
