/**
 * FINDING AN OPPONENT: the screen between picking a formation and the board.
 *
 * A vertical split. You are on the left — your colony's head, your name under it, the size
 * of your colony under that. The right half is the seat across the board, and while the
 * search runs it REELS: a column of profiles scrolling past under motion blur, too fast to
 * read, which is the one thing a search screen has to say — that it is looking at people
 * and has not settled on one.
 *
 * When somebody is seated the reel STOPS DEAD on them. Not eased, not decelerated: a
 * gradual stop reads as an animation finishing, and a hard one reads as a search hitting
 * something. Then the two halves part and the board is already underneath, with the camera
 * coming down onto it (render/intro.ts) — the reveal and the opening are one movement, so
 * the split hands over to the descent rather than cutting to it.
 *
 * It knows nothing about how an opponent is found. `platform/matchmaking.ts` owns that, and
 * owns the rule that seats a bot when nobody answers in five seconds; this screen would
 * behave identically the day a real person is on the other end.
 */
import type { Opponent } from "../platform";
import { compact } from "../platform";
import type { SpeciesId } from "../engine";
import { SPECIES_COL } from "../render";
import { antPortrait, el } from "./chrome";

/** One side's card. The player's is fixed; the opponent's is what the reel lands on. */
export interface Seat {
  name: string;
  colony: number;
  species: SpeciesId;
}

export interface MatchmakingOptions {
  you: Seat;
  /** Who to reel past while the search runs. Never the one who is found. */
  roster: readonly Opponent[];
  /** Resolves with whoever was seated; rejects if the search was abandoned. */
  search: () => Promise<Opponent>;
  /** The opponent is on screen and the halves have parted. The match starts here. */
  onFound: (foe: Opponent) => void;
}

/** How long the found opponent is held before the halves part. */
const HOLD_MS = 900;
/** How long the split takes. Quick: it is a reveal, not a transition. */
const SPLIT_MS = 520;
/**
 * How long the strip takes to travel its own length, in milliseconds per card.
 *
 * Slow enough to read as a list being looked THROUGH rather than shuffled. The reel used
 * to swap one card every 90ms and jitter it up and down, which is two hard motions a
 * second and reads as aggression; this is one continuous drift.
 */
const REEL_MS_PER_CARD = 780;

export class MatchmakingScreen {
  private root: HTMLElement;
  private reel: HTMLElement;
  private foeCard: HTMLElement;
  private status: HTMLElement;
  private timers: number[] = [];
  private abort = new AbortController();
  private done = false;

  constructor(host: HTMLElement, private opts: MatchmakingOptions) {
    this.root = el("div", "mmk");
    this.root.id = "matchmaking";

    const left = el("div", "mmk-half mmk-you");
    left.appendChild(seatCard(opts.you));

    const right = el("div", "mmk-half mmk-foe");
    // The reel and the found card share the half: the reel is on top until it stops, so
    // the card behind it is the same box in the same place — nothing jumps on the swap.
    this.reel = el("div", "mmk-reel");
    this.foeCard = el("div", "mmk-found");
    right.append(this.reel, this.foeCard);

    this.status = el("div", "mmk-status", "Searching for an opponent…");

    this.root.append(left, right, this.status);
    host.appendChild(this.root);

    this.spin();
  }

  /**
   * Begin the search.
   *
   * SEPARATE from the constructor, and it has to be: the caller's `search` closure wants
   * the screen — it hands the screen's own abort signal to the finder — and a constructor
   * that searched immediately would run that closure while the caller's binding was still
   * in its temporal dead zone. The search threw, the catch below swallowed it, and the reel
   * turned for ever with nobody ever seated.
   */
  start(): void {
    void this.run();
  }

  /**
   * The reel: one long strip of profiles, drifting continuously.
   *
   * A STRIP, not a card being swapped. Replacing one card on a timer is a hard cut every
   * step however short the step is, and no amount of blur hides a jump — the motion has to
   * be continuous for the blur to read as speed rather than as a flicker. The roster is
   * laid down TWICE and the strip travels exactly half its height, so the moment it wraps
   * is showing the same thing it was: the loop has no seam to see.
   */
  private spin(): void {
    const roster = this.opts.roster;
    if (!roster.length) return;
    const strip = el("div", "mmk-strip");
    for (const seat of [...roster, ...roster]) strip.appendChild(seatCard(seat));
    strip.style.animationDuration = `${roster.length * REEL_MS_PER_CARD}ms`;
    this.reel.appendChild(strip);
  }

  private async run(): Promise<void> {
    let foe: Opponent;
    try {
      foe = await this.opts.search();
    } catch {
      return;                               // the player left; `destroy` has cleaned up
    }
    if (this.done) return;
    this.land(foe);
  }

  /** Somebody is seated: stop dead, show them, hold, then part. */
  private land(foe: Opponent): void {
    this.reel.remove();
    this.foeCard.appendChild(seatCard(foe));
    this.foeCard.classList.add("on");
    this.status.textContent = "Opponent found";
    this.root.classList.add("found");

    this.after(HOLD_MS, () => {
      this.root.classList.add("split");
      // The board is revealed as the halves move, so the match starts NOW rather than when
      // they finish: the camera's descent plays through the gap as it widens.
      this.opts.onFound(foe);
      this.after(SPLIT_MS, () => this.destroy());
    });
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  /** Tear it all down. Safe to call twice, and from a search that never finished. */
  destroy(): void {
    if (this.done) return;
    this.done = true;
    this.abort.abort();
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.root.remove();
  }

  /** The signal to hand a `Matchmaker`, so leaving the screen abandons the search. */
  get signal(): AbortSignal { return this.abort.signal; }
}

/** One profile: the colony's head, the name, the size. The same card on both halves. */
function seatCard(seat: Seat): HTMLElement {
  const card = el("div", "mmk-card");
  const troops = el("div", "mmk-colony", `${compact(seat.colony)} troops`);
  // Each figure takes ITS OWN colony's colour rather than the board's you/enemy pair. The
  // faction colours are not set until the match is built, so at this point the enemy's is
  // still the last match's — and a player is their colony here, not a side.
  troops.style.color = (SPECIES_COL[seat.species] ?? SPECIES_COL.fire)[1] as string;
  card.append(antPortrait(seat.species, 108, "mmk-head"), el("div", "mmk-name", seat.name), troops);
  return card;
}

