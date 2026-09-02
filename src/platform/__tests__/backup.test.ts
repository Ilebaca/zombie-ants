/**
 * THE BACKUP CODE.
 *
 * Everything a player has is in `localStorage` on one device, and until there is a server
 * this string is the only way any of it survives a new phone. What is tested here is not
 * that a round trip works — that is the easy half — but the three ways a code can be wrong,
 * because each of them is a player being told something about their own save:
 *
 *  - a string that is not one of ours must be REFUSED, never read as an empty colony;
 *  - a code copied without its last characters must be caught, not half-loaded;
 *  - and a code somebody has edited goes through `normalise` like every other read, so it
 *    cannot put a NaN chamber level into a fight.
 */
import { describe, expect, it } from "vitest";
import { BACKUP_TAG, checksum, exportProfile, importProfile } from "../backup";
import { CHAMBER_MAX } from "../../engine";
import { canReplay } from "../history";
import type { MatchLog } from "../history";
import { ProfileStore, defaultProfile, normalise } from "../profile";
import { MemoryStore } from "../storage";

const played = (): ProfileStore => {
  const store = new ProfileStore(new MemoryStore());
  store.update((p) => {
    p.name = "Ilebaca";
    p.mycel = 640;
    p.pheromone = 210;
    p.colony = 18400;
    p.hill.royal = 3;
    p.stats.wins = 41;
  });
  return store;
};

describe("writing a save out", () => {
  it("carries the whole colony there and back", () => {
    const before = played().get();
    const read = importProfile(exportProfile(before));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.profile).toEqual(normalise(before));
  });

  // A player is going to paste this into a message or a note, and a chat app will wrap it.
  // A code that only loads when it arrives on one line is a code that mostly does not.
  it("survives being wrapped, spaced and padded on the way", () => {
    const code = exportProfile(played().get());
    const mangled = `  ${code.slice(0, 40)}\n${code.slice(40, 90)}  \n ${code.slice(90)} \n`;
    const read = importProfile(mangled);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.profile.name).toBe("Ilebaca");
  });

  /**
   * THE REPLAY RECORDS DO NOT TRAVEL. Measured on a full history of long matches they are
   * 400 KB of a 408 KB save, and the code built from that is 544 KB — half a million
   * characters, in a box a player is asked to copy into a message. Nobody does that, so
   * the backup silently stopped working for exactly the players with most to lose.
   *
   * The match itself still travels. Only the moves are left behind.
   */
  it("carries the matches but not the moves", () => {
    const store = new ProfileStore(new MemoryStore());
    const log = {
      id: "m:1", at: 1_000, map: "small" as const, you: "fire" as const, foe: "ghost" as const,
      foeName: "Vela", human: true, winner: "you" as const, reason: "nest",
      turns: 40, playedMs: 90_000, colonyBefore: 100, colonyAfter: 140,
      record: {
        setup: { map: "small" as const, species: { you: "fire" as const, ai: "ghost" as const }, seed: 7 },
        moves: Array.from({ length: 400 }, () => ({ do: "end" as const })),
      },
    };
    store.rememberMatch(log);
    const fat = exportProfile(store.get()).length;

    const read = importProfile(exportProfile(store.get()));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.profile.history.length, "the match was left behind with its moves").toBe(1);
    expect(read.profile.history[0]?.foeName).toBe("Vela");
    expect(read.profile.history[0]?.colonyAfter).toBe(140);
    expect(canReplay(read.profile.history[0] as MatchLog),
      "the moves travelled after all").toBe(false);

    // ...and it is the moves that were the weight.
    const bare = new ProfileStore(new MemoryStore());
    bare.rememberMatch({ ...log, record: undefined });
    expect(fat, "the code still carries the move list")
      .toBeLessThan(exportProfile(bare.get()).length + 400);
  });

  it("is recognisable on sight", () => {
    expect(exportProfile(defaultProfile()).startsWith(`${BACKUP_TAG}.`)).toBe(true);
  });

  // A colony can be named in any alphabet. `btoa` alone throws on anything outside
  // Latin-1, which would mean the export button doing nothing at all for those players.
  it("carries a name written in another alphabet", () => {
    const store = new ProfileStore(new MemoryStore());
    store.update((p) => { p.name = "Мрави"; });
    const read = importProfile(exportProfile(store.get()));
    expect(read.ok && read.profile.name).toBe("Мрави");
  });
});

describe("reading a code back", () => {
  it("refuses something that is not a code at all", () => {
    for (const junk of ["", "hello", "ZA2.1.abc.def", "ZA1.9.abc.def", "ZA1.1.abc"]) {
      const read = importProfile(junk);
      expect(read.ok, junk).toBe(false);
      if (!read.ok) expect(read.why).toBe("not-a-code");
    }
  });

  // The way this actually gets moved is a person copying it out of a message, and the
  // thing that really happens is that the end goes missing. Half a code that LOADS is far
  // worse than one that does not: it is a colony quietly reset.
  it("catches a code that lost its end", () => {
    const code = exportProfile(played().get());
    const read = importProfile(code.slice(0, code.length - 20));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.why).toBe("damaged");
  });

  it("catches a code with a character changed in the middle", () => {
    const code = exportProfile(played().get());
    const at = Math.floor(code.length / 2);
    const swapped = code[at] === "A" ? "B" : "A";
    const read = importProfile(code.slice(0, at) + swapped + code.slice(at + 1));
    expect(read.ok).toBe(false);
  });

  it("says a code whose checksum matches but whose body is not a save is unreadable", () => {
    const body = Buffer.from("not json at all").toString("base64").replace(/=+$/, "");
    const read = importProfile(`${BACKUP_TAG}.1.${checksum(body)}.${body}`);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.why).toBe("unreadable");
  });

  /**
   * The trust boundary is the same one every other read goes through. A code is a string
   * somebody can edit, so this is the door a hand-written profile arrives at — and a NaN
   * chamber level silently distorts combat maths rather than crashing.
   */
  it("normalises a hand-edited code rather than trusting it", () => {
    const body = Buffer.from(JSON.stringify({
      mycel: "lots", colony: Number.NaN, hill: { royal: 99 }, unlocked: [],
    })).toString("base64").replace(/=+$/, "");
    const read = importProfile(`${BACKUP_TAG}.1.${checksum(body)}.${body}`);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(Number.isFinite(read.profile.colony)).toBe(true);
    expect(read.profile.mycel).toBe(defaultProfile().mycel);
    expect(read.profile.hill.royal).toBeLessThanOrEqual(CHAMBER_MAX.royal);
    // A save stripped of every species is repopulated — the player must always have
    // something to field.
    expect(read.profile.unlocked.length).toBeGreaterThan(0);
  });
});

describe("the checksum", () => {
  it("changes when the body does", () => {
    expect(checksum("abcdef")).not.toBe(checksum("abcdeg"));
    expect(checksum("abcdef")).toBe(checksum("abcdef"));
  });

  // Fixed width, because it is one of four dot-separated fields and a variable-length one
  // is a field that can be confused with the next.
  it("is always the same length", () => {
    for (const body of ["", "a", "a".repeat(4000), "ZZZZ"]) {
      expect(checksum(body)).toHaveLength(7);
    }
  });
});

describe("taking a code as the save", () => {
  it("replaces what is on the device, and keeps it", () => {
    const from = played();
    const code = exportProfile(from.get());

    const store = new MemoryStore();
    const to = new ProfileStore(store);
    to.update((p) => { p.mycel = 5; p.name = "Someone else"; });

    const read = importProfile(code);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    to.restore(read.profile);

    expect(to.get().name).toBe("Ilebaca");
    expect(to.get().mycel).toBe(640);
    // Written through, or the restore is undone by the next reload.
    expect(new ProfileStore(store).get().mycel).toBe(640);
  });
});
