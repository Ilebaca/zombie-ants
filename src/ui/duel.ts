/**
 * CHALLENGING SOMEBODY YOU KNOW.
 *
 * Two screens' worth of parts, both small, because the duel flow is deliberately the
 * ORDINARY flow with one step added and one step skipped:
 *
 *   challenging  home → map → colony → formation → WHO → the match
 *   invited      the invitation bar → colony → formation → the match
 *
 * The guest does not pick the ground. The person who sends the challenge picks it, and the
 * bar tells the guest which one it is — there is no negotiating a position between two
 * people who are not both looking at a screen, and asking the guest to choose one too
 * would mean one of the two answers was thrown away.
 *
 * Everything here is DOM and nothing here decides anything: `App` owns the flow, this file
 * owns what it looks like, and `platform/duels.ts` owns what a challenge IS.
 */
import { MAPS } from "../engine";
import { compact } from "../platform";
import type { DuelInvite, Friend, ProfileStore } from "../platform";
import { antPortrait, el, screenEl, screenHeader } from "./chrome";
import { icon } from "./icons";

export interface DuelPickOptions {
  profile: ProfileStore;
  onBack: () => void;
  /** The friend to play. The match starts from here. */
  onPick: (friend: Friend) => void;
  /** No friends yet: the screen offers the way to get some rather than a dead end. */
  onFindFriends: () => void;
}

/**
 * WHO TO PLAY — the last step of setting a challenge up.
 *
 * A list of the player's own friends and nothing else. There is deliberately no search
 * here: a challenge goes to somebody you have already added, and putting the directory on
 * this screen would make it a second Friends screen with a different button on it.
 */
export function buildDuelPick(opts: DuelPickOptions): HTMLElement {
  const root = screenEl("duelpick");
  screenHeader(root, {
    title: "Who to play",
    sub: "Challenge a friend to this match",
    onBack: opts.onBack,
    backId: "duelBack",
  });

  const body = el("div", "screenbody");
  const friends = opts.profile.get().friends;

  if (friends.length === 0) {
    // A dead end with an explanation is still a dead end: the empty state carries the way
    // out of it, which is the same rule the Friends screen's own empty tabs follow.
    const empty = el("div", "duelempty");
    empty.append(
      el("div", "duelemptyh", "No friends yet"),
      el("div", "duelemptyp", "A challenge goes to somebody on your list. Find a colony and add them first."),
    );
    const go = el("button", "cta", "Find colonies");
    go.onclick = opts.onFindFriends;
    empty.appendChild(go);
    body.appendChild(empty);
  } else {
    for (const friend of friends) body.appendChild(friendRow(friend, () => opts.onPick(friend)));
  }

  root.appendChild(body);
  return root;
}

function friendRow(friend: Friend, onPick: () => void): HTMLElement {
  const row = el("button", "duelrow");
  row.dataset.friend = friend.id;
  const face = el("div", "duelface");
  face.appendChild(antPortrait(friend.species, 72));
  const mid = el("div", "duelmid");
  mid.append(
    el("div", "duelname", friend.name),
    el("div", "duelsub", `${compact(friend.colony)} troops`),
  );
  row.append(face, mid, el("span", "duelgo", "Challenge"));
  row.onclick = onPick;
  return row;
}

export interface InviteBarOptions {
  invite: DuelInvite;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * THE INVITATION, ON TOP OF THE SCREEN IT INTERRUPTS.
 *
 * It sits on the map picker — the screen a challenge would otherwise start on — because
 * that is where the button sends a player who has one waiting, and because it is the
 * choice the invitation REPLACES: the ground is already decided, so the bar states which
 * one it is instead of the player choosing.
 *
 * Accept and Decline are both here. An invitation you can only accept is a demand.
 */
export function inviteBar(opts: InviteBarOptions): HTMLElement {
  const { invite } = opts;
  const bar = el("div", "invbar");
  bar.dataset.invite = invite.id;

  const face = el("div", "invface");
  face.appendChild(antPortrait(invite.from.species, 64));

  // The NAME is the line that must survive: "…challenged you" is the same on every
  // invitation there will ever be, so it is the half that gets cut when the bar is narrow.
  const mid = el("div", "invmid");
  const who = el("div", "invwho");
  who.append(el("b", "invname", invite.from.name), el("span", "invverb", " challenged you"));
  mid.append(
    who,
    el("div", "invwhat", `${MAPS[invite.map].name} · ${compact(invite.from.colony)} troops · ${waitingFor(invite.at)}`),
  );

  const accept = el("button", "invbtn", "Accept");
  accept.onclick = opts.onAccept;
  const decline = el("button", "invghost");
  decline.setAttribute("aria-label", `Decline ${invite.from.name}`);
  decline.appendChild(icon("cross", 16));
  decline.onclick = opts.onDecline;

  bar.append(face, mid, accept, decline);
  return bar;
}

/**
 * How long an invitation has been waiting.
 *
 * NOT `agoOf` from the news feed, and the difference is the unit rather than the wording:
 * a post lives for weeks and is dated in days, so "Today" is the right answer for one that
 * arrived this morning. A challenge lives for minutes, and "Today" tells the player
 * nothing about whether the person who sent it is still there.
 */
export function waitingFor(at: number, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - at) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
