/**
 * Challenges and the daily challenge: fixed set-ups to beat.
 *
 * A challenge is only a preset — a map, a species, a formation and an objective — so it
 * starts an ordinary match. The engine knows nothing about challenges; the objective is
 * judged by the shell from what the match reports.
 *
 * Markup is the legacy build's (challist → challcard, dailywrap → dailycard).
 */
import type { MapId, SpeciesId } from "../engine";
import type { ShapeId } from "../engine";
import { el, screenEl, screenHeader } from "./chrome";

/** What the player has to do to pass. */
export type ChallengeGoal = "attackFirst" | "eliminate";

export interface Challenge {
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
    name: "First Blood", stars: 1, map: "small", species: "fire", shape: "wedge",
    goal: "attackFirst", desc: "Corridor · Fire Ant · strike the enemy before they strike you.",
  },
  {
    name: "Hold the Line", stars: 2, map: "small", species: "weaver", shape: "line",
    goal: "eliminate", desc: "Corridor · Weaver Ant · survive the early swarm, then wipe them out.",
  },
  {
    name: "Hive Siege", stars: 3, map: "mid", species: "army", shape: "arrow",
    goal: "eliminate", desc: "Gauntlet · Army Ant · break the wall and destroy the enemy colony.",
  },
  {
    name: "Outnumbered", stars: 4, map: "mid", species: "bullet", shape: "column",
    goal: "eliminate", desc: "Gauntlet · Bullet Ant · claw back a win from the corner.",
  },
  {
    name: "Ghost Protocol", stars: 5, map: "mid", species: "ghost", shape: "tower",
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

export function buildChallenges(onPlay: (index: number) => void): HTMLElement {
  const root = screenEl("challenges");
  screenHeader(root, { title: "Challenges", sub: "Positions to beat" });

  const body = el("div", "screenbody sb-top");
  const list = el("div", "challist");
  list.id = "challBody";
  CHALLENGES.forEach((c, i) => list.appendChild(challengeCard(c, i, () => onPlay(i))));
  body.appendChild(list);
  root.appendChild(body);
  return root;
}

/** One challenge a day, chosen by the day number so everyone gets the same one. */
export function buildDaily(onPlay: (index: number) => void, onBack: () => void,
  now: number = Date.now()): HTMLElement {
  const root = screenEl("daily");
  screenHeader(root, { title: "Daily Challenges", sub: "Resets every 24h", onBack });

  const index = Math.floor(now / 864e5) % CHALLENGES.length;
  const challenge = CHALLENGES[index] as Challenge;
  const msLeft = 864e5 - (now % 864e5);

  const body = el("div", "screenbody sb-top");
  const wrap = el("div", "dailywrap");
  wrap.id = "dailyBody";

  const card = el("div", "dailycard");
  card.appendChild(el("span", "dailybadge", "TODAY'S CHALLENGE"));

  const top = el("div", "challtop");
  top.append(el("span", "challname", challenge.name), el("span", "challstars", stars(challenge.stars)));
  card.append(top, el("div", "challdesc", challenge.desc));
  card.appendChild(el("div", "dailyreward",
    `Reward · ${DAILY_BONUS_PHEROMONE} pheromone + ${CHALLENGE_REWARD} mycelium`));

  const play = el("button", "cta challplay", "Play daily");
  play.onclick = () => onPlay(index);
  card.appendChild(play);

  const hours = Math.floor(msLeft / 36e5);
  const minutes = Math.floor((msLeft % 36e5) / 6e4);
  card.appendChild(el("div", "dailyreset", `Resets in ${hours}h ${minutes}m`));

  wrap.appendChild(card);
  body.appendChild(wrap);
  root.appendChild(body);
  return root;
}

function challengeCard(c: Challenge, index: number, onPlay: () => void): HTMLElement {
  const card = el("div", "challcard");
  const top = el("div", "challtop");
  top.append(
    el("span", "challname", `${index + 1}. ${c.name}`),
    el("span", "challstars", stars(c.stars)),
  );
  card.append(top, el("div", "challdesc", c.desc));

  const play = el("button", "cta challplay", "Play");
  play.onclick = onPlay;
  card.appendChild(play);
  return card;
}

const stars = (n: number): string => "★".repeat(n) + "☆".repeat(5 - n);
