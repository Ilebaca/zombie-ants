/**
 * THE WEEKLY LEAGUE — a season short enough to matter.
 *
 * The ladder was seven bands with names on them and nothing behind the names: a colony sat
 * in Forager or Raider because of its size, and that was the whole of it. There was nothing
 * to win, nothing to lose, no reason to open the screen twice and no way for a week of
 * playing to show up anywhere. This is the half that was missing.
 *
 * FOUR RULES, and each of them is a decision rather than a detail:
 *
 * 1. **THE SCORE IS WHAT YOU GAINED THIS WEEK, not what you hold.** Ranking by total
 *    troops would rank by how long somebody has played, which is a table decided before
 *    the week starts — the biggest colony wins every week for ever. Gain is the one
 *    measure a new colony and an old one compete at on the same terms, and it is the
 *    measure the game already moves: a win pays a share of the colony (§8a), so a small
 *    colony gaining 12% of itself and a large one gaining 3% are both playing well. A
 *    DEFEAT SHRINKS THE COLONY, so it drops the score by itself — nothing here has to
 *    subtract anything, and that is why the score is a difference and not a tally.
 * 2. **THE LEAGUE IS THE SIZE BAND**, so everybody in one is playing for the same kind of
 *    number. It is the same table the ladder already used, moved here because it is a
 *    progression fact rather than a screen's private business (§7), and it now names the
 *    CHAPTERS it spans — a band that does not tie to the road is a second scale to learn.
 * 3. **FIFTY PLAYERS, TOP TEN PAID, and the prize tapers.** Fifty is small enough that a
 *    good week reaches the top of it and large enough that it is not a foregone conclusion.
 * 4. **A SEASON IS SETTLED ONCE.** The week the season belongs to is stamped on it, so a
 *    new week replaces it and the same placing cannot pay twice — the same shape the
 *    challenge rewards and the road claims use.
 *
 * There is no server, so the other forty-nine are generated on the device, and every screen
 * that shows them says so (§ WHAT THE TWO STORES REQUIRE). What is NOT invented is the
 * player's own score and the prize: those are real, and they are paid out of the same
 * `Grant` the shop and the road use.
 */
import { COLONY_START } from "./colony";
import { ROAD_LAST, chapterOf } from "./road";
import { RIVAL_NAMES } from "./rival";
import { seeded } from "../engine";
import type { Grant } from "./purchases";
import type { SpeciesId } from "../engine";
import { SPECIES } from "../engine";

/** How many colonies are in a league, the player included. */
export const LEAGUE_SIZE = 50;
/** How many of them are paid at the end of the week. */
export const PAID_PLACES = 10;

export interface League {
  name: string;
  /** The colony sizes this league covers. */
  min: number;
  max: number;
  icon: string;
  col: string;
}

/**
 * Seven bands spanning the range a career actually covers.
 *
 * Pinned to the ROAD rather than to round powers of ten: it ends at five million troops
 * (road.ts), so Supercolony is the band a player is in as they finish it and Continental is
 * what lies past it. Bands sized for the old trillion-troop road left the top three empty
 * for everybody who ever played.
 */
export const LEAGUES: readonly League[] = [
  { name: "Forager", min: 0, max: 1e3, icon: "antarium", col: "#c08457" },
  { name: "Scout", min: 1e3, max: 1e4, icon: "next", col: "#9fb0c8" },
  { name: "Raider", min: 1e4, max: 1e5, icon: "attack", col: "#e7b53a" },
  { name: "Garrison", min: 1e5, max: 5e5, icon: "defence", col: "#27d3bd" },
  { name: "Warren", min: 5e5, max: 2e6, icon: "anthill", col: "#4a9eff" },
  { name: "Supercolony", min: 2e6, max: 1e7, icon: "brood", col: "#b14de0" },
  { name: "Continental", min: 1e7, max: Infinity, icon: "crown", col: "#f24fc8" },
];

export const leagueOf = (colony: number): number => {
  const i = LEAGUES.findIndex((d) => colony >= d.min && colony < d.max);
  return i < 0 ? LEAGUES.length - 1 : i;
};

/**
 * The chapters a league spans, so it reads as part of the road rather than beside it.
 *
 * The top band has no ceiling and the road does, so it reports the last chapter and no
 * more — a range ending at infinity is a number nobody can play toward.
 */
export function leagueChapters(index: number): { from: number; to: number } {
  const d = LEAGUES[index] as League;
  return {
    from: chapterOf(Math.max(COLONY_START, d.min)),
    to: chapterOf(d.max === Infinity ? d.min * 10 : d.max - 1),
  };
}

/* -------------------------------------------------------------------- THE WEEK */

/**
 * Which week it is, counted in whole UTC weeks from the epoch.
 *
 * UTC rather than local, and that is deliberate: a season is a thing several people are
 * meant to be in together, so it cannot start and end at a different moment for each of
 * them. The daily quests roll on LOCAL midnight for the opposite reason — those are one
 * player's own day (quests.ts).
 */
export const weekIndex = (now: number = Date.now()): number =>
  Math.floor(now / 604_800_000);

/** Milliseconds left in this week — the countdown the screen shows. */
export const msLeftInWeek = (now: number = Date.now()): number =>
  (weekIndex(now) + 1) * 604_800_000 - now;

/** How far through the week we are, 0..1. The rivals' scores are revealed against it. */
export const weekProgress = (now: number = Date.now()): number =>
  1 - msLeftInWeek(now) / 604_800_000;

/* ------------------------------------------------------------------ THE SEASON */

/** A season in progress: which week, and what the colony was worth when it opened. */
export interface Season {
  week: number;
  /** The colony at the moment the season opened. The score is measured from here. */
  startColony: number;
  /** Which league they were seeded into. Fixed for the week, even if the colony grows. */
  league: number;
}

export const openSeason = (colony: number, now: number = Date.now()): Season => ({
  week: weekIndex(now),
  startColony: colony,
  league: leagueOf(colony),
});

/**
 * What a week of playing was worth. Negative when it cost.
 *
 * A defeat shrinks the colony (§8a), so this falls by itself — which is the whole reason
 * the score is a difference between two readings rather than something the match settler
 * has to remember to add to.
 */
export const seasonScore = (season: Season, colony: number): number =>
  colony - season.startColony;

/* ------------------------------------------------------------------ THE RIVALS */

/** Non-premium colonies only: a rival is somebody playing the game, not a shop window. */
const RIVAL_SPECIES = (Object.keys(SPECIES) as SpeciesId[]).filter((id) => !SPECIES[id].premium);

export interface Standing {
  name: string;
  species: SpeciesId;
  /** Troops gained this week. */
  score: number;
  /** What their colony is worth now, so the table can show who it is. */
  colony: number;
  you: boolean;
}

/**
 * The forty-nine, and what they have gained so far this week.
 *
 * SEEDED ON THE WEEK AND THE LEAGUE, so the table is a standing one: the same names in the
 * same league all week, rather than a fresh cast every time the screen is opened. A ladder
 * that reshuffles on each visit is not a ladder.
 *
 * Their gains are REVEALED ACROSS THE WEEK rather than fixed at the start — each has a
 * target for the week and shows the share of it the week has reached, with a phase of its
 * own so they do not all move in step. That is what makes the table something to climb: a
 * player who plays on Tuesday passes rivals who have not caught up yet, and some of them
 * pass back on Friday.
 */
export function rivals(league: number, week: number, now: number = Date.now()): Standing[] {
  const band = LEAGUES[league] as League;
  const low = Math.max(COLONY_START, band.min);
  const high = band.max === Infinity ? low * 8 : band.max;
  const through = weekProgress(now);
  const rng = seeded(week * 7919 + league * 104729);
  const out: Standing[] = [];

  for (let i = 0; i < LEAGUE_SIZE - 1; i++) {
    // Geometric across the band: a league runs from a hundred thousand to five hundred
    // thousand, and fifty colonies at even intervals would all sit in the top of it and
    // read as a table of one number.
    const colony = Math.round(low * (high / low) ** rng());
    // A week's gain, as a share of what they hold — the same shape the win curve has, so a
    // small colony and a large one produce numbers of the right size for their own band.
    const target = colony * (0.04 + rng() * 0.55);
    // Their own pace through the week, so the order moves rather than only the totals.
    const pace = 0.55 + rng() * 0.9;
    const shown = Math.min(1, through * pace);
    out.push({
      name: (RIVAL_NAMES[Math.floor(rng() * RIVAL_NAMES.length)] as string)
        + (10 + Math.floor(rng() * 89)),
      species: RIVAL_SPECIES[Math.floor(rng() * RIVAL_SPECIES.length)] as SpeciesId,
      score: Math.round(target * shown),
      colony,
      you: false,
    });
  }
  return out;
}

/** The whole table, the player in it, best week first. */
export function table(
  season: Season, you: { name: string; species: SpeciesId; colony: number },
  now: number = Date.now(),
): Standing[] {
  const rows = rivals(season.league, season.week, now);
  rows.push({
    name: you.name,
    species: you.species,
    score: seasonScore(season, you.colony),
    colony: you.colony,
    you: true,
  });
  return rows.sort((a, b) => b.score - a.score || b.colony - a.colony);
}

/** Where the player finished, counting from 1. */
export const placeOf = (rows: readonly Standing[]): number =>
  rows.findIndex((r) => r.you) + 1;

/* ----------------------------------------------------------------------- PRIZES */

/**
 * What each place pays.
 *
 * FLAT ACROSS THE LEAGUES, not scaled by band, and that is on purpose: the currencies buy
 * the same chambers and the same research whatever the colony is worth (catalogue.ts), so a
 * prize that scaled with the league would be worth more to the players who need it least.
 *
 * SIZED AGAINST WHAT PLAYING PAYS. The modelled player earns around seventy mycelium and
 * fifty pheromone a day (§8c), so a week of playing is roughly 490 and 350. First place is
 * about half a week of that and tenth is a rounding error on it — a prize worth winning
 * that cannot become the way the game is played. `economy.test.ts` holds that ceiling.
 */
export interface Prize extends Grant { place: number }

const PRIZES: ReadonlyArray<{ upTo: number; mycel: number; pheromone: number; larva: number }> = [
  { upTo: 1, mycel: 240, pheromone: 120, larva: 3 },
  { upTo: 2, mycel: 170, pheromone: 85, larva: 2 },
  { upTo: 3, mycel: 120, pheromone: 60, larva: 2 },
  { upTo: 5, mycel: 80, pheromone: 40, larva: 1 },
  { upTo: PAID_PLACES, mycel: 50, pheromone: 25, larva: 1 },
];

/** The prize for a place, or null outside the paid ten. */
export function prizeFor(place: number): Prize | null {
  if (place < 1 || place > PAID_PLACES) return null;
  const row = PRIZES.find((p) => place <= p.upTo);
  if (!row) return null;
  return { place, mycel: row.mycel, pheromone: row.pheromone, larva: row.larva };
}

/** What the screen prints beside a place. */
export function prizeText(p: Prize): string {
  return [
    p.mycel ? `${p.mycel} mycelium` : "",
    p.pheromone ? `${p.pheromone} pheromone` : "",
    p.larva ? `${p.larva} larva` : "",
  ].filter(Boolean).join(" · ");
}

/** How a finished season is reported back to the screen that has to announce it. */
export interface SeasonResult {
  week: number;
  league: number;
  place: number;
  score: number;
  prize: Prize | null;
}

/* ------------------------------------------------------- THE WHOLE-SERVER LIST */

export interface GlobalRow {
  name: string;
  species: SpeciesId;
  colony: number;
  chapter: number;
  you: boolean;
}

/**
 * Every colony, biggest first, with the chapter it has reached. That is the whole of it.
 *
 * DELIBERATELY NOT A COMPETITION. It pays nothing, resets never and is not divided into
 * anything — the league is where a week is played for, and this is the other question a
 * ladder answers: how big is the biggest, and where am I in that. Two different jobs, which
 * is why they are two tabs rather than one screen trying to be both.
 *
 * Spread over the WHOLE road rather than around the player, or a list that exists to show
 * the scale would show one band of it. Seeded on nothing but the index, so it is the same
 * list every time it is opened — it is meant to read as a standing table, and one that
 * reshuffled would say the opposite.
 */
export function globalTable(
  you: { name: string; species: SpeciesId; colony: number }, count = 100,
): GlobalRow[] {
  const rng = seeded(0x1eaded);
  // THE BIGGEST COLONY IS THE END OF THE ROAD, not a number past it. Topping the list out
  // at four times the last rung gave the first seven rows the same chapter — fifty, because
  // the road stops there — so the one fact this table exists to carry said nothing at the
  // one end everybody looks at.
  const top = ROAD_LAST;
  const rows: GlobalRow[] = [];
  for (let i = 0; i < count; i++) {
    // Geometric from the top down, so the shape of the list is the shape of the curve a
    // career actually follows (§8a) rather than a straight line nobody's colony walks.
    const colony = Math.round(top * (COLONY_START / top) ** ((i + rng() * 0.7) / count));
    rows.push({
      name: (RIVAL_NAMES[Math.floor(rng() * RIVAL_NAMES.length)] as string)
        + (10 + Math.floor(rng() * 89)),
      species: RIVAL_SPECIES[Math.floor(rng() * RIVAL_SPECIES.length)] as SpeciesId,
      colony,
      chapter: chapterOf(colony),
      you: false,
    });
  }
  rows.push({
    name: you.name, species: you.species, colony: you.colony,
    chapter: chapterOf(you.colony), you: true,
  });
  return rows.sort((a, b) => b.colony - a.colony);
}
