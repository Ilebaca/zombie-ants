/**
 * DUELS: challenging somebody you know, and the seam a server will slot into.
 *
 * WHAT A BACKEND HAS TO PROVIDE, in one place, so it can be built against:
 *
 *   POST  /duels                {toPlayerId, map}     -> DuelOutcome (accepted carries the seed)
 *   POST  /duels/:id/answer     {accept}              -> DuelOutcome
 *   GET   /duels                                      -> DuelInvite[]   (or a socket; see subscribe)
 *   POST  /matches/:id/result   MatchOutcome          -> RecordedResult (platform/results.ts)
 *
 * The seed on an accept is the load-bearing part: both players must open the same board or
 * nothing replays and nothing can be verified (engine/protocol.ts). Only one side can
 * choose it, which is the server.
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

/**
 * How a challenge ended.
 *
 * A RESULT RATHER THAN A PERSON, and that is the whole reason this type exists. The first
 * version resolved with the friend and rejected on abandonment, which left "they said no"
 * and "they are not online" with nowhere to go but an exception — and an exception is for
 * something going wrong, not for an answer nobody wanted. All four of these are ordinary
 * outcomes a real opponent produces, and the screen can say something different for each.
 */
export type DuelOutcome =
  | { kind: "accepted"; who: Person; seed: number }
  | { kind: "declined" }
  | { kind: "timeout" }
  | { kind: "offline" }
  | { kind: "abandoned" };

/**
 * An invitation arriving while the app is open.
 *
 * `subscribe` is the half a server needs and a local build cannot have: with no server
 * nothing ever arrives on its own, so `LocalDuels` registers the listener and calls it
 * never. It is here anyway because the shape is the point — a badge that can only change
 * when the local code writes it is not a notification, and discovering that after a
 * backend exists means rewriting the screens that read it.
 */
export interface DuelService {
  /**
   * Ask a friend for a match.
   *
   * Never rejects: every way this can end is a `DuelOutcome`, including the player walking
   * away. The signal is the matchmaking screen's, so leaving cannot start a match behind
   * whatever they went to.
   */
  challenge(friend: Friend, map: MapId, signal: AbortSignal): Promise<DuelOutcome>;

  /**
   * Answer one that came in. The server decides; this reports what it decided.
   *
   * The SEED comes back on an accept because both players must open the same board — it
   * is what makes two clients replay to the same position (engine/protocol.ts), and only
   * one side can choose it.
   */
  answer(invite: DuelInvite, accept: boolean): Promise<DuelOutcome>;

  /** Called whenever the set of waiting invitations changes. Returns an unsubscribe. */
  subscribe(onChange: (invites: readonly DuelInvite[]) => void): () => void;
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
  constructor(private wait = DUEL_WAIT_MS, private seed = () => (Math.random() * 2 ** 31) | 0) {}

  challenge(friend: Friend, _map: MapId, signal: AbortSignal): Promise<DuelOutcome> {
    return new Promise((resolve) => {
      if (signal.aborted) { resolve({ kind: "abandoned" }); return; }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve({
          kind: "accepted",
          who: { id: friend.id, name: friend.name, colony: friend.colony, species: friend.species },
          // Chosen HERE because offline there is nobody else to choose it. With a server
          // this is the server's number, and both players are handed the same one.
          seed: this.seed(),
        });
      }, this.wait);
      const onAbort = (): void => { clearTimeout(timer); resolve({ kind: "abandoned" }); };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  /** Offline the answer is simply what the player pressed: there is nobody to tell. */
  answer(invite: DuelInvite, accept: boolean): Promise<DuelOutcome> {
    return Promise.resolve(accept
      ? { kind: "accepted", who: invite.from, seed: this.seed() }
      : { kind: "declined" });
  }

  /**
   * Nothing ever arrives on its own without a server, so this listener is registered and
   * never called. That is the honest offline behaviour rather than a stub — and the
   * unsubscribe is real, so the screens are already tidying up something they will need to.
   */
  subscribe(_onChange: (invites: readonly DuelInvite[]) => void): () => void {
    return () => { /* nothing to stop */ };
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
