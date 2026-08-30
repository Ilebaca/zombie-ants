/**
 * The Profile: who the player is, what their record is, and what they have collected.
 *
 * The avatar used to open the Colony screen — a level badge and today's three quests — so
 * the one place a player would go to look at THEMSELVES showed a to-do list. Everything the
 * game already knew about their career (games, wins, ground taken, abilities cast) was
 * counted into the save and never shown anywhere.
 *
 * Three blocks, in the order a player asks for them:
 *
 *  1. WHO. Name, colony level, the XP bar and any level reward still to collect.
 *  2. RECORD. What has actually happened: played, won, win rate, streaks, and the field
 *     numbers — ground taken, queens, time at the board and the fastest win.
 *  3. COLLECTION. Colonies, chambers and research as three filled bars, each opening the
 *     screen that fills it. This is the block with room in it: anything the game starts
 *     collecting later — cosmetics, trophies, a lucky hatch — is another row here.
 *
 * EVERY CLASS IS PREFIXED, and that is not tidiness. The legacy stylesheet is this app's,
 * verbatim (CLAUDE.md §10), and it already owns `.pname` — the name INPUT, a bordered text
 * field — so borrowing it drew a box round the player's name. `.qbar` has a height only
 * inside `.qhero`, so the XP bar came out as a track with none. Both were silent.
 *
 * The screen reads and claims; it never advances progress. Career numbers come from what a
 * match did (app.ts → ProfileStore), so opening this can never move one.
 */
import { CHAMBER_MAX, SPECIES } from "../engine";
import type { SpeciesId } from "../engine";
import {
  CHAMBERS, RESEARCH_TOTAL_MAX, SPECIES_ORDER, compact, exact, levelReward,
} from "../platform";
import type { ProfileStore } from "../platform";
import { antPortrait, clockOf, el, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";

export interface ProfileOptions {
  onBack: () => void;
  /** The collection rows open the screens that fill them. */
  onColonies: () => void;
  onChambers: () => void;
  onQuests: () => void;
}

export function buildProfile(store: ProfileStore, opts: ProfileOptions): HTMLElement {
  const root = screenEl("profile");

  const render = (): void => {
    const profile = store.get();
    const s = profile.stats;

    root.replaceChildren();
    screenHeader(root, { title: "Profile", sub: "Record & collection", onBack: opts.onBack });

    const body = el("div", "screenbody sb-top");
    const scroll = el("div", "antscroll");
    scroll.id = "profileBody";

    scroll.appendChild(who(store, render, root));

    /*
     * RECORD, in two grids rather than one.
     *
     * The first six are the ones a player checks — how many, how many won, how often, and
     * whether they are on a run. The rest are what they DID, and they belong under their
     * own heading: one grid of a dozen cells is a spreadsheet.
     *
     * Tunnels dug, nests cracked, abilities cast and turns played are all still counted
     * into the save and simply not reported. Each is a tally rather than an achievement —
     * a number that only ever goes up with time played, which "Time at the board" already
     * says — so putting any of them back is a line.
     */
    const lost = Math.max(0, s.games - s.wins);
    const rate = s.games ? Math.round((s.wins / s.games) * 100) : 0;
    // THE COLONY LEADS. It is what every match is played for and the only number in the
    // game with no ceiling, so it is a line of its own rather than a cell in a grid.
    const size = el("div", "pf-colony");
    size.title = `${exact(profile.colony)} troops`;
    const fig = el("div", "pf-colony-n", compact(profile.colony));
    size.append(el("div", "pf-colony-k", "Colony"), fig, el("div", "pf-colony-s", "troops"));
    scroll.append(el("div", "secthead", "Record"), size);

    scroll.append(
      cells([
        ["Played", String(s.games)],
        ["Won", String(s.wins)],
        ["Lost", String(lost)],
        ["Win rate", `${rate}%`],
        ["Streak", String(s.winStreak)],
        ["Best streak", String(s.bestStreak)],
      ]),
      el("div", "secthead", "In the field"),
      cells([
        ["Ground taken", String(s.conquered)],
        ["Queens taken", String(s.queens)],
        ["Time at the board", clockOf(s.playedMs)],
        // A dash, not 0:00: a record that has never been set is not a time of nothing.
        ["Fastest win", s.bestMs ? clockOf(s.bestMs) : "—"],
      ]),
    );

    scroll.append(el("div", "secthead", "Collection"), collection(store, opts));

    // The quests still have a home, and this is the screen you would look for them from.
    const quests = el("button", "pf-row pf-row-go");
    quests.append(
      iconSlot("pf-row-i", "calendar", 18),
      el("span", "pf-row-t", "Daily quests"),
      icon("next", 14),
    );
    quests.onclick = opts.onQuests;
    scroll.appendChild(quests);

    body.appendChild(scroll);
    root.appendChild(body);
  };

  render();
  return root;
}

/** Name, level, the bar to the next one, and any reward still standing uncollected. */
function who(store: ProfileStore, render: () => void, root: HTMLElement): HTMLElement {
  const profile = store.get();
  const progress = store.level();
  const fav = favourite(store);

  const box = el("div", "pf-hero");

  const face = el("div", "pf-face");
  face.appendChild(antPortrait(fav ?? profile.lastSpecies, 76));
  // The level rides the portrait rather than sitting beside it: one object, and the
  // number is the part that changes.
  face.appendChild(el("span", "pf-level", String(progress.level)));

  const side = el("div", "pf-who");
  side.append(
    el("div", "pf-name", profile.name),
    el("div", "pf-sub", `Colony level ${progress.level}`),
  );
  const bar = el("div", "pf-bar");
  const fill = el("i");
  fill.style.width = `${Math.round(progress.pct * 100)}%`;
  bar.appendChild(fill);
  side.append(bar,
    el("div", "pf-xp", `${progress.into} / ${progress.need} XP to level ${progress.level + 1}`));

  box.append(face, side);

  // Level rewards are tapped, not auto-paid: reaching a level should feel like collecting.
  const unclaimed = store.unclaimedLevels();
  if (unclaimed.length) {
    const row = el("div", "claimrow");
    for (const level of unclaimed) {
      const chip = el("button", "claimchip", `Lvl ${level} · ${levelReward(level).label}`);
      chip.onclick = () => {
        if (store.claimLevel(level)) {
          render();
          toast(root, "Reward claimed!", "good");
        }
      };
      row.appendChild(chip);
    }
    box.appendChild(row);
  }
  return box;
}

/** A grid of labelled figures. Two columns, so nothing is stranded on a row of its own. */
function cells(items: readonly (readonly [string, string])[]): HTMLElement {
  const grid = el("div", "pf-stats");
  for (const [k, v] of items) {
    const cell = el("div", "pf-stat");
    cell.append(el("span", "pf-k", k), el("span", "pf-v", v));
    grid.appendChild(cell);
  }
  return grid;
}

/**
 * What has been collected, and the room for what will be.
 *
 * Each row is a count, a bar and a way in — the screen that fills it is one tap away, which
 * is the only thing a player wants from a summary they cannot act on here.
 */
function collection(store: ProfileStore, opts: ProfileOptions): HTMLElement {
  const profile = store.get();
  const box = el("div", "pf-coll");

  const colonies = SPECIES_ORDER.filter((id) => store.isUnlocked(id)).length;
  const chambers = CHAMBERS.reduce((n, ch) => n + (profile.hill[ch.id] ?? 0), 0);
  const chamberMax = Object.values(CHAMBER_MAX).reduce((a, b) => a + b, 0);
  const research = SPECIES_ORDER.reduce((n, id) => {
    const r = profile.research[id];
    return n + (r ? r.reservoir + r.mandible + r.cuticle : 0);
  }, 0);
  const researchMax = SPECIES_ORDER.length * RESEARCH_TOTAL_MAX;

  box.append(
    collRow("antarium", "Colonies", colonies, SPECIES_ORDER.length, opts.onColonies, faces(store)),
    collRow("anthill", "Nest chambers", chambers, chamberMax, opts.onChambers),
    collRow("flask", "Research levels", research, researchMax, opts.onColonies),
  );
  return box;
}

function collRow(
  mark: string, label: string, have: number, max: number,
  onOpen: () => void, extra?: HTMLElement,
): HTMLElement {
  const row = el("button", "pf-row pf-row-coll");
  row.append(iconSlot("pf-row-i", mark, 18));

  const mid = el("div", "pf-row-mid");
  const top = el("div", "pf-row-top");
  top.append(el("span", "pf-row-t", label), el("span", "pf-row-c", `${have} / ${max}`));
  const track = el("div", "pf-bar");
  const fill = el("i");
  fill.style.width = `${max ? Math.round((have / max) * 100) : 0}%`;
  track.appendChild(fill);
  mid.append(top, track);
  if (extra) mid.appendChild(extra);

  row.append(mid, icon("next", 14));
  row.onclick = onOpen;
  return row;
}

/** The nine colonies as a row of heads, the locked ones dimmed. */
function faces(store: ProfileStore): HTMLElement {
  const strip = el("div", "pf-faces");
  for (const id of SPECIES_ORDER) {
    const cell = el("span", "pf-head" + (store.isUnlocked(id) ? "" : " off"));
    cell.title = SPECIES[id].name;
    cell.appendChild(antPortrait(id, 22));
    strip.appendChild(cell);
  }
  return strip;
}

/** The colony fielded most often — the face the profile wears. */
function favourite(store: ProfileStore): SpeciesId | null {
  const fav = store.get().fav;
  let best: { id: SpeciesId; n: number } | null = null;
  for (const id of SPECIES_ORDER) {
    const n = fav[id] ?? 0;
    if (n > 0 && (!best || n > best.n)) best = { id, n };
  }
  return best?.id ?? null;
}

function iconSlot(cls: string, name: string, size: number): HTMLElement {
  const box = el("span", cls);
  box.appendChild(icon(name, size));
  return box;
}
