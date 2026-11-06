/**
 * THE NINETY-EIGHT FACES, AND THE THREE WAYS ONE IS COME BY.
 *
 * Almost everything here is about the TABLE rather than about behaviour, and that is the
 * point: which avatar is free, which chapter pays which and which are left for the hatch
 * is a judgement somebody made looking at ninety-eight pictures, and the only thing a
 * test can hold is that the judgement is still internally consistent — nothing in two
 * places, nothing in none, and a file for every id that ships.
 */
import { describe, expect, it } from "vitest";
import {
  AVATAR_IDS, AVATAR_TIER, DEFAULT_AVATAR, FREE_AVATARS, HATCH_AVATARS, ROAD_AVATARS,
  ROAD_CHAPTERS, avatarProgress, avatarTier, faceOf, isAvatar, isFreeAvatar, lockedAvatars,
  roadAvatar, rollAvatar,
} from "../index";
import { TIER_IDS } from "../../engine";
import { MemoryStore, ProfileStore, defaultProfile, normalise } from "../index";

describe("the avatar catalogue", () => {
  it("has ninety-eight distinct faces", () => {
    expect(AVATAR_IDS.length).toBe(98);
    expect(new Set(AVATAR_IDS).size).toBe(AVATAR_IDS.length);
    for (const id of AVATAR_IDS) expect(id).toMatch(/^av\d+$/);
  });

  /**
   * TEN FREE, FIFTY ON THE ROAD, THE REST IN THE HATCH — asked for in those words, and
   * this is the only place the three numbers are stated together.
   */
  it("splits them ten free, fifty on the road and the rest in the hatch", () => {
    expect(FREE_AVATARS.length).toBe(10);
    expect(ROAD_AVATARS.length).toBe(50);
    expect(ROAD_AVATARS.length).toBe(ROAD_CHAPTERS);
    expect(HATCH_AVATARS.length).toBe(AVATAR_IDS.length - 60);
  });

  /**
   * NOTHING IN TWO PLACES AND NOTHING IN NONE.
   *
   * An avatar on both the road and in the hatch is one a player can be paid twice; one
   * in neither is a file that ships, costs install size and can never be had. The hatch
   * pool is DERIVED for exactly this reason, so what this really guards is the two
   * hand-kept lists not overlapping.
   */
  it("gives every avatar exactly one way in", () => {
    const seen = new Map<string, number>();
    for (const id of [...FREE_AVATARS, ...ROAD_AVATARS, ...HATCH_AVATARS]) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    for (const id of AVATAR_IDS) {
      expect(seen.get(id), `${id} is in ${seen.get(id) ?? 0} of the three lists`).toBe(1);
    }
    expect(seen.size, "a list names an avatar the table does not have").toBe(AVATAR_IDS.length);
  });

  it("knows its own ids and nobody else's", () => {
    expect(isAvatar(AVATAR_IDS[0] as string)).toBe(true);
    expect(isAvatar("av9999")).toBe(false);
    expect(isAvatar("fire-ember")).toBe(false);
    expect(isFreeAvatar(FREE_AVATARS[0] as string)).toBe(true);
    expect(isFreeAvatar(ROAD_AVATARS[0] as string)).toBe(false);
  });

  it("pays one avatar per chapter of the road, in table order", () => {
    for (let c = 1; c <= ROAD_CHAPTERS; c++) expect(roadAvatar(c)).toBe(ROAD_AVATARS[c - 1]);
    expect(roadAvatar(0)).toBeNull();
    expect(roadAvatar(ROAD_CHAPTERS + 1)).toBeNull();
  });

  /**
   * THE BOTTOM RUNG, DERIVED. A skin is the top two rungs of the ladder and an avatar is
   * the lowest one; writing "common" here would be the kind of copy that survives a
   * retune of the ladder and quietly points at the wrong end of it.
   */
  it("comes out of the lowest tier there is", () => {
    expect(AVATAR_TIER).toBe(TIER_IDS[0]);
    expect(avatarTier(TIER_IDS[0])).toBe(true);
    for (const t of TIER_IDS.slice(1)) expect(avatarTier(t)).toBe(false);
  });
});

describe("rolling one", () => {
  it("only ever rolls out of the hatch pool", () => {
    const pool = new Set(HATCH_AVATARS);
    for (let i = 0; i < 200; i++) {
      const id = rollAvatar(() => i / 200, []);
      expect(id).not.toBeNull();
      expect(pool.has(id as string), `${id} is not a hatch avatar`).toBe(true);
    }
  });

  it("never rolls one already found", () => {
    const found = HATCH_AVATARS.slice(0, HATCH_AVATARS.length - 1);
    for (let i = 0; i < 50; i++) {
      expect(rollAvatar(() => i / 50, found)).toBe(HATCH_AVATARS[HATCH_AVATARS.length - 1]);
    }
    expect(lockedAvatars(found).length).toBe(1);
  });

  /**
   * NULL IS NOT A FAILURE. It is what makes a finished collection fall back to a common
   * TRAIT instead of eating the larva, so the last avatar found is never the moment the
   * hatch got worse — exactly what `rollSkin` does at the other end.
   */
  it("answers null once there is nothing left to find", () => {
    expect(rollAvatar(() => 0.5, [...HATCH_AVATARS])).toBeNull();
    expect(lockedAvatars([...HATCH_AVATARS])).toEqual([]);
  });

  /** Reachable, all of them: a face nothing can roll is a file that ships for nothing. */
  it("can reach every avatar in the pool", () => {
    const seen = new Set<string>();
    const found: string[] = [];
    for (let i = 0; i < HATCH_AVATARS.length; i++) {
      const id = rollAvatar(() => 0.37, found);
      if (!id) break;
      seen.add(id);
      found.push(id);
    }
    expect(seen.size).toBe(HATCH_AVATARS.length);
  });
});

describe("carrying one on the save", () => {
  const store = (): ProfileStore => new ProfileStore(new MemoryStore());

  /**
   * THE CHOICE IS NULL AND THE FACE IS NOT, which is the `lookFor` shape: a colony always
   * has a look it was born with, and always has a face it started with.
   */
  it("starts on the default face with the ten already wearable", () => {
    const s = store();
    expect(s.avatar, "a new colony has chosen something").toBeNull();
    expect(s.face).toBe(DEFAULT_AVATAR);
    expect(FREE_AVATARS, "the default is not one of the free ten").toContain(DEFAULT_AVATAR);
    expect(s.avatars).toEqual([]);
    for (const id of FREE_AVATARS) expect(s.hasAvatar(id)).toBe(true);
    for (const id of ROAD_AVATARS) expect(s.hasAvatar(id)).toBe(false);
  });

  /**
   * A FREE ONE IS NEVER WRITTEN DOWN, which is the rule a basic look already follows:
   * it is not something that happened to this player, and storing it would make "how
   * many have I collected" start at ten for a colony that has collected nothing.
   */
  it("never stores a free avatar as found", () => {
    const s = store();
    s.findAvatar(FREE_AVATARS[0] as string);
    expect(s.avatars).toEqual([]);
    expect(s.hasAvatar(FREE_AVATARS[0] as string)).toBe(true);
    // ...and it is still wearable, which is the half that makes the rule safe.
    expect(s.wearAvatar(FREE_AVATARS[0] as string)).toBe(true);
    expect(s.avatar).toBe(FREE_AVATARS[0]);
  });

  /**
   * AN ID THE TABLE DOES NOT KNOW IS REFUSED, and the RETURN is what matters here.
   * `normalise` would strip it from the save either way, so what this guards is the
   * answer the hatch reads: a null means no prize card rather than a card for a face
   * that was never stored and can never be worn.
   */
  it("refuses to find one it has never heard of", () => {
    const s = store();
    expect(s.findAvatar("av9999")).toBeNull();
    expect(s.findAvatar("fire-ember")).toBeNull();
    expect(s.avatars).toEqual([]);
    expect(s.findAvatar(HATCH_AVATARS[0] as string)).toBe(HATCH_AVATARS[0]);
  });

  it("finds one once, however many times it is found", () => {
    const s = store();
    const id = HATCH_AVATARS[0] as string;
    s.findAvatar(id);
    s.findAvatar(id);
    expect(s.avatars).toEqual([id]);
  });

  it("refuses to wear one it has not found, and refuses one it has never heard of", () => {
    const s = store();
    expect(s.wearAvatar(ROAD_AVATARS[0] as string)).toBe(false);
    expect(s.wearAvatar("av9999")).toBe(false);
    expect(s.avatar).toBeNull();
  });

  /** Null is a state, not a refusal: it is the way back to the face everyone starts on. */
  it("takes one off again", () => {
    const s = store();
    const id = HATCH_AVATARS[0] as string;
    s.findAvatar(id);
    s.wearAvatar(id);
    expect(s.wearAvatar(null)).toBe(true);
    expect(s.avatar).toBeNull();
    expect(s.face).toBe(DEFAULT_AVATAR);
    expect(s.hasAvatar(id), "taking it off threw it away").toBe(true);
  });

  /** `faceOf` is the one place the fallback lives, so nothing else has to know it. */
  it("answers the default for no choice and the choice for one", () => {
    expect(faceOf(null)).toBe(DEFAULT_AVATAR);
    expect(faceOf(undefined)).toBe(DEFAULT_AVATAR);
    expect(faceOf("av43")).toBe("av43");
  });

  it("counts the free ten into the collection and nothing twice", () => {
    expect(avatarProgress([])).toEqual({ has: 10, of: 98 });
    expect(avatarProgress([HATCH_AVATARS[0] as string])).toEqual({ has: 11, of: 98 });
    // A save holding a free one anyway (an older build, a hand-edit) is not double-counted.
    expect(avatarProgress([FREE_AVATARS[0] as string])).toEqual({ has: 10, of: 98 });
    expect(avatarProgress(["av9999"])).toEqual({ has: 10, of: 98 });
  });
});

describe("normalising a save", () => {
  it("adds nothing to a default profile", () => {
    const d = defaultProfile();
    expect(normalise(d).avatars).toEqual(d.avatars);
    expect(normalise(d).avatar).toBe(d.avatar);
  });

  /** A save outlives the build that wrote it, so an id out of the table is dropped. */
  it("drops an avatar the table no longer has", () => {
    const p = normalise({ avatars: ["av9999", HATCH_AVATARS[0] as string], avatar: "av9999" });
    expect(p.avatars).toEqual([HATCH_AVATARS[0]]);
    expect(p.avatar, "a worn avatar outlived the table").toBeNull();
  });

  it("refuses to wear one that was never found", () => {
    expect(normalise({ avatar: ROAD_AVATARS[0] as string }).avatar).toBeNull();
    expect(normalise({ avatars: [ROAD_AVATARS[0] as string], avatar: ROAD_AVATARS[0] as string })
      .avatar).toBe(ROAD_AVATARS[0]);
  });

  /** A FREE one is wearable without ever being in the set — the two halves together. */
  it("lets a free avatar be worn without being stored", () => {
    const p = normalise({ avatar: FREE_AVATARS[0] as string });
    expect(p.avatar).toBe(FREE_AVATARS[0]);
    expect(p.avatars).toEqual([]);
  });

  it("survives junk where the two fields go", () => {
    const p = normalise({
      avatars: ["", 7, null, { id: "av30" }] as unknown as string[],
      avatar: 42 as unknown as string,
    });
    expect(p.avatars).toEqual([]);
    expect(p.avatar).toBeNull();
  });
});
