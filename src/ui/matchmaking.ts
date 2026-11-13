/**
 * Two horizontal curtains reveal the board as the match starts.
 * Identity and full-body colony artwork stay separate; the top owns the versus badge.
 * Search cancellation and the seamless roster loop are owned here.
 */
import type { Opponent } from "../platform";
import { compact, faceOf } from "../platform";
import { SPECIES, NEUTRAL_MODS, combatPower } from "../engine";
import type { SpeciesId } from "../engine";
import { SPECIES_COL } from "../render";
import { avatarFace, el } from "./chrome";
import { cutCoverFor } from "./covers";
import { powerTag } from "./power-tag";

/** One side's card. The player's is fixed; the opponent's is what the reel lands on. */
export interface Seat {
  name: string;
  colony: number;
  species: SpeciesId;
  /** The selected account avatar, when supplied. */
  avatar?: string | null;
  /** Active combat loadout, supplied by the match setup owner. */
  power?: number;
}

export interface MatchmakingOptions {
  you: Seat;
  /** Who to reel past while the search runs. Never the one who is found. */
  roster: readonly Opponent[];
  /** Uses the same chapter equipment calculation as the upcoming match. */
  opponentPower?: (foe: Opponent) => number;
  /** Resolves with whoever was seated; rejects if the search was abandoned. */
  search: () => Promise<Opponent>;
  /** The opponent is on screen and the halves have parted. The match starts here. */
  onFound: (foe: Opponent) => void;
  /**
   * Who is being waited FOR, when that is already known.
   *
   * A ranked match is a search: nobody is named because nobody has been chosen yet. A
   * challenge is the opposite — the player picked the person — so "searching for an
   * opponent" would be describing something that is not happening. Same screen, because
   * the moment is the same one; different sentence, because the moment means something
   * different.
   */
  awaiting?: string;
}

/** How long the found opponent is held before the halves part. */
const HOLD_MS = 2000;
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

    const top = el("div", "mmk-half mmk-you");
    const topContent = el("div", "mmk-content");
    topContent.appendChild(seatCard(opts.you));
    top.append(topContent, el("div", "mmk-versus", "VERSUS"));

    const bottom = el("div", "mmk-half mmk-foe");
    const bottomContent = el("div", "mmk-content");
    // Search and found states occupy the same composition.
    this.reel = el("div", "mmk-reel");
    this.foeCard = el("div", "mmk-found");
    bottomContent.append(this.reel, this.foeCard);
    bottom.appendChild(bottomContent);

    this.status = el("div", "mmk-status",
      opts.awaiting ? `Waiting for ${opts.awaiting}…` : "Choosing your opponent…");

    this.status.setAttribute("role", "status");
    this.root.append(top, bottom, this.status);
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
    for (const seat of [...roster, ...roster]) strip.appendChild(seatCard({...seat,power:this.opts.opponentPower?.(seat)}));
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
    this.foeCard.appendChild(seatCard({...foe,power:this.opts.opponentPower?.(foe)}));
    this.foeCard.classList.add("on");
    this.status.textContent = this.opts.awaiting
      ? `${this.opts.awaiting} is ready`
      : "Your opponent";
    this.root.classList.add("found");

    this.after(HOLD_MS, () => {
      this.root.classList.add("split");
      // The board is revealed as the halves move, so the match starts NOW rather than when
      // they finish: the colonies grow out of their nests through the gap as it widens.
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

/** Profile details and a separate transparent full-body illustration. */
function seatCard(seat: Seat): HTMLElement {
  const card = el("div", "mmk-card");
  card.dataset.species = seat.species;
  const profile = el("div", "mmk-profile");
  const portrait = el("div", "mmk-head");
  portrait.setAttribute("aria-hidden", "true");
  portrait.appendChild(avatarFace(faceOf(seat.avatar), 112));
  const troops = el("div", "mmk-colony", `${compact(seat.colony)} troops`);
  troops.style.color = (SPECIES_COL[seat.species] ?? SPECIES_COL.fire)[1] as string;
  const avatar = el("div", "mmk-avatar power-host");
  avatar.append(portrait, powerTag(seat.power ?? combatPower(seat.species, NEUTRAL_MODS).total,
    {context:SPECIES[seat.species].name}));
  profile.append(avatar, el("div", "mmk-name", seat.name), troops);
  const art = cutCoverFor(seat.species);
  if (art) {
    const body = document.createElement("img");
    body.className = "mmk-body";
    body.src = art;
    body.alt = SPECIES[seat.species].name;
    body.decoding = "async";
    body.draggable = false;
    card.appendChild(body);
  }
  card.appendChild(profile);
  return card;
}
