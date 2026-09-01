/**
 * CHALLENGING SOMEBODY YOU KNOW.
 *
 * The seam and the state. What matters here is not that a friend answers — offline they
 * always do — but the rules around it: an invitation may be accepted exactly once, it has
 * to survive a reload, and a challenge that was abandoned must never start a match behind
 * the screen the player left.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DUELS_MAX, LocalDuels, inviteFrom, seedInvites } from "../duels";
import { MemoryStore } from "../storage";
import { ProfileStore } from "../profile";

const store = (): ProfileStore => new ProfileStore(new MemoryStore());

describe("asking a friend for a match", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const friend = { id: "p:vela", name: "Vela", colony: 900, species: "fire" as const, since: 0 };

  it("seats them after a moment, and agrees a seed", async () => {
    const duels = new LocalDuels(100);
    const promise = duels.challenge(friend, "small", new AbortController().signal);
    vi.advanceTimersByTime(120);
    const out = await promise;
    expect(out.kind).toBe("accepted");
    if (out.kind !== "accepted") return;
    expect(out.who).toMatchObject({ name: "Vela", colony: 900 });
    // THE SEED IS THE MATCH. Both players have to open the same board or nothing replays
    // and no server can verify it, so a challenge that was accepted carries one.
    expect(Number.isInteger(out.seed), "an accepted challenge agreed no seed").toBe(true);
  });

  /**
   * LEAVING THE SCREEN ABANDONS THE CHALLENGE. The same rule the opponent search follows:
   * a promise that settles after the player has walked away must not start a match behind
   * whatever screen they went to.
   *
   * An OUTCOME rather than a rejection, because walking away is an ordinary thing to do.
   * Exceptions are for something going wrong.
   */
  it("gives up when the screen is left", async () => {
    const duels = new LocalDuels(100);
    const abort = new AbortController();
    const promise = duels.challenge(friend, "small", abort.signal);
    abort.abort();
    await expect(promise).resolves.toEqual({ kind: "abandoned" });
    // ...and the timer that would have seated them is gone, not merely ignored.
    vi.advanceTimersByTime(500);
    await expect(promise).resolves.toEqual({ kind: "abandoned" });
  });

  it("refuses one that was abandoned before it started", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(new LocalDuels(1).challenge(friend, "small", abort.signal))
      .resolves.toEqual({ kind: "abandoned" });
  });

  /**
   * ANSWERING ONE THAT CAME IN. Declining is an answer, not a failure — an invitation you
   * can only accept is a demand, and the service has to be able to say so.
   */
  it("reports an accept and a decline as outcomes", async () => {
    const duels = new LocalDuels(1);
    const invite = inviteFrom("Kestra", 1200, "mid", 5000);
    const yes = await duels.answer(invite, true);
    expect(yes.kind).toBe("accepted");
    if (yes.kind === "accepted") expect(yes.who.name).toBe("Kestra");
    await expect(duels.answer(invite, false)).resolves.toEqual({ kind: "declined" });
  });

  /**
   * NOTHING ARRIVES ON ITS OWN OFFLINE, and the listener says so by never firing. The
   * method exists because a badge that can only change when the local code writes it is
   * not a notification — and finding that out after a server exists means rewriting the
   * screens that read it.
   */
  it("takes a listener for invitations that arrive, and hands back a way to stop", () => {
    const duels = new LocalDuels(1);
    let calls = 0;
    const stop = duels.subscribe(() => { calls++; });
    expect(typeof stop, "there is no way to unsubscribe").toBe("function");
    stop();
    expect(calls, "an offline build invented an invitation").toBe(0);
  });
});

describe("invitations on the profile", () => {
  /** A new colony arrives to one, or the receiving half of the feature is unreachable. */
  it("gives a new colony something to accept", () => {
    expect(store().duels.length).toBe(1);
    expect(seedInvites(1000)[0]?.at).toBe(1000);
  });

  /**
   * ACCEPTED ONCE. Accepting is what starts a match, so an invitation that could be taken
   * twice would start two — the same reason a challenge reward returns a boolean.
   */
  it("can only be answered once", () => {
    const s = store();
    const id = s.duels[0]?.id ?? "";
    expect(s.answerDuel(id)).not.toBeNull();
    expect(s.answerDuel(id), "the same invitation was accepted twice").toBeNull();
    expect(s.duels.length).toBe(0);
  });

  it("survives a reload", () => {
    const kv = new MemoryStore();
    const first = new ProfileStore(kv);
    const id = first.duels[0]?.id ?? "";
    expect(new ProfileStore(kv).duels[0]?.id, "the inbox was forgotten").toBe(id);
    first.answerDuel(id);
    expect(new ProfileStore(kv).duels.length, "an answered invitation came back").toBe(0);
  });

  /** ...and the store does not summon another every time the app opens. */
  it("does not seed a second one after the first is answered", () => {
    const kv = new MemoryStore();
    const first = new ProfileStore(kv);
    first.answerDuel(first.duels[0]?.id ?? "");
    expect(new ProfileStore(kv).duels.length).toBe(0);
  });

  it("takes a new one, and refuses a duplicate", () => {
    const s = store();
    const invite = inviteFrom("Kestra", 1200, "mid", 5000);
    expect(s.addDuel(invite)).toBe(true);
    expect(s.addDuel(invite), "the same invitation arrived twice").toBe(false);
  });

  /** An inbox is a list, not a phone book. */
  it("keeps the newest and drops the rest", () => {
    const s = store();
    for (let i = 0; i < DUELS_MAX + 8; i++) s.addDuel(inviteFrom(`Rival${i}`, 100, "small", 1000 + i));
    expect(s.duels.length).toBe(DUELS_MAX);
    expect(s.duels[0]?.from.name, "the newest is not at the top").toBe(`Rival${DUELS_MAX + 7}`);
  });

  /** Saves outlive code: a malformed invitation must not reach a screen as `undefined`. */
  it("throws away an invitation it cannot read", () => {
    const kv = new MemoryStore();
    kv.set("zombie-ants.profile", JSON.stringify({
      // A valid code, so the store treats this as an existing save and does not seed a
      // fresh invitation over the ones being tested.
      playerId: "ZA-4K7M-9QX2",
      duelsIn: [
        { id: "ok", map: "small", at: 1, from: { id: "x", name: "Fine", colony: 10, species: "fire" } },
        { id: "bad-map", map: "nowhere", at: 1, from: { id: "x", name: "X", colony: 1, species: "fire" } },
        { id: "bad-species", map: "small", at: 1, from: { id: "x", name: "X", colony: 1, species: "wasp" } },
        { id: "no-from", map: "small", at: 1 },
        "nonsense",
      ],
    }));
    const kept = new ProfileStore(kv).duels;
    expect(kept.map((d) => d.id)).toEqual(["ok"]);
  });
});
