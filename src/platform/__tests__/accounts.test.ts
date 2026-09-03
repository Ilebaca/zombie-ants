/**
 * ACCOUNTS.
 *
 * There is no server, so what is worth holding here is not authentication — it is that a
 * save can never be lost or crossed with another one:
 *
 *  - the colony that already exists must become account ONE, or this build's first launch
 *    shows a sign-in screen over a save the player can no longer reach;
 *  - two accounts must never share a key, and a forgotten one must never hand its key on;
 *  - signing out must destroy nothing, which is the whole difference between it and reset.
 */
import { describe, expect, it } from "vitest";
import { LEGACY_ID, LocalAccounts, cleanName, keyFor } from "../accounts";
import { MemoryStore } from "../storage";
import { PROFILE_KEY, ProfileStore } from "../profile";

const fresh = (): MemoryStore => new MemoryStore();

describe("creating one", () => {
  it("names the colony, mints a code and signs in", () => {
    const accounts = new LocalAccounts(fresh());
    const made = accounts.create("Ridgeback");

    expect(made.name).toBe("Ridgeback");
    expect(made.code).toMatch(/^ZA-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(accounts.current()?.id).toBe(made.id);
    expect(accounts.storeFor(made).get().name).toBe("Ridgeback");
  });

  /**
   * THE CODE COMES OFF THE SAVE. `ProfileStore` mints one on first read and that is the
   * code Support and Settings already print; a second minted here would be two codes for
   * one colony, and the one a player reads off Support would not sign them in.
   */
  it("uses the save's own player code, not one of its own", () => {
    const store = fresh();
    const accounts = new LocalAccounts(store);
    const made = accounts.create("Ridgeback");
    expect(made.code).toBe(accounts.storeFor(made).get().playerId);
  });

  it("falls back rather than refusing an empty name", () => {
    expect(cleanName("   ")).toBe("Commander");
    expect(cleanName("a".repeat(40)).length).toBe(18);
  });

  it("gives each colony its own save, which never cross", () => {
    const accounts = new LocalAccounts(fresh());
    const first = accounts.create("First");
    const second = accounts.create("Second");

    expect(keyFor(first.id)).not.toBe(keyFor(second.id));
    accounts.storeFor(first).update((p) => { p.colony = 9999; });
    expect(accounts.storeFor(second).get().colony).not.toBe(9999);
    expect(accounts.storeFor(first).get().colony).toBe(9999);
  });
});

describe("coming back", () => {
  it("signs in by code, case and space insensitively", () => {
    const accounts = new LocalAccounts(fresh());
    const made = accounts.create("Ridgeback");
    accounts.signOut();
    expect(accounts.current()).toBe(null);

    expect(accounts.signIn(` ${made.code.toLowerCase()} `)?.id).toBe(made.id);
    expect(accounts.current()?.id).toBe(made.id);
  });

  /** A code from another device cannot be honoured, so it must fail rather than half-work. */
  it("returns null for a code no colony here has", () => {
    const accounts = new LocalAccounts(fresh());
    accounts.create("Ridgeback");
    accounts.signOut();
    expect(accounts.signIn("ZA-ZZZZ-ZZZZ")).toBe(null);
    expect(accounts.signIn("")).toBe(null);
    expect(accounts.current()).toBe(null);
  });

  /**
   * SIGNING OUT DESTROYS NOTHING. That is the whole difference between it and the reset
   * row two headings below it in Settings.
   */
  it("keeps every colony through a sign-out", () => {
    const store = fresh();
    const accounts = new LocalAccounts(store);
    const made = accounts.create("Ridgeback");
    accounts.storeFor(made).update((p) => { p.colony = 4242; p.mycel = 77; });

    accounts.signOut();
    const later = new LocalAccounts(store);
    const back = later.signIn(made.code);
    expect(back).toBeTruthy();
    expect(later.storeFor(back!).get().colony).toBe(4242);
    expect(later.storeFor(back!).get().mycel).toBe(77);
  });

  it("leads the picker with the colony last played", () => {
    const accounts = new LocalAccounts(fresh());
    accounts.create("First");
    const second = accounts.create("Second");
    accounts.signIn(accounts.list().find((a) => a.name === "First")!.code);
    expect(accounts.list()[0]?.name).toBe("First");
    expect(accounts.list().map((a) => a.name)).toContain(second.name);
  });
});

describe("forgetting one", () => {
  it("removes the account and its save", () => {
    const store = fresh();
    const accounts = new LocalAccounts(store);
    const made = accounts.create("Ridgeback");
    accounts.storeFor(made).update((p) => { p.colony = 1234; });

    expect(accounts.forget(made.id)).toBe(true);
    expect(accounts.list()).toEqual([]);
    expect(accounts.current()).toBe(null);
    expect(store.get(keyFor(made.id))).toBe(null);
    expect(accounts.forget(made.id), "forgetting twice is not an error").toBe(false);
  });

  /**
   * A NEW ACCOUNT MAY NEVER INHERIT A FORGOTTEN ONE'S KEY. Numbering by the roster's
   * LENGTH would hand it straight over, and the next colony created would open on the
   * leftovers of the one just deleted — the same rule the trait uids follow.
   */
  it("never reuses a forgotten account's key", () => {
    const accounts = new LocalAccounts(fresh());
    accounts.create("First");
    const second = accounts.create("Second");
    accounts.forget(second.id);
    const third = accounts.create("Third");
    expect(third.id).not.toBe(second.id);
    expect(keyFor(third.id)).not.toBe(keyFor(second.id));
  });
});

/**
 * THE SAVE THAT IS ALREADY THERE BECOMES ACCOUNT ONE.
 *
 * Without this, every existing player opens this build to a sign-in screen with their
 * colony sitting under the old key and no way to reach it — which reads as the game having
 * deleted everything.
 */
describe("a save from before accounts existed", () => {
  const withOldSave = (): MemoryStore => {
    const store = fresh();
    const old = new ProfileStore(store, PROFILE_KEY);
    old.update((p) => { p.name = "Ridgeback"; p.colony = 88_000; p.mycel = 500; });
    return store;
  };

  it("is adopted, signed in, and keeps its key", () => {
    const store = withOldSave();
    const accounts = new LocalAccounts(store);

    const now = accounts.current();
    expect(now?.id).toBe(LEGACY_ID);
    expect(now?.name).toBe("Ridgeback");
    expect(keyFor(LEGACY_ID)).toBe(PROFILE_KEY);
    expect(accounts.storeFor(now!).get().colony).toBe(88_000);
  });

  it("carries the code the save already had, so Support still matches", () => {
    const store = withOldSave();
    const code = new ProfileStore(store, PROFILE_KEY).get().playerId;
    expect(new LocalAccounts(store).current()?.code).toBe(code);
  });

  it("adopts exactly once, however often the app starts", () => {
    const store = withOldSave();
    new LocalAccounts(store);
    new LocalAccounts(store);
    expect(new LocalAccounts(store).list().length).toBe(1);
  });

  it("leaves a device with no save at all on a clean sign-in screen", () => {
    const accounts = new LocalAccounts(fresh());
    expect(accounts.list()).toEqual([]);
    expect(accounts.current()).toBe(null);
  });
});
