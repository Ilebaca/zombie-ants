import { describe, it, expect } from "vitest";
import { createGame, ownedCount, nestTile, START_SHAPES, allTiles, NEUTRAL_MODS } from "../index";

describe("starting position", () => {
  it("gives each side exactly 5 tiles on every shape and map", () => {
    for (const map of ["tiny", "small", "mid"] as const) {
      for (const shape of Object.values(START_SHAPES)) {
        const s = createGame({ map, species: { you: "fire", ai: "fire" }, shape });
        expect(ownedCount(s, "you")).toBe(5);
        expect(ownedCount(s, "ai")).toBe(5);
      }
    }
  });

  it("gives each side exactly one nest", () => {
    const s = createGame({ map: "mid", species: { you: "fire", ai: "fire" } });
    expect(allTiles(s).filter(t => t.owner === "you" && t.struct === "nest")).toHaveLength(1);
    expect(allTiles(s).filter(t => t.owner === "ai" && t.struct === "nest")).toHaveLength(1);
  });

  it("adds Royal Chamber soldiers to the nest but NOT extra tiles", () => {
    // Regression: a removed 'Tunnel Network' upgrade kept pre-digging bonus tiles from
    // stale save data, so starts were ~10 tiles instead of 5. (CLAUDE.md §5)
    const mods = { you: { ...NEUTRAL_MODS, royal: 5 }, ai: { ...NEUTRAL_MODS } };
    const s = createGame({ map: "mid", species: { you: "fire", ai: "fire" }, mods });
    expect(ownedCount(s, "you")).toBe(5);
    expect(nestTile(s, "you")!.soldiers).toBe(15);   // 10 base + 5
  });

  it("starts Ghost Ant's tunnelling on cooldown", () => {
    const s = createGame({ map: "mid", species: { you: "ghost", ai: "fire" } });
    expect(s.cooldown.you).toBeGreaterThan(0);
    expect(s.cooldown.ai).toBe(0);
  });

  it("places the hive at the exact centre", () => {
    const s = createGame({ map: "mid", species: { you: "fire", ai: "fire" } });
    const mid = Math.floor(s.size / 2);
    expect(s.grid[mid]![mid]!.terrain).toBe("hiveQ");
    expect(allTiles(s).filter(t => t.terrain === "hiveG")).toHaveLength(4);
  });
});
