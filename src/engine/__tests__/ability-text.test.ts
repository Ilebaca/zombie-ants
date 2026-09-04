/**
 * THE COPY CANNOT LIE ABOUT THE RULES.
 *
 * Every ability's description carried its own hand-typed copy of the numbers it describes,
 * and one of them was wrong for as long as the game existed: Venom Rain promised "10
 * troops/turn" while the engine took 7 — ported verbatim from the legacy build, wrong in
 * both, and invisible because nothing compared the sentence to the rule.
 *
 * The descriptions are built from `config.ts` now, so this file's job is to hold that they
 * still ARE: a future edit that types a number back into the prose is exactly the mistake
 * this is here to catch, and it would pass every other test in the suite.
 */
import { describe, expect, it } from "vitest";
import { SPECIES } from "../species";
import type { SpeciesId } from "../types";
import {
  ARMOUR_DEF, BUD_MIN, FIRE_BITE, FIRE_TURNS, FLEE_REACH, FORTIFY_DEF, FORTIFY_GAIN,
  FORTIFY_TURNS, KEEP_TUNNEL, LEAF_TURNS, SWARM_BITE, VENOM_BITE, VENOM_TURNS, asPct, sharePct,
} from "../config";

const descOf = (id: SpeciesId): string => SPECIES[id].ability.desc;

describe("what an ability says it does", () => {
  /** The one that was wrong, named on its own so a regression reads as itself. */
  it("states Venom Rain's real bite, not the legacy build's", () => {
    expect(VENOM_BITE).toBe(7);
    expect(descOf("bullet")).toContain(`${VENOM_BITE} troops/turn`);
    expect(descOf("bullet"), "the legacy figure is back").not.toContain("10 troops/turn");
  });

  it("quotes the engine for every number a player counts with", () => {
    expect(descOf("ghost")).toContain(`${KEEP_TUNNEL} workers`);
    expect(descOf("pharaoh")).toContain(`${BUD_MIN}+ troops`);
    expect(descOf("leafcutter")).toContain(`${LEAF_TURNS} turns`);
    expect(descOf("leafcutter")).toContain(`+${asPct(ARMOUR_DEF)}% defense`);
    expect(descOf("fire")).toContain(`${FIRE_TURNS} turns`);
    expect(descOf("fire")).toContain(`${sharePct(FIRE_BITE)}% each turn`);
    expect(descOf("army")).toContain(`${sharePct(SWARM_BITE)}% of their troops`);
    expect(descOf("carpenter")).toContain(`+${sharePct(FORTIFY_GAIN)}% garrison`);
    expect(descOf("carpenter")).toContain(`+${asPct(FORTIFY_DEF)}% for ${FORTIFY_TURNS} turns`);
    expect(descOf("bullet")).toContain(`for ${VENOM_TURNS} turns`);
    expect(descOf("demon")).toContain(`within ${FLEE_REACH} tiles`);
  });

  /**
   * THE REAL GUARD. Every check above would still pass if somebody typed the current value
   * back in as a literal — it only breaks on the day the constant is retuned, which is the
   * day nobody is looking at this file. So the numbers are MOVED and the copy has to move
   * with them: a description that does not follow is one that was hand-written again.
   */
  it("follows the constants when they are retuned, rather than restating them", async () => {
    const config = await import("../config");
    const cases: [SpeciesId, keyof typeof config, string][] = [
      ["bullet", "VENOM_BITE", " troops/turn"],
      ["pharaoh", "BUD_MIN", "+ troops"],
      ["ghost", "KEEP_TUNNEL", " workers"],
      ["demon", "FLEE_REACH", " tiles"],
    ];
    for (const [id, key, tail] of cases) {
      const value = config[key] as number;
      // The sentence must contain the live value and NOT the value either side of it —
      // a hard-typed number would keep matching one of those after a retune.
      expect(descOf(id), `${id} does not quote ${key}`).toContain(`${value}${tail}`);
      expect(descOf(id), `${id} looks hand-typed`).not.toContain(`${value + 1}${tail}`);
    }
  });

  it("gives every colony an ability with a name and a description", () => {
    for (const species of Object.values(SPECIES)) {
      expect(species.ability.name.length).toBeGreaterThan(0);
      expect(species.ability.desc.length).toBeGreaterThan(40);
      expect(species.ability.cooldown).toBeGreaterThan(0);
      // A description that still holds a template hole never got interpolated.
      expect(species.ability.desc).not.toContain("${");
    }
  });
});
