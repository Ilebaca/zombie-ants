/**
 * CHALLENGING SOMEBODY YOU KNOW.
 *
 * Two screens' worth of parts, both small, because the duel flow is deliberately the
 * ORDINARY flow with one step added and one step skipped:
 *
 *   challenging  the Friends list → formation → colony → the match
 *   invited      the invitation bar → formation → colony → the match
 *
 * THE "WHO" STEP IS GONE and this file is what is left of it. It was a screen at the end
 * of the flow — a list of your friends with a Challenge button on each — because the way
 * in was a button on home that said only "a friend". The challenge starts ON the friend
 * now (`ui/friends.ts`), which is the same list with the same button, in the one place
 * that already knew who these people are: a screen asking "which friend?" after you have
 * pressed a friend is a question already answered.
 *
 * Everything here is DOM and nothing here decides anything: `App` owns the flow, this file
 * owns what it looks like, and `platform/duels.ts` owns what a challenge IS.
 */
import { MAPS } from "../engine";
import { compact } from "../platform";
import type { DuelInvite } from "../platform";
import { antPortrait, el } from "./chrome";
import { icon } from "./icons";

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
