/**
 * SUPPORT: the questions, and a way to say something back.
 *
 * There is no server (roadmap step 6), so a message cannot be posted anywhere — and a Send
 * button that quietly throws the text away is worse than no button. `SupportGateway` is the
 * seam, exactly as `PurchaseGateway` and `Matchmaker` are: `LocalSupportGateway` KEEPS the
 * message on the device and hands back the mail link, so nothing a player writes is lost
 * and the screen can honestly say where it went. A server-backed one is a new class.
 *
 * The address is a constant in one place because it is the one thing here that has to
 * change before release.
 */
import { BUILD } from "./build";

/** Where a ticket goes. CHANGE THIS before the store release. */
export const SUPPORT_EMAIL = "support@zombie-ants.game";

export type TicketKind = "bug" | "idea" | "help";

export interface Ticket {
  id: string;
  kind: TicketKind;
  text: string;
  at: number;
  /** The build it was written on. The first thing any support reply needs. */
  build: string;
  /** The player's support code, so a message can be matched to a save. */
  player: string;
}

export interface SupportGateway {
  /** Keep the message and hand back a mail link the screen can open. */
  send(kind: TicketKind, text: string, player: string): Ticket;
}

export const TICKET_KINDS: readonly { id: TicketKind; label: string; icon: string }[] = [
  { id: "bug", label: "Something is broken", icon: "flask" },
  { id: "idea", label: "An idea", icon: "star" },
  { id: "help", label: "I need help", icon: "support" },
];

/** The longest a message may be. Long enough to describe a bug, short enough to read. */
export const TICKET_MAX = 600;

export class LocalSupportGateway implements SupportGateway {
  send(kind: TicketKind, text: string, player: string): Ticket {
    return {
      id: `t${Date.now().toString(36)}`,
      kind,
      text: text.slice(0, TICKET_MAX),
      at: Date.now(),
      build: BUILD,
      player,
    };
  }
}

/**
 * The mail link for a ticket.
 *
 * The build and the support code go in the body rather than being asked for: a player
 * should never have to copy a version string out of Settings to report a crash, and a
 * ticket without one is a ticket nobody can act on.
 */
export function mailLink(t: Ticket): string {
  const subject = `Zombie Ants — ${KIND_SUBJECT[t.kind]}`;
  const body = `${t.text}\n\n---\nBuild: ${t.build}\nPlayer: ${t.player}`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`;
}

const KIND_SUBJECT: Record<TicketKind, string> = {
  bug: "Bug report",
  idea: "Idea",
  help: "Help",
};

export interface FaqEntry {
  q: string;
  a: string;
}

/**
 * The questions this game actually raises.
 *
 * Not a generic help page: every one of these is a rule a player can lose a match to
 * without understanding it, or a number they will ask about the first time it moves. The
 * answers name the screen that explains more rather than repeating it — How to play is
 * the manual, and two copies of a rule is two places for it to go stale.
 */
export const FAQ: readonly FaqEntry[] = [
  {
    q: "Why did half my colony stop producing?",
    a: "A tile only counts while a chain of your own tiles or veins links it back to your "
      + "nest. Cut that chain and everything past the break goes quiet until you reconnect "
      + "it. Tunnel galleries are their own root and can never be cut off.",
  },
  {
    q: "Is combat random?",
    a: "No. The same attack against the same defence always gives the same result, every "
      + "time, so you can count a fight out before you commit to it. Two abilities scatter "
      + "on purpose — where Venom Rain lands, and which leaf Fungal Garden keeps.",
  },
  {
    q: "What does taking the Hive queen do?",
    a: "The middle tile only. All five hive tiles and their troops become yours and a "
      + "growth surge runs across your whole colony. When it lapses the tiles go back to "
      + "bare ground, and the queen returns four turns later one level stronger.",
  },
  {
    q: "How does my colony grow?",
    a: "A win pays a share of what you already hold, and that share shrinks as you get "
      + "bigger — 13% of a young colony down to 3% of five million. A loss costs about a "
      + "third of what a win there pays. The granary adds to it while you are away.",
  },
  {
    q: "Why is the enemy always Hard?",
    a: "A matched opponent stands in for a person, and a person who folds is worse than no "
      + "opponent, so they play at full strength. The difficulty in Settings is what the "
      + "challenges use.",
  },
  {
    q: "I bought something and it has not arrived.",
    a: "Purchases are not live yet — this build grants what the shop sells without "
      + "charging, so nothing you tap there can cost you money. If something did not "
      + "arrive, send the build number below and it will be looked at.",
  },
  {
    q: "Will my colony carry over?",
    a: "Your progress is saved on this device. Clearing the browser's data for the game, "
      + "or Reset in Settings, erases it and it cannot be recovered — accounts that follow "
      + "you between devices come with the server.",
  },
  {
    q: "Is my leaderboard position real?",
    a: "Not yet. The colonies you are ranked against are generated until there is a "
      + "server; your own number is real and is exactly what you have earned.",
  },
];
