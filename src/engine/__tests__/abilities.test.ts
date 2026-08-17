import { describe, expect, it } from "vitest";
import { blankGame, put } from "./helpers";
import {
  NEUTRAL_MODS, PERMANENT, activateAbility, abilityCooldown, allTiles, createGame,
  moveOrAttack, defaultContext, recomputeConnectivity, snapshot, restore, startTurn, tile,
} from "../index";
import type { GameState, PlayerMods, SpeciesId } from "../index";

const mods = (over: Partial<PlayerMods> = {}): PlayerMods => ({ ...NEUTRAL_MODS, ...over });

/** A blank board with `you` fielding `species` and a nest already placed. */
function withSpecies(species: SpeciesId, map: "tiny" | "mid" = "mid"): GameState {
  const s = blankGame(map, { you: species, ai: "fire" });
  s.current = "you";
  s.cooldown.you = 0;
  return s;
}

describe("bud (Pharaoh)", () => {
  it("seeds a neighbour without costing the parent anything", () => {
    const s = withSpecies("pharaoh");
    const parent = put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 50 });
    recomputeConnectivity(s);

    const events = activateAbility(s, "you", mods());
    expect(events.some((e) => e.type === "budded")).toBe(true);
    expect(parent.soldiers).toBe(50);                 // budding, not splitting
    const budded = allTiles(s).filter((t) => t.owner === "you" && t !== parent);
    expect(budded).toHaveLength(1);
    expect(budded[0]?.struct).toBe("stable");
  });

  it("does nothing below 40 troops", () => {
    const s = withSpecies("pharaoh");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 39 });
    recomputeConnectivity(s);
    expect(activateAbility(s, "you", mods())).toHaveLength(0);
    expect(s.cooldown.you).toBe(0);                   // a no-op must not burn the cooldown
  });
});

describe("leaf (Leafcutter)", () => {
  /**
   * CLAUDE.md §5: the cap is the TOTAL a player may ever hold, and each cast promotes at
   * most one new leaf. A per-cast reading let the board fill with permanent walls.
   */
  it("promotes at most one leaf per cast, up to a running total", () => {
    const s = withSpecies("leafcutter");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 5 });
    put(s, 11, 11, { owner: "ai", struct: "nest", soldiers: 10 });   // or checkWipe ends it
    recomputeConnectivity(s);

    const permanentCount = (): number =>
      s.effects.filter((e) => e.kind === "leaf" && e.owner === "you" && e.left >= PERMANENT).length;

    const research = mods({ reservoir: 5 });          // cap of 3
    activateAbility(s, "you", research);
    expect(permanentCount()).toBe(1);

    // A cast only ever walls ground that has no leaf on it yet, so let the temporary walls
    // wither before casting again — otherwise there is nothing fresh to promote.
    s.effects = s.effects.filter((e) => e.kind !== "leaf" || e.left >= PERMANENT);
    s.cooldown.you = 0;
    activateAbility(s, "you", research);
    expect(permanentCount()).toBe(2);                 // one more, not a fresh batch

    s.effects = s.effects.filter((e) => e.kind !== "leaf" || e.left >= PERMANENT);
    s.cooldown.you = 0;
    activateAbility(s, "you", research);
    expect(permanentCount()).toBe(3);

    // capped: further casts still wall the border, but grant no more permanent leaves
    s.effects = s.effects.filter((e) => e.kind !== "leaf" || e.left >= PERMANENT);
    s.cooldown.you = 0;
    activateAbility(s, "you", research);
    expect(permanentCount()).toBe(3);
  });

  it("grants no permanent leaves below research level 2", () => {
    const s = withSpecies("leafcutter");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);
    activateAbility(s, "you", mods({ reservoir: 1 }));
    expect(s.effects.some((e) => e.left >= PERMANENT)).toBe(false);
  });

  it("armours the border immediately, not only once the walls wither", () => {
    const s = withSpecies("leafcutter");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);
    activateAbility(s, "you", mods());
    expect(s.effects.some((e) => e.kind === "armor" && e.c === 1 && e.r === 1)).toBe(true);
  });
});

describe("swarm (Army Ant)", () => {
  /**
   * CLAUDE.md §5: targets are snapshotted at cast time. Resolving while mutating let a tile
   * captured by the bite seed new targets, cascading across the whole map.
   */
  it("does not cascade through tiles it captures", () => {
    const s = withSpecies("army");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 20 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 10 });
    // a chain of weak enemy tiles: only the one touching us at cast time may be eaten
    put(s, 3, 1, { owner: "ai", struct: "stable", soldiers: 1 });
    put(s, 4, 1, { owner: "ai", struct: "stable", soldiers: 1 });
    put(s, 5, 1, { owner: "ai", struct: "stable", soldiers: 1 });
    recomputeConnectivity(s);

    activateAbility(s, "you", mods());
    expect(tile(s, 3, 1).owner).toBe("you");          // eaten, it bordered us
    expect(tile(s, 4, 1).owner).toBe("ai");           // untouched — it did not border us at cast time
    expect(tile(s, 5, 1).owner).toBe("ai");
  });

  it("never bites a nest", () => {
    const s = withSpecies("army");
    put(s, 1, 1, { owner: "you", struct: "stable", soldiers: 20 });
    const enemyNest = put(s, 2, 1, { owner: "ai", struct: "nest", soldiers: 8 });
    recomputeConnectivity(s);
    activateAbility(s, "you", mods());
    expect(enemyNest.soldiers).toBe(8);
  });
});

describe("fortify (Carpenter)", () => {
  it("thickens frontline garrisons but never veins", () => {
    const s = withSpecies("carpenter");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    const vein = put(s, 2, 1, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 3, 1, { owner: "ai", struct: "stable", soldiers: 5 });
    recomputeConnectivity(s);

    activateAbility(s, "you", mods());
    expect(vein.soldiers).toBe(0);                    // veins are infrastructure (§4.5)
    expect(s.shield.you).toBeGreaterThan(0);
  });
});

describe("flee (Demon)", () => {
  it("cannot push veins, tunnels, resources, nests or the hive", () => {
    const s = withSpecies("demon");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    const vein = put(s, 2, 1, { owner: "ai", struct: "vein", soldiers: 0 });
    const tunnel = put(s, 1, 2, { owner: "ai", struct: "stable", soldiers: 5, tunnel: true });
    const resource = put(s, 2, 2, { owner: "ai", struct: "stable", soldiers: 4, terrain: "resource" });
    const nest = put(s, 3, 1, { owner: "ai", struct: "nest", soldiers: 9 });
    recomputeConnectivity(s);

    activateAbility(s, "you", mods());
    expect(vein.owner).toBe("ai");
    expect(vein.struct).toBe("vein");
    expect(tunnel.owner).toBe("ai");
    expect(tunnel.tunnel).toBe(true);
    expect(resource.owner).toBe("ai");
    expect(nest.owner).toBe("ai");
  });

  /** CLAUDE.md §5: flee relocates garrisons only. Pruning here destroyed trails. */
  it("leaves the enemy's trail structure intact", () => {
    const s = withSpecies("demon");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 6, 6, { owner: "ai", struct: "nest", soldiers: 10 });
    const trail = [put(s, 5, 6, { owner: "ai", struct: "vein", soldiers: 0 }),
                   put(s, 4, 6, { owner: "ai", struct: "vein", soldiers: 0 })];
    put(s, 3, 1, { owner: "ai", struct: "stable", soldiers: 6 });
    recomputeConnectivity(s);

    activateAbility(s, "you", mods());
    for (const v of trail) {
      expect(v.owner).toBe("ai");
      expect(v.struct).toBe("vein");
    }
  });

  it("moves a mobile garrison away from the caster", () => {
    const s = withSpecies("demon");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "ai", struct: "stable", soldiers: 6 });
    recomputeConnectivity(s);

    const events = activateAbility(s, "you", mods());
    const fled = events.find((e) => e.type === "fled");
    expect(fled).toBeDefined();
    expect(tile(s, 2, 1).owner).not.toBe("ai");       // it vacated
  });
});

describe("tunnel (Ghost)", () => {
  it("digs a gallery paid for out of the colony's spare workers", () => {
    const s = withSpecies("ghost");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 20 });
    recomputeConnectivity(s);

    const events = activateAbility(s, "you", mods(), { target: { c: 5, r: 5 } });
    expect(events.some((e) => e.type === "tunnelDug")).toBe(true);
    const mouth = tile(s, 5, 5);
    expect(mouth.owner).toBe("you");
    expect(mouth.tunnel).toBe(true);
    expect(mouth.soldiers).toBe(5);
    expect(tile(s, 1, 1).soldiers).toBe(15);          // the diggers marched from home
  });

  it("refuses when the colony cannot spare five workers", () => {
    const s = withSpecies("ghost");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 4 });
    recomputeConnectivity(s);
    expect(activateAbility(s, "you", mods(), { target: { c: 5, r: 5 } })).toHaveLength(0);
    expect(tile(s, 5, 5).owner).toBeNull();
  });

  it("cannot dig onto an occupied or guarded tile", () => {
    const s = withSpecies("ghost");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 20 });
    put(s, 5, 5, { owner: null, guard: 3 });
    recomputeConnectivity(s);
    expect(activateAbility(s, "you", mods(), { target: { c: 5, r: 5 } })).toHaveLength(0);
  });

  it("starts the match already recharging, so there is no turn-one beachhead", () => {
    const s = createGame({ map: "small", species: { you: "ghost", ai: "fire" } });
    expect(s.cooldown.you).toBeGreaterThan(0);
  });
});

describe("cooldown and cost", () => {
  it("only spends the cooldown when the ability actually fires", () => {
    const weaver = withSpecies("weaver");
    // Spread only claims ground on the enemy's side of the diagonal (c > r for "you").
    // Sitting at (1,3), every neighbour is still on our own side, so it has nothing to take.
    put(weaver, 1, 3, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(weaver);
    expect(activateAbility(weaver, "you", mods())).toHaveLength(0);
    expect(weaver.cooldown.you).toBe(0);
  });

  it("shortens the cooldown by one turn only at max research", () => {
    const ability = { name: "x", kind: "fire" as const, cooldown: 6, desc: "" };
    expect(abilityCooldown(ability, mods({ reservoir: 4 }))).toBe(6);
    expect(abilityCooldown(ability, mods({ reservoir: 5 }))).toBe(5);
    expect(abilityCooldown({ ...ability, cooldown: 2 }, mods({ reservoir: 5 }))).toBe(2);  // floor
  });
});

describe("determinism", () => {
  /**
   * Venom scatters, but from the seeded stream on GameState — never Math.random(). If this
   * breaks, AI search stops being reproducible and replays become impossible.
   */
  it("replays identically from the same seed", () => {
    const run = (): string => {
      const s = blankGame("mid", { you: "bullet", ai: "fire" });
      s.rng = 12345;
      s.current = "you";
      put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
      put(s, 6, 6, { owner: "ai", struct: "nest", soldiers: 10 });
      recomputeConnectivity(s);
      activateAbility(s, "you", mods());
      return JSON.stringify(s.effects.map((e) => [e.c, e.r, e.kind]).sort());
    };
    expect(run()).toBe(run());
  });

  it("gives different scatter for different seeds", () => {
    const run = (seed: number): string => {
      const s = blankGame("mid", { you: "bullet", ai: "fire" });
      s.rng = seed;
      s.current = "you";
      put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
      recomputeConnectivity(s);
      activateAbility(s, "you", mods());
      return JSON.stringify(s.effects.map((e) => [e.c, e.r]).sort());
    };
    expect(run(1)).not.toBe(run(999));
  });

  /** Simulation must not advance the real match's stream (CLAUDE.md §5). */
  it("restores the generator with the board", () => {
    const s = blankGame("mid", { you: "bullet", ai: "fire" });
    s.rng = 4242;
    s.current = "you";
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);

    const snap = snapshot(s);
    activateAbility(s, "you", mods());
    expect(s.rng).not.toBe(4242);
    restore(s, snap);
    expect(s.rng).toBe(4242);
  });
});

describe("wildfire", () => {
  it("burns wild garrisons and the hive, not only the enemy", () => {
    const s = withSpecies("fire");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    const wild = put(s, 2, 1, { owner: null, guard: 10 });
    recomputeConnectivity(s);

    activateAbility(s, "you", mods());
    s.current = "you";
    startTurn(s, { you: mods(), ai: mods() });
    expect(wild.guard).toBeLessThan(10);
  });

  it("never ignites a nest", () => {
    const s = withSpecies("fire");
    put(s, 1, 1, { owner: "you", struct: "stable", soldiers: 10 });
    put(s, 2, 1, { owner: "ai", struct: "nest", soldiers: 8 });
    recomputeConnectivity(s);
    activateAbility(s, "you", mods());
    expect(s.effects.some((e) => e.kind === "fire" && e.c === 2 && e.r === 1)).toBe(false);
  });
});

describe("abilities never break the board", () => {
  it("leaves every colony connected to its nest after any cast", () => {
    const casters: SpeciesId[] = ["pharaoh", "leafcutter", "fire", "army", "weaver", "carpenter", "bullet", "demon"];
    for (const species of casters) {
      const s = withSpecies(species);
      put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 45 });
      put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 8 });
      put(s, 3, 1, { owner: "ai", struct: "stable", soldiers: 6 });
      put(s, 8, 8, { owner: "ai", struct: "nest", soldiers: 10 });
      recomputeConnectivity(s);

      activateAbility(s, "you", mods());
      // a tile can be owned by nobody, but never owned with a nonsense structure
      for (const t of allTiles(s)) {
        if (t.owner === null) expect(t.soldiers).toBe(0);
        else expect(t.struct).not.toBeNull();
      }
    }
  });

  it("does not consume the turn — abilities are a free extra action", () => {
    const s = withSpecies("carpenter");
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "ai", struct: "stable", soldiers: 3 });
    recomputeConnectivity(s);

    activateAbility(s, "you", mods());
    expect(s.current).toBe("you");
    // and the player can still move afterwards
    const before = tile(s, 2, 1).soldiers;
    moveOrAttack(s, { c: 1, r: 1 }, { c: 2, r: 1 }, defaultContext());
    expect(tile(s, 2, 1).soldiers).not.toBe(before);
  });
});
