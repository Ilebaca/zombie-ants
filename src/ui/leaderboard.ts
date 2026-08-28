/**
 * BIGGEST COLONIES: the ranking the whole game is played for.
 *
 * Tiers are bands of colony SIZE rather than rating brackets, and because a colony
 * compounds (platform/colony.ts) the bands are orders of magnitude apart — a thousand, ten
 * thousand, a million, a billion. That is the shape the number actually has, and it is why
 * the tier names are sizes of nest rather than military ranks.
 *
 * The rival colonies are generated, not fetched: there is no server yet (roadmap — async
 * PvP and a real ladder come later). They are derived from the tier index so the same tier
 * always shows the same table, which reads as a standing ladder rather than reshuffling on
 * every open. When the server exists this file swaps its source and nothing else moves.
 *
 * Markup is the legacy build's (lbchips → lbbanner → lblist).
 */
import { compact, exact } from "../platform";
import { el, screenEl, screenHeader } from "./chrome";
import { icon } from "./icons";

export interface Division {
  name: string;
  min: number;
  max: number;
  icon: string;
  col: string;
}

/**
 * Seven bands, each roughly two orders of magnitude wide at the top.
 *
 * Every mark is from the icon family — the legacy build put a compass, crossed swords, a
 * medal and a crown in this row, four glyphs from four illustrators (CLAUDE.md §10).
 */
export const DIVISIONS: readonly Division[] = [
  { name: "Forager", min: 0, max: 1e3, icon: "antarium", col: "#c08457" },
  { name: "Scout", min: 1e3, max: 1e4, icon: "next", col: "#9fb0c8" },
  { name: "Raider", min: 1e4, max: 1e5, icon: "attack", col: "#e7b53a" },
  { name: "Garrison", min: 1e5, max: 1e6, icon: "defence", col: "#27d3bd" },
  { name: "Warren", min: 1e6, max: 1e8, icon: "anthill", col: "#4a9eff" },
  { name: "Supercolony", min: 1e8, max: 1e10, icon: "brood", col: "#b14de0" },
  { name: "Continental", min: 1e10, max: Infinity, icon: "crown", col: "#f24fc8" },
];

const NAMES = [
  "Mandible", "Pheromone", "SixLegs", "Formica", "Stinger", "Myrmidon", "TunnelKing",
  "Brood", "Crawler", "AphidLord", "HiveMind", "Antenna", "Chitin", "Swarmlord", "Pincer",
  "Velvet", "Mound", "Drone", "Carapace", "Skitter",
];

export interface LadderRow {
  name: string;
  points: number;
  you: boolean;
}

export const divisionOf = (colony: number): number => {
  const i = DIVISIONS.findIndex((d) => colony >= d.min && colony < d.max);
  return i < 0 ? DIVISIONS.length - 1 : i;
};

/**
 * Fifteen rivals spread across the tier, plus the player when they belong in it.
 *
 * Spread GEOMETRICALLY, not evenly: a tier runs from a million to a hundred million, and
 * fifteen colonies laid out at equal intervals across that would put fourteen of them in
 * the top tenth and read as a table of one number.
 */
export function standings(divisionIndex: number, colony: number): LadderRow[] {
  const d = DIVISIONS[divisionIndex] as Division;
  const low = Math.max(1, d.min);
  const high = d.max === Infinity ? low * 100 : d.max;
  const rows: LadderRow[] = [];
  for (let i = 0; i < 15; i++) {
    const spread = ((i * 53 + 17) % 100) / 100;
    rows.push({
      name: (NAMES[(i + divisionIndex * 5) % NAMES.length] as string)
        + (((i * 7 + divisionIndex * 3) % 89) + 11),
      points: Math.round(low * (high / low) ** spread),
      you: false,
    });
  }
  if (divisionIndex === divisionOf(colony)) rows.push({ name: "You", points: colony, you: true });
  return rows.sort((a, b) => b.points - a.points);
}

export function buildLeaderboard(colony: number, onBack: () => void): HTMLElement {
  const root = screenEl("leaderboard");
  /** Which tier is on screen. Starts on the player's own. */
  let selected = divisionOf(colony);

  const render = (): void => {
    root.replaceChildren();
    screenHeader(root, { title: "Biggest colonies", sub: "World ranking", onBack });

    const body = el("div", "screenbody lbbody");
    body.id = "lbBody";
    const division = DIVISIONS[selected] as Division;

    const chips = el("div", "lbchips");
    DIVISIONS.forEach((d, i) => {
      const chip = el("button", "lbchip" + (i === selected ? " on" : ""));
      chip.style.setProperty("--c", d.col);
      chip.append(icon(d.icon, 14), document.createTextNode(d.name));
      chip.onclick = () => { selected = i; render(); };
      chips.appendChild(chip);
    });
    body.appendChild(chips);

    const banner = el("div", "lbbanner");
    banner.style.setProperty("--c", division.col);
    const badge = el("div", "lbbadge");
    badge.appendChild(icon(division.icon, 26));
    banner.appendChild(badge);
    const text = el("div");
    text.append(el("div", "lbname", division.name), el("div", "lbrange", range(division)));
    banner.appendChild(text);
    body.appendChild(banner);

    const list = el("div", "lblist");
    standings(selected, colony).forEach((row, i) => {
      const line = el("div", "lbrow" + (row.you ? " you" : ""));
      const troops = el("div", "lbpts", compact(row.points));
      // The full figure is one long press away for the player's own row, where it means
      // something: a colony of "1.2M" is a colony of exactly 1,238,441 troops.
      if (row.you) troops.title = `${exact(row.points)} troops`;
      line.append(el("div", "lbrank", medal(i + 1)), el("div", "lbpname", row.name), troops);
      list.appendChild(line);
    });
    body.appendChild(list);
    root.appendChild(body);

    // Open with the player's own tier in view, and their row if it is off screen.
    requestAnimationFrame(() => {
      body.querySelector(".lbchip.on")?.scrollIntoView?.({ inline: "center", block: "nearest" });
      body.querySelector(".lbrow.you")?.scrollIntoView?.({ block: "center" });
    });
  };

  render();
  return root;
}

const range = (d: Division): string =>
  d.max === Infinity
    ? `${compact(d.min)}+ troops`
    : `${compact(d.min)}–${compact(d.max - 1)} troops`;

const medal = (rank: number): string => String(rank);
