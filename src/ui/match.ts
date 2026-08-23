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
  abilityReady, activateAbility, sparePool, tunnelTargets, endByObjective,
} from "../engine";
import type {
  AbilityKind, ActionContext, Coord, EngineEvent, GameOverReason, GameState, MapId, Player, PlayerMods, SpeciesId,
} from "../engine";
import { Thinker, adopt } from "../ai/thinker";
import type { Thought } from "../ai/thinker";
import type { Difficulty } from "../ai/search";
import { BoardRenderer } from "../render";

/** Seconds a player gets per move before the turn passes automatically. */
const MOVE_SECONDS = 15;
/** Pause before the AI moves, so its turn reads as deliberate rather than instant. */
/**
 * How long an AI turn takes from the player's side, thinking included.
 *
 * This is a MINIMUM, not a delay. Easy decides in a millisecond and Hard can spend a few
 * hundred actually searching; without this the two would feel like different games for the
 * wrong reason. Whatever the search costs comes out of the pause, so every level keeps the
 * same rhythm and Hard's extra thinking is free.
 */
const AI_TURN_MS = 1100;
/** How long the board is left alone after the AI's turn begins, before it moves. */
const AI_BEAT_MS = 260;

type Mode = "go" | "rally" | "tunnel";
type ToastKind = "good" | "bad" | "warn" | "hive";

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
  /** Show the first-match coaching toasts. The shell owns whether they are still due. */
  tutorial?: boolean;
  /** Called once the coaching toasts have run, so they are never shown twice. */
  onTutorialShown?: () => void;
}

export class MatchScreen {
  private root: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private renderer: BoardRenderer;

  private el!: {
    youArmy: HTMLElement; aiArmy: HTMLElement;
    hiveChip: HTMLElement; hiveK: HTMLElement; hiveV: HTMLElement;
    timeBand: HTMLElement; timeFill: HTMLElement; timeLabel: HTMLElement;
    toast: HTMLElement;
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
  /** Coaching toasts still pending; cleared with the rest when the match is torn down. */
  private tutorialTimers: number[] = [];
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
      onNotice: (e) => this.notice(e),
    });
  }

  start(): void {
    this.renderer.start();
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.beginTurn();

    // Who you are, and where you are. Shown every match, as the legacy build does.
    const you = speciesOf(this.state.species.you);
    this.toast(`You are the ${you.name}. Expand from your corner.`, "good");
    if (this.opts.tutorial) this.runTutorial();
  }

  /**
   * Three coaching lines, spaced out over the opening turns so they land while the player
   * is looking at the thing each one describes. First match only.
   */
  private runTutorial(): void {
    this.opts.onTutorialShown?.();
    const lines: Array<[number, string, ToastKind]> = [
      [900, "Tap a glowing tile, then a neighbour to move or attack.", "hive"],
      [4200, "Resources 🍄 boost growth — grab them early.", "hive"],
      [7600, "The Hive wakes mid-game. Its Queen is power — or doom.", "warn"],
    ];
    for (const [delay, text, kind] of lines) {
      this.tutorialTimers.push(window.setTimeout(() => this.toast(text, kind), delay));
    }
  }

  destroy(): void {
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
      toast: pick("toast"),
      bMove: pick<HTMLButtonElement>("bMove"), bRally: pick<HTMLButtonElement>("bRally"),
      bAbility: pick<HTMLButtonElement>("bAbility"), bEnd: pick<HTMLButtonElement>("bEnd"),
      bSurr: pick<HTMLButtonElement>("bSurr"),
    };

    this.el.bMove.onclick = () => this.setMode("go");
    this.el.bRally.onclick = () => this.setMode("rally");
    this.el.bEnd.onclick = () => {
      if (this.state.over || this.state.current !== "you") return;
      this.toast("You hold the line.", "good");
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

    if (!abilityReady(s, "you")) {
      const left = s.cooldown.you;
      this.toast(`${ability.name} recharging — ${left} turn${left > 1 ? "s" : ""}`, "bad");
      return;
    }

    if (ability.kind === "tunnel") {
      if (sparePool(s, "you") < 5) {
        this.toast("You need 5 spare workers to dig a gallery.", "bad");
        return;
      }
      this.setMode("tunnel");
      this.toast("Choose an empty tile to dig to — costs 5 workers and ends your turn.", "good");
      return;
    }

    const events = activateAbility(s, "you", this.opts.mods.you);
    if (!events.length) {
      this.toast(`${ability.name} had no valid target this turn.`, "bad");
      return;
    }
    this.opts.onAbilityCast?.(ability.kind);
    this.consume(events);
    this.showSpellCard(ability.name, ability.desc);
    this.toast(`${ability.name}! You can still move.`, "good");
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

    const thought = await this.thinker.think(this.state, "ai", this.opts.difficulty, this.opts.ctx);
    // The match may have ended — surrendered, or torn down — while it was thinking. Adopting
    // the searched board then would undo that, so the answer is simply dropped.
    if (gen !== this.generation || this.state.over) return;

    // However fast the answer came back, the board settles before the AI moves. The searched
    // board is NOT adopted yet: it lands with the animation that shows it (see `playAI`).
    const beat = Math.max(0, AI_BEAT_MS - (performance.now() - started));
    this.aiTimer = window.setTimeout(() => this.playAI(thought, started, gen), beat);
  }

  /**
   * The AI's move lands, and is animated, in the same tick.
   *
   * The board must not change before the animation that dramatises it. Adopting the searched
   * board as soon as the answer arrived showed the finished move — troops already on the far
   * tile, in the enemy's colour — and only then played the reveal that was supposed to be
   * showing it happening. It read as the destination flashing and then being animated into.
   */
  private playAI(thought: Thought, started: number, gen: number): void {
    this.aiTimer = null;
    if (gen !== this.generation) return;
    adopt(this.state, thought.next);
    const events = thought.events;
    this.consume(events);
    this.refreshHUD();
    // Spend what is left of the turn's budget, then let the reveal finish before handing
    // over — flipping the turn mid-sweep cuts the animation off.
    const rest = Math.max(0, AI_TURN_MS - (performance.now() - started));
    this.aiTimer = window.setTimeout(() => this.handOver(), rest + (events.length ? 700 : 200));
  }

  private finish(): void {
    this.clearTimers();
    this.renderer.setSelection(null, []);
    const winner = this.state.winner;
    this.toast(winner === "you" ? "The colony consumes them. Victory." : "Your colony falls.",
      winner === "you" ? "good" : "bad");
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
        this.toast("Tap an empty, unguarded tile to dig to.", "bad");
        return;
      }
      const events = activateAbility(this.state, "you", this.opts.mods.you, { target: at });
      this.setMode("go");
      if (!events.length) {
        this.toast("Not enough spare workers — a gallery needs 5.", "bad");
        return;
      }
      this.opts.onAbilityCast?.("tunnel");
      this.consume(events);
      this.toast("Gallery dug — your turn ends.", "good");
      this.refreshHUD();
      this.handOver();                       // tunnelling deliberately costs the turn
      return;
    }

    if (this.mode === "rally") {
      if (t.owner === "you" && isConnected(this.state, t)) {
        const events = rally(this.state, at);
        if (events.length) {
          this.consume(events);
          this.toast("Troops rallied to one tile.", "good");
          this.handOver();
        } else {
          this.toast("No spare troops to gather.", "bad");
        }
      } else {
        this.toast("Tap one of your linked tiles to gather everything there.", "bad");
      }
      return;
    }

    // selecting a source
    if (!this.selection) {
      if (canActFrom(this.state, t)) this.select(at);
      else if (t.owner === "you") this.toast("That cell needs 2+ soldiers to act.", "bad");
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
        this.handOver();
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
      this.toast("Tap Surrender again to forfeit the match.", "warn");
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
    this.timeLeft = MOVE_SECONDS;
    this.updateTimerUI();
    this.timerId = window.setInterval(() => {
      this.timeLeft--;
      this.updateTimerUI();
      if (this.timeLeft <= 0) {
        this.stopTimer();
        if (!this.state.over && this.state.current === "you") {
          this.toast("Time's up — turn passed.", "warn");
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
    for (const id of this.tutorialTimers) clearTimeout(id);
    this.tutorialTimers.length = 0;
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

  /* ---------------------------------------------------------------------- TOASTS */

  /** Engine events the player should hear about, rather than only see. */
  private notice(e: EngineEvent): void {
    if (e.type === "hiveAwake") this.toast("The Hive stirs. The queen is awake.", "hive");
    else if (e.type === "hiveCaptured") {
      this.toast(e.owner === "you" ? "You take the Hive queen — surge!" : "The enemy takes the Hive queen.", "hive");
    } else if (e.type === "hiveSurgeEnded") {
      this.toast("The surge fades. The ground you took stays yours.", "hive");
    } else if (e.type === "hiveRespawn") this.toast(`The Hive returns — level ${e.level}.`, "hive");
    else if (e.type === "effectDamage" && e.wiped) this.toast("A garrison is wiped out.", "bad");
  }

  private toast(msg: string, kind?: ToastKind): void {
    const box = this.el.toast;
    const el = document.createElement("div");
    el.className = "toast " + (kind ?? "");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .4s,transform .4s";
      el.style.opacity = "0";
      el.style.transform = "translateY(-6px)";
      setTimeout(() => el.remove(), 400);
    }, 2200);
    while (box.children.length > 3) box.removeChild(box.firstChild as ChildNode);
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
    <div id="toast"></div>
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
