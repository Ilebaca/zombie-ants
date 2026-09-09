/**
 * The board itself: corners, symmetry, and the terrain it is supposed to carry.
 *
 * These are the rules a player feels before they make a single move — which corner is mine,
 * is the other side's ground the same as mine, is there anything worth taking. Nothing here
 * was covered before, and the corners were wrong (you started top-left, and the diagonal
 * that splits the board for Weaver's Spread ran the wrong way).
 */
import { describe, expect, it } from "vitest";
import {
  MAPS, START_SHAPES, allTiles, armyOf, createGame, incomeOf, nestTile, ownedCount, tileAt,
} from "../index";
import { NEUTRAL_MODS } from "../index";
import type { GameState, MapId, Tile } from "../index";

const MAP_IDS: readonly MapId[] = ["small", "small", "small"];
const game = (map: MapId): GameState => createGame({ map, species: { you: "fire", ai: "fire" } });

/** The 180° partner of a cell: the same ground from the other colony's point of view. */
const rotated = (s: GameState, t: Tile): Tile | undefined =>
  tileAt(s, s.size - 1 - t.c, s.size - 1 - t.r);

describe("colony corners", () => {
  it("puts you bottom-left and the enemy top-right", () => {
    for (const map of MAP_IDS) {
      const s = game(map);
      const you = nestTile(s, "you")!;
      const ai = nestTile(s, "ai")!;
      const last = s.size - 1;

      // Bottom-left means a low column and a high row; the canvas draws row 0 at the top.
      expect(you.c, `${map}: your nest column`).toBeLessThan(s.size / 2);
      expect(you.r, `${map}: your nest row`).toBeGreaterThan(s.size / 2);
      expect(ai.c, `${map}: enemy nest column`).toBeGreaterThan(s.size / 2);
      expect(ai.r, `${map}: enemy nest row`).toBeLessThan(s.size / 2);

      // ...and the two corners are the same distance from their own corner of the board.
      expect(you.c + (last - you.r)).toBe(ai.r + (last - ai.c));
    }
  });

  it("mirrors the two colonies through the centre when both field the same formation", () => {
    for (const map of MAP_IDS) {
      for (const [name, shape] of Object.entries(START_SHAPES)) {
        const s = createGame({ map, species: { you: "fire", ai: "fire" }, shape });
        for (const t of allTiles(s)) {
          if (t.owner !== "you") continue;
          const partner = rotated(s, t);
          expect(partner?.owner, `${map}/${name}: (${t.c},${t.r}) has no mirrored enemy tile`).toBe("ai");
          expect(partner?.struct).toBe(t.struct);
          expect(partner?.soldiers).toBe(t.soldiers);
        }
      }
    }
  });

  /**
   * The enemy usually fields a DIFFERENT formation (app.ts rolls one), which must change
   * the silhouette of its corner without changing what it is worth.
   */
  it("keeps a different enemy formation worth exactly the same", () => {
    for (const map of MAP_IDS) {
      const shapes = Object.values(START_SHAPES);
      for (const aiShape of shapes) {
        const s = createGame({
          map, species: { you: "fire", ai: "fire" }, shape: START_SHAPES.wedge, aiShape,
        });
        expect(ownedCount(s, "you")).toBe(5);
        expect(ownedCount(s, "ai")).toBe(5);
        expect(armyOf(s, "you")).toBe(armyOf(s, "ai"));
        expect(allTiles(s).filter((t) => t.owner === "ai" && t.struct === "nest")).toHaveLength(1);
      }
    }
  });

  it("never starts a colony on rock or on the hive", () => {
    for (const map of MAP_IDS) {
      for (const shape of Object.values(START_SHAPES)) {
        const s = createGame({ map, species: { you: "fire", ai: "fire" }, shape });
        for (const t of allTiles(s)) {
          if (!t.owner) continue;
          expect(t.terrain, `${map}: a start tile sits on ${t.terrain}`).toBe("ground");
        }
      }
    }
  });
});

describe("map symmetry", () => {
  /**
   * Every map must be symmetric under a 180° rotation, because that is the transform that
   * carries your corner onto the enemy's. Anything else hands one side better ground.
   */
  it("gives both colonies identical terrain and identical wild garrisons", () => {
    for (const map of MAP_IDS) {
      const s = game(map);
      for (const t of allTiles(s)) {
        const partner = rotated(s, t);
        expect(partner, `${map}: (${t.c},${t.r}) has no partner`).toBeTruthy();
        expect(partner!.terrain, `${map}: terrain at (${t.c},${t.r}) is not mirrored`).toBe(t.terrain);
        if (!t.owner && !partner!.owner) {
          expect(partner!.guard, `${map}: guard at (${t.c},${t.r}) is not mirrored`).toBe(t.guard);
        }
      }
    }
  });

  it("puts the hive dead centre, so it is equidistant from both nests", () => {
    for (const map of MAP_IDS) {
      const s = game(map);
      const mid = Math.floor(s.size / 2);
      expect(tileAt(s, mid, mid)?.terrain).toBe("hiveQ");
      const guards = allTiles(s).filter((t) => t.terrain === "hiveG");
      expect(guards).toHaveLength(4);

      const you = nestTile(s, "you")!;
      const ai = nestTile(s, "ai")!;
      const walk = (t: Tile): number => Math.abs(t.c - mid) + Math.abs(t.r - mid);
      expect(walk(you)).toBe(walk(ai));
    }
  });
});

describe("what the board carries", () => {
  const terrainCount = (s: GameState, kind: Tile["terrain"]): number =>
    allTiles(s).filter((t) => t.terrain === kind).length;

  it("gives the board resource tiles, in mirrored pairs", () => {
    for (const map of MAP_IDS) {
      const s = game(map);
      const resources = allTiles(s).filter((t) => t.terrain === "resource");
      expect(resources.length, `${map} has no resource tiles`).toBeGreaterThan(0);
      expect(resources.length % 2, `${map} has an odd number of resources`).toBe(0);
    }
  });

  /** The exact layouts, so a well-meaning "tidy-up" cannot quietly reshape a board. */
  it("lays the board out the way it was designed", () => {
    const board = game("small");
    expect(terrainCount(board, "resource")).toBe(4);
    expect(terrainCount(board, "blocked")).toBe(4);
    expect(tileAt(board, 1, 3)?.guard).toBe(6);     // the defended pair
    expect(tileAt(board, 7, 5)?.guard).toBe(6);
    expect(tileAt(board, 5, 1)?.guard).toBe(0);     // and the two open ones
    expect(tileAt(board, 3, 7)?.guard).toBe(0);
    expect(tileAt(board, 5, 3)?.guard).toBe(4);     // wild garrisons on open ground
    expect(tileAt(board, 3, 5)?.guard).toBe(4);
    expect(tileAt(board, 4, 4)?.terrain).toBe("hiveQ");
  });

  /**
   * ONE BOARD, and the table says so. There were three, and choosing between them was the
   * first thing the game asked of somebody who did not yet know what a Hive was — so the
   * setup asks about the FORMATION and the COLONY instead (ui/setup.ts). A second board is
   * a line in `MAPS` and a block in `buildMap`; this holds that nothing else assumed more.
   */
  it("ships exactly one board", () => {
    expect(Object.keys(MAPS)).toEqual(["small"]);
  });

  it("keeps the board size odd, so the hive has a true centre", () => {
    for (const map of MAP_IDS) expect(MAPS[map].size % 2).toBe(1);
  });
});

describe("a fair start", () => {
  /**
   * Both colonies open on the same numbers. A difference here is a thumb on the scale that
   * no amount of good play corrects, and it would be invisible in a normal match.
   */
  it("gives both sides the same army and the same income on every formation", () => {
    const mods = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };
    for (const map of MAP_IDS) {
      for (const [name, shape] of Object.entries(START_SHAPES)) {
        const s = createGame({ map, species: { you: "fire", ai: "fire" }, shape, mods });
        expect(armyOf(s, "you"), `${map}/${name}: armies differ`).toBe(armyOf(s, "ai"));
        expect(incomeOf(s, "you", mods.you), `${map}/${name}: income differs`)
          .toBe(incomeOf(s, "ai", mods.ai));
      }
    }
  });

  it("leaves both colonies connected to their own nest at the start", () => {
    for (const map of MAP_IDS) {
      const s = createGame({ map, species: { you: "fire", ai: "fire" } });
      expect(s.conn.you.size).toBe(5);
      expect(s.conn.ai.size).toBe(5);
    }
  });

  it("puts the same number of open neighbours in front of each colony", () => {
    for (const map of MAP_IDS) {
      const s = createGame({ map, species: { you: "fire", ai: "fire" } });
      const open = (owner: "you" | "ai"): number => {
        let n = 0;
        for (const t of allTiles(s)) {
          if (t.owner !== owner) continue;
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nb = tileAt(s, t.c + dc, t.r + dr);
            if (nb && !nb.owner && nb.terrain === "ground" && nb.guard === 0) n++;
          }
        }
        return n;
      };
      expect(open("you"), `${map}: unequal room to expand`).toBe(open("ai"));
    }
  });
});
