/**
 * SKINS — an appearance, not an item.
 *
 * What matters here is the difference between a skin and a trait, because almost every
 * bug this feature can have is one of them being treated as the other: a skin has no uid,
 * no bag and no slot, finding one twice is finding it once, and a colony can only ever
 * wear one of its own.
 */
import { describe, expect, it } from "vitest";
import { LOOKS, UNLOCKABLE_LOOKS, basicLook, lookById, looksFor } from "../../engine";
import { SPECIES } from "../../engine";
import type { SpeciesId } from "../../engine";
import { MemoryStore, ProfileStore, defaultProfile, normalise } from "../index";
import { SKIN_CHANCE, lockedLooks, rollSkin, skinProgress } from "../skins";

const ALL = Object.keys(SPECIES) as SpeciesId[];

/**
 * The body colour every colony is drawn in, copied rather than imported: `platform/` may
 * not reach into `render/` (eslint.config.js), and the point of this test is precisely to
 * measure against those values. A change to one that is not made here shows up as a skin
 * that suddenly passes when it should not, which is why the list is kept short and named.
 */
const SPECIES_BODY: Record<SpeciesId, string> = {
  ghost: "#eaf2ff", pharaoh: "#ffc62f", leafcutter: "#56d840", fire: "#ff8f43",
  army: "#cf9354", weaver: "#ffa636", carpenter: "#a3adc4", bullet: "#ec4763",
  demon: "#ff54d4",
};

const store = (larva = 0): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => { p.colony = 2_000_000; p.larva = larva; });
  return s;
};

describe("the catalogue", () => {
  /** Milan's ask, held as a number: two skins beside the basic one, on every colony. */
  it("gives every colony a basic look and two to find", () => {
    for (const id of ALL) {
      const list = looksFor(id);
      expect(list.length, `${id} does not have three looks`).toBe(3);
      expect(basicLook(id).id).toBe(list[0]?.id);
      expect(basicLook(id).style, `${id}'s basic look is not bare`).toBeNull();
      expect(basicLook(id).pal, `${id}'s basic look overrides its colours`).toBeUndefined();
    }
    expect(UNLOCKABLE_LOOKS.length).toBe(ALL.length * 2);
  });

  /**
   * NO SKIN MAY LOOK LIKE ANOTHER COLONY. An opponent always fields its basic look, so a
   * palette landing on some other species' own colours is not a skin — it is a colony the
   * player cannot identify across the board. Two did on the first pass: a pink Leafcutter
   * read as a Demon Ant and a gold Weaver as a Pharaoh.
   */
  it("keeps every palette clear of every other colony's own colours", () => {
    const rgb = (hex: string): [number, number, number] => [
      parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
    ];
    const apart = (a: string, b: string): number => {
      const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
      return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
    };
    // The BODY colour is the one a tile is filled with, so that is the one that has to
    // stand apart. 90 out of a possible 765 is about a third of one channel.
    const body = (id: SpeciesId): string => SPECIES_BODY[id];
    for (const look of UNLOCKABLE_LOOKS) {
      if (!look.pal) continue;
      for (const other of ALL) {
        if (other === look.species) continue;
        expect(apart(look.pal[1], body(other)),
          `${look.name} is too close to the ${other} colony's own colour`)
          .toBeGreaterThan(90);
      }
    }
  });

  it("keeps every id unique and every look on its own colony", () => {
    const seen = new Set<string>();
    for (const id of ALL) {
      for (const look of looksFor(id)) {
        expect(seen.has(look.id), `two looks share the id ${look.id}`).toBe(false);
        seen.add(look.id);
        expect(look.species, `${look.id} is filed under the wrong colony`).toBe(id);
        expect(lookById(look.id)).toBe(look);
      }
    }
    expect(lookById("nothing.at.all")).toBeNull();
  });

  /**
   * The two found looks have to differ from the basic one and from each other, or a
   * player opens a hatch, finds a skin and cannot see that anything changed.
   */
  it("makes every found look different from the one before it", () => {
    for (const id of ALL) {
      const [, drawn, colour] = looksFor(id);
      // The second is the DRAWN one: an overlay, and usually its own nest.
      expect(drawn?.style, `${id}'s first skin draws nothing`).not.toBeNull();
      // The third is the COLOURWAY, which is what carries onto every tile it holds.
      expect(colour?.pal, `${id}'s second skin recolours nothing`).toBeTruthy();
      expect(colour?.pal).toHaveLength(3);
      expect(drawn?.name).not.toBe(colour?.name);
    }
  });
});

describe("finding one", () => {
  const feed = (values: number[]): (() => number) => {
    let i = 0;
    return () => values[i++ % values.length] ?? 0;
  };

  /** The same rule the trait pool follows: a skin you cannot wear is not a prize. */
  it("only offers skins for colonies the player owns", () => {
    const mine: SpeciesId[] = ["fire", "ghost"];
    for (const look of lockedLooks(mine, [])) {
      expect(mine, `offered a ${look.species} skin`).toContain(look.species);
    }
    expect(lockedLooks(mine, []).length).toBe(4);
  });

  it("never offers one that has already been found", () => {
    const first = looksFor("fire")[1]!;
    const left = lockedLooks(["fire"], [first.id]);
    expect(left.map((l) => l.id)).not.toContain(first.id);
    expect(left.length).toBe(1);
  });

  /**
   * NULL IS NOT A FAILURE. It is what makes a completed collection fall through to a
   * trait instead of eating the larva — the last skin found must not make the hatch worse.
   */
  it("answers null once there is nothing left to find", () => {
    const all = looksFor("fire").slice(1).map((l) => l.id);
    expect(rollSkin(feed([0.5]), ["fire"], all)).toBeNull();
    expect(rollSkin(feed([0.5]), [], [])).toBeNull();
  });

  it("counts a colony's own collection", () => {
    expect(skinProgress("fire", [])).toEqual({ has: 0, of: 2 });
    expect(skinProgress("fire", [looksFor("fire")[1]!.id])).toEqual({ has: 1, of: 2 });
    // A basic look is not a find, so naming it changes nothing.
    expect(skinProgress("fire", [basicLook("fire").id])).toEqual({ has: 0, of: 2 });
  });
});

describe("owning and wearing one", () => {
  it("unlocks a look once, however many times it is found", () => {
    const s = store();
    const look = looksFor("fire")[1]!;
    expect(s.findSkin(look.id)).toBe(look);
    expect(s.findSkin(look.id)).toBe(look);
    expect(s.skins).toEqual([look.id]);
  });

  /** A basic look is what everybody has, so it is never stored as something found. */
  it("refuses to unlock a basic look, or one that does not exist", () => {
    const s = store();
    expect(s.findSkin(basicLook("fire").id)).toBeNull();
    expect(s.findSkin("nope")).toBeNull();
    expect(s.skins).toEqual([]);
  });

  it("wears one that has been found, and reports it everywhere", () => {
    const s = store();
    const look = looksFor("ghost")[2]!;
    expect(s.lookFor("ghost")).toBe(basicLook("ghost"));
    s.findSkin(look.id);
    expect(s.wearSkin("ghost", look.id)).toBe(true);
    expect(s.lookFor("ghost")).toBe(look);
  });

  it("refuses a look that has not been found", () => {
    const s = store();
    const look = looksFor("ghost")[1]!;
    expect(s.wearSkin("ghost", look.id)).toBe(false);
    expect(s.lookFor("ghost")).toBe(basicLook("ghost"));
  });

  /** Impossible by construction, and refused in the one place rather than in five. */
  it("refuses another colony's look", () => {
    const s = store();
    const fire = looksFor("fire")[1]!;
    s.findSkin(fire.id);
    expect(s.wearSkin("ghost", fire.id)).toBe(false);
    expect(s.lookFor("ghost")).toBe(basicLook("ghost"));
  });

  /**
   * Going back to basic is CLEARING the field, not writing its id. Two ways to spell one
   * state is two states to keep in step.
   */
  it("puts a skin back by wearing the basic look", () => {
    const s = store();
    const look = looksFor("fire")[1]!;
    s.findSkin(look.id);
    s.wearSkin("fire", look.id);
    expect(s.wearSkin("fire", basicLook("fire").id)).toBe(true);
    expect(s.lookFor("fire")).toBe(basicLook("fire"));
    expect(s.get().look.fire).toBeUndefined();
    // ...and it is still owned, so it can go straight back on.
    expect(s.hasSkin(look.id)).toBe(true);
  });
});

describe("hatching one", () => {
  /** A skin is a different KIND of prize, so the union says which arrived. */
  it("pays a skin when the roll lands on one", () => {
    const s = store(1);
    // First draw decides skin-or-trait; the second picks which skin.
    const prize = s.hatch(feedOf([0, 0]));
    expect(prize?.kind).toBe("skin");
    if (prize?.kind === "skin") {
      expect(s.hasSkin(prize.look.id)).toBe(true);
      expect(s.get().unlocked).toContain(prize.look.species);
    }
    expect(s.get().larva).toBe(0);
    expect(s.bag.length, "a skin went into the bag").toBe(0);
  });

  it("pays a trait when it does not", () => {
    const s = store(1);
    const prize = s.hatch(feedOf([0.99, 0.3, 0.3]));
    expect(prize?.kind).toBe("trait");
    expect(s.skins).toEqual([]);
    expect(s.bag.length).toBe(1);
  });

  /**
   * THE CHASE MUST NOT DEAD-END. With every skin found, a roll that wanted one falls
   * through to a trait rather than spending the larva on nothing.
   */
  it("falls through to a trait once every skin is found", () => {
    const s = store(1);
    const owned = s.get().unlocked;
    for (const look of lockedLooks(owned, [])) s.findSkin(look.id);
    const before = s.skins.length;
    const prize = s.hatch(feedOf([0, 0.3, 0.3]));
    expect(prize?.kind, "a full collection ate the larva").toBe("trait");
    expect(s.skins.length).toBe(before);
    expect(s.get().larva).toBe(0);
  });

  it("takes nothing when there is no larva", () => {
    const s = store(0);
    expect(s.hatch(feedOf([0, 0]))).toBeNull();
    expect(s.skins).toEqual([]);
    expect(s.bag.length).toBe(0);
  });

  /** Printed on the screen, so it has to be a real number a player can act on. */
  it("keeps the skin chance small enough to be an event", () => {
    expect(SKIN_CHANCE).toBeGreaterThan(0.02);
    expect(SKIN_CHANCE).toBeLessThan(0.2);
  });
});

describe("reading a save back", () => {
  it("starts a new colony with nothing found and nothing worn", () => {
    expect(defaultProfile().skins).toEqual([]);
    expect(defaultProfile().look).toEqual({});
  });

  it("drops a skin this build no longer has", () => {
    const p = normalise({ skins: ["fi_lava", "gone.forever", 7] });
    expect(p.skins).toEqual(["fi_lava"]);
  });

  /** A basic look in the set would make "how many skins" depend on how many colonies. */
  it("drops a basic look out of the found set", () => {
    expect(normalise({ skins: [basicLook("fire").id] }).skins).toEqual([]);
  });

  it("un-wears a look the save never found", () => {
    expect(normalise({ skins: [], look: { fire: "fi_lava" } }).look).toEqual({});
  });

  it("un-wears another colony's look", () => {
    const p = normalise({ skins: ["fi_lava"], look: { ghost: "fi_lava" } });
    expect(p.look).toEqual({});
  });

  it("keeps a look that was really found", () => {
    const p = normalise({ skins: ["fi_lava"], look: { fire: "fi_lava" } });
    expect(p.look).toEqual({ fire: "fi_lava" });
  });

  /** The whole table is reachable, or a look is in the game and can never be found. */
  it("can find every look in the catalogue", () => {
    const all = Object.values(LOOKS).flat();
    expect(all.length).toBe(ALL.length * 3);
    for (const look of all) expect(lookById(look.id)).toBe(look);
  });
});

/** A stream that walks a fixed list, so a roll is a fact rather than a coin flip. */
function feedOf(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0.5;
}
