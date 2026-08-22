import { describe, it, expect } from "vitest";
import {
  captureQueen, defaultContext, hiveCells, moveOrAttack, recomputeConnectivity,
  respawnHive, setHiveDefence, tile, isConnected, hiveTick, HIVE_COOLDOWN,
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

  /**
   * The queen does not come back the instant the surge lapses. She is dead, her ground is
   * bare, and there is a gap before she grows again — otherwise the colony that just rode
   * a surge walks straight onto a fresh one and the Hive is a tap rather than a contest.
   */
  it("goes cold between the surge ending and the queen returning", () => {
    const s = blankGame("small");
    s.turn = 20;
    captureQueen(s, "you");
    expect(s.hive.phase).toBe("buff");
    const level = s.hive.level;

    // Run the surge down. The clock only ticks on the holder's turn.
    for (let i = 0; i < s.limits.buffTurns; i++) hiveTick(s, "you");
    expect(s.hive.phase, "the queen should be gone, not instantly back").toBe("cooling");
    expect(s.hive.coolLeft).toBe(HIVE_COOLDOWN);
    expect(s.hive.level, "she does not level up until she returns").toBe(level);
    for (const t of hiveCells(s)) {
      expect(t.owner, "the tiles are his only while the surge runs").toBeNull();
      expect(t.soldiers, "there must be nothing there to capture").toBe(0);
    }

    // Nothing is capturable during the wait, however many turns pass.
    for (let i = 0; i < HIVE_COOLDOWN - 1; i++) { hiveTick(s, "you"); hiveTick(s, "ai"); }
    expect(s.hive.phase).toBe("cooling");
    for (const t of hiveCells(s)) expect(t.soldiers).toBe(0);

    hiveTick(s, "you");
    expect(s.hive.phase).toBe("awake");
    expect(s.hive.level).toBe(level + 1);
    for (const t of hiveCells(s)) expect(t.soldiers).toBeGreaterThan(0);
  });

  it("counts the wait once per round, not once per side", () => {
    const s = blankGame("small");
    captureQueen(s, "you");
    for (let i = 0; i < s.limits.buffTurns; i++) hiveTick(s, "you");
    // A full round is one tick of the clock, so the AI's turn must not spend one.
    const before = s.hive.coolLeft;
    hiveTick(s, "ai");
    expect(s.hive.coolLeft).toBe(before);
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
