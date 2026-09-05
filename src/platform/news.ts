/**
 * NEWS: what changed, written for the player rather than for a changelog.
 *
 * The posts are a table in the app rather than something fetched, because there is no
 * server yet (roadmap step 6). That is a real constraint and not a placeholder: a build
 * ships with the notes for what is in it, which is how a store listing works too. When
 * there is a server this file's `NEWS` becomes its response and the screen does not move.
 *
 * EVERY POST CARRIES A PICTURE AND IT IS DRAWN, NEVER A FILE. The same rule the manual and
 * the pickers follow (CLAUDE.md — the pickers show the game): a screenshot goes stale the
 * moment the thing it shows is changed, and this project has no image pipeline. A post
 * about the board draws a real `GameState` with the board's own code; a post about a
 * screen draws its mark on a plate of that screen's colour.
 */
import type { MapId, SpeciesId } from "../engine";

/** What a post is illustrated with. Both are drawn at render time. */
export type NewsArt =
  | { kind: "board"; map: MapId; species: SpeciesId }
  | { kind: "mark"; icon: string; col: string };

export type NewsTag = "update" | "balance" | "coming";

export interface NewsPost {
  /** Stable, and the key the "read" mark is stored under. Never renumber one. */
  id: string;
  tag: NewsTag;
  title: string;
  /** The lead line under the title, and the only part shown in a collapsed card. */
  lead: string;
  /** Paragraphs. Plain text — the screen builds nodes, never innerHTML. */
  body: readonly string[];
  /** When it was posted, epoch ms. Sorted newest first by `newsFeed()`. */
  at: number;
  art: NewsArt;
  /**
   * IS THIS WORTH STOPPING SOMEBODY FOR?
   *
   * A player who has been away is shown the major posts once, over the home screen
   * (`ui/whatsnew.ts`) — everything else waits quietly behind the badge on the drawer. The
   * flag is set by whoever writes the post rather than derived from the tag, because
   * "update" covers both a whole new feature and a button that moved, and only one of those
   * has earned a card in front of the game. Most posts are not major; a card that appears
   * every build is a card nobody reads.
   */
  major?: boolean;
}

const DAY = 86_400_000;
/** Everything is dated back from one stamp so the feed keeps its order forever. */
const LATEST = Date.UTC(2026, 7, 30);

export const NEWS: readonly NewsPost[] = [
  {
    // NOT major, deliberately, and it is the newest post in the table. A card in front of
    // the game is for something a player would want to be told; a fix they never met is
    // not, and it waits behind the badge like the rest of the feed.
    id: "fixes",
    tag: "update",
    title: "Fixes",
    lead: "Challenge matches, and a few smaller things.",
    at: LATEST + 6 * DAY,
    art: { kind: "mark", icon: "flask", col: "#4a9eff" },
    body: [
      "Starting a challenge from the Challenges tab left the list drawn on top of the "
      + "action bar, so End turn, the ability and Surrender could not be pressed. Fixed.",
      "The game now covers itself while it loads instead of showing a blank screen, and "
      + "the privacy policy is readable from Support.",
    ],
  },
  {
    id: "resume",
    tag: "update",
    major: true,
    title: "A match now waits for you",
    lead: "A phone call no longer costs you the game.",
    at: LATEST + 5 * DAY,
    art: { kind: "board", map: "small", species: "army" },
    body: [
      "Until now, closing the game in the middle of a match lost it — every turn played, "
      + "and everything it would have paid your colony. It is written down after every move "
      + "now, so you can put the phone down at any point.",
      "When you come back it is waiting on the home screen, with the map and the turn you "
      + "left it on. Pick it up and you carry on from exactly the board you left, with your "
      + "match time carried over.",
      "On Android the back button now goes up one screen instead of closing the game — and "
      + "backing out of a match takes you home rather than ending it. The match is still "
      + "there when you want it.",
      "If anything goes wrong, the game now says so and offers to reload rather than "
      + "quietly stopping. Your colony is saved either way.",
    ],
  },
  {
    id: "granary",
    major: true,
    tag: "update",
    title: "The granary",
    lead: "Your colony now grows while you are not playing.",
    at: LATEST,
    art: { kind: "mark", icon: "granary", col: "#e7b53a" },
    body: [
      "Harvester ants carry seed back around the clock and store it underground. The "
      + "brood eats whether or not the colony is at war — so from this build your colony "
      + "grows between matches as well as during them.",
      "The granary is the first room down in the Anthill. It starts dug at level one and "
      + "goes to seven, and each level fills the store faster. The rate is a share of what "
      + "your colony is already worth, so it keeps up with you all the way up the road.",
      "The store holds twelve hours and then stops filling, so there is always a reason to "
      + "come back. Collect it from the pill under your troop count on the home screen.",
      "Levels two to seven unlock as you climb the Colony Road — chapters 6, 12, 20, 30, "
      + "40 and 50 — and cost mycelium to dig.",
    ],
  },
  {
    id: "ladder",
    major: true,
    tag: "update",
    title: "The ladder tells you where you stand",
    lead: "Divisions, ranks, and the distance to the next band.",
    at: LATEST - 2 * DAY,
    art: { kind: "mark", icon: "trophy", col: "#27d3bd" },
    body: [
      "Biggest Colonies now opens with your division and your place in it held at the top "
      + "of the screen instead of scrolling away under the table.",
      "Your banner carries your rank in words, a bar showing how far through the division "
      + "you are, and exactly how many troops the next one is. Tap through the other "
      + "divisions and each says whether you have outgrown it or how far off it is.",
      "Every colony on the ladder has a face now, drawn in its own species — and your row "
      + "carries the name you set in Settings.",
    ],
  },
  {
    id: "maps",
    major: true,
    tag: "update",
    title: "Pick your ground",
    lead: "Real maps in the picker, and an opponent to find.",
    at: LATEST - 5 * DAY,
    art: { kind: "board", map: "small", species: "fire" },
    body: [
      "The map picker used to show three coloured diagrams. It shows the real board now — "
      + "the gems, the rocks, the water, the Hive and both colonies exactly where they will "
      + "be when the match starts. Swipe between them.",
      "The formation picker got the same treatment: every shape is your actual opening "
      + "position, drawn by the game.",
      "And before a match starts, the game now looks for an opponent. Nobody is on the "
      + "other side of the world yet, so after five seconds a colony from your own chapter "
      + "of the road takes the seat.",
    ],
  },
  {
    id: "roadmap",
    tag: "coming",
    title: "What is next",
    lead: "Friends, real opponents, and a season.",
    at: LATEST - 9 * DAY,
    art: { kind: "mark", icon: "friends", col: "#4a9eff" },
    body: [
      "Asynchronous matches against real colonies are the next big piece, and the ladder "
      + "is built for it — the same screen will show real standings the day the server is "
      + "there.",
      "Friends comes with it: your list is already here, and requests will travel between "
      + "real players rather than staying on your own device.",
      "Anything you want to see, send it from Support. It is read.",
    ],
  },
];

/** Newest first, which is the only order a feed is ever read in. */
export const newsFeed = (): NewsPost[] => [...NEWS].sort((a, b) => b.at - a.at);

/** How many posts landed after the last time the player opened the screen. */
export const unreadNews = (seenAt: number): number =>
  NEWS.filter((p) => p.at > seenAt).length;

/**
 * The MAJOR posts a player has not seen — what is worth putting in front of them once.
 *
 * Newest first, and capped: a player who has been away for three builds should be told
 * what changed, not handed a reading list. What is left over is still behind the badge on
 * the drawer, which is where a feed belongs.
 */
export const majorSince = (seenAt: number, cap = 3): NewsPost[] =>
  newsFeed().filter((p) => p.major === true && p.at > seenAt).slice(0, cap);

/** The newest post's stamp — what the screen writes back once it has been read. */
export const newsLatestAt = (): number => NEWS.reduce((n, p) => Math.max(n, p.at), 0);

/**
 * "Today", "3 days ago", "2 weeks ago".
 *
 * A date is the wrong unit for a feed: what a reader wants to know is whether a post is
 * new, and "27 Aug" only answers that if they know today's date.
 */
export function agoOf(at: number, now: number = Date.now()): string {
  const days = Math.floor((now - at) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  const months = Math.max(1, Math.round(days / 30));
  return months === 1 ? "A month ago" : `${months} months ago`;
}
