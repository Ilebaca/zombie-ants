/**
 * CHALLENGES: fixed positions to beat, in order.
 *
 * A challenge is only a preset — a map, a species, a formation and an objective — so it
 * starts an ordinary match. The engine knows nothing about challenges; the objective is
 * judged by the shell from what the match reports.
 *
 * IT WAS A LIST THAT REMEMBERED NOTHING. Five identical cards, each a title, a run-on grey
 * sentence and a green Play button — and beating one changed nothing, so the forty-mycelium
 * reward paid again every single replay of the easiest position in the game, and there was
 * no reason to open the screen twice. Three things follow from fixing that:
 *
 *   - A challenge is BEATEN, once, and the profile remembers which (platform/profile.ts).
 *   - They are a LADDER: each opens when the one before it falls. Five positions all
 *     available at once with nothing recorded is a menu, not a progression.
 *   - The daily is the repeatable half. It pays once a DAY rather than once ever, which is
 *     what the countdown on it was always implying.
 *
 * Every card carried a drawn preview of its position for a while, and it was removed: at
 * the size a list row allows, a corner of the board says only "this is the game", which
 * every other card on the screen says too. The map, the colony and the difficulty are the
 * facts that tell one challenge from another, so they are what the card carries.
 */
import type { MapId, ShapeId, SpeciesId } from "../engine";
import { MAPS, SPECIES } from "../engine";
import type { ProfileStore } from "../platform";
import { el, screenEl, screenHeader } from "./chrome";
import { icon } from "./icons";

/** What the player has to do to pass. */
export type ChallengeGoal = "attackFirst" | "eliminate";

export interface Challenge {
  /**
   * Stable name for the challenge, and the key its "beaten" mark is stored under.
   *
   * An INDEX is not a name — the same lesson the Colony Road learned (platform/road.ts):
   * reorder the list or slip one in and every stored mark points at a different position.
   */
  id: string;
  name: string;
  /** Difficulty, 1–5, drawn as stars. */
  stars: number;
  map: MapId;
  species: SpeciesId;
  shape: ShapeId;
  goal: ChallengeGoal;
  desc: string;
}

/**
 * The legacy build's five challenges, unchanged. Its formation keys are spelled
 * differently (tee/box for what this build calls arrow/column) — same twelve shapes, same
 * order, same names on screen.
 */
export const CHALLENGES: readonly Challenge[] = [
  {
    id: "first-blood", name: "First Blood", stars: 1, map: "small", species: "fire", shape: "wedge",
    goal: "attackFirst", desc: "Corridor · Fire Ant · strike the enemy before they strike you.",
  },
  {
    id: "hold-the-line", name: "Hold the Line", stars: 2, map: "small", species: "weaver", shape: "line",
    goal: "eliminate", desc: "Corridor · Weaver Ant · survive the early swarm, then wipe them out.",
  },
  {
    id: "hive-siege", name: "Hive Siege", stars: 3, map: "mid", species: "army", shape: "arrow",
    goal: "eliminate", desc: "Gauntlet · Army Ant · break the wall and destroy the enemy colony.",
  },
  {
    id: "outnumbered", name: "Outnumbered", stars: 4, map: "mid", species: "bullet", shape: "column",
    goal: "eliminate", desc: "Gauntlet · Bullet Ant · claw back a win from the corner.",
  },
  {
    id: "ghost-protocol", name: "Ghost Protocol", stars: 5, map: "mid", species: "ghost", shape: "tower",
    goal: "attackFirst", desc: "Gauntlet · Ghost Ant · cloak, flank, and land the first hit.",
  },
];

/** What each objective asks of the player, in the words shown after a challenge match. */
export const GOAL_TEXT: Record<ChallengeGoal, string> = {
  attackFirst: "Strike the enemy before they strike you.",
  eliminate: "Wipe out the enemy colony.",
};

/**
 * What a challenge pays. The legacy build's challenge screen pays 40 mycelium and its
 * daily screen advertises "250 pheromone + 40 mycelium" while paying the same 40 — the pheromone half
 * is honoured here so the promise on screen is the promise kept.
 */
export const CHALLENGE_REWARD = 40;
export const DAILY_BONUS_PHEROMONE = 250;


/** The day the daily is drawn for. One challenge a day, the same one for everybody. */
export const dailyIndex = (now: number = Date.now()): number =>
  Math.floor(now / 864e5) % CHALLENGES.length;

export const dayNumber = (now: number = Date.now()): number => Math.floor(now / 864e5);

/**
 * How far down the ladder a player has got.
 *
 * A challenge opens when the one before it falls, so the list has a spine: the first
 * unbeaten position is the one to play, everything past it names what stands in the way.
 */
export function challengeState(store: ProfileStore): {
  beaten: boolean[]; open: number; done: number;
} {
  const beaten = CHALLENGES.map((c) => store.challengeBeaten(c.id));
  const open = beaten.findIndex((b) => !b);
  return { beaten, open: open < 0 ? CHALLENGES.length : open, done: beaten.filter(Boolean).length };
}

/* ------------------------------------------------------------------- THE LADDER */

export function buildChallenges(store: ProfileStore, onPlay: (index: number) => void): HTMLElement {
  const root = screenEl("challenges");
  screenHeader(root, { title: "Challenges", sub: "Positions to beat" });

  const { beaten, open, done } = challengeState(store);

  const body = el("div", "screenbody sb-top");
  const wrap = el("div", "chalwrap");
  wrap.id = "challBody";

  // How far along the whole ladder is — the one thing a list of five cards could not say.
  const bar = el("div", "chalsum");
  bar.append(
    el("span", "chalsum-k", "Beaten"),
    el("span", "chalsum-v", `${done} of ${CHALLENGES.length}`),
  );
  const track = el("div", "hl-track");
  const fill = el("span", "hl-fill");
  fill.style.width = `${Math.round((done / CHALLENGES.length) * 100)}%`;
  track.appendChild(fill);
  bar.appendChild(track);
  wrap.appendChild(bar);

  const list = el("div", "challist");
  CHALLENGES.forEach((c, i) => {
    list.appendChild(challengeCard(c, i, {
      beaten: beaten[i] ?? false,
      locked: i > open,
      blockedBy: CHALLENGES[i - 1]?.name ?? "",
      onPlay: () => onPlay(i),
    }));
  });
  wrap.appendChild(list);

  body.appendChild(wrap);
  root.appendChild(body);
  return root;
}

interface CardState {
  beaten: boolean;
  locked: boolean;
  /** The challenge standing in the way, named rather than left as a padlock. */
  blockedBy: string;
  onPlay: () => void;
}

/**
 * One position: a picture of it, what it asks, and the way in.
 *
 * The map, the colony and the objective were one grey run-on sentence. They are three
 * different KINDS of fact — where, who, and what you have to do — so the first two are
 * chips and the last is the line that is actually read.
 */
function challengeCard(c: Challenge, index: number, state: CardState): HTMLElement {
  const card = el("div", "chalcard"
    + (state.beaten ? " beaten" : "") + (state.locked ? " locked" : ""));
  card.dataset.chal = c.id;

  const top = el("div", "chaltop");
  top.append(el("b", "chalname", `${index + 1}. ${c.name}`), starRow(c.stars));
  card.appendChild(top);

  const chips = el("div", "chalchips");
  chips.append(chip("board", MAPS[c.map].name), chip("antarium", speciesName(c.species)));
  card.appendChild(chips);

  card.appendChild(el("p", "chalgoal", GOAL_TEXT[c.goal]));

  const foot = el("div", "chalfoot");
  if (state.beaten) {
    const done = el("span", "chalstate done");
    done.append(icon("check", 14), el("span", undefined, "Beaten"));
    foot.append(done, replayButton(state.onPlay));
  } else if (state.locked) {
    // NAMED, not a padlock: "locked" says nothing about what to do next.
    const lock = el("span", "chalstate");
    lock.append(icon("lock", 13), el("span", undefined, `Beat ${state.blockedBy} first`));
    foot.appendChild(lock);
  } else {
    foot.append(reward(), playButton(state.onPlay, "Play"));
  }
  card.appendChild(foot);
  return card;
}

/* -------------------------------------------------------------------- THE DAILY */

/**
 * One challenge a day, chosen by the day number so everyone gets the same one.
 *
 * It is the repeatable half of the screen: the ladder is beaten once, this comes back
 * every day — and it says so, rather than showing a countdown next to a reward that
 * silently paid every replay.
 */
export function buildDaily(
  store: ProfileStore, onPlay: (index: number) => void, onBack: () => void,
  onLadder: () => void = () => {}, now: number = Date.now(),
): HTMLElement {
  const root = screenEl("daily");
  screenHeader(root, { title: "Daily challenge", sub: "A new position every day", onBack });

  const index = dailyIndex(now);
  const challenge = CHALLENGES[index] as Challenge;
  const done = store.dailyBeaten(dayNumber(now));
  const msLeft = 864e5 - (now % 864e5);

  const body = el("div", "screenbody sb-top");
  const wrap = el("div", "chalwrap");
  wrap.id = "dailyBody";

  const card = el("div", "chalcard daily" + (done ? " beaten" : ""));
  card.dataset.chal = challenge.id;

  const top = el("div", "chaltop");
  top.append(el("b", "chalname", challenge.name), starRow(challenge.stars));
  card.appendChild(top);
  const chips = el("div", "chalchips");
  chips.append(chip("board", MAPS[challenge.map].name), chip("antarium", speciesName(challenge.species)));
  card.appendChild(chips);

  card.appendChild(el("p", "chalgoal", GOAL_TEXT[challenge.goal]));

  const foot = el("div", "chalfoot");
  if (done) {
    const beaten = el("span", "chalstate done");
    beaten.append(icon("check", 14), el("span", undefined, "Beaten today"));
    foot.append(beaten, replayButton(() => onPlay(index)));
  } else {
    foot.append(reward(DAILY_BONUS_PHEROMONE), playButton(() => onPlay(index), "Play"));
  }
  card.appendChild(foot);

  // The clock belongs to the SCREEN, not to the card: it is about when the next one
  // arrives, which is true whether or not today's has been beaten.
  const hours = Math.floor(msLeft / 36e5);
  const minutes = Math.floor((msLeft % 36e5) / 6e4);
  const clock = el("div", "chalclock");
  clock.append(icon("clock", 14), el("span", undefined, `A new one in ${hours}h ${minutes}m`));

  wrap.append(card, clock);

  // ONE CARD IN AN EMPTY SCREEN is what this was. The ladder is the other half of the
  // same subject and the daily draws from it, so the screen says where it stands and
  // opens it — rather than being a page with a single object floating at the top.
  const ladder = challengeState(store);
  const more = el("button", "chalmore");
  const side = el("span", "chalmore-t");
  side.append(
    el("b", undefined, "The ladder"),
    el("span", undefined, `${ladder.done} of ${CHALLENGES.length} positions beaten`),
  );
  more.append(side, icon("next", 14));
  more.onclick = onLadder;
  wrap.appendChild(more);

  body.appendChild(wrap);
  root.appendChild(body);
  return root;
}

/* -------------------------------------------------------------------- THE PIECES */

/** Difficulty as marks from the icon family, not as ★ and ☆ glyphs (CLAUDE.md §10). */
function starRow(n: number): HTMLElement {
  const row = el("span", "chalstars");
  row.setAttribute("aria-label", `Difficulty ${n} of 5`);
  for (let i = 0; i < 5; i++) {
    const mark = el("span", "chalstar" + (i < n ? " on" : ""));
    mark.appendChild(icon("star", 11));
    row.appendChild(mark);
  }
  return row;
}

function chip(mark: string, text: string): HTMLElement {
  const box = el("span", "chalchip");
  box.append(icon(mark, 12), el("span", undefined, text));
  return box;
}

/** What beating it pays. It was a sentence under the card; it is the price tag now. */
function reward(pheromone = 0): HTMLElement {
  const box = el("span", "chalpay");
  box.append(icon("mycel", 13), el("span", undefined, `+${CHALLENGE_REWARD}`));
  if (pheromone) box.append(icon("pheromone", 13), el("span", undefined, `+${pheromone}`));
  return box;
}

function playButton(onPlay: () => void, label: string): HTMLButtonElement {
  const play = el("button", "cta challplay", label);
  play.onclick = onPlay;
  return play;
}

/** A beaten position can still be played — it just does not pay again. */
function replayButton(onPlay: () => void): HTMLButtonElement {
  const again = el("button", "chalagain", "Play again");
  again.onclick = onPlay;
  return again;
}

const speciesName = (id: SpeciesId): string => SPECIES[id].name;
