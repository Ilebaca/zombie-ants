/**
 * The ranked ladder: divisions by trophy count, and the standings inside one.
 *
 * The opponents are generated, not fetched — there is no server yet (roadmap: async PvP
 * comes later). They are derived from the division index so the same division always shows
 * the same table, which reads as a real ladder rather than reshuffling on every open.
 *
 * Markup is the legacy build's (lbchips → lbbanner → lblist).
 */
import { el, screenEl, screenHeader } from "./chrome";
import { icon } from "./icons";

export interface Division {
  name: string;
  min: number;
  max: number;
  icon: string;
  col: string;
}

export const DIVISIONS: readonly Division[] = [
  { name: "Forager", min: 0, max: 250, icon: "antarium", col: "#c08457" },
  { name: "Scout", min: 250, max: 600, icon: "🧭", col: "#9fb0c8" },
  { name: "Soldier", min: 600, max: 1200, icon: "⚔️", col: "#e7b53a" },
  { name: "Guardian", min: 1200, max: 2200, icon: "defence", col: "#27d3bd" },
  { name: "Major", min: 2200, max: 3800, icon: "🎖️", col: "#4a9eff" },
  { name: "Warlord", min: 3800, max: 6000, icon: "flag", col: "#b14de0" },
  { name: "Queen", min: 6000, max: Infinity, icon: "👑", col: "#f24fc8" },
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

export const divisionOf = (trophies: number): number => {
  const i = DIVISIONS.findIndex((d) => trophies >= d.min && trophies < d.max);
  return i < 0 ? DIVISIONS.length - 1 : i;
};

/** Fifteen opponents spread across the division's range, plus the player when they belong. */
export function standings(divisionIndex: number, trophies: number): LadderRow[] {
  const d = DIVISIONS[divisionIndex] as Division;
  const top = d.max === Infinity ? d.min + 2000 : d.max;
  const rows: LadderRow[] = [];
  for (let i = 0; i < 15; i++) {
    const spread = ((i * 53 + 17) % 100) / 100;
    rows.push({
      name: (NAMES[(i + divisionIndex * 5) % NAMES.length] as string) + (((i * 7 + divisionIndex * 3) % 89) + 11),
      points: Math.round(d.min + spread * (top - d.min - 1)),
      you: false,
    });
  }
  if (divisionIndex === divisionOf(trophies)) rows.push({ name: "You", points: trophies, you: true });
  return rows.sort((a, b) => b.points - a.points);
}

export function buildLeaderboard(trophies: number, onBack: () => void): HTMLElement {
  const root = screenEl("leaderboard");
  /** Which division is on screen. Starts on the player's own. */
  let selected = divisionOf(trophies);

  const render = (): void => {
    root.replaceChildren();
    screenHeader(root, { title: "Leaderboard", sub: "Ranked divisions", onBack });

    const body = el("div", "screenbody lbbody");
    body.id = "lbBody";
    const division = DIVISIONS[selected] as Division;

    const chips = el("div", "lbchips");
    DIVISIONS.forEach((d, i) => {
      const chip = el("button", "lbchip" + (i === selected ? " on" : ""));
      chip.style.setProperty("--c", d.col);
      chip.append(el("span", undefined, d.icon), document.createTextNode(d.name));
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
    standings(selected, trophies).forEach((row, i) => {
      const line = el("div", "lbrow" + (row.you ? " you" : ""));
      line.append(
        el("div", "lbrank", medal(i + 1)),
        el("div", "lbpname", row.name),
        el("div", "lbpts", row.points.toLocaleString()),
      );
      list.appendChild(line);
    });
    body.appendChild(list);
    root.appendChild(body);

    // Open with the player's own division in view, and their row if it is off screen.
    requestAnimationFrame(() => {
      body.querySelector(".lbchip.on")?.scrollIntoView({ inline: "center", block: "nearest" });
      body.querySelector(".lbrow.you")?.scrollIntoView({ block: "center" });
    });
  };

  render();
  return root;
}

const range = (d: Division): string =>
  d.max === Infinity
    ? `${d.min.toLocaleString()}+ pts`
    : `${d.min.toLocaleString()}–${(d.max - 1).toLocaleString()} pts`;

const medal = (rank: number): string =>
  String(rank);
