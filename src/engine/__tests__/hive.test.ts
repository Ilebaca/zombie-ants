import { describe, it, expect } from "vitest";
import {
  captureQueen, defaultContext, endSurge, hiveCells, moveOrAttack, recomputeConnectivity,
  respawnHive, setHiveDefence, tile, isConnected, hiveTick, HIVE_COOLDOWN,
} from "../index";
import type { GameState } from "../index";
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

/**
 * A CAPTURED QUEEN MUST COME BACK HARDER.
 *
 * The level used to add a flat bonus while the growth clock restarted on respawn, so a
 * long-ignored level-1 queen (base plus many growth steps) outclassed the level-2 queen who
 * replaced her. Capturing the Hive made the Hive EASIER, which is backwards.
 */
describe("the queen's strength across levels", () => {
  const queenOf = (s: GameState): number =>
    (hiveCells(s).find((t) => t.terrain === "hiveQ") as { soldiers: number }).soldiers;
  const garrison = (s: GameState): number =>
    hiveCells(s).reduce((n, t) => n + t.soldiers, 0);

  /** An awake hive that has been standing a long time — the case that used to break. */
  const longStanding = (): GameState => {
    const s = blankGame("small");
    s.hive.phase = "awake"; s.hive.awokeTurn = 1; s.turn = 30;
    setHiveDefence(s);
    return s;
  };

  /**
   * Run a whole capture → surge → cooldown → respawn cycle. Both stretch by a turn per
   * level, so this drives to the next phase rather than counting a fixed number of ticks.
   */
  const cycle = (s: GameState): void => {
    for (let i = 0; i < 40 && s.hive.phase === "buff"; i++) hiveTick(s, "you");
    expect(s.hive.phase).toBe("cooling");
    for (let i = 0; i < 40 && s.hive.phase === "cooling"; i++) { hiveTick(s, "you"); hiveTick(s, "ai"); }
    expect(s.hive.phase).toBe("awake");
  };

  it("is stronger at a higher level on the same turn", () => {
    const s = longStanding();
    const one = queenOf(s);
    s.hive.level = 2;
    setHiveDefence(s);
    expect(queenOf(s)).toBeGreaterThan(one);
  });

  it("returns stronger than the queen that was just beaten", () => {
    const s = longStanding();
    const beaten = queenOf(s);
    captureQueen(s, "you");
    for (const t of hiveCells(s)) t.soldiers = 1;    // leave almost nothing to absorb
    cycle(s);
    expect(s.hive.level).toBe(2);
    expect(queenOf(s), "level 2 came back weaker than level 1").toBeGreaterThan(beaten);
  });

  it("keeps climbing over several captures", () => {
    const s = longStanding();
    const seen: number[] = [queenOf(s)];
    for (let i = 0; i < 3; i++) {
      captureQueen(s, "you");
      for (const t of hiveCells(s)) t.soldiers = 1;
      cycle(s);
      seen.push(queenOf(s));
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i] as number).toBeGreaterThan(seen[i - 1] as number);
    }
  });

  /**
   * THE HIVE EATS WHAT IS LEFT ON IT. Troops standing on the five tiles when the surge
   * lapses used to be deleted outright — a garrison the player had paid for, gone with no
   * explanation. They are banked and come back as part of the next queen instead.
   */
  it("absorbs the garrison left standing when the surge lapses", () => {
    const bare = longStanding();
    captureQueen(bare, "you");
    for (const t of hiveCells(bare)) t.soldiers = 1;
    cycle(bare);

    const fed = longStanding();
    captureQueen(fed, "you");
    for (const t of hiveCells(fed)) t.soldiers = 1;
    (hiveCells(fed).find((t) => t.terrain === "hiveQ") as { soldiers: number }).soldiers = 201;
    cycle(fed);

    expect(garrison(fed) - garrison(bare)).toBe(200);
  });

  it("absorbs troops camped on the bare ground during the cooldown", () => {
    const s = longStanding();
    captureQueen(s, "you");
    for (const t of hiveCells(s)) t.soldiers = 1;
    for (let i = 0; i < s.limits.buffTurns; i++) hiveTick(s, "you");
    expect(s.hive.phase).toBe("cooling");

    const control = garrison(s);            // 0 — she is gone
    expect(control).toBe(0);
    const q = hiveCells(s).find((t) => t.terrain === "hiveQ") as { c: number; r: number };
    put(s, q.c, q.r, { owner: "you", struct: "stable", soldiers: 60 });

    for (let i = 0; i < HIVE_COOLDOWN; i++) { hiveTick(s, "you"); hiveTick(s, "ai"); }
    expect(s.hive.phase).toBe("awake");
    for (const t of hiveCells(s)) expect(t.owner, "sitting on her does not keep the ground").toBeNull();

    const clean = longStanding();
    captureQueen(clean, "you");
    for (const t of hiveCells(clean)) t.soldiers = 1;
    cycle(clean);
    // Both runs banked the five tokens left at the lapse; only these 60 are extra.
    expect(garrison(s) - garrison(clean)).toBe(60);
  });

  it("hands the banked soldiers out without losing or inventing any", () => {
    const s = longStanding();
    captureQueen(s, "you");
    for (const t of hiveCells(s)) t.soldiers = 7;
    endSurge(s);
    expect(s.hive.banked).toBe(35);
    respawnHive(s);
    expect(s.hive.banked, "the pool must be spent, not carried").toBe(0);
  });
});

/**
 * THE SURGE IS FOR THE QUEEN, NOT FOR HER GUARDS, AND NOT FOR HER GRAVE.
 */
describe("what actually grants the surge", () => {
  const attack = (s: GameState, from: { c: number; r: number }, to: { c: number; r: number }) => {
    recomputeConnectivity(s);
    s.current = "you";
    return moveOrAttack(s, from, to, defaultContext());
  };

  it("does not start a surge when only a guard is taken", () => {
    const s = blankGame();
    s.hive.phase = "awake"; s.hive.awokeTurn = 1; s.turn = 1; setHiveDefence(s);
    const guard = hiveCells(s).find((t) => t.terrain === "hiveG") as { c: number; r: number };
    const near = { c: guard.c, r: guard.r - 1 };
    put(s, near.c, near.r, { owner: "you", struct: "nest", soldiers: 400 });

    attack(s, near, { c: guard.c, r: guard.r });
    expect(tile(s, guard.c, guard.r).owner).toBe("you");
    expect(s.hive.phase, "a guard is not the queen").toBe("awake");
    expect(s.hive.owner).toBeNull();
  });

  /**
   * While she is dead her tiles are bare ground with no garrison. The combat path used to
   * treat them as the hive regardless, so attacking the empty middle tile beat a garrison
   * of zero and handed out a full surge from a corpse.
   */
  it("gives nothing for walking onto a dead queen's tile", () => {
    const s = blankGame("small");
    s.hive.phase = "awake"; s.hive.awokeTurn = 1; s.turn = 20; setHiveDefence(s);
    captureQueen(s, "you");
    for (const t of hiveCells(s)) t.soldiers = 1;
    for (let i = 0; i < s.limits.buffTurns; i++) hiveTick(s, "you");
    expect(s.hive.phase).toBe("cooling");

    const q = hiveCells(s).find((t) => t.terrain === "hiveQ") as { c: number; r: number };
    const near = { c: q.c, r: q.r - 1 };
    put(s, near.c, near.r, { owner: "ai", struct: "nest", soldiers: 40 });
    recomputeConnectivity(s);
    s.current = "ai";
    moveOrAttack(s, near, { c: q.c, r: q.r }, defaultContext());

    expect(tile(s, q.c, q.r).owner, "it is ordinary ground now").toBe("ai");
    expect(s.hive.phase, "a dead queen grants no surge").toBe("cooling");
    expect(s.hive.owner).toBeNull();
    expect(s.hive.coolLeft).toBeGreaterThan(0);
  });
});

/**
 * A SURGE CANNOT BE STOLEN.
 *
 * Cracking a level-3 queen costs a garrison the player has spent the whole match building.
 * If the enemy could walk onto the middle tile the turn after and inherit the growth, that
 * investment bought one turn of production. The tiles can still be fought for — they are
 * ordinary tiles of whoever holds them now — but the surge belongs to whoever took her.
 */
describe("holding the surge", () => {
  const runSurgeDown = (s: GameState): void => {
    for (let i = 0; i < 40 && s.hive.phase === "buff"; i++) hiveTick(s, "you");
  };

  const surging = (): GameState => {
    const s = blankGame("small");
    s.hive.phase = "awake"; s.hive.awokeTurn = 1; s.turn = 10; setHiveDefence(s);
    captureQueen(s, "you");
    return s;
  };

  it("does not hand the growth over when the queen's tile is retaken", () => {
    const s = surging();
    const q = hiveCells(s).find((t) => t.terrain === "hiveQ") as { c: number; r: number };
    tile(s, q.c, q.r).soldiers = 2;
    const near = { c: q.c, r: q.r - 2 };
    put(s, near.c, near.r, { owner: "ai", struct: "nest", soldiers: 300 });
    recomputeConnectivity(s);
    s.current = "ai";
    moveOrAttack(s, near, { c: q.c, r: q.r - 1 }, defaultContext());
    s.current = "ai";
    moveOrAttack(s, { c: q.c, r: q.r - 1 }, { c: q.c, r: q.r }, defaultContext());

    expect(tile(s, q.c, q.r).owner, "the ground itself is still fair game").toBe("ai");
    expect(s.hive.owner, "the surge stays with whoever took her").toBe("you");
    expect(s.hive.phase).toBe("buff");
  });

  it("runs its full length whatever happens on the ground", () => {
    const s = surging();
    const left = s.hive.buffLeft;
    expect(left).toBeGreaterThan(0);
    for (let i = 0; i < left - 1; i++) hiveTick(s, "you");
    expect(s.hive.phase).toBe("buff");
    hiveTick(s, "you");
    expect(s.hive.phase).toBe("cooling");
  });

  /** A bigger queen pays a bigger swing, and leaves a bigger gap before the next one. */
  it("stretches the surge and the wait by a turn per level", () => {
    const one = blankGame("small");
    one.hive.phase = "awake"; one.hive.awokeTurn = 1; one.turn = 10; setHiveDefence(one);
    captureQueen(one, "you");
    expect(one.hive.buffLeft).toBe(one.limits.buffTurns);

    const three = blankGame("small");
    three.hive.phase = "awake"; three.hive.awokeTurn = 1; three.turn = 10; three.hive.level = 3;
    setHiveDefence(three);
    captureQueen(three, "you");
    expect(three.hive.buffLeft).toBe(three.limits.buffTurns + 2);

    runSurgeDown(three);
    expect(three.hive.coolLeft).toBe(HIVE_COOLDOWN + 2);
  });
});
