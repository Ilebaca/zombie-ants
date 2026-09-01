/**
 * DUELS: challenging somebody you know, and the seam a server will slot into.
 *
 * A ranked match is against whoever the finder seats (`matchmaking.ts`). A DUEL is against
 * a named person: you pick the ground, you pick the colony, then you pick the friend, and
 * the match starts when they sit down. From the other side an invitation arrives, and
 * accepting it drops you into the same setup flow with the ground already chosen.
 *
 * Nobody is really out there — there is no server (roadmap step 6) — so `LocalDuels` is the
 * offline stand-in and the friend always answers. That is the same arrangement `Matchmaker`
 * and `PurchaseGateway` have, and for the same reason: the SHAPE is the real one, so a
 * server is a new class and one line in `App`.
 *
 * Two things this file deliberately does NOT do. It does not store anything: invitations
 * live on the profile, because `ProfileStore` is the only thing in this app that writes.
 * And it does not decide what a duel means for the ladder — a match is a match, and the
 * result card and the colony do not care who was across the board.
 */
import type { MapId } from "../engine";
import type { Friend, Person } from "./friends";
import { directory, personId } from "./friends";

/**
 * An invitation, from their side to yours.
 *
 * The MAP is on it because the person who sends the challenge picks the ground — there is
 * no negotiating a position between two people who are not both looking at the screen, and
 * asking the guest to choose one too would mean one of the two choices was thrown away.
 */
export interface DuelInvite {
  /** Stable id, so accepting the same invitation twice cannot start two matches. */
  id: string;
  from: Person;
  map: MapId;
  /** When it arrived, in epoch milliseconds — the bar says how long ago. */
  at: number;
}

export interface DuelService {
  /**
   * Ask a friend for a match.
   *
   * Resolves with the person once they sit down. Rejects if the challenge was abandoned —
   * the caller passes the same abort signal the matchmaking screen uses, so leaving the
   * screen cannot start a match behind it.
   */
  challenge(friend: Friend, map: MapId, signal: AbortSignal): Promise<Person>;
}

/** An inbox is a list, not a phone book: past this the oldest fall off. */
export const DUELS_MAX = 20;

/** How long a friend takes to answer. Long enough to read the screen, short enough to wait. */
export const DUEL_WAIT_MS = 3200;

/**
 * The offline one: the friend always answers, after a moment.
 *
 * "Always" is the honest behaviour for a build with no server. A friend who might decline
 * would need a way to have declined, and there is nobody there to do it — a coin flip
 * would be inventing a refusal rather than reporting one.
 */
export class LocalDuels implements DuelService {
  constructor(private wait = DUEL_WAIT_MS) {}

  challenge(friend: Friend, _map: MapId, signal: AbortSignal): Promise<Person> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new Error("abandoned")); return; }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve({ id: friend.id, name: friend.name, colony: friend.colony, species: friend.species });
      }, this.wait);
      const onAbort = (): void => { clearTimeout(timer); reject(new Error("abandoned")); };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}

/**
 * The invitations a new colony arrives to.
 *
 * The same rule the friend requests follow: nothing can ever arrive on its own without a
 * server, and an Accept button nobody can reach is a screen nobody can tell is finished.
 * One, not three — an inbox that starts full reads as a backlog rather than an invitation.
 */
export function seedInvites(now: number): DuelInvite[] {
  const people = directory();
  const from = people[7] ?? people[0];
  if (!from) return [];
  return [{ id: inviteId(from.id, now), from, map: "small", at: now }];
}

/** Stable id for an invitation: who it is from, and when. */
export const inviteId = (fromId: string, at: number): string => `d:${fromId}:${at}`;

/** An invitation from a person the profile knows by name only. */
export const inviteFrom = (name: string, colony: number, map: MapId, at: number): DuelInvite => ({
  id: inviteId(personId(name), at),
  from: { id: personId(name), name, colony, species: "fire" },
  map,
  at,
});
