/**
 * The match screen: HUD, turn timer, action bar, board input.
 *
 * This layer owns *interaction*, not rules. Every legality question — can this tile act,
 * where may it go, what happens when it does — is answered by the engine. The screen only
 * decides what to show, what to say, and when to hand the turn over.
 */
import {
  MAPS, actionTargets, canActFrom, endTurn, incomeOf, armyOf, moveOrAttack,
  rally, speciesOf, surrender, tileAt, travel, distance, isConnected,
  abilityReady, abilitySpendsTurn, activateAbility, sparePool, tunnelTargets,
  endByObjective, nestTile,
  tilesOwnedBy, allTiles, neighbours, tutorialAiMove, furthestTravel,
} from "../engine";
import type {
  AbilityKind, ActionContext, Coord, EngineEvent, GameOverReason, GameState, MapId, Player,
  PlayerMods, SpeciesId, Tile,
} from "../engine";
import { Thinker, adopt } from "../ai/thinker";
import type { Thought } from "../ai/thinker";
import type { Difficulty } from "../ai/search";
import { BoardRenderer } from "../render";
// How a colony size is written, handed to the renderer rather than reached for by it: the
// board draws the figure, and the progression layer decides what it looks like.
import { compact } from "../platform";
import type { SpotRect, Tour, TourStep } from "./tour";
import { icon } from "./icons";
import type { Cue, Feedback } from "../platform";
import { el } from "./chrome";

/** Seconds a player gets per move before the turn passes automatically. */
const MOVE_SECONDS = 15;
/**
 * How long the AI sits on its turn before playing, in milliseconds.
 *
 * A move that lands the instant the turn flips reads as a machine answering, not as an
 * opponent deciding — the player never gets to look at the board between the two turns.
 * The pause is rolled fresh every turn inside this range so the rhythm is never metronomic.
 *
 * It is a floor on the whole turn, not a delay on top of one: the search runs off the main
 * thread and whatever it spends comes out of the pause, so Easy deciding in a millisecond
 * and Hard searching for a third of a second still feel like the same opponent thinking.
 */
const AI_THINK_MIN_MS = 1000;
const AI_THINK_MAX_MS = 4000;

type Mode = "go" | "rally" | "tunnel";

/**
 * One side's identity, drawn on the ground beside its own base (render/plates.ts).
 *
 * The species is not here: the board already knows what each side is fielding, and two
 * sources for it is two things to disagree.
 */
export interface Nameplate {
  name: string;
  /** Troops. Fixed for the length of the match — a colony is settled when it ends. */
  colony: number;
}

export interface MatchOptions {
  state: GameState;
  mods: Record<Player, PlayerMods>;
  ctx: ActionContext;
  difficulty: Difficulty;
  map: MapId;
  /** `played` is the wall clock: how long the match was playable, in milliseconds. */
  onExit?: (winner: Player | null, reason: GameOverReason | null, played: number) => void;
  /** Fired when the player casts, so the shell can record the stat. */
  onAbilityCast?: (kind: AbilityKind) => void;
  /**
   * Every batch of engine events, after the renderer has taken them. The shell uses this to
   * score quests. It is a read-only pass-through: the match does not care what happens to
   * them, and the engine stays unaware that anything is listening.
   */
  onEvents?: (events: readonly EngineEvent[]) => void;
  /**
   * Sound and haptics. Optional: a match with none is a silent match, not a broken one,
   * which is what every test and every platform without an audio device gets.
   */
  feedback?: Feedback;
  /**
   * Scenario objective. Returns the winner when a batch of events settles it, or null to
   * play on. The match asks; it does not know what the objective is.
   */
  judge?: (events: readonly EngineEvent[]) => Player | null;
  /**
   * Walk a new player through their first turn. The overlay belongs to the app shell, so
   * the meta tour and this one are the same tour and never appear at once.
   */
  tutorial?: boolean;
  tour?: Tour;
  /**
   * Who is playing, on both sides. The match shows them and nothing else: it does not read
   * the profile (that is the shell's job) and nothing here can change a colony.
   */
  plates?: Record<Player, Nameplate>;
  /** Steps the meta walk already showed, so this half's counter carries on from it. */
  tourFrom?: number;
  /** The last step was finished or skipped: the tutorial is over for good. */
  onTutorialDone?: () => void;
}

export class MatchScreen {
  private root: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private renderer: BoardRenderer;

  private el!: {
    youArmy: HTMLElement; aiArmy: HTMLElement;
    hiveChip: HTMLElement; hiveK: HTMLElement; hiveV: HTMLElement;
    timeBand: HTMLElement; timeFill: HTMLElement; timeLabel: HTMLElement;
    bMove: HTMLButtonElement; bRally: HTMLButtonElement;
    bAbility: HTMLButtonElement; bEnd: HTMLButtonElement; bSurr: HTMLButtonElement;
  };

  private mode: Mode = "go";
  private selection: Coord | null = null;
  private valid: Coord[] = [];

  private timeLeft = MOVE_SECONDS;
  private timerId: number | null = null;
  private aiTimer: number | null = null;
  /** Holds the result card back while the winner's wash plays. */
  private endTimer: number | null = null;
  /** Holds the turn back while the camera comes down onto the board. */
  private introTimer: number | null = null;
  /** finish() is reachable from several paths; the finale plays once. */
  /**
   * THE MATCH CLOCK. Wall time from the moment the opening hands over to the moment the
   * match is decided, latched there so a card that sits on screen does not keep counting.
   *
   * It lives here rather than in the engine, and it has to: the engine is pure and seeded,
   * so the same moves must replay identically (CLAUDE.md §4.1) — and a real clock is the
   * one input that never does. Nothing about the game reads it; it is a fact ABOUT the
   * match, reported when it is over.
   *
   * The descent is not counted. It plays the same length every time and the player cannot
   * act during it, so charging them for it would put the same two seconds on every match.
   */
  private startedAt = 0;
  private endedAt = 0;

  private finishing = false;
  private surrenderArmed = false;
  private surrenderTimer: number | null = null;
  /** Why the match ended. Only the engine's gameOver event carries it. */
  private endReason: GameOverReason | null = null;
  private thinker = new Thinker();
  /**
   * Bumped whenever this match stops caring about an answer still in flight — torn down, or
   * already finished. The AI thinks off the main thread now, so a reply can arrive after the
   * board it was thinking about has gone.
   */
  private generation = 0;

  constructor(host: HTMLElement, private opts: MatchOptions) {
    this.root = document.createElement("div");
    this.root.className = "match";
    // `.match` is `display: contents` (skin.css) so header/timeband/main/footer are laid
    // out by #app itself, exactly as they are in the legacy build — this wrapper exists
    // only to tear them all down at the end of a match.
    //
    // In a STYLESHEET rather than as an inline style here, and that is the whole reason it
    // moved: an inline style outranks every rule, so the landscape layout — which needs
    // this wrapper to become a real grid — could not override it without `!important`.
    this.root.innerHTML = MARKUP;
    /*
     * THE ACTION BAR'S MARKS ARE DRAWN, NOT TYPESET.
     *
     * They were emoji — a crossed sword, a flag, a sparkle, a skip glyph and a white flag,
     * five pictures from five illustrators rendered differently on every platform. This is
     * the screen a player spends the whole game on, and it was the loudest remaining
     * "unconsidered" signal in the app (CLAUDE.md §10). The markup names a mark and the
     * shell fills it in, because the shell is one HTML string and an SVG cannot be one.
     */
    for (const slot of Array.from(this.root.querySelectorAll<HTMLElement>(".ic[data-ic]"))) {
      slot.replaceChildren(icon(slot.dataset.ic as string, 20));
    }
    host.appendChild(this.root);
    this.bind();

    this.renderer = new BoardRenderer(this.canvas, opts.state, {
      species: opts.state.species,
      // Who is playing is drawn ON THE GROUND, beside each side's own base — so it is the
      // renderer's, not the screen's. Settled for the length of the match either way.
      plates: opts.plates && {
        you: { ...opts.plates.you, species: opts.state.species.you },
        ai: { ...opts.plates.ai, species: opts.state.species.ai },
      },
      colonySize: compact,
    });
  }

  start(): void {
    this.renderer.start();
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    // THE FOOTER HAS TO BE ITS FINAL SIZE BEFORE THE FIRST FRAME. The ability button's
    // label is two lines once it names the ability and its cooldown, and one line in the
    // static markup — so filling it in at the first turn grew the footer by five pixels,
    // which shrank the canvas, which fired the ResizeObserver, which re-measured the board
    // and re-baked the scenery. A blink at the exact moment the opening handed over, with
    // different rocks and sticks on the other side of it.
    this.refreshHUD();
    // The camera comes down through the canopy first, and the colonies fill in from their
    // nests when it lands (render/intro.ts). The clock does not start until it is over.
    this.introTimer = window.setTimeout(this.openMatch, this.renderer.playIntro());
  }

  /**
   * The opening is finished — because it ran its course, or because the player tapped
   * through it. Either way the turn begins exactly once.
   */
  private openMatch = (): void => {
    if (this.introTimer) { clearTimeout(this.introTimer); this.introTimer = null; }
    if (!this.startedAt) this.startedAt = performance.now();
    this.renderer.endIntro();
    this.beginTurn();
    if (this.opts.tutorial && this.opts.tour) this.startTour();
  };

  /* ----------------------------------------------------------------------- TOUR */

  /**
   * The first-turn walkthrough. It PAUSES the match: `startTimer` refuses to run while the
   * tour is up, so a player reading a step never loses the turn to the clock. The steps
   * that ask for a tap wait for the deed rather than the tap — selecting a tile and moving
   * into one are confirmed from `tap()`, so a tap that the engine refused does not count.
   */
  private startTour(): void {
    const tour = this.opts.tour;
    if (!tour) return;
    this.stopTimer();
    const done = (over: boolean) => (): void => {
      this.opts.onTutorialDone?.();
      // Taking the queen was a real action on a real turn, so the turn passes and the REAL
      // opponent takes it from here — that is the hand-over the walk has been rehearsing.
      // A skip is different: the player may not have acted at all, and taking their turn
      // away for pressing Skip would be a strange thank-you.
      if (over && !this.state.over && this.state.current === "you") this.handOver();
      else this.startTimer();
    };
    // The counter carries on from the meta walk rather than restarting: it is one
    // tutorial, and "1 / 13" right after "12 / 25" reads as a second one starting.
    tour.start(this.tourSteps(), {
      onDone: done(true),
      onSkip: done(false),
      done: this.opts.tourFrom ?? 0,
      total: (this.opts.tourFrom ?? 0) + MatchScreen.TOUR_STEPS,
    });
  }

  /** True while the walkthrough is playing the enemy's turn for it. */
  private scripted = false;

  private get touring(): boolean {
    return this.opts.tour?.running === true;
  }

  /** A board cell as a viewport rectangle, for the tour's spotlight. */
  private cellRect(at: Coord | null): SpotRect | null {
    if (!at) return null;
    const box = this.canvas.getBoundingClientRect();
    const layout = this.renderer.layout;
    if (!box.width || layout.ts <= 0) return null;
    return {
      left: box.left + layout.x0(at.c), top: box.top + layout.y0(at.r),
      width: layout.ts, height: layout.ts,
    };
  }

  /* ------------------------------------------------------ THE WALKTHROUGH'S TILES

     Every one of these reads the board as it stands rather than remembering a coordinate.
     A step opens turns after the list was written, with the enemy having moved in between,
     so a captured coordinate would be pointing at history. */

  /** Home, and the camp the arrangement puts beside the enemy tile (engine/tutorial.ts). */
  private home(): Tile | null { return nestTile(this.state, "you"); }

  /** The enemy tile: an AI colony standing on the Hive guard in front of the queen. */
  private foeCell(): Tile | null {
    return allTiles(this.state).find((t) => t.owner === "ai" && t.terrain === "hiveG") ?? null;
  }

  private camp(): Tile | null {
    const foe = this.foeCell();
    if (foe) {
      const beside = neighbours(this.state, foe).find((n) => n.owner === "you");
      if (beside) return beside;
    }
    // Once the enemy tile is taken the camp IS that tile: the fist moved onto it.
    const queen = this.queenCell();
    const q = queen ? tileAt(this.state, queen.c, queen.r) : null;
    return q ? neighbours(this.state, q).find((n) => n.owner === "you") ?? null : null;
  }

  /**
   * A tile to teach with — never the nest and never the camp.
   *
   * The nest is the army the rally is going to gather, and the camp is where it gathers;
   * spending either on a demonstration takes the last two steps away.
   */
  private spare(t: Tile): boolean {
    return t !== this.home() && t !== this.camp();
  }

  private moveSource(): Tile | null {
    return tilesOwnedBy(this.state, "you").find(
      (t) => this.spare(t) && canActFrom(this.state, t) && this.freeNeighbour(t) !== null,
    ) ?? null;
  }

  /** Empty ground beside a tile: what a move CLAIMS, rather than shuffling troops around. */
  private freeNeighbour(from: Tile | null): Coord | null {
    if (!from) return null;
    for (const at of actionTargets(this.state, from)) {
      if (distance(from, at) !== 1) continue;
      const t = tileAt(this.state, at.c, at.r);
      if (t && !t.owner && t.guard === 0 && t.terrain === "ground") return at;
    }
    return null;
  }

  private travelSource(): Tile | null {
    return tilesOwnedBy(this.state, "you").find(
      (t) => this.spare(t) && canActFrom(this.state, t) && this.travelTarget(t) !== null,
    ) ?? null;
  }

  /** The furthest a long send reaches — the engine owns the rule (engine/tutorial.ts). */
  private travelTarget(from: Tile | null): Coord | null {
    return from ? furthestTravel(this.state, from) : null;
  }

  private queenCell(): Coord | null {
    const t = allTiles(this.state).find((x) => x.terrain === "hiveQ");
    return t ? { c: t.c, r: t.r } : null;
  }

  /** A hive tile the player has taken — the doorstep the queen is attacked from. */
  private doorstep(): Tile | null {
    const queen = this.queenCell();
    if (!queen) return null;
    const q = tileAt(this.state, queen.c, queen.r);
    return q ? neighbours(this.state, q).find((n) => n.owner === "you" && canActFrom(this.state, n)) ?? null : null;
  }

  private at(t: Tile | null): Coord | null {
    return t ? { c: t.c, r: t.r } : null;
  }

  /**
   * THE ENEMY ANSWERS, between one lesson and the next.
   *
   * A turn handed over is half of how this game works, and a walkthrough where the enemy
   * never moves teaches a solitaire. It is NOT the real AI: the reply is decided in the
   * engine (`tutorialAiMove`) so the board the next step is about is the board the step was
   * written for. The real opponent takes over the moment the walk ends.
   *
   * Called from the following step's `enter`, so the enemy's move animates under the
   * instruction the player is reading rather than in a pause with nothing on screen.
   */
  private enemyReplies(): void {
    if (!this.touring || this.state.over || this.state.current !== "you") return;
    this.clearSelection();
    // Everything in here is the enemy's doing, and none of it answers the step the player
    // is looking at — a scripted capture would otherwise complete a "take ground" step
    // that the player had not taken.
    this.scripted = true;
    try {
      this.consume(endTurn(this.state, this.opts.mods));
      if (this.state.over) return;
      this.consume(tutorialAiMove(this.state, this.opts.ctx));
      if (this.state.over) return;
      this.consume(endTurn(this.state, this.opts.mods));
    } finally {
      this.scripted = false;
    }
    this.refreshHUD();
  }

  /**
   * Turn a batch of events into the deed a step is waiting for.
   *
   * The steps wait for what actually RESOLVED rather than for the tap that started it, so
   * a move the engine refused leaves the step standing.
   *
   * The deeds are read off the whole BATCH, not one event at a time, because the events do
   * not map one-to-one onto lessons. Walking onto empty ground is a `capture` and not a
   * `move` — `move` is reinforcing a tile you already hold — and a capture is also what a
   * won fight and the end of a long send produce. So "took ground" is a capture with no
   * fight and no march anywhere in the batch.
   *
   * The signal is deferred to a microtask, and that is not decoration: it opens the next
   * step, whose `enter` may hand the turn over — and the caller we are inside is not
   * finished. A step opened DURING the batch had the board changed under it.
   */
  private tourSignals(events: readonly EngineEvent[]): void {
    const tour = this.opts.tour;
    // The enemy's scripted reply is not an answer to the step on screen.
    if (!tour || this.scripted) return;

    const kinds = new Set(events.map((e) => e.type));
    const deeds: string[] = [];
    if (kinds.has("hiveCaptured")) deeds.push("queen");
    if (kinds.has("travel")) deeds.push("travel");
    if (kinds.has("rally")) deeds.push("rally");
    if (kinds.has("abilityCast")) deeds.push("ability");
    for (const e of events) {
      if (e.type !== "combat") continue;
      // The queen's own capture is announced by hiveCaptured; anything else fought for is
      // an attack, wherever it was standing.
      if (tileAt(this.state, e.at.c, e.at.r)?.terrain !== "hiveQ") deeds.push("attack");
    }
    if (!kinds.has("travel") && !kinds.has("combat")
      && (kinds.has("move") || kinds.has("capture"))) deeds.push("move");

    if (!deeds.length) return;
    queueMicrotask(() => { for (const deed of deeds) tour.signal(deed); });
  }

  /**
   * How many steps the match half of the tutorial has.
   *
   * The same for every colony, so the meta half can put the whole tutorial's length on its
   * counter before this screen exists. `onboarding.test.ts` holds the two in step.
   */
  static readonly TOUR_STEPS = 12;

  private tourSteps(): TourStep[] {
    /* FIVE THINGS, EACH ON ITS OWN TURN, EACH IN TWO TAPS.
     *
     * Move, long send, rally, attack, queen — and every one of them is "pick the tile up,
     * then say where it goes", because that is how the player will do it for the rest of
     * their life in this game. Teaching the second tap without the first would leave them
     * with a board they cannot start. The enemy answers between them (`enemyReplies`), and
     * the dark does the rest: the only tap that can land is the one being asked for, so
     * nothing here is real free play until the walk is over. */
    return [
      {
        id: "nest",
        title: "Your nest",
        text: "The corner tile is your queen, and your whole army is sitting in her. Every "
          + "tile you hold has to trace a path back to her; if she falls the match is over.",
        rect: () => this.cellRect(this.at(this.home())),
        pad: 4,
      },
      {
        id: "pickMove",
        title: "Pick a tile up",
        text: "Every move is two taps: the tile you are moving FROM, then where it goes. "
          + "Tap this one. A tile can act with two or more soldiers — one always stays "
          + "behind to hold the ground.",
        rect: () => this.cellRect(this.at(this.moveSource())),
        pad: 4,
        advance: "signal",
        awaits: "select",
      },
      {
        id: "move",
        title: "Take ground",
        text: "The lit tiles are where those soldiers can go. Tap this one — empty ground "
          + "is claimed just by walking onto it.",
        rect: () => this.cellRect(this.freeNeighbour(this.moveSource())),
        pad: 4,
        advance: "signal",
        awaits: "move",
      },
      {
        id: "pickSend",
        title: "The long send",
        text: "That was your turn, and the enemy has just taken theirs. Now something "
          + "further away: tap this tile.",
        enter: () => this.enemyReplies(),
        rect: () => this.cellRect(this.at(this.travelSource())),
        pad: 4,
        advance: "signal",
        awaits: "select",
      },
      {
        id: "send",
        title: "March, and lay a vein",
        text: "Tap the far tile. Beyond a neighbour your soldiers march instead, laying a "
          + "vein behind them — it carries supply and can be cut, but it produces nothing.",
        rect: () => this.cellRect(this.travelTarget(this.travelSource())),
        pad: 4,
        advance: "signal",
        awaits: "travel",
      },
      {
        id: "rallybtn",
        title: "Make a fist",
        text: "The Hive is in the middle of the board, and there is an enemy colony sitting "
          + "on the guard in front of her. Time to gather. Tap Rally.",
        enter: () => this.enemyReplies(),
        find: () => this.root.querySelector("#bRally"),
        advance: "signal",
        awaits: "mode:rally",
      },
      {
        id: "rally",
        title: "All of it, onto one tile",
        text: "Tap your camp beside the Hive. Every spare soldier in the colony marches to "
          + "it, and everywhere else is left holding one — so this is a commitment.",
        rect: () => this.cellRect(this.at(this.camp())),
        pad: 4,
        advance: "signal",
        awaits: "rally",
      },
      {
        id: "pickAttack",
        title: "Pick the fist up",
        text: "Same two taps as before. Tap the tile your army is standing on.",
        enter: () => this.enemyReplies(),
        rect: () => this.cellRect(this.at(this.camp())),
        pad: 4,
        advance: "signal",
        awaits: "select",
      },
      {
        id: "attack",
        title: "Attack",
        text: "Tap the enemy tile. Attack and defence are pure arithmetic — no dice — so "
          + "you can count it out first. Win and their garrison is destroyed and the tile "
          + "is yours; lose and your attackers are the ones who are gone.",
        rect: () => this.cellRect(this.at(this.foeCell())),
        pad: 4,
        advance: "signal",
        awaits: "attack",
      },
      {
        id: "pickQueen",
        title: "One tile from her",
        text: "Your army moved onto the ground it took, and that ground was the queen's "
          + "guard — so she is next door now. Pick the tile up.",
        enter: () => this.enemyReplies(),
        rect: () => this.cellRect(this.at(this.doorstep())),
        pad: 4,
        advance: "signal",
        awaits: "select",
      },
      {
        id: "queen",
        title: "Take the queen",
        text: "Tap her. Taking the QUEEN — not just her guards — hands your whole colony a "
          + "growth surge for a few turns.",
        rect: () => this.cellRect(this.queenCell()),
        pad: 4,
        advance: "signal",
        awaits: "queen",
      },
      {
        id: "done",
        title: "The rest is yours",
        text: "That is the whole game: spread, surround, consume. Take the enemy nest in "
          + "the far corner and the match is yours. Off you go.",
        find: () => this.root.querySelector("header"),
        pad: 2,
      },
    ];
  }

  destroy(): void {
    if (this.touring) this.opts.tour?.stop();
    this.generation++;
    this.thinker.dispose();
    this.renderer.stop();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.clearTimers();
    if (this.endTimer) { clearTimeout(this.endTimer); this.endTimer = null; }
    if (this.introTimer) { clearTimeout(this.introTimer); this.introTimer = null; }
    this.root.remove();
  }

  /* ------------------------------------------------------------------ DOM WIRING */

  private bind(): void {
    const pick = <T extends HTMLElement>(id: string): T => {
      const el = this.root.querySelector<T>("#" + id);
      if (!el) throw new Error(`match screen is missing #${id}`);
      return el;
    };
    this.canvas = pick<HTMLCanvasElement>("cv");
    this.el = {
      youArmy: pick("youArmy"), aiArmy: pick("aiArmy"),
      hiveChip: pick("hiveChip"), hiveK: pick("hiveK"), hiveV: pick("hiveV"),
      timeBand: pick("timeBand"), timeFill: pick("timeFill"), timeLabel: pick("timeLabel"),
      bMove: pick<HTMLButtonElement>("bMove"), bRally: pick<HTMLButtonElement>("bRally"),
      bAbility: pick<HTMLButtonElement>("bAbility"), bEnd: pick<HTMLButtonElement>("bEnd"),
      bSurr: pick<HTMLButtonElement>("bSurr"),
    };

    // Every control skips the opening rather than acting through it. The footer is DOM, so
    // it is live while the camera is still coming down — and End turn during the descent
    // would hand the first turn over before the match had visibly started.
    const acting = (): boolean => {
      if (!this.introTimer) return true;
      this.openMatch();
      return false;
    };
    this.el.bMove.onclick = () => { if (acting()) this.setMode("go"); };
    this.el.bRally.onclick = () => { if (acting()) this.setMode("rally"); };
    this.el.bEnd.onclick = () => {
      if (!acting()) return;
      if (this.state.over || this.state.current !== "you") return;
      this.handOver();
    };
    this.el.bSurr.onclick = () => { if (acting()) this.onSurrender(); };

    this.el.bAbility.onclick = () => { if (acting()) this.onAbility(); };
  }

  /**
   * Cast the species ability. It is a FREE extra action — the turn continues afterwards,
   * so the player can still move. Tunnelling is the exception: it needs a target tap and
   * deliberately ends the turn.
   */
  private onAbility(): void {
    const s = this.state;
    if (s.over || s.current !== "you") return;
    const ability = speciesOf(s.species.you).ability;

    if (!abilityReady(s, "you")) return;

    if (ability.kind === "tunnel") {
      if (sparePool(s, "you") < 5) {
        return;
      }
      this.setMode("tunnel");
      return;
    }

    const events = activateAbility(s, "you", this.opts.mods.you);
    if (!events.length) {
      return;
    }
    this.cue("ability");
    this.opts.onAbilityCast?.(ability.kind);
    this.consume(events);
    this.showSpellCard(ability.name, ability.desc);
    this.clearSelection();
    this.refreshHUD();
    if (s.over) this.finish();
  }

  /** The ability card: slides in, holds, slides out. Purely decorative. */
  private showSpellCard(name: string, desc: string): void {
    const card = this.root.querySelector<HTMLElement>("#spellCard");
    if (!card) return;
    const title = card.querySelector(".sc-title");
    const body = card.querySelector(".sc-desc");
    if (title) title.textContent = name;
    if (body) body.textContent = desc;
    card.classList.remove("show");
    void card.offsetWidth;                  // restart the CSS animation
    card.classList.add("show");
  }

  private get state(): GameState { return this.opts.state; }

  /* ------------------------------------------------------------------- TURN FLOW */

  private beginTurn(): void {
    this.selection = null;
    this.valid = [];
    this.mode = "go";
    this.syncModeButtons();
    this.disarmSurrender();
    this.refreshHUD();
    this.renderer.setSelection(null, []);

    if (this.state.over) { this.clearTimers(); this.finish(); return; }

    this.startTimer();
    // Thinking starts at once and happens off the main thread, so it overlaps the fill the
    // player's own move is still playing out. The beat before the AI MOVES is kept below.
    if (this.state.current === "ai") void this.runAI();
  }

  private handOver(): void {
    if (this.state.over) { this.finish(); return; }
    this.clearTimers();
    const events = endTurn(this.state, this.opts.mods);
    this.consume(events);
    this.beginTurn();
  }

  private async runAI(): Promise<void> {
    this.aiTimer = null;
    if (this.state.over) { this.finish(); return; }
    const gen = this.generation;
    const started = performance.now();
    const thinkFor = AI_THINK_MIN_MS + Math.random() * (AI_THINK_MAX_MS - AI_THINK_MIN_MS);

    const thought = await this.thinker.think(this.state, "ai", this.opts.difficulty, this.opts.ctx);
    // The match may have ended — surrendered, or torn down — while it was thinking. Adopting
    // the searched board then would undo that, so the answer is simply dropped.
    if (gen !== this.generation || this.state.over) return;

    // However fast the answer came back, the AI sits on the move for the rest of its think
    // time. The searched board is NOT adopted yet: it lands with the animation that shows
    // it (see `playAI`).
    const beat = Math.max(0, thinkFor - (performance.now() - started));
    this.aiTimer = window.setTimeout(() => this.playAI(thought, gen), beat);
  }

  /**
   * The AI's move lands, and is animated, in the same tick.
   *
   * The board must not change before the animation that dramatises it. Adopting the searched
   * board as soon as the answer arrived showed the finished move — troops already on the far
   * tile, in the enemy's colour — and only then played the reveal that was supposed to be
   * showing it happening. It read as the destination flashing and then being animated into.
   */
  private playAI(thought: Thought, gen: number): void {
    this.aiTimer = null;
    if (gen !== this.generation) return;
    adopt(this.state, thought.next);
    const events = thought.events;
    this.consume(events);
    this.refreshHUD();
    // Let the reveal finish before handing over — flipping the turn mid-sweep cuts the
    // animation off.
    this.aiTimer = window.setTimeout(() => this.handOver(), events.length ? 700 : 200);
  }

  /**
   * The match is over.
   *
   * The winner takes the whole board before the card comes up (render/flood.ts). A popup
   * over a board frozen mid-fight told the player it was over without ever showing it; the
   * wash is the showing, and the card waits for it.
   *
   * Reachable from several paths — a queen falling, a surrender, a challenge objective — and
   * more than once from some of them, so it latches. Without that a second call would start
   * a second wash and queue a second card.
   */
  /** How long the match has been playable, in milliseconds. Latched once it is over. */
  get playedMs(): number {
    if (!this.startedAt) return 0;
    return (this.endedAt || performance.now()) - this.startedAt;
  }

  private finish(): void {
    if (this.finishing) return;
    this.finishing = true;
    this.endedAt = performance.now();
    this.clearTimers();
    this.renderer.setSelection(null, []);
    const winner = this.state.winner;
    this.updateTimerUI();

    this.cue(winner === "you" ? "win" : "lose");
    const wait = winner ? this.renderer.floodWin(winner) : 0;
    // `destroy()` cancels this, so a screen torn down mid-wash never hands out a card.
    this.endTimer = window.setTimeout(() => {
      this.endTimer = null;
      this.opts.onExit?.(winner, this.endReason, this.playedMs);
    }, wait);
  }

  /** Mark a moment, if there is anything to mark it with. */
  private cue(c: Cue | null): void {
    if (c) this.opts.feedback?.play(c);
  }

  /* ----------------------------------------------------------------------- INPUT */

  private onPointerDown = (e: PointerEvent): void => {
    // A tap during the opening skips it. Sitting through the same descent every match is
    // the fastest way to make an animation hated.
    if (this.introTimer) { this.openMatch(); return; }
    if (this.state.over || this.state.current !== "you") return;
    const at = this.renderer.hit(e.clientX, e.clientY);
    if (!at) return;
    this.tap(at);
  };

  private tap(at: Coord): void {
    const t = tileAt(this.state, at.c, at.r);
    if (!t) return;

    if (this.mode === "tunnel") {
      if (!this.valid.some((v) => v.c === at.c && v.r === at.r)) {
        return;
      }
      const events = activateAbility(this.state, "you", this.opts.mods.you, { target: at });
      this.setMode("go");
      if (!events.length) {
        return;
      }
      this.opts.onAbilityCast?.("tunnel");
      this.consume(events);
      this.refreshHUD();
      // Tunnelling spends the turn — `abilitySpendsTurn` in the engine owns that rule, and
      // the AI obeys the same one. The walkthrough keeps the turn, as everywhere else here.
      if (!this.touring && abilitySpendsTurn(speciesOf(this.state.species.you).ability.kind)) {
        this.handOver();
      }
      return;
    }

    if (this.mode === "rally") {
      if (t.owner === "you" && isConnected(this.state, t)) {
        const events = rally(this.state, at);
        if (events.length) {
          this.consume(events);
          // The walkthrough keeps the turn (see the move branch), so the mode has to come
          // back by itself — `handOver` is what normally resets it.
          if (this.touring) this.setMode("go");
          else this.handOver();
        }
      }
      return;
    }

    // selecting a source
    if (!this.selection) {
      if (canActFrom(this.state, t)) this.select(at);
      return;
    }

    // tapping the selected cell again deselects
    if (this.selection.c === at.c && this.selection.r === at.r) {
      this.clearSelection();
      return;
    }

    if (this.valid.some((v) => v.c === at.c && v.r === at.r)) {
      const from = this.selection;
      // Distance picks the action: a neighbour is a move/attack, anything further is a travel.
      const adjacent = distance(from, at) === 1;
      const events = adjacent
        ? moveOrAttack(this.state, from, at, this.opts.ctx)
        : travel(this.state, from, at);

      this.clearSelection();
      if (events.length) {
        this.consume(events);
        this.refreshHUD();
        // The step waits for the deed to RESOLVE — `tourSignals`, from the events — so a
        // tap the engine refused leaves it standing, and a long send does not answer the
        // step that asked for a move. The turn is handed over by the walkthrough itself,
        // between one lesson and the next (`enemyReplies`).
        if (!this.touring) this.handOver();
      }
      return;
    }

    // otherwise reselect, if that tile can act
    if (canActFrom(this.state, t)) this.select(at);
    else this.clearSelection();
  }

  private select(at: Coord): void {
    const t = tileAt(this.state, at.c, at.r);
    if (!t) return;
    this.selection = at;
    this.valid = actionTargets(this.state, t);
    this.renderer.setSelection(this.selection, this.valid);
    this.opts.tour?.signal("select");
  }

  private clearSelection(): void {
    this.selection = null;
    this.valid = [];
    this.renderer.setSelection(null, []);
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.clearSelection();
    // The walkthrough's Rally step waits for the mode to actually change rather than for
    // the press — same rule as everywhere else here: a tap the app did not act on must
    // leave the step standing rather than march the tutorial on without the player.
    this.opts.tour?.signal("mode:" + m);
    if (m === "tunnel") {
      // highlight every diggable tile, since there is no source to select first
      this.valid = tunnelTargets(this.state, "you");
      this.renderer.setSelection(null, this.valid);
    }
    this.syncModeButtons();
  }

  private syncModeButtons(): void {
    this.el.bMove.classList.toggle("on", this.mode === "go");
    this.el.bRally.classList.toggle("on", this.mode === "rally");
    this.el.bAbility.classList.toggle("armed", this.mode === "tunnel");
  }

  /* ------------------------------------------------------------------- SURRENDER */

  private onSurrender(): void {
    if (this.state.over || this.state.current !== "you") return;
    if (!this.surrenderArmed) {
      // Two taps to confirm — forfeiting by fat finger would be maddening.
      this.surrenderArmed = true;
      this.el.bSurr.classList.add("armed");
      this.setLabel(this.el.bSurr, "Confirm?");
      this.surrenderTimer = window.setTimeout(() => this.disarmSurrender(), 3000);
      return;
    }
    this.disarmSurrender();
    this.renderer.consume(surrender(this.state, "you"));
    this.finish();
  }

  private disarmSurrender(): void {
    this.surrenderArmed = false;
    if (this.surrenderTimer) { clearTimeout(this.surrenderTimer); this.surrenderTimer = null; }
    this.el.bSurr.classList.remove("armed");
    this.setLabel(this.el.bSurr, "Surrender");
  }

  private setLabel(btn: HTMLButtonElement, text: string): void {
    const lb = btn.querySelector(".lb");
    if (lb) lb.textContent = text;
  }

  /* ----------------------------------------------------------------------- TIMER */

  private startTimer(): void {
    this.stopTimer();
    if (this.state.over) { this.updateTimerUI(); return; }
    // A tutorial step holds the match still: reading one must never cost the turn.
    if (this.touring) { this.updateTimerUI(); return; }
    this.timeLeft = MOVE_SECONDS;
    this.updateTimerUI();
    this.timerId = window.setInterval(() => {
      this.timeLeft--;
      this.updateTimerUI();
      if (this.timeLeft <= 0) {
        this.stopTimer();
        if (!this.state.over && this.state.current === "you") {
          this.handOver();
        }
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
  }

  private clearTimers(): void {
    this.stopTimer();
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    if (this.surrenderTimer) { clearTimeout(this.surrenderTimer); this.surrenderTimer = null; }
  }

  private updateTimerUI(): void {
    const isAI = this.state.current === "ai";
    const t = Math.max(0, this.timeLeft | 0);
    const frac = Math.max(0, Math.min(1, t / MOVE_SECONDS));
    const fill = this.el.timeFill;

    if (frac >= 1) {
      // A new turn snaps to full — easing back up would read as time being *added*.
      fill.style.transition = "none";
      fill.style.transform = "scaleX(1)";
      void fill.offsetWidth;                 // force the snap before easing is restored
      fill.style.transition = "";
    } else {
      fill.style.transform = `scaleX(${frac})`;
    }
    this.el.timeBand.classList.toggle("ai", isAI);
    this.el.timeBand.classList.toggle("low", !isAI && t <= 5);
    this.el.timeLabel.textContent = `${isAI ? "Enemy turn" : "Your turn"} · Turn ${this.state.turn}`;
  }

  /* ------------------------------------------------------------------------- HUD */

  private refreshHUD(): void {
    const s = this.state;
    this.updateTimerUI();
    this.el.youArmy.textContent = `${armyOf(s, "you")} / +${incomeOf(s, "you", this.opts.mods.you)}`;
    this.el.aiArmy.textContent = `${armyOf(s, "ai")} / +${incomeOf(s, "ai", this.opts.mods.ai)}`;

    const chip = this.el.hiveChip;
    if (s.hive.phase === "dormant") {
      chip.className = "hivechip";
      this.el.hiveK.textContent = "Hive";
      this.el.hiveV.textContent = "T" + MAPS[this.opts.map].awakenTurn;
    } else if (s.hive.phase === "buff") {
      chip.className = "hivechip awake";
      this.el.hiveK.textContent = s.hive.owner === "you" ? "Surge" : "Enemy";
      this.el.hiveV.textContent = `×${s.hive.level + 1} (${s.hive.buffLeft})`;
    } else if (s.hive.phase === "cooling") {
      // She is dead and her ground is bare. Saying "Lvl 2" here reads as a queen standing
      // there to be fought, which is the opposite of what is on the board.
      chip.className = "hivechip";
      this.el.hiveK.textContent = "Hive";
      this.el.hiveV.textContent = `Back in ${s.hive.coolLeft}`;
    } else {
      chip.className = "hivechip awake";
      this.el.hiveK.textContent = "Hive";
      this.el.hiveV.textContent = "Lvl " + s.hive.level;
    }

    const ability = speciesOf(s.species.you).ability;
    const ready = abilityReady(s, "you") && s.current === "you";
    const lb = this.el.bAbility.querySelector(".lb");
    if (lb) {
      // WORDS, not an hourglass. The turns left is the number a player is counting down,
      // and "3 turns" says what "⏳ 3" only implies — in a glyph the device chose.
      const turns = s.cooldown.you;
      const status = turns > 0 ? `${turns} turn${turns === 1 ? "" : "s"}` : "ready";
      lb.replaceChildren(document.createTextNode(ability.name), el("b", undefined, status));
    }
    this.el.bAbility.classList.toggle("armed", ready || this.mode === "tunnel");
    this.el.bAbility.classList.toggle("cool", s.cooldown.you > 0);
  }

  /**
   * Hand a batch of events to the renderer, then to whoever else is listening.
   *
   * The renderer goes first: it owns the dramatisation, and a listener must never be able to
   * delay or reorder what the player sees.
   */
  private consume(events: readonly EngineEvent[]): void {
    for (const e of events) if (e.type === "gameOver") this.endReason = e.reason;
    this.renderer.consume(events as EngineEvent[]);
    this.cue(loudestOf(events));
    this.opts.onEvents?.(events);
    this.tourSignals(events);

    // A scenario objective can settle mid-turn — a challenge that asks you to strike first
    // is decided by the first attack, not by whose nest falls.
    if (!this.state.over) {
      const decided = this.opts.judge?.(events) ?? null;
      if (decided) {
        this.consume(endByObjective(this.state, decided));
        this.finish();
      }
    }
  }

}

/**
 * ONE cue per batch, and it is the loudest thing that happened.
 *
 * A single action produces a whole batch — a long send is a dozen `veinLaid` and a
 * `capture`; an attack is a `combat` and then a `capture` — and playing a sound for each
 * would be a rattle. The batch gets the sound of the biggest thing in it, in the order a
 * player would rank them.
 *
 * Returns null for a batch with nothing worth marking, which is most of them: production
 * ticking over is not an event a player needs to hear.
 */
export function loudestOf(events: readonly EngineEvent[]): Cue | null {
  let best: Cue | null = null;
  const rank: Cue[] = ["move", "travel", "fight", "destroy", "hive"];
  const take = (c: Cue): void => {
    if (best === null || rank.indexOf(c) > rank.indexOf(best)) best = c;
  };
  for (const e of events) {
    if (e.type === "hiveCaptured") take("hive");
    // Ground coming apart outranks a fight: a trail collapsing or a garrison burned off
    // the map is the bigger thing that happened, even when a fight caused it.
    else if (e.type === "veinPruned") take("destroy");
    else if (e.type === "effectDamage" && e.wiped) take("destroy");
    else if (e.type === "combat") take("fight");
    // A long send is the same movement going much further, and gets the longer scurry.
    else if (e.type === "travel") take("travel");
    // A plain `move` is reinforcing ground already held — no capture event, and for a long
    // time no sound either, so half of what a player does was silent.
    else if (e.type === "capture" || e.type === "move" || e.type === "rally") take("move");
  }
  return best;
}

const MARKUP = `
  <header>
    <div class="stat you"><span class="k">You</span><span class="v" id="youArmy">0 / +0</span></div>
    <div class="stat ai"><span class="k">Enemy</span><span class="v" id="aiArmy">0 / +0</span></div>
    <div class="hivechip" id="hiveChip"><span class="k" id="hiveK">Hive</span><span class="v" id="hiveV">—</span></div>
  </header>
  <div class="timeband" id="timeBand">
    <div class="timebar"><i id="timeFill"></i></div>
    <div class="timelabel" id="timeLabel">Your turn · Turn 1</div>
  </div>
  <main>
    <canvas id="cv"></canvas>
    <div class="hint" id="hint">Tap one of your cells, then tap where to act.</div>
  </main>
  <footer>
    <div class="brow brow4">
      <button class="btn on" id="bMove"><span class="ic" data-ic="attack"></span><span class="lb">Move / Attack</span></button>
      <button class="btn" id="bRally"><span class="ic" data-ic="flag"></span><span class="lb">Rally</span></button>
      <button class="btn ability" id="bAbility"><span class="ic" data-ic="spark"></span><span class="lb">Ability</span></button>
      <button class="btn end" id="bEnd"><span class="ic" data-ic="skip"></span><span class="lb">End turn</span></button>
    </div>
    <div class="brow">
      <button class="btn surr" id="bSurr"><span class="ic" data-ic="surrender"></span><span class="lb">Surrender</span></button>
    </div>
  </footer>
  <div class="spellcard" id="spellCard" aria-hidden="true">
    <div class="sc-img" id="scImg"></div>
    <div class="sc-title" id="scTitle"></div>
    <div class="sc-desc" id="scDesc"></div>
    <div class="sc-cast" id="scCast"></div>
  </div>
`;

export type { SpeciesId };
