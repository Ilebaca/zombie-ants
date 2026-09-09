/**
 * THE LADDER, IN TWO TABS — because it was being asked two different questions at once.
 *
 * **THIS WEEK** is a league: fifty colonies of a similar size, ranked by what they GAINED
 * over the week, top ten paid when it ends. That is the half that was missing — the bands
 * had names and nothing behind them, so a colony sat in Forager or Raider by size alone,
 * there was nothing to win or lose, and no reason to open the screen twice. The rules of it
 * live in `platform/league.ts`, because what a week is worth is a progression decision and
 * not a screen's private business (§7); this file draws them.
 *
 * **BIGGEST COLONIES** is the other question, and it is deliberately NOT a competition: one
 * list of everybody by total troops with the chapter they have reached. No bands, no prize,
 * no reset. Ranking a WEEK and ranking a CAREER are different measures — one rewards
 * playing now, the other rewards having played — and a single table trying to be both
 * answers neither, which is what the old one did.
 *
 * THE TOP OF THE SCREEN DOES NOT SCROLL. The body used to be one scroller that opened by
 * bringing the player's own row to the middle, which pushed the chips and the banner off
 * the top: the screen a player arrived at was a column of strangers' names with nothing
 * saying what they were a ranking OF.
 *
 * The neighbours are generated on this device — there is no server yet (roadmap) — and both
 * tabs say so, because a table of invented names under a heading claiming a global standing
 * is the app telling a player something untrue (§ WHAT THE TWO STORES REQUIRE). What is NOT
 * invented is the player's own score, their place in the week, and the prize it pays.
 */
import {
  COLONY_START, LEAGUES, LEAGUE_SIZE, PAID_PLACES, compact, exact, globalTable,
  leagueChapters, msLeftInWeek, prizeFor, prizeText, seasonScore, table, weekProgress,
} from "../platform";
import type { GlobalRow, League, ProfileStore, SeasonResult, Standing } from "../platform";
import { antPortrait, el, redraw, screenEl, screenHeader } from "./chrome";
import { icon } from "./icons";

type Tab = "week" | "all";

export function buildLeaderboard(store: ProfileStore, onBack: () => void): HTMLElement {
  const root = screenEl("leaderboard");
  /**
   * SETTLE BEFORE DRAWING, and exactly once. `rollSeason` closes a week that has ended,
   * pays what it was worth and opens the next one; it answers null while the season is
   * still running, so there is something to announce on the first open after a Sunday and
   * nothing on the second (platform/profile.ts).
   */
  const finished: SeasonResult | null = store.rollSeason();
  let tab: Tab = "week";

  const render = (): void => {
    redraw(root);
    screenHeader(root, {
      title: tab === "week" ? "This week" : "Biggest colonies",
      sub: tab === "week" ? "League season" : "Every colony, by size",
      onBack,
    });

    const body = el("div", "screenbody lbbody");
    body.id = "lbBody";

    const tabs = el("div", "lbtabs");
    ([["week", "This week"], ["all", "Biggest colonies"]] as const).forEach(([id, label]) => {
      const b = el("button", "lbtab" + (tab === id ? " on" : ""), label);
      b.onclick = () => { tab = id; render(); };
      tabs.appendChild(b);
    });
    body.appendChild(tabs);

    if (tab === "week") weekTab(body, store, finished);
    else allTab(body, store);

    root.appendChild(body);
    requestAnimationFrame(() => {
      body.querySelector(".lblist .lbrow.you")?.scrollIntoView?.({ block: "center" });
    });
  };

  render();
  return root;
}

/* --------------------------------------------------------------------- THIS WEEK */

function weekTab(body: HTMLElement, store: ProfileStore, finished: SeasonResult | null): void {
  const me = store.get();
  const season = store.season();
  const rows = table(season, { name: me.name, species: me.lastSpecies, colony: me.colony });
  const place = rows.findIndex((r) => r.you) + 1;
  const band = LEAGUES[season.league] as League;

  const top = el("div", "lbtop");
  // WHAT LAST WEEK CAME TO, on the one open where it is news. A season that paid out and
  // said nothing is a reward the player never sees arrive.
  if (finished) top.appendChild(lastWeek(finished));
  top.appendChild(seasonBanner(band, season.league, place, seasonScore(season, me.colony)));
  body.appendChild(top);

  const list = el("div", "lblist");
  rows.forEach((row, i) => list.appendChild(weekRow(row, i + 1)));
  // UNDER THE TABLE AND INSIDE IT. Pinned to the foot of the screen it took a fifth of the
  // page for ever and left five rows of a fifty-colony league on show; the head is what has
  // to stay put, and this is a thing read once.
  list.appendChild(el("div", "lbnote",
    `Fifty colonies of about your size play each week. The top ${PAID_PLACES} are paid when `
    + "it ends. These colonies are generated on your device; playing against other people "
    + "arrives with online matches."));
  body.appendChild(list);
}

/**
 * The league, the clock, and where the player stands in it.
 *
 * The CHAPTERS are on it because a band that does not tie back to the road is a second
 * scale to learn: "Raider, chapters 21–30" says where this sits in a career, and
 * "10K–100K troops" says what it takes to be here.
 */
function seasonBanner(band: League, index: number, place: number, score: number): HTMLElement {
  const box = el("div", "lbbanner");
  box.style.setProperty("--c", band.col);

  const badge = el("div", "lbbadge");
  badge.appendChild(icon(band.icon, 26));
  box.appendChild(badge);

  const text = el("div", "lbmeta");
  const chapters = leagueChapters(index);
  text.append(
    el("div", "lbname", band.name),
    el("div", "lbrange", `${range(band)} · ${chapterRange(chapters)}`),
    el("div", "lbstand", `You are ${ordinal(place)} of ${LEAGUE_SIZE}`),
  );

  // THE SCORE IS THE WEEK'S GAIN, and a losing week is printed as one. A defeat shrinks the
  // colony (§8a), so this goes negative by itself — which is the whole reason the score is
  // a difference between two readings rather than a tally somebody has to decrement.
  const gain = el("div", "lbgain" + (score < 0 ? " down" : ""),
    `${score < 0 ? "−" : "+"}${compact(Math.abs(score))} troops this week`);
  text.appendChild(gain);

  // HOW FAR THE PRIZE IS, counted the right way round. It was `PAID_PLACES - place + 1`,
  // which is places-remaining-in-the-paid-ten — a number that is only positive for somebody
  // who is already being paid, so everybody else read "−27 places to a prize".
  const prize = prizeFor(place);
  const climb = place - PAID_PLACES;
  text.appendChild(el("div", "lbnext", prize
    ? `Finishing here pays ${prizeText(prize)}`
    : `${climb} ${climb === 1 ? "place" : "places"} to a prize`));
  // HOW MUCH OF THE WEEK IS LEFT, drawn as well as written. A score is only worth reading
  // against the time there is to improve it: second place with a day to go and second place
  // with an hour to go are two different positions.
  const track = el("div", "lbtrack");
  const run = el("i");
  run.style.width = `${Math.round(weekProgress() * 100)}%`;
  track.appendChild(run);
  const time = el("div", "lbtime");
  time.append(track, el("span", "lbclock", `${untilEnd()} left`));
  text.appendChild(time);

  box.appendChild(text);
  return box;
}

/** What the week that just ended came to. */
function lastWeek(r: SeasonResult): HTMLElement {
  const box = el("div", "lblast" + (r.prize ? " paid" : ""));
  const band = LEAGUES[r.league] as League;
  box.append(
    el("div", "lblastname", `Last week in ${band.name}`),
    el("div", "lblastplace", `${ordinal(r.place)} of ${LEAGUE_SIZE}`
      + ` · ${r.score < 0 ? "−" : "+"}${compact(Math.abs(r.score))} troops`),
  );
  // A place outside the paid ten still gets a line: "you were not paid" is information, and
  // a banner that only ever appears on a win teaches a player to expect one.
  box.appendChild(el("div", "lblastprize", r.prize
    ? `Paid ${prizeText(r.prize)}`
    : `Top ${PAID_PLACES} are paid — closer next week`));
  return box;
}

/** One colony's week: its place, its face, its name, and what it gained. */
function weekRow(row: Standing, rank: number): HTMLElement {
  const line = el("div", "lbrow" + (row.you ? " you" : "")
    + (rank <= PAID_PLACES ? " paid" : ""));
  const place = el("div", "lbrank" + medalClass(rank), String(rank));
  const face = el("div", "lbface");
  face.appendChild(antPortrait(row.species, 60));
  const gain = el("div", "lbpts" + (row.score < 0 ? " down" : ""),
    `${row.score < 0 ? "−" : "+"}${compact(Math.abs(row.score))}`);
  if (row.you) gain.title = `${exact(row.score)} troops this week`;
  line.append(place, face, el("div", "lbpname", row.name), gain);
  return line;
}

/** How long the season has left, in the largest unit that still says something useful. */
function untilEnd(now: number = Date.now()): string {
  const ms = msLeftInWeek(now);
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m`;
}

/* -------------------------------------------------------------- BIGGEST COLONIES */

function allTab(body: HTMLElement, store: ProfileStore): void {
  const me = store.get();
  const rows = globalTable({ name: me.name, species: me.lastSpecies, colony: me.colony });
  const place = rows.findIndex((r) => r.you) + 1;

  const top = el("div", "lbtop");
  const box = el("div", "lbbanner");
  box.style.setProperty("--c", "#8fe36a");
  const badge = el("div", "lbbadge");
  badge.appendChild(icon("crown", 26));
  box.appendChild(badge);
  const text = el("div", "lbmeta");
  text.append(
    el("div", "lbname", me.name),
    el("div", "lbrange", `${exact(me.colony)} troops`),
    el("div", "lbstand", `${ordinal(place)} of ${rows.length}`),
    el("div", "lbnext", `Chapter ${rows.find((r) => r.you)?.chapter ?? 1}`),
  );
  box.appendChild(text);
  top.appendChild(box);
  body.appendChild(top);

  const list = el("div", "lblist");
  rows.forEach((row, i) => list.appendChild(globalRow(row, i + 1)));
  list.appendChild(el("div", "lbnote",
    "Every colony by total troops, with the chapter it has reached. Nothing here resets and "
    + "nothing here is paid — that is the weekly league. These colonies are generated on "
    + "your device."));
  body.appendChild(list);
}

/** One colony's career: its place, its face, its name, its size and its chapter. */
function globalRow(row: GlobalRow, rank: number): HTMLElement {
  const line = el("div", "lbrow" + (row.you ? " you" : ""));
  const place = el("div", "lbrank" + medalClass(rank), String(rank));
  const face = el("div", "lbface");
  face.appendChild(antPortrait(row.species, 60));
  const who = el("div", "lbpname");
  who.append(
    el("span", "lbwho", row.name),
    el("small", "lbch", `Chapter ${row.chapter}`),
  );
  const troops = el("div", "lbpts", compact(row.colony));
  if (row.you) troops.title = `${exact(row.colony)} troops`;
  line.append(place, face, who, troops);
  return line;
}

/* ------------------------------------------------------------------------ SHARED */

/** The top three are the only ranks worth marking; below that a number is a number. */
const medalClass = (rank: number): string =>
  rank === 1 ? " gold" : rank === 2 ? " silver" : rank === 3 ? " bronze" : "";

const range = (d: League): string =>
  d.max === Infinity
    ? `${compact(d.min)}+ troops`
    : `${compact(Math.max(COLONY_START, d.min))}–${compact(d.max - 1)} troops`;

const chapterRange = (c: { from: number; to: number }): string =>
  c.from === c.to ? `chapter ${c.from}` : `chapters ${c.from}–${c.to}`;

/** 1st, 2nd, 3rd, 4th — a rank reads as a placing, not as a count. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
}
