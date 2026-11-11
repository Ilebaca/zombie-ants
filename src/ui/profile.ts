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
 * verbatim (PROJECT_GUIDE.md §10), and it already owns `.pname` — the name INPUT, a bordered text
 * field — so borrowing it drew a box round the player's name. `.qbar` has a height only
 * inside `.qhero`, so the XP bar came out as a track with none. Both were silent.
 *
 * The screen reads and claims; it never advances progress. Career numbers come from what a
 * match did (app.ts → ProfileStore), so opening this can never move one.
 */
import { groupSections } from "./groups";
import { CHAMBER_MAX, SPECIES } from "../engine";
import {
  CHAMBERS, RESEARCH_TOTAL_MAX, SPECIES_ORDER, TRAIT_SLOTS, avatarProgress, exact,
} from "../platform";
import type { ProfileStore, TraitScope } from "../platform";
import { antPortrait, avatarFace, clockOf, el, levelRewardChip, redraw, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";

export interface ProfileOptions {
  onBack: () => void;
  /** The collection rows open the screens that fill them. */
  onColonies: () => void;
  onChambers: () => void;
  onQuests: () => void;
  /** The record's own detail: which matches, not just how many. */
  onHistory: () => void;
  /** The collection's fourth door, once traits are open. */
  onTraits: () => void;
  /** The faces: the one worn is on this screen, so the picker opens from it. */
  onAvatars: () => void;
}

export function buildProfile(store: ProfileStore, opts: ProfileOptions): HTMLElement {
  const root = screenEl("profile");

  const render = (): void => {
    const profile = store.get();
    const s = profile.stats;

    redraw(root);
    screenHeader(root, { title: "Profile", onBack: opts.onBack });

    const body = el("div", "screenbody sb-top");
    const scroll = el("div", "antscroll");
    scroll.id = "profileBody";

    scroll.appendChild(who(store, render, root, opts));

    // THE RECORD IS A COUNT; THIS IS THE LIST. A player who has won 61 of 104 could not
    // see one of them — no idea who they played last night or how it went.
    //
    // It rides with the HERO, above the record rather than below it, because everything
    // under "Record" is a summary OF these matches and the way into a summary is the
    // thing it summarises. It began under the collection — three doors and a strip of
    // a strip of heads deep — where from the top of the screen it did not exist at all.
    const stored = store.history.length;
    const history = el("button", "pf-row pf-row-go");
    history.id = "pfHistory";
    const hmid = el("div", "pf-row-mid");
    const htop = el("div", "pf-row-top");
    htop.append(
      el("span", "pf-row-t", "Recent matches"),
      // The count is what makes it a door with something behind it rather than a label.
      el("span", "pf-row-c", stored ? String(stored) : "none yet"),
    );
    hmid.appendChild(htop);
    history.append(iconSlot("pf-row-i", "board", 18), hmid, icon("next", 14));
    history.onclick = opts.onHistory;
    scroll.appendChild(history);

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
    //
    // AND IT IS WRITTEN OUT IN FULL HERE, asked for directly: "we need to see the exact
    // colony number, not 2K — that's shortened for other screens like the home screen."
    // `compact()` exists because the figure rides a 30px banner over artwork and a chip
    // in the top bar, where seven digits do not fit (§8a); this is the one screen that is
    // ABOUT the number, there is a whole card for it, and a player who wants to know
    // whether they are at 1,960 or 2,040 has nowhere else to look.
    const size = el("div", "pf-colony");
    const fig = el("div", "pf-colony-n", exact(profile.colony));
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

    // The quests still have a home, and this is the screen you would look for them from.
    const quests = el("button", "pf-row pf-row-go");
    quests.append(
      iconSlot("pf-row-i", "calendar", 18),
      el("span", "pf-row-t", "Daily quests"),
      icon("next", 14),
    );
    quests.onclick = opts.onQuests;
    scroll.appendChild(quests);

    scroll.append(el("div", "secthead", "Collection"), collection(store, opts));

    body.appendChild(scroll);
    root.appendChild(body);
    groupSections(root);
  };

  render();
  return root;
}

/** Name, level, the bar to the next one, and any reward still standing uncollected. */
function who(
  store: ProfileStore, render: () => void, root: HTMLElement, opts: ProfileOptions,
): HTMLElement {
  const profile = store.get();
  const progress = store.level();

  const box = el("div", "pf-hero");

  // THE FACE IS A CONTROL NOW, because there is something to choose.
  const face = el("button", "pf-face") as HTMLButtonElement;
  face.type = "button";
  face.onclick = opts.onAvatars;
  /*
   * THE AVATAR, AND NOT THE COLONY ANY MORE.
   *
   * This hero used to draw the colony the player fields most, which was the best picture
   * of them the app had. It is not any more: every colony has a face from its first
   * launch (`platform/avatars.ts`), and the top bar on the screen behind is already
   * wearing it — a hero showing something else would be two different pictures of the
   * same player, one screen apart. The colonies are still all over this page, as the
   * strip of heads on the collection row.
   */
  face.appendChild(avatarFace(store.face, 76, "pf-av"));
  face.title = store.avatar ? "Change your avatar" : "Choose an avatar";
  face.setAttribute("aria-label", face.title);
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
      const chip = levelRewardChip(level);
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
    return n + (r?.level ?? 0);
  }, 0);
  const researchMax = SPECIES_ORDER.length * RESEARCH_TOTAL_MAX;

  box.append(
    collRow("antarium", "Colonies", colonies, SPECIES_ORDER.length, opts.onColonies, faces(store)),
    collRow("anthill", "Nest chambers", chambers, chamberMax, opts.onChambers),
    collRow("flask", "Research levels", research, researchMax, opts.onColonies),
  );
  /*
   * TRAITS ARE COUNTED AGAINST THE SLOTS, not against how many exist.
   *
   * Every other row here is "x of everything there is", because chambers and research
   * have an end. Traits do not: they are found, there is no last one, and a bar creeping
   * toward a total nobody will ever reach says the collection is failing. What CAN be
   * finished is the fifty slots, so that is the number — and how many are in the bag
   * rides beside it as the thing there is more of.
   */
  box.appendChild(traitRow(store, opts.onTraits));
  /*
   * THE FACES ARE A DOOR LIKE THE REST, AND THEY ARE NEVER GATED.
   *
   * Every other row here opens at some point on the road; this one is open from the
   * first launch, because a new colony already has ten (`platform/avatars.ts`) and a
   * player should be able to choose a face before they have earned anything.
   */
  box.appendChild(avatarRow(store, opts.onAvatars));
  return box;
}

/** The collection's last door: ninety-eight faces, and the one being worn beside them. */
function avatarRow(store: ProfileStore, onOpen: () => void): HTMLElement {
  const { has, of } = avatarProgress(store.avatars);
  const row = collRow("star", "Avatars", has, of, onOpen,
    undefined, avatarFace(store.face, 22, "pf-av-mini"));
  row.id = "pfAvatars";
  return row;
}

/** The collection's fourth door: fifty slots, and a bag with no ceiling. */
function traitRow(store: ProfileStore, onOpen: () => void): HTMLElement {
  const benches: TraitScope[] = ["hill", ...SPECIES_ORDER];
  const filled = benches.reduce((n, b) => n + store.bench(b).filter(Boolean).length, 0);
  const slots = benches.length * TRAIT_SLOTS;
  const bag = store.bag.length;
  const row = collRow("star", "Traits equipped", filled, slots, onOpen);
  row.id = "pfTraits";
  const found = el("div", "pf-row-note", `${bag} found`);
  row.querySelector(".pf-row-mid")?.appendChild(found);
  return row;
}

function collRow(
  mark: string, label: string, have: number, max: number,
  onOpen: () => void, extra?: HTMLElement, lead?: HTMLElement,
): HTMLElement {
  const row = el("button", "pf-row pf-row-coll");
  // A row whose own collectable is a PICTURE leads with the picture rather than with a
  // mark standing for it — the same reason the road's avatar checkpoint wears its face.
  if (lead) {
    const slot = el("span", "pf-row-i");
    slot.appendChild(lead);
    row.appendChild(slot);
  } else row.append(iconSlot("pf-row-i", mark, 18));

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

/** The eight colonies as a row of heads, the locked ones dimmed. */
function faces(store: ProfileStore): HTMLElement {
  const strip = el("div", "pf-faces");
  for (const id of SPECIES_ORDER) {
    const cell = el("span", "pf-head" + (store.isUnlocked(id) ? "" : " off"));
    cell.title = SPECIES[id].name;
    cell.appendChild(antPortrait(id, 22, undefined, store.lookFor(id)));
    strip.appendChild(cell);
  }
  return strip;
}



function iconSlot(cls: string, name: string, size: number): HTMLElement {
  const box = el("span", cls);
  box.appendChild(icon(name, size));
  return box;
}
