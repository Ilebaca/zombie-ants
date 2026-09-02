/**
 * PAST MATCHES, AND WATCHING ONE BACK.
 *
 * Two screens in one file because they are one idea: a list of what happened, and the
 * thing that happens when a row is opened.
 *
 * THE REPLAY IS THE REAL BOARD, not a picture of one. It rebuilds the opening position
 * from the record and applies the moves through `applyMove`, feeding the events to the
 * SAME `BoardRenderer` a live match uses — so a replay shows the fight, the fill, the
 * marching ants and the crumble exactly as they happened, and a change to how any of that
 * is drawn reaches replays on the same commit. Nothing is stored but the moves.
 */
import { applyMove, openingBoard, restore, snapshot } from "../engine";
import type { GameState, MatchRecord, Player } from "../engine";
import { MAPS, SPECIES } from "../engine";
import { BoardRenderer } from "../render";
import { canReplay, compact, outcomeOf } from "../platform";
import type { MatchLog, ProfileStore } from "../platform";
import { antPortrait, el, screenEl, screenHeader } from "./chrome";
import { icon } from "./icons";

/* ---------------------------------------------------------------------- THE LIST */

export function buildHistory(
  store: ProfileStore, onBack: () => void, onOpen: (log: MatchLog) => void,
): HTMLElement {
  const root = screenEl("history");
  screenHeader(root, {
    title: "Recent matches",
    sub: "The last twenty, newest first",
    onBack,
    backId: "histBack",
  });

  const body = el("div", "screenbody sb-top histbody");
  const matches = store.history;

  if (matches.length === 0) {
    const empty = el("div", "histempty");
    empty.append(
      el("div", "histemptyh", "No matches yet"),
      el("div", "histemptyp", "Play one and it will be here — with the moves, so you can watch it back."),
    );
    body.appendChild(empty);
  } else {
    const list = el("div", "histlist");
    for (const log of matches) list.appendChild(row(log, () => onOpen(log)));
    body.appendChild(list);
  }

  root.appendChild(body);
  return root;
}

function row(log: MatchLog, onOpen: () => void): HTMLElement {
  const outcome = outcomeOf(log);
  const item = el("button", `histrow ${outcome}`);
  item.dataset.match = log.id;

  const face = el("div", "histface");
  face.appendChild(antPortrait(log.foe, 76));

  const mid = el("div", "histmid");
  const who = log.foeName || SPECIES[log.foe].name;
  mid.append(
    el("div", "histwho", who),
    // The map's NAME without its size: "Corridor (9×9)" is what the picker says, where
    // the dimensions are the choice being made. Here they cost the line its turns and its
    // clock on a narrow phone, which are the two facts a row is actually for.
    el("div", "histwhat", `${mapName(log.map)} · ${log.turns} turns · ${minutes(log.playedMs)}`),
  );

  const right = el("div", "histright");
  // THE COLONY IS THE SCORE. What a match paid is the number the whole game is played for,
  // so it is what a row reports rather than a bare win or loss.
  const delta = log.colonyAfter - log.colonyBefore;
  right.append(
    el("div", `histresult ${outcome}`, outcome === "won" ? "Won" : outcome === "lost" ? "Lost" : "Unfinished"),
    el("div", "histdelta", `${delta >= 0 ? "+" : "−"}${compact(Math.abs(delta))}`),
  );
  if (canReplay(log)) right.appendChild(icon("next", 14));

  item.append(face, mid, right);
  // A row with no moves is not a door. It still reports the match — the facts are the
  // point of the list — it simply does not offer a replay it cannot give.
  if (canReplay(log)) item.onclick = onOpen;
  else item.classList.add("noreplay");
  return item;
}

const mapName = (id: MatchLog["map"]): string => (MAPS[id].name.split(" (")[0] ?? MAPS[id].name);

/**
 * How long it took, to the minute.
 *
 * Written to the SECOND it is four characters longer, and on the narrowest phone those
 * four characters are what pushed the clock off the end of the row entirely — an
 * ellipsis where the number was. The result card is where a match is timed exactly; a
 * list row only says whether it was a quick one.
 */
const minutes = (ms: number): string => {
  const total = Math.round(ms / 1000);
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m`;
};

/* -------------------------------------------------------------------- THE REPLAY */

/** Milliseconds between moves at each speed. A replay is watched, not endured. */
const SPEEDS = [900, 450, 180] as const;

export interface ReplayOptions {
  log: MatchLog;
  onBack: () => void;
}

/**
 * Watch a match back.
 *
 * It steps rather than streams: one move applied, its events handed to the renderer,
 * then a pause. That is what a live match does too — the renderer's whole job is to
 * dramatise a batch of events — so the animation a replay shows is the animation the
 * player saw, without a second code path to keep in step.
 */
export class ReplayScreen {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: BoardRenderer;
  private state: GameState;
  private record: MatchRecord;
  private at = 0;
  /** Latched when a move is refused: the board has diverged, so there is no going on. */
  private stuck = false;
  private timer: number | null = null;
  private speed = 1;
  private el: { turn: HTMLElement; play: HTMLButtonElement; rate: HTMLButtonElement };

  constructor(host: HTMLElement, opts: ReplayOptions) {
    this.record = opts.log.record as MatchRecord;
    this.state = openingBoard(this.record.setup);

    this.root = screenEl("replay");
    screenHeader(this.root, {
      title: opts.log.foeName || SPECIES[opts.log.foe].name,
      sub: `${MAPS[opts.log.map].name} · ${outcomeOf(opts.log) === "won" ? "you won" : outcomeOf(opts.log) === "lost" ? "you lost" : "unfinished"}`,
      onBack: opts.onBack,
      backId: "replayBack",
    });

    const stage = el("div", "replaystage");
    this.canvas = document.createElement("canvas");
    this.canvas.id = "replayCv";
    stage.appendChild(this.canvas);
    this.root.appendChild(stage);

    const bar = el("div", "replaybar");
    const turn = el("div", "replayturn", "Turn 1");
    const play = el("button", "replaybtn", "Play");
    const rate = el("button", "replayrate", "1×");
    const step = el("button", "replaybtn ghost", "Step");
    play.onclick = () => this.toggle();
    rate.onclick = () => this.cycleSpeed();
    step.onclick = () => { this.pause(); this.advance(); };
    bar.append(turn, step, play, rate);
    this.root.appendChild(bar);
    this.el = { turn, play, rate };

    // No `playIntro()`, and that is the whole of it: the opening descent is a match
    // STARTING, and replaying it every time a row is opened is an animation nobody asked
    // for twice. The renderer only plays it when it is told to.
    this.renderer = new BoardRenderer(this.canvas, this.state, {
      species: this.record.setup.species,
    });
    host.appendChild(this.root);
    this.renderer.start();
    this.refresh();
  }

  /** How far through, for the bar and for anything that wants to know it is over. */
  get done(): boolean { return this.stuck || this.at >= this.record.moves.length; }

  private toggle(): void {
    if (this.timer !== null) { this.pause(); return; }
    if (this.done) this.rewind();
    this.el.play.textContent = "Pause";
    this.timer = window.setInterval(() => this.advance(), SPEEDS[this.speed]);
  }

  private pause(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.el.play.textContent = this.done ? "Again" : "Play";
  }

  private cycleSpeed(): void {
    this.speed = (this.speed + 1) % SPEEDS.length;
    this.el.rate.textContent = ["0.5×", "1×", "2×"][this.speed] as string;
    if (this.timer !== null) { this.pause(); this.toggle(); }
  }

  /**
   * Back to the opening. There is no undo in the engine, so it rebuilds the first position
   * and folds it ONTO the board the renderer is already holding — the same trick the AI's
   * searched board lands by, and the reason the renderer needs no rewind of its own.
   */
  private rewind(): void {
    restore(this.state, snapshot(openingBoard(this.record.setup)));
    this.at = 0;
    this.stuck = false;
    this.refresh();
  }

  private advance(): void {
    const move = this.record.moves[this.at];
    if (this.stuck || !move) { this.pause(); return; }
    const result = applyMove(this.state, this.state.current, move, this.record.setup.mods);
    // A record that will not replay is a bug in the RECORDING, not in the watching. It
    // stops where it stopped and stays stopped — skipping the move and playing the rest
    // would put the rest of the record onto a board that has diverged, which is a game
    // nobody played being shown as a replay of one somebody did. Latched, because a
    // refusal that only pauses is a refusal another tap on Step walks straight past.
    if (!result.ok) { this.stuck = true; this.pause(); return; }
    this.at++;
    this.renderer.consume(result.events);
    this.refresh();
  }

  private refresh(): void {
    const left = this.record.moves.length - this.at;
    this.el.turn.textContent = this.state.over
      ? `Turn ${this.state.turn} · over`
      : `Turn ${this.state.turn} · ${left} to go`;
    if (this.done) this.el.play.textContent = "Again";
  }

  destroy(): void {
    this.pause();
    this.renderer.stop();
    this.root.remove();
  }

  /** Who won, from the board rather than from the log — they must agree. */
  get winner(): Player | null { return this.state.winner; }
}
