/**
 * BIGGEST COLONIES: the ranking the whole game is played for.
 *
 * Divisions are bands of colony SIZE rather than rating brackets, and because a colony
 * compounds (platform/colony.ts) the bands are orders of magnitude apart. That is the
 * shape the number actually has, and it is why the names are sizes of nest rather than
 * military ranks.
 *
 * The rivals are generated, not fetched: there is no server yet (roadmap — async PvP and a
 * real ladder come later). They are derived from the division index so the same division
 * always shows the same table, which reads as a standing ladder rather than reshuffling on
 * every open. When the server exists this file swaps its source and nothing else moves.
 *
 * THE TOP OF THE SCREEN DOES NOT SCROLL, and that is the fix this rebuild is mostly about.
 * The whole body was one scroller, and it opened by scrolling the player's own row into
 * the middle of it — which pushed the division chips and the banner off the top, so the
 * screen a player arrived at was a column of strangers' names with nothing saying what
 * they were a ranking OF. The chips and the banner are fixed now and only the table moves.
 *
 * Three other things the old table could not say, all of which a ladder exists to answer:
 * WHERE the player stands (their rank, in words, not just a highlighted row), how far the
 * next division is, and who a rival actually is — every other screen in the game gives an
 * opponent a colony and a face (matchmaking.ts, render/plates.ts) and here they were bare
 * strings.
 */
import { COLONY_START, RIVAL_NAMES, compact, exact } from "../platform";
import type { SpeciesId } from "../engine";
import { SPECIES } from "../engine";
import { antPortrait, el, redraw, screenEl, screenHeader } from "./chrome";
import { icon } from "./icons";

export interface Division {
  name: string;
  min: number;
  max: number;
  icon: string;
  col: string;
}

/**
 * Seven bands spanning the range a career actually covers.
 *
 * They are pinned to the ROAD, not to round powers of ten for their own sake: the road
 * ends at five million troops (platform/road.ts), so Supercolony is the band a player is
 * in as they finish it and Continental is what lies past it. Bands sized for the old
 * trillion-troop road left the top three empty for everyone.
 *
 * Every mark is from the icon family — the legacy build put a compass, crossed swords, a
 * medal and a crown in this row, four glyphs from four illustrators (CLAUDE.md §10).
 */
export const DIVISIONS: readonly Division[] = [
  { name: "Forager", min: 0, max: 1e3, icon: "antarium", col: "#c08457" },
  { name: "Scout", min: 1e3, max: 1e4, icon: "next", col: "#9fb0c8" },
  { name: "Raider", min: 1e4, max: 1e5, icon: "attack", col: "#e7b53a" },
  { name: "Garrison", min: 1e5, max: 5e5, icon: "defence", col: "#27d3bd" },
  { name: "Warren", min: 5e5, max: 2e6, icon: "anthill", col: "#4a9eff" },
  { name: "Supercolony", min: 2e6, max: 1e7, icon: "brood", col: "#b14de0" },
  { name: "Continental", min: 1e7, max: Infinity, icon: "crown", col: "#f24fc8" },
];

export interface LadderRow {
  name: string;
  points: number;
  species: SpeciesId;
  you: boolean;
}

/** Who is looking at the ladder. Their own row is drawn from this, not invented. */
export interface LadderYou {
  name: string;
  colony: number;
  species: SpeciesId;
}

export const divisionOf = (colony: number): number => {
  const i = DIVISIONS.findIndex((d) => colony >= d.min && colony < d.max);
  return i < 0 ? DIVISIONS.length - 1 : i;
};

/** Non-premium colonies only: a rival is somebody playing the game, not a shop window. */
const LADDER_SPECIES = (Object.keys(SPECIES) as SpeciesId[])
  .filter((id) => !SPECIES[id].premium);

/**
 * Fifteen rivals spread across the division, plus the player when they belong in it.
 *
 * Spread GEOMETRICALLY, not evenly: a division runs from a hundred thousand to five
 * hundred thousand, and fifteen colonies laid out at equal intervals across that would put
 * most of them in the top of the band and read as a table of one number.
 *
 * Each rival gets a colony of their own, seeded off their place in the table, because a
 * ladder of names with no faces is the one screen in this game where an opponent is a
 * string — the search, the nameplate and the result card all give them a head.
 */
export function standings(divisionIndex: number, you: LadderYou): LadderRow[] {
  const d = DIVISIONS[divisionIndex] as Division;
  const low = Math.max(1, d.min);
  const high = d.max === Infinity ? low * 100 : d.max;
  const rows: LadderRow[] = [];
  for (let i = 0; i < 15; i++) {
    const spread = ((i * 53 + 17) % 100) / 100;
    rows.push({
      name: (RIVAL_NAMES[(i + divisionIndex * 5) % RIVAL_NAMES.length] as string)
        + (((i * 7 + divisionIndex * 3) % 89) + 11),
      points: Math.round(low * (high / low) ** spread),
      species: LADDER_SPECIES[(i * 3 + divisionIndex) % LADDER_SPECIES.length] as SpeciesId,
      you: false,
    });
  }
  if (divisionIndex === divisionOf(you.colony)) {
    rows.push({ name: you.name, points: you.colony, species: you.species, you: true });
  }
  return rows.sort((a, b) => b.points - a.points);
}

export function buildLeaderboard(you: LadderYou, onBack: () => void): HTMLElement {
  const root = screenEl("leaderboard");
  const home = divisionOf(you.colony);
  /** Which division is on screen. Starts on the player's own. */
  let selected = home;

  const render = (): void => {
    redraw(root);
    screenHeader(root, { title: "Biggest colonies", sub: "World ranking", onBack });

    const body = el("div", "screenbody lbbody");
    body.id = "lbBody";
    const division = DIVISIONS[selected] as Division;

    // FIXED: the chips and the banner say what the table below is a ranking of, so they
    // cannot be the first thing scrolled away when the player's own row is brought up.
    const top = el("div", "lbtop");

    const chips = el("div", "lbchips");
    DIVISIONS.forEach((d, i) => {
      const chip = el("button", "lbchip" + (i === selected ? " on" : "")
        + (i === home ? " mine" : ""));
      chip.style.setProperty("--c", d.col);
      chip.append(icon(d.icon, 14), document.createTextNode(d.name));
      chip.onclick = () => { selected = i; render(); };
      chips.appendChild(chip);
    });
    top.appendChild(chips);
    top.appendChild(banner(division, selected, home, you));
    body.appendChild(top);

    const list = el("div", "lblist");
    const table = standings(selected, you);
    table.forEach((row, i) => {
      list.appendChild(ladderRow(row, i + 1));
    });
    body.appendChild(list);
    root.appendChild(body);

    // Only the TABLE scrolls, and only to the player's own row. The chips and the banner
    // are outside it and stay where they are.
    requestAnimationFrame(() => {
      chips.querySelector(".lbchip.on")?.scrollIntoView?.({ inline: "center", block: "nearest" });
      list.querySelector(".lbrow.you")?.scrollIntoView?.({ block: "center" });
    });
  };

  render();
  return root;
}

/* ------------------------------------------------------------------ THE BANNER */

/**
 * The division, what it takes to be in it, and where the player stands against it.
 *
 * The third part is the one the old screen never answered. On the player's own division it
 * is their rank and the distance to the next band; on any other it says whether that band
 * is ahead of them or behind, which is what makes the chips worth tapping through.
 */
function banner(d: Division, index: number, home: number, you: LadderYou): HTMLElement {
  const box = el("div", "lbbanner");
  box.style.setProperty("--c", d.col);

  const badge = el("div", "lbbadge");
  badge.appendChild(icon(d.icon, 26));
  box.appendChild(badge);

  const text = el("div", "lbmeta");
  text.append(el("div", "lbname", d.name), el("div", "lbrange", range(d)));

  if (index === home) {
    const rank = standings(index, you).findIndex((r) => r.you) + 1;
    const total = standings(index, you).length;
    text.appendChild(el("div", "lbstand", `You are ${ordinal(rank)} of ${total}`));

    const track = el("div", "lbtrack");
    const fill = el("i");
    fill.style.width = `${Math.round(progress(d, you.colony) * 100)}%`;
    track.appendChild(fill);
    text.appendChild(track);

    const next = DIVISIONS[index + 1];
    // The top band has no ceiling, which is the point of it — the colony number has none
    // either (CLAUDE.md §8a), so there is nothing to promise beyond it.
    text.appendChild(el("div", "lbnext", next
      ? `${compact(Math.max(0, d.max - you.colony))} troops to ${next.name}`
      : "The largest colonies there are"));
  } else {
    text.appendChild(el("div", "lbstand" + (index < home ? " past" : ""), index < home
      ? "You have outgrown this division"
      : `${compact(Math.max(0, d.min - you.colony))} troops to reach it`));
  }

  box.appendChild(text);
  return box;
}

/**
 * How far through the band a colony is — on a LOG scale, because the bands are orders of
 * magnitude wide. Linearly, a colony of a hundred thousand in a band running to five
 * hundred thousand fills nothing, and the bar would sit near empty for most of a division.
 */
function progress(d: Division, colony: number): number {
  const low = Math.max(COLONY_START, d.min);
  const high = d.max === Infinity ? low * 100 : d.max;
  if (colony <= low) return 0;
  const pct = Math.log(colony / low) / Math.log(high / low);
  return Math.max(0, Math.min(1, pct));
}

/* ------------------------------------------------------------------- THE TABLE */

/** One colony on the ladder: its place, its face, its name and its size. */
function ladderRow(row: LadderRow, rank: number): HTMLElement {
  const line = el("div", "lbrow" + (row.you ? " you" : ""));
  const place = el("div", "lbrank" + medalClass(rank), String(rank));
  const face = el("div", "lbface");
  // Drawn at twice the size it is shown at and scaled down by the stylesheet, the way the
  // species page and the map picker do it: a 30px canvas on a phone is a 60px picture.
  face.appendChild(antPortrait(row.species, 60));
  const troops = el("div", "lbpts", compact(row.points));
  // The full figure is one long press away on the player's own row, where it means
  // something: a colony of "1.2M" is a colony of exactly 1,238,441 troops.
  if (row.you) troops.title = `${exact(row.points)} troops`;
  line.append(place, face, el("div", "lbpname", row.name), troops);
  return line;
}

/** The top three are the only ranks worth marking; below that a number is a number. */
const medalClass = (rank: number): string =>
  rank === 1 ? " gold" : rank === 2 ? " silver" : rank === 3 ? " bronze" : "";

const range = (d: Division): string =>
  d.max === Infinity
    ? `${compact(d.min)}+ troops`
    : `${compact(d.min)}–${compact(d.max - 1)} troops`;

/** 1st, 2nd, 3rd, 4th — a rank reads as a placing, not as a count. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
}
