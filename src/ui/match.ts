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
} from "../engine";
import type {
  ActionContext, Coord, EngineEvent, GameState, MapId, Player, PlayerMods, SpeciesId,
} from "../engine";
import { aiTurn } from "../ai/search";
import type { Difficulty } from "../ai/search";
import { BoardRenderer } from "../render";
import "./match.css";

/** Seconds a player gets per move before the turn passes automatically. */
const MOVE_SECONDS = 15;
/** Pause before the AI moves, so its turn reads as deliberate rather than instant. */
const AI_THINK_MS = 1500;

type Mode = "go" | "rally";
type ToastKind = "good" | "bad" | "warn" | "hive";

export interface MatchOptions {
  state: GameState;
  mods: Record<Player, PlayerMods>;
  ctx: ActionContext;
  difficulty: Difficulty;
  map: MapId;
  onExit?: (winner: Player | null) => void;
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

  constructor(host: HTMLElement, private opts: MatchOptions) {
    this.root = document.createElement("div");
    this.root.className = "match";
    this.root.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column";
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
  }

  destroy(): void {
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

    // Species abilities are not ported to the engine yet; the button stays visible but inert
    // rather than silently doing nothing when tapped.
    this.el.bAbility.onclick = () => {
      this.toast("Abilities are not wired up yet.", "bad");
    };
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
    if (this.state.current === "ai") {
      this.aiTimer = window.setTimeout(() => this.runAI(), AI_THINK_MS);
    }
  }

  private handOver(): void {
    if (this.state.over) { this.finish(); return; }
    this.clearTimers();
    const events = endTurn(this.state, this.opts.mods);
    this.renderer.consume(events);
    this.beginTurn();
  }

  private runAI(): void {
    this.aiTimer = null;
    if (this.state.over) { this.finish(); return; }
    const events = aiTurn(this.state, "ai", this.opts.difficulty, this.opts.ctx);
    this.renderer.consume(events);
    this.refreshHUD();
    // Let the reveal finish before the turn flips, or the animation is cut off mid-sweep.
    window.setTimeout(() => this.handOver(), events.length ? 700 : 200);
  }

  private finish(): void {
    this.clearTimers();
    this.renderer.setSelection(null, []);
    const winner = this.state.winner;
    this.toast(winner === "you" ? "The colony consumes them. Victory." : "Your colony falls.",
      winner === "you" ? "good" : "bad");
    this.updateTimerUI();
    this.opts.onExit?.(winner);
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

    if (this.mode === "rally") {
      if (t.owner === "you" && isConnected(this.state, t)) {
        const events = rally(this.state, at);
        if (events.length) {
          this.renderer.consume(events);
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
        this.renderer.consume(events);
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
    this.syncModeButtons();
  }

  private syncModeButtons(): void {
    this.el.bMove.classList.toggle("on", this.mode === "go");
    this.el.bRally.classList.toggle("on", this.mode === "rally");
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
    } else {
      chip.className = "hivechip awake";
      this.el.hiveK.textContent = "Hive";
      this.el.hiveV.textContent = "Lvl " + s.hive.level;
    }

    const ability = speciesOf(s.species.you).ability;
    this.el.bAbility.classList.add("cool");
    const lb = this.el.bAbility.querySelector(".lb");
    if (lb) lb.innerHTML = `${escapeHtml(ability.name)}<b>soon</b>`;
  }

  /* ---------------------------------------------------------------------- TOASTS */

  /** Engine events the player should hear about, rather than only see. */
  private notice(e: EngineEvent): void {
    if (e.type === "hiveAwake") this.toast("The Hive stirs. The queen is awake.", "hive");
    else if (e.type === "hiveCaptured") {
      this.toast(e.owner === "you" ? "You take the Hive queen — surge!" : "The enemy takes the Hive queen.", "hive");
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
`;

export type { SpeciesId };
