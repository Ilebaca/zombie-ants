import { describe, it, expect } from "vitest";
import {
  captureQueen, defaultContext, hiveCells, moveOrAttack, recomputeConnectivity,
  respawnHive, setHiveDefence, tile, isConnected,
} from "../index";
import { blankGame, put } from "./helpers";

describe("hive", () => {
  it("is tougher while dormant than awake", () => {
    const s = blankGame();
    s.hive.phase = "dormant"; setHiveDefence(s);
    const dormant = hiveCells(s).find(t => t.terrain === "hiveQ")!.soldiers;
    s.hive.phase = "awake"; s.hive.awokeTurn = s.turn; setHiveDefence(s);
    const awake = hiveCells(s).find(t => t.terrain === "hiveQ")!.soldiers;
    expect(dormant).toBeGreaterThan(awake);
  });

  it("grows stronger the longer it is left alone", () => {
    const s = blankGame();
    s.hive.phase = "awake"; s.hive.awokeTurn = 1; s.turn = 1; setHiveDefence(s);
    const early = hiveCells(s).find(t => t.terrain === "hiveQ")!.soldiers;
    s.turn = 21; setHiveDefence(s);
    const late = hiveCells(s).find(t => t.terrain === "hiveQ")!.soldiers;
    expect(late).toBeGreaterThan(early);
  });

  it("gives the capturer all five tiles as selectable STABLES", () => {
    // Regression: these were made veins once, and the pruner then deleted them,
    // making a won fight look like a loss. (CLAUDE.md §5)
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    captureQueen(s, "you");
    for (const t of hiveCells(s)) {
      expect(t.owner).toBe("you");
      expect(t.struct).toBe("stable");
      expect(t.soldiers).toBeGreaterThan(0);
    }
    expect(s.hive.phase).toBe("buff");
  });

  it("survives vein pruning after capture", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);
    captureQueen(s, "you");
    // an action triggers pruning; hive tiles must remain
    s.current = "you";
    moveOrAttack(s, { c: 1, r: 1 }, { c: 2, r: 1 }, defaultContext());
    for (const t of hiveCells(s)) expect(t.owner).toBe("you");
  });

  it("hive tiles are never considered cut off", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    captureQueen(s, "you");
    recomputeConnectivity(s);
    for (const t of hiveCells(s)) expect(isConnected(s, t)).toBe(true);
  });

  it("respawns neutral and one level stronger", () => {
    const s = blankGame();
    captureQueen(s, "you");
    const before = s.hive.level;
    respawnHive(s);
    expect(s.hive.level).toBe(before + 1);
    expect(s.hive.owner).toBeNull();
    for (const t of hiveCells(s)) expect(t.owner).toBeNull();
  });

  it("capturing a hive GUARD keeps it as a usable stable", () => {
    const s = blankGame();
    const guard = hiveCells(s).find(t => t.terrain === "hiveG")!;
    guard.soldiers = 5; guard.owner = null;
    // attacker adjacent to the guard, connected to its own nest
    const near = { c: guard.c, r: guard.r - 1 };
    put(s, near.c, near.r, { owner: "you", struct: "nest", soldiers: 200 });
    recomputeConnectivity(s);
    s.current = "you";

    moveOrAttack(s, near, { c: guard.c, r: guard.r }, defaultContext());
    expect(tile(s, guard.c, guard.r).owner).toBe("you");
    expect(tile(s, guard.c, guard.r).struct).toBe("stable");
    expect(tile(s, guard.c, guard.r).soldiers).toBeGreaterThan(0);
  });
});
