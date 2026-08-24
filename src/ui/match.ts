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
  abilityReady, activateAbility, sparePool, tunnelTargets, endByObjective, nestTile,
  tilesOwnedBy,
} from "../engine";
import type {
  AbilityKind, ActionContext, Coord, EngineEvent, GameOverReason, GameState, MapId, Player, PlayerMods, SpeciesId,
} from "../engine";
import { Thinker, adopt } from "../ai/thinker";
import type { Thought } from "../ai/thinker";
import type { Difficulty } from "../ai/search";
import { BoardRenderer } from "../render";
import type { SpotRect, Tour, TourStep } from "./tour";

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

export interface MatchOptions {
  state: GameState;
  mods: Record<Player, PlayerMods>;
  ctx: ActionContext;
  difficulty: Difficulty;
  map: MapId;
  onExit?: (winner: Player | null, reason: GameOverReason | null) => void;
  /** Fired when the player casts, so the shell can record the stat. */
  onAbilityCast?: (kind: AbilityKind) => void;
  /**
   * Every batch of engine events, after the renderer has taken them. The shell uses this to
   * score quests. It is a read-only pass-through: the match does not care what happens to
   * them, and the engine stays unaware that anything is listening.
   */
  onEvents?: (events: readonly EngineEvent[]) => void;
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
    // display:contents so header/timeband/main/footer are laid out by #app itself, exactly
    // as they are in the legacy build — this wrapper exists only to tear them all down at
    // the end of a match.
    this.root.style.cssText = "display:contents";
    this.root.innerHTML = MARKUP;
    host.appendChild(this.root);
    this.bind();

    this.renderer = new BoardRenderer(this.canvas, opts.state, {
      species: opts.state.species,
    });
  }

  start(): void {
    this.renderer.start();
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.beginTurn();
    if (this.opts.tutorial && this.opts.tour) this.startTour();
  }

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
    const done = (): void => {
      this.opts.onTutorialDone?.();
      // The clock was held for the whole walk; the turn starts properly now.
      this.startTimer();
    };
    tour.start(this.tourSteps(), { onDone: done, onSkip: done });
  }

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

  /** The tile the tour asks the player to move from: the nest, or anything that can act. */
  private tourSource(): Coord | null {
    const nest = nestTile(this.state, "you");
    if (nest && canActFrom(this.state, nest)) return { c: nest.c, r: nest.r };
    const any = tilesOwnedBy(this.state, "you").find((t) => canActFrom(this.state, t));
    return any ? { c: any.c, r: any.r } : null;
  }

  /**
   * The tile it asks them to move INTO. Ground the player does not already hold, so the
   * step ends in a capture — the thing the whole game is made of — rather than in troops
   * shuffling between two tiles they already own.
   */
  private tourTarget(): Coord | null {
    if (!this.valid.length) return null;
    const fresh = this.valid.find((at) => tileAt(this.state, at.c, at.r)?.owner !== "you");
    return fresh ?? this.valid[0] ?? null;
  }

  /** The Hive queen's tile — the middle of the board's five hive tiles. */
  private queenCell(): Coord | null {
    for (const t of this.state.grid.flat()) if (t.terrain === "hiveQ") return { c: t.c, r: t.r };
    return null;
  }

  private enemyNest(): Coord | null {
    const nest = nestTile(this.state, "ai");
    return nest ? { c: nest.c, r: nest.r } : null;
  }

  private tourSteps(): TourStep[] {
    return [
      {
        id: "nest",
        title: "Your nest",
        text: "The corner tile is your queen. Every tile you hold has to trace a path back "
          + "to her, and if she falls the match is over.",
        rect: () => this.cellRect(this.tourSource()),
        pad: 4,
      },
      {
        id: "select",
        text: "Tap it to pick up its soldiers.",
        rect: () => this.cellRect(this.tourSource()),
        pad: 4,
        advance: "signal",
      },
      {
        id: "move",
        title: "Take ground",
        text: "The lit tiles are where those soldiers can go. Tap this one to march in and "
          + "claim it.",
        rect: () => this.cellRect(this.tourTarget()),
        pad: 4,
        advance: "signal",
      },
      {
        id: "hive",
        title: "The Hive",
        text: `A wild queen sleeps in the middle, infected with the fungus this game is `
          + `named after. She wakes on turn ${MAPS[this.opts.map].awakenTurn}. Take HER `
          + `tile — not just her guards — and your whole colony surges.`,
        rect: () => this.cellRect(this.queenCell()),
        pad: 4,
      },
      {
        id: "enemy",
        title: "How it ends",
        text: "That far corner is the enemy queen. Take it and the match is yours; lose "
          + "your own and it is theirs. There is no timer on the match itself.",
        rect: () => this.cellRect(this.enemyNest()),
        pad: 4,
      },
      {
        id: "hud",
        title: "The count that matters",
        text: "Your army and what it earns each turn, against the enemy's. The chip on the "
          + "right is the Hive: when its queen wakes, taking her is worth a growth surge.",
        find: () => this.root.querySelector("header"),
        pad: 2,
      },
      {
        id: "ability",
        title: "Your species ability",
        text: "Every colony has one, drawn from what the real ant does. It is free — you "
          + "still get your move — and then it recharges for a few turns.",
        find: () => this.root.querySelector("#bAbility"),
      },
      {
        id: "end",
        text: "That is the whole game: spread, surround, consume. Tap End turn and the "
          + "enemy colony moves.",
        find: () => this.root.querySelector("#bEnd"),
        advance: "tap",
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

    this.el.bMove.onclick = () => this.setMode("go");
    this.el.bRally.onclick = () => this.setMode("rally");
    this.el.bEnd.onclick = () => {
      if (this.state.over || this.state.current !== "you") return;
      this.handOver();
    };
    this.el.bSurr.onclick = () => this.onSurrender();

    this.el.bAbility.onclick = () => this.onAbility();
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

  private finish(): void {
    this.clearTimers();
    this.renderer.setSelection(null, []);
    const winner = this.state.winner;
    this.updateTimerUI();
    this.opts.onExit?.(winner, this.endReason);
  }

  /* ----------------------------------------------------------------------- INPUT */

  private onPointerDown = (e: PointerEvent): void => {
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
      this.handOver();                       // tunnelling deliberately costs the turn
      return;
    }

    if (this.mode === "rally") {
      if (t.owner === "you" && isConnected(this.state, t)) {
        const events = rally(this.state, at);
        if (events.length) {
          this.consume(events);
          this.handOver();
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
        // The tour's move step waits for the move to RESOLVE, so a tap the engine refused
        // leaves the step standing. It also holds the turn: handing over mid-walkthrough
        // would put the enemy on the board before the player has been told there is one.
        this.opts.tour?.signal("move");
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
      const status = s.cooldown.you > 0 ? `⏳ ${s.cooldown.you}` : "ready";
      lb.innerHTML = `${escapeHtml(ability.name)}<b>${status}</b>`;
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
    this.opts.onEvents?.(events);

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

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
      <button class="btn on" id="bMove"><span class="ic">⚔️</span><span class="lb">Move / Attack</span></button>
      <button class="btn" id="bRally"><span class="ic">🚩</span><span class="lb">Rally</span></button>
      <button class="btn ability" id="bAbility"><span class="ic">✨</span><span class="lb">Ability</span></button>
      <button class="btn end" id="bEnd"><span class="ic">⏭️</span><span class="lb">End turn</span></button>
    </div>
    <div class="brow">
      <button class="btn surr" id="bSurr"><span class="ic">🏳️</span><span class="lb">Surrender</span></button>
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
