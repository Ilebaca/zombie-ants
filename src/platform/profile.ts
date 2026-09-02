/**
 * The player's persistent colony record.
 *
 * This is the ONLY source of PlayerMods for the human side. The AI is always handed
 * NEUTRAL_MODS — it competes on decision quality, never on progression (CLAUDE.md §4.8),
 * so no code path here may ever feed the "ai" player.
 *
 * The engine does not import this module. Search runs on engine state alone, which is what
 * keeps simulation from writing stats or currencies (CLAUDE.md §5).
 */
import {
  CHAMBER_MAX, MAPS, NEUTRAL_MODS, RESEARCH_MAX, SPECIES, chamberCost, researchCost,
} from "../engine";
import { COLONY_START, grownColony } from "./colony";
import type { MapId, Player, PlayerMods, SpeciesId } from "../engine";
import { SPECIES_UNLOCK, type ResearchTrack } from "./catalogue";
import {
  QUEST_SWEEP_BONUS, dayIndex, isClaimable, levelProgress, levelReward, questDef, rollQuests,
  unclaimedLevels, type QuestKind, type QuestState,
} from "./quests";
import { newsLatestAt, unreadNews } from "./news";
import {
  ROAD_STOPS, chapterOf, freeReward, isPassKey, passReward, rewardFor, roadColony, stopReached,
} from "./road";
import {
  GRANARY_MAX, granaryFillsIn, granaryFull, granaryLevel, granaryNext, granaryRate,
  granaryStored,
} from "./granary";
import type { GranaryLevel } from "./granary";
import { FRIEND_MAX, seedRequests } from "./friends";
import { DUELS_MAX, seedInvites } from "./duels";
import { HISTORY_MAX, addToHistory } from "./history";
import type { MatchLog } from "./history";
import {
  HATCH_COST, TRAITS_CHAPTER, TRAIT_SLOTS, TRAIT_TIERS, combine, fitsScope, rollDrop,
  totalsOf, traitDef,
} from "./traits";
import type { TraitItem, TraitScope, TraitTier, TraitTotals } from "./traits";
import type { DuelInvite } from "./duels";
import type { Friend, Person } from "./friends";
import type { SupportGateway, Ticket, TicketKind } from "./support";
import type { Grant } from "./purchases";
import { defaultStore, readJson, writeJson, type KeyValueStore } from "./storage";

const KEY = "zombie-ants.profile";
const VERSION = 1;

/** Anthill chambers. Keys match PlayerMods so upgrades map straight through. */
export type ChamberId = keyof typeof CHAMBER_MAX;

/** Per-species research tracks: ability power, attack, defence. */
export interface Research {
  reservoir: number;
  mandible: number;
  cuticle: number;
}

export interface Equipped {
  look: string | null;
  effect: string | null;
}

/**
 * A career, in numbers. Everything here is counted from what a match actually DID — the
 * engine knows nothing about any of it, and opening a screen can never move one.
 */
export interface Stats {
  games: number;
  wins: number;
  /** Enemy and neutral ground taken, across every match. */
  conquered: number;
  abilities: number;
  tunnels: number;
  /** Current and best run of wins. */
  winStreak: number;
  bestStreak: number;
  /** Turns played, and wall time at the board — the two ways to say "how much". */
  turns: number;
  playedMs: number;
  /** The fastest win, in milliseconds. Zero until there is one. */
  bestMs: number;
  /** Hive queens taken, and enemy nests cracked. */
  queens: number;
  nests: number;
}

/** What a finished match reports about itself, beyond who won and how long it ran. */
export interface MatchFacts {
  /** Wall time at the board, in milliseconds. */
  playedMs?: number;
  /** Hive queens the player took during it. */
  queens?: number;
  /** Won by capturing the enemy nest, rather than by surrender or an objective. */
  byNest?: boolean;
}

export interface Profile {
  v: number;
  name: string;
  /**
   * THE COLONY: how many troops the player commands, across their whole career.
   *
   * It replaced a trophy rating. A rating is a number about the player; this is a number
   * about the colony, and a colony compounds (colony.ts) — which is what lets it run from
   * a few dozen to billions and makes "biggest colony" worth competing over.
   */
  colony: number;
  /** Soft currency (mycelium) and research currency (pheromone). */
  mycel: number;
  pheromone: number;
  /**
   * LARVA — the third currency, and the only one that is not spent on a screen it can be
   * seen from. It buys exactly one thing: a hatch. So it is shown in the lucky hatch and
   * nowhere else, rather than riding the top bar beside the two currencies a player spends
   * every day. A number in the chrome that the chrome offers nothing to spend on is a
   * question the interface never answers.
   */
  larva: number;
  stats: Stats;
  unlocked: SpeciesId[];
  research: Partial<Record<SpeciesId, Research>>;
  hill: Partial<Record<ChamberId, number>>;
  equip: Partial<Record<SpeciesId, Equipped>>;
  /** How often each colony has been fielded, for the "favourite species" readout. */
  fav: Partial<Record<SpeciesId, number>>;
  /** Colony Road: the reward keys already paid out, and whether the pass is owned. */
  roadClaimed: string[];
  pass: boolean;
  /** When the shop's daily gift was last taken. */
  freeAt: number;
  /**
   * THE GRANARY: which level is dug, and when the store was last emptied.
   *
   * `granaryAt` is a wall-clock stamp, which is the one kind of number the engine may
   * never hold (§4.1) — this is the meta layer, and it is the only thing the passive
   * rate needs to know. Zero means it has never been emptied, and a store that has been
   * filling since before the profile existed reads as full: a save from a build without
   * a granary is owed the one payout that costs, and after the first tap the stamp is
   * real for ever after.
   */
  granary: number;
  granaryAt: number;
  /**
   * The code a player quotes to support, and the id a friend request travels under.
   *
   * Filled in on first load rather than by `defaultProfile`, because it is the one field
   * that has to be UNIQUE: a default profile is a constant, and `normalise` has to stay a
   * pure function of what it is given (a test compares the two field by field). The store
   * mints one when it finds this empty, which is exactly once per save.
   */
  playerId: string;
  /** Friends, and requests either way. No server yet, so all three live here. */
  friends: Friend[];
  friendsIn: Person[];
  friendsOut: Person[];
  /**
   * Match invitations waiting to be answered.
   *
   * Here rather than in `duels.ts` for the same reason the friend requests are: this is
   * state, and `ProfileStore` is the only thing in the app that writes state. It also has
   * to survive a reload — a badge that forgets what it was counting is worse than none.
   */
  duelsIn: DuelInvite[];
  /**
   * The last few matches, newest first.
   *
   * The career counts what happened; this remembers WHICH matches. Kept here rather than
   * in its own store because it is save data like everything else, and `ProfileStore` is
   * the only thing in the app that writes.
   */
  history: MatchLog[];
  /**
   * TRAITS: everything found, and what is worn where.
   *
   * The bag is the inventory; `wearing` maps a bench — "hill" or a colony's id — to five
   * slots holding an item's UID or nothing. Slots hold uids rather than positions in the
   * bag, because the bag is sorted and filtered and added to: an index would re-point
   * every equipped slot at a different item the first time one was removed.
   *
   * `traitSeq` mints those uids. It only ever goes up, including past items that have
   * been thrown away, so a uid can never be handed out twice to two different traits.
   */
  bag: TraitItem[];
  wearing: Record<string, (string | null)[]>;
  traitSeq: number;
  /** The newest post the player has read, as a stamp. Older than every post = all unread. */
  newsSeen: number;
  /** Messages sent to support, kept so nothing a player wrote is thrown away. */
  tickets: Ticket[];
  /**
   * CHALLENGES BEATEN, by id.
   *
   * Nothing recorded one before, so a challenge paid its reward every time it was replayed
   * — forty mycelium a run off the easiest position in the game — and the list had no
   * reason to be opened twice. Keyed by id rather than index, so reordering the table
   * cannot silently re-award or re-lock one.
   */
  challenges: string[];
  /** The day the daily challenge was last beaten. It pays once a day, not once ever. */
  dailyDay: number;
  /**
   * Sound and haptics, both on by default.
   *
   * They were switches over nothing for months and were taken off Settings for exactly
   * that reason. There is something behind them now (platform/feedback.ts), so they are
   * back — and on, because a game that ships muted is a game most players never hear.
   */
  sound: boolean;
  /**
   * The beds, apart from the cues.
   *
   * Its own flag because they are two different irritations: a bed running for an hour is
   * what somebody turns off on a bus, and the cues are what they still want when they do.
   */
  music: boolean;
  haptics: boolean;
  /** Daily quests: today's three, the day they were rolled for, and the sweep streak. */
  quests: QuestState[];
  questDay: number;
  questStreak: number;
  /** Colony level: total XP earned, and which level rewards have been taken. */
  xp: number;
  claimedLevels: number[];
  /** Last setup choices, so the pickers open where the player left off. */
  lastSpecies: SpeciesId;
  lastMap: MapId;
  /** The difficulty the player last chose. Kept here so it survives a reload. */
  difficulty: "easy" | "normal" | "hard";
  lastShape: string;
  /**
   * Which guided tour this player has already been walked through.
   *
   * A number rather than a flag, and deliberately so: the build before this one recorded
   * "tutorial seen" for three coaching lines that no longer exist, and honouring that flag
   * would have hidden the real walkthrough from every player who had ever started a match.
   * A tour that changes gets a new version and is shown once more.
   */
  tourSeen: number;
}

/** The tour the current build ships. Bump it to show the walkthrough again. */
export const TOUR_VERSION = 1;

/**
 * Species available from the very first launch — the founding castes, the three the
 * catalogue prices at zero. The rest are unlocked in the Antarium.
 */
const STARTER_SPECIES: SpeciesId[] = ["leafcutter", "fire", "carpenter"];

export function defaultProfile(): Profile {
  return {
    v: VERSION,
    name: "Commander",
    colony: COLONY_START,
    // A new colony starts with nothing. The legacy build handed out 120 mycelium so the
    // Anthill had something to do on the first visit; earning the first chamber from a
    // match instead is what gives that visit a point.
    mycel: 0,
    pheromone: 0,
    larva: 0,
    stats: {
      games: 0, wins: 0, conquered: 0, abilities: 0, tunnels: 0,
      winStreak: 0, bestStreak: 0, turns: 0, playedMs: 0, bestMs: 0, queens: 0, nests: 0,
    },
    unlocked: [...STARTER_SPECIES],
    research: {},
    hill: {},
    equip: {},
    fav: {},
    roadClaimed: [],
    pass: false,
    freeAt: 0,
    granary: 1,
    granaryAt: 0,
    playerId: "",
    friends: [],
    // A new colony arrives to two requests. Nothing can ever arrive on its own without a
    // server, and accept/decline nobody can reach is a screen nobody can tell is finished.
    friendsIn: seedRequests(),
    // Empty here, and seeded by the store's constructor instead: an invitation carries the
    // time it arrived, and this function is a CONSTANT — it may not read a clock.
    duelsIn: [],
    history: [],
    bag: [],
    wearing: {},
    traitSeq: 0,
    friendsOut: [],
    newsSeen: 0,
    tickets: [],
    challenges: [],
    dailyDay: 0,
    sound: true,
    music: true,
    haptics: true,
    quests: [],
    questDay: 0,
    questStreak: 0,
    xp: 0,
    claimedLevels: [],
    // The colony the Antarium opens on before the player has fielded anything. The picker
    // itself always opens on the first colony by rarity (DEFAULT_SPECIES); this is the
    // "currently fielded" slot, and the legacy build starts it on Fire.
    lastSpecies: "fire",
    lastMap: "small",
    difficulty: "normal",
    lastShape: "wedge",
    tourSeen: 0,
  };
}

/**
 * Coerce whatever is on disk into a valid Profile.
 *
 * Saves outlive code. A field that was removed, renamed or corrupted must degrade to its
 * default rather than produce NaN levels that silently distort combat maths.
 */
/**
 * The colony a save carries, before the profile around it is built.
 *
 * Needed twice — for the field itself and for the road-claim migration — and both have to
 * agree, or a converted save would be handed a road that does not match its own size.
 */
function colonyOf(p: { colony?: unknown; trophies?: unknown }, fallback: number): number {
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(v, 1e15) : null;
  return Math.max(COLONY_START, Math.round(num(p.colony) ?? num(p.trophies) ?? fallback));
}

/**
 * WHAT A SAVE FROM THE TROPHY ROAD IS OWED.
 *
 * Claims used to be keyed by trophy amount ("f500"), and are keyed by rung index now, so
 * an old save's keys are numbers on a ladder that no longer exists — "f500" would read as
 * rung five hundred, which is past the end of the road.
 *
 * A save is treated as legacy the moment it holds a key past the last rung. Everything at
 * or below the colony it converts to is marked claimed: a player who was collecting as
 * they went has already been paid for that ground, and leaving it unclaimed would hand
 * them the whole lower road a second time.
 */
function roadClaims(raw: unknown, colony: number): string[] {
  if (!Array.isArray(raw)) return [];
  const keys = raw.filter((k): k is string => typeof k === "string");
  const legacy = keys.some((k) => Number(k.slice(1)) > ROAD_STOPS);
  if (!legacy) return [...new Set(keys.filter((k) => !!rewardFor(k)))];

  const out: string[] = [];
  for (let i = 1; i <= stopReached(colony); i++) {
    if (freeReward(i)) out.push(`f${i}`);
    if (passReward(i)) out.push(`p${i}`);
  }
  return out;
}

export function normalise(raw: unknown): Profile {
  const base = defaultProfile();
  // Junk falls through as an empty object rather than returning early, so EVERY profile
  // leaves this function with research, chambers and equipment fully populated. An early
  // return left those maps empty, and callers then had to guess whether a missing key meant
  // level 0 or a species that had never been seen.
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<Profile>;

  const int = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : fallback;
    return Math.max(min, Math.min(max, n));
  };
  const isSpecies = (v: unknown): v is SpeciesId => typeof v === "string" && v in SPECIES;

  const out: Profile = {
    ...base,
    name: typeof p.name === "string" && p.name.trim() ? p.name.slice(0, 18) : base.name,
    // Fallbacks are the DEFAULT profile's values, not zero: a brand-new save has no mycel
    // field at all, and falling back to 0 quietly cancelled the starting grant.
    // A save from before the rebrand carries a trophy count and no colony. It becomes the
    // colony's starting size rather than being thrown away — the player earned it, and the
    // two ladders start at roughly the same place (`roadClaims` handles the road).
    colony: colonyOf(p, base.colony),
    mycel: int(p.mycel, 0, 1e9, base.mycel),
    pheromone: int(p.pheromone, 0, 1e9, base.pheromone),
    larva: int(p.larva, 0, 1e9, base.larva),
    stats: {
      games: int(p.stats?.games, 0, 1e9, 0),
      wins: int(p.stats?.wins, 0, 1e9, 0),
      conquered: int(p.stats?.conquered, 0, 1e9, 0),
      abilities: int(p.stats?.abilities, 0, 1e9, 0),
      tunnels: int(p.stats?.tunnels, 0, 1e9, 0),
      winStreak: int(p.stats?.winStreak, 0, 1e9, 0),
      bestStreak: int(p.stats?.bestStreak, 0, 1e9, 0),
      turns: int(p.stats?.turns, 0, 1e9, 0),
      // Milliseconds, so the ceiling is generous: a thousand hours of play is 3.6e9.
      playedMs: int(p.stats?.playedMs, 0, 1e12, 0),
      bestMs: int(p.stats?.bestMs, 0, 1e12, 0),
      queens: int(p.stats?.queens, 0, 1e9, 0),
      nests: int(p.stats?.nests, 0, 1e9, 0),
    },
    unlocked: Array.isArray(p.unlocked) ? p.unlocked.filter(isSpecies) : [...STARTER_SPECIES],
    research: {},
    hill: {},
    equip: {},
    fav: {},
    // Unknown keys are dropped rather than kept: a claim key that no longer pays anything
    // would sit on the road forever showing "claimed" against an empty cell.
    roadClaimed: roadClaims(p.roadClaimed, colonyOf(p, base.colony)),
    pass: p.pass === true,
    freeAt: int(p.freeAt, 0, 1e15, 0),
    // There is no level zero: every colony forages. A save with nothing here is a save
    // from before the granary, and it starts on the first level like everyone else.
    granary: int(p.granary, 1, GRANARY_MAX, 1),
    granaryAt: int(p.granaryAt, 0, 1e15, 0),
    playerId: typeof p.playerId === "string" && ID_SHAPE.test(p.playerId) ? p.playerId : "",
    // Every list is rebuilt entry by entry rather than trusted: these are the only arrays
    // on the profile whose contents reach a screen as text and as a species lookup, and a
    // malformed one would put `undefined` on the page or a colour lookup off the end.
    friends: people(p.friends, base.friends).slice(0, FRIEND_MAX)
      .map((f, i) => ({ ...f, since: int((p.friends as Friend[])?.[i]?.since, 0, 1e15, 0) })),
    friendsIn: people(p.friendsIn, base.friendsIn),
    friendsOut: people(p.friendsOut, base.friendsOut),
    duelsIn: invites(p.duelsIn),
    history: matchLogs(p.history),
    ...bagAndBenches(p),
    newsSeen: int(p.newsSeen, 0, 1e15, 0),
    tickets: tickets(p.tickets),
    challenges: Array.isArray(p.challenges)
      ? p.challenges.filter((c): c is string => typeof c === "string").slice(0, 200)
      : [],
    dailyDay: int(p.dailyDay, 0, 1e9, 0),
    // `!== false`, not `=== true`: a save from before these existed has neither field, and
    // reading a missing flag as "off" would silently mute the game for every returning
    // player (the same trap the mycelium fallback fell into — see the note above).
    sound: p.sound !== false,
    // `!== false`, never `=== true`: a save from a build before this flag existed has no
    // field at all, and reading that as "off" would silently mute the game for every
    // returning player.
    music: p.music !== false,
    haptics: p.haptics !== false,
    // A quest id that no longer exists in the pool is dropped rather than kept at zero
    // progress, where it would be permanently unclaimable and block the daily sweep.
    quests: Array.isArray(p.quests)
      ? p.quests
          .filter((q): q is QuestState => !!q && typeof q === "object" && !!questDef((q as QuestState).id))
          .map((q) => ({
            id: q.id,
            progress: int(q.progress, 0, 1e6, 0),
            claimed: q.claimed === true,
          }))
      : [],
    questDay: int(p.questDay, 0, 1e9, 0),
    questStreak: int(p.questStreak, 0, 1e9, 0),
    xp: int(p.xp, 0, 1e9, 0),
    claimedLevels: Array.isArray(p.claimedLevels)
      ? [...new Set(p.claimedLevels.filter((l): l is number => typeof l === "number" && Number.isFinite(l) && l > 0)
          .map((l) => Math.floor(l)))]
      : [],
    lastSpecies: isSpecies(p.lastSpecies) ? p.lastSpecies : base.lastSpecies,
    lastMap: p.lastMap === "tiny" || p.lastMap === "small" || p.lastMap === "mid" ? p.lastMap : base.lastMap,
    difficulty: p.difficulty === "easy" || p.difficulty === "normal" || p.difficulty === "hard"
      ? p.difficulty : base.difficulty,
    lastShape: typeof p.lastShape === "string" ? p.lastShape : base.lastShape,
    // An old save's `tutorialDone` is deliberately NOT read: see `tourSeen`.
    tourSeen: typeof p.tourSeen === "number" && p.tourSeen > 0 ? Math.floor(p.tourSeen) : 0,
  };

  // A save with every species stripped would leave nothing to field.
  if (!out.unlocked.length) out.unlocked = [...STARTER_SPECIES];
  if (!out.unlocked.includes(out.lastSpecies)) out.lastSpecies = out.unlocked[0] as SpeciesId;

  for (const id of Object.keys(SPECIES) as SpeciesId[]) {
    const r = p.research?.[id];
    out.research[id] = {
      reservoir: int(r?.reservoir, 0, RESEARCH_MAX, 0),
      mandible: int(r?.mandible, 0, RESEARCH_MAX, 0),
      cuticle: int(r?.cuticle, 0, RESEARCH_MAX, 0),
    };
    const e = p.equip?.[id];
    out.equip[id] = {
      look: typeof e?.look === "string" ? e.look : null,
      effect: typeof e?.effect === "string" ? e.effect : null,
    };
  }

  for (const id of Object.keys(SPECIES) as SpeciesId[]) {
    const n = p.fav?.[id];
    if (typeof n === "number" && Number.isFinite(n) && n > 0) out.fav[id] = Math.floor(n);
  }

  for (const key of Object.keys(CHAMBER_MAX) as ChamberId[]) {
    out.hill[key] = int(p.hill?.[key], 0, CHAMBER_MAX[key], 0);
  }
  return out;
}

/** What a minted player code looks like, and what `normalise` will accept back. */
const ID_SHAPE = /^ZA-[0-9A-Z]{4}-[0-9A-Z]{4}$/;
const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * A support code: ZA-7F3K-2QX9.
 *
 * Ambiguous characters are left out (no O/0, no I/1), because the whole point of this
 * string is that somebody reads it off a screen and types it into an email.
 */
function mintPlayerId(rand: () => number = Math.random): string {
  const block = (): string => Array.from({ length: 4 }, () =>
    ID_CHARS[Math.floor(rand() * ID_CHARS.length)] ?? "Z").join("");
  return `ZA-${block()}-${block()}`;
}

/** A stored list of colonies, rebuilt entry by entry. Anything malformed is dropped. */
function people<T extends Person>(raw: unknown, fallback: T[]): T[] {
  if (!Array.isArray(raw)) return fallback;
  return raw.filter((p): p is T => !!p && typeof p === "object"
    && typeof (p as Person).id === "string"
    && typeof (p as Person).name === "string"
    && typeof (p as Person).colony === "number" && Number.isFinite((p as Person).colony)
    && typeof (p as Person).species === "string" && (p as Person).species in SPECIES)
    .map((p) => ({ ...p, name: p.name.slice(0, 18), colony: Math.max(0, Math.round(p.colony)) }));
}

/**
 * Match invitations. Rebuilt entry by entry like the friend lists, and for the same reason:
 * every field here reaches a screen as text, as a map lookup or as a colour lookup, and a
 * malformed one would put `undefined` on the page or index off the end of a table.
 */
function invites(raw: unknown): DuelInvite[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is DuelInvite => !!d && typeof d === "object"
    && typeof (d as DuelInvite).id === "string"
    && typeof (d as DuelInvite).map === "string" && (d as DuelInvite).map in MAPS
    && !!(d as DuelInvite).from && typeof (d as DuelInvite).from === "object"
    && typeof (d as DuelInvite).from.name === "string"
    && typeof (d as DuelInvite).from.species === "string" && (d as DuelInvite).from.species in SPECIES)
    .slice(0, DUELS_MAX)
    .map((d) => ({
      ...d,
      at: Math.max(0, Math.round(Number(d.at) || 0)),
      from: {
        ...d.from,
        id: typeof d.from.id === "string" ? d.from.id : "",
        name: d.from.name.slice(0, 18),
        colony: Math.max(0, Math.round(Number(d.from.colony) || 0)),
      },
    }));
}

/** How many found traits a save may hold. Generous, and a ceiling all the same. */
export const BAG_MAX = 300;

/** Every bench there is: the anthill's, and one per colony. */
const BENCHES: readonly string[] = ["hill", ...(Object.keys(SPECIES) as SpeciesId[])];

/**
 * THE BAG AND THE BENCHES, rebuilt together because they refer to each other.
 *
 * Two rules, and both are about a save outliving the code that wrote it:
 *
 *  - an item whose trait id is no longer in the table is DROPPED. A trait that has been
 *    renamed or removed would otherwise sit in the bag as a nameless row that cannot be
 *    equipped, unequipped or explained;
 *  - a slot pointing at a uid that is not in the bag is EMPTIED. That is what makes the
 *    two halves consistent no matter what happened to the save in between, and it is the
 *    only reason the screens can assume a filled slot always resolves to an item.
 *
 * `traitSeq` is floored at one past the highest uid actually held, so a save whose
 * counter was lost cannot mint a uid that is already in use — two items with one uid is
 * one item the player can never take off.
 */
function bagAndBenches(p: Partial<Profile>): Pick<Profile, "bag" | "wearing" | "traitSeq"> {
  const raw = Array.isArray(p.bag) ? p.bag : [];
  const seen = new Set<string>();
  const bag: TraitItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const uid = typeof item.uid === "string" ? item.uid : "";
    const def = typeof item.def === "string" ? item.def : "";
    if (!uid || seen.has(uid) || !traitDef(def)) continue;
    if (!TRAIT_TIERS.includes(item.tier as TraitTier)) continue;
    seen.add(uid);
    bag.push({ uid, def, tier: item.tier as TraitTier });
    if (bag.length >= BAG_MAX) break;
  }

  const wearing: Record<string, (string | null)[]> = {};
  const held = new Set(bag.map((i) => i.uid));
  const source = p.wearing && typeof p.wearing === "object" ? p.wearing : {};
  for (const scope of BENCHES) {
    const slots = Array.isArray(source[scope]) ? source[scope] : [];
    const used = new Set<string>();
    wearing[scope] = Array.from({ length: TRAIT_SLOTS }, (_, i) => {
      const uid = slots[i];
      // One item cannot be in two slots. A save that says otherwise would show the same
      // trait twice and count it twice.
      if (typeof uid !== "string" || !held.has(uid) || used.has(uid)) return null;
      const item = bag.find((b) => b.uid === uid);
      if (!item || !fitsScope(item, scope as TraitScope)) return null;
      used.add(uid);
      return uid;
    });
  }

  let highest = 0;
  for (const item of bag) {
    const n = Number(item.uid.slice(1));
    if (Number.isFinite(n)) highest = Math.max(highest, n);
  }
  const seq = Math.round(Number(p.traitSeq));
  return {
    bag,
    wearing,
    traitSeq: Math.max(Number.isFinite(seq) ? seq : 0, highest + 1),
  };
}

/**
 * Past matches. Rebuilt entry by entry like every other list on the profile.
 *
 * A malformed RECORD is dropped while the entry is KEPT: the facts are what the list
 * reads, and losing the whole row because its move list went bad would delete a match the
 * player remembers playing. A replay that cannot be replayed simply is not offered.
 */
function matchLogs(raw: unknown): MatchLog[] {
  if (!Array.isArray(raw)) return [];
  // `normalise`'s own clamp is local to it; this list is rebuilt out here, so it carries
  // its own. Same rule either way: a number off a save is a suggestion, not a fact.
  const num = (v: unknown, max: number): number => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
  };
  return raw.filter((m): m is MatchLog => !!m && typeof m === "object"
    && typeof (m as MatchLog).id === "string"
    && typeof (m as MatchLog).map === "string" && (m as MatchLog).map in MAPS
    && typeof (m as MatchLog).you === "string" && (m as MatchLog).you in SPECIES
    && typeof (m as MatchLog).foe === "string" && (m as MatchLog).foe in SPECIES)
    .slice(0, HISTORY_MAX)
    .map(({ record, ...m }) => ({
      // The record is taken OFF and only put back when it is readable. Spreading it and
      // adding a good one back on top cannot remove a bad one — which left a `record`
      // that was a bare string on the entry, and `canReplay` then read `.moves` off it.
      ...m,
      at: num(m.at, 1e15),
      foeName: typeof m.foeName === "string" ? m.foeName.slice(0, 18) : "",
      human: m.human === true,
      winner: m.winner === "you" || m.winner === "ai" ? m.winner : null,
      reason: typeof m.reason === "string" ? m.reason : null,
      turns: num(m.turns, 1e6),
      playedMs: num(m.playedMs, 1e12),
      colonyBefore: num(m.colonyBefore, 1e15),
      colonyAfter: num(m.colonyAfter, 1e15),
      ...(Array.isArray(record?.moves) && record?.setup ? { record } : {}),
    }));
}

/** Sent messages. Kept so nothing a player wrote is thrown away by a bad save. */
function tickets(raw: unknown): Ticket[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is Ticket => !!t && typeof t === "object"
    && typeof (t as Ticket).id === "string" && typeof (t as Ticket).text === "string")
    .slice(-30);
}

/** Everything the granary room and the home pill need, from one call. */
export interface GranaryState {
  level: number;
  def: GranaryLevel;
  /** The level above, or null at the top. */
  next: GranaryLevel | null;
  /** Troops an hour at the colony's current size. A fraction, early on. */
  rate: number;
  stored: number;
  full: number;
  /** Milliseconds until the store stops filling. Zero once it has. */
  fillsIn: number;
  /** The chapter the colony is standing in, which is what opens the next level. */
  chapter: number;
}

/**
 * How long the store has been filling.
 *
 * Two readings have to be handled or the number on screen is nonsense. A stamp of ZERO is
 * a save that has never emptied it — a fresh profile, or one from a build with no granary
 * — and it reads as full, which costs one payout and is then correct for ever. A stamp in
 * the FUTURE is a device clock that has moved backwards, and it reads as empty rather than
 * as a negative store; the next collect stamps it back into the present.
 */
function granaryElapsed(since: number, now: number): number {
  if (since <= 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, now - since);
}

/* ---------------------------------------------------------------- ACCESS */

export class ProfileStore {
  private profile: Profile;

  constructor(private store: KeyValueStore = defaultStore()) {
    this.profile = normalise(readJson<Profile>(store, KEY));
    // Minted here rather than in `defaultProfile`, which is a constant, or in `normalise`,
    // which has to stay a pure function of its input. Exactly once per save.
    if (!this.profile.playerId) {
      // A NEW COLONY ARRIVES TO ONE CHALLENGE, minted in the same breath as the player
      // code and for the same reason: it needs the clock, and neither `defaultProfile`
      // (a constant) nor `normalise` (a pure function of its input) may read one. Once
      // per save, so accepting it does not summon another.
      //
      // It is here at all because nothing can turn up on its own without a server, and an
      // Accept button nobody can reach is a feature nobody can tell is finished.
      this.update((p) => {
        p.playerId = mintPlayerId();
        p.duelsIn = seedInvites(Date.now());
      });
    }
  }

  get(): Readonly<Profile> { return this.profile; }

  /** Apply a change and persist. The callback receives a mutable draft. */
  update(fn: (p: Profile) => void): Readonly<Profile> {
    fn(this.profile);
    this.profile = normalise(this.profile);
    writeJson(this.store, KEY, this.profile);
    return this.profile;
  }

  reset(): Readonly<Profile> {
    this.profile = defaultProfile();
    writeJson(this.store, KEY, this.profile);
    return this.profile;
  }

  /**
   * Take a save read off a backup code (platform/backup.ts) as THE save.
   *
   * It replaces rather than merges, because a backup is a whole colony at a moment and
   * half of one merged into another is a save nobody has ever had. `normalise` runs again
   * here even though `importProfile` already ran it: this is the door every write goes
   * through, and a second pass over an already-normal profile costs nothing.
   */
  restore(profile: Profile): Readonly<Profile> {
    this.profile = normalise(profile);
    writeJson(this.store, KEY, this.profile);
    return this.profile;
  }

  /* ------------------------------------------------------------------ TRAITS */

  /**
   * Are traits open yet? Chapter 10, which is the same gate the lucky hatch opens on.
   *
   * Late on purpose. A trait is a CHOICE between things you have found, and a player who
   * is handed one in their first hour has no collection to choose from and no idea what
   * +2% defence is worth — it would land as one more number on a screen they are still
   * learning. By chapter 10 they have a colony, a favourite species and opinions.
   */
  traitsOpen(): boolean { return chapterOf(this.profile.colony) >= TRAITS_CHAPTER; }

  get bag(): readonly TraitItem[] { return this.profile.bag; }

  /** The five slots of one bench, as items and gaps. */
  bench(scope: TraitScope): (TraitItem | null)[] {
    const slots = this.profile.wearing[scope] ?? [];
    return Array.from({ length: TRAIT_SLOTS }, (_, i) => {
      const uid = slots[i];
      return (uid ? this.profile.bag.find((b) => b.uid === uid) : null) ?? null;
    });
  }

  /** What a bench is worth right now. */
  benchTotals(scope: TraitScope): TraitTotals { return wornTotals(this.profile, scope); }

  /** Everything in the bag that could go in this bench and is not already worn. */
  spare(scope: TraitScope): TraitItem[] {
    const worn = new Set((this.profile.wearing[scope] ?? []).filter(Boolean));
    return this.profile.bag.filter((i) => fitsScope(i, scope) && !worn.has(i.uid));
  }

  /**
   * Put an item in a bench.
   *
   * Returns false rather than throwing when it cannot — an item that does not fit the
   * bench, a bench with no room, an item already worn there — so a screen can tap
   * optimistically and nothing ever goes half-applied, the same contract every other
   * spend on this store has.
   *
   * An item worn in ANOTHER bench is impossible by construction: a species trait fits
   * exactly one colony's bench and a universal one fits only the anthill.
   */
  equipTrait(scope: TraitScope, uid: string, slot?: number): boolean {
    const item = this.profile.bag.find((b) => b.uid === uid);
    if (!item || !fitsScope(item, scope)) return false;
    const slots = [...(this.profile.wearing[scope] ?? [])];
    if (slots.includes(uid)) return false;
    const at = slot ?? slots.findIndex((s) => !s);
    if (at < 0 || at >= TRAIT_SLOTS) return false;
    this.update((p) => {
      const bench = [...(p.wearing[scope] ?? [])];
      while (bench.length < TRAIT_SLOTS) bench.push(null);
      bench[at] = uid;
      p.wearing[scope] = bench;
    });
    return true;
  }

  /** Take a slot's item off. It goes back to the bag, which never let go of it. */
  unequipTrait(scope: TraitScope, slot: number): boolean {
    const slots = this.profile.wearing[scope] ?? [];
    if (slot < 0 || slot >= TRAIT_SLOTS || !slots[slot]) return false;
    this.update((p) => {
      const bench = [...(p.wearing[scope] ?? [])];
      bench[slot] = null;
      p.wearing[scope] = bench;
    });
    return true;
  }

  /**
   * A trait is found.
   *
   * Minted here rather than by the finder, because the uid has to come from the save's
   * own counter — two callers each numbering from their own idea of "next" is two items
   * with one uid, which is one item the player can never take off.
   *
   * A full bag REFUSES rather than silently dropping the oldest: a collection that
   * quietly deletes what you collected is worse than one that tells you it is full.
   */
  findTrait(def: string, tier: TraitTier): TraitItem | null {
    if (!traitDef(def) || !TRAIT_TIERS.includes(tier)) return null;
    if (this.profile.bag.length >= BAG_MAX) return null;
    const uid = `t${this.profile.traitSeq}`;
    const item: TraitItem = { uid, def, tier };
    this.update((p) => {
      p.traitSeq++;
      p.bag = [item, ...p.bag];
    });
    return item;
  }

  /**
   * Throw one away.
   *
   * Asked for twice by the screen, like every other destructive thing in this app: a
   * mythic thrown away by a misplaced thumb cannot be found again.
   */
  dropTrait(uid: string): boolean {
    if (!this.profile.bag.some((b) => b.uid === uid)) return false;
    this.update((p) => {
      // Only the bag. `normalise` runs on every write and empties any slot pointing at
      // something the bag no longer holds, so clearing the benches here as well was a
      // second copy of that rule — and a rule written twice is a rule that can disagree
      // with itself (CLAUDE.md §7: one function owns a rule).
      p.bag = p.bag.filter((b) => b.uid !== uid);
    });
    return true;
  }

  /**
   * Modifiers for a match. `you` is derived from the profile; `ai` is ALWAYS neutral —
   * the AI gets no anthill and no research (CLAUDE.md §4.8).
   */
  modsFor(species: SpeciesId): Record<Player, PlayerMods> {
    return { you: modsFrom(this.profile, species), ai: neutralMods() };
  }

  isUnlocked(id: SpeciesId): boolean { return this.profile.unlocked.includes(id); }

  /** Ground taken during a match, folded in once rather than a write per capture. */
  recordCaptures(n: number): void {
    if (n > 0) this.update((p) => { p.stats.conquered += n; });
  }

  /**
   * Record a finished match: the colony (which compounds — colony.ts), mycelium, the
   * favourite-species tally, the win streak, and XP toward the colony level.
   *
   * XP is a base for playing, a bonus for winning and a little for a longer game — the
   * legacy formula, so both builds level at the same rate.
   */
  recordResult(won: boolean, species: SpeciesId, turns = 0, match: MatchFacts = {}): Readonly<Profile> {
    return this.update((p) => {
      p.stats.games++;
      p.stats.turns += Math.max(0, Math.round(turns));
      p.stats.playedMs += Math.max(0, Math.round(match.playedMs ?? 0));
      p.stats.queens += Math.max(0, Math.round(match.queens ?? 0));
      if (won) {
        p.stats.wins++;
        p.stats.winStreak++;
        p.stats.bestStreak = Math.max(p.stats.bestStreak, p.stats.winStreak);
        if (match.byNest) p.stats.nests++;
        // The fastest win only counts a win that was actually timed: a zero would win
        // every comparison for ever, and a match with no clock is not a record.
        const ms = Math.round(match.playedMs ?? 0);
        if (ms > 0 && (p.stats.bestMs === 0 || ms < p.stats.bestMs)) p.stats.bestMs = ms;
      } else {
        p.stats.winStreak = 0;
      }
      p.colony = grownColony(p.colony, won);
      p.mycel += won ? MATCH_MYCEL.win : MATCH_MYCEL.loss;
      p.fav[species] = (p.fav[species] ?? 0) + 1;
      p.xp += matchXp(won, turns);
      p.lastSpecies = species;
    });
  }

  /* -------------------------------------------------------------- HISTORY */

  get history(): readonly MatchLog[] { return this.profile.history; }

  /** Remember a match. Newest first, capped, and de-duplicated by id. */
  rememberMatch(log: MatchLog): void {
    this.update((p) => { p.history = addToHistory(p.history, log); });
  }

  /* ---------------------------------------------------------------- DUELS */

  /** Invitations waiting to be answered — what the badge on the home screen counts. */
  get duels(): readonly DuelInvite[] { return this.profile.duelsIn; }

  /**
   * Take an invitation off the list, and say whether it was there.
   *
   * The BOOLEAN is the point, exactly as it is for a challenge reward: accepting is what
   * starts a match, and an invitation that could be accepted twice would start two. The
   * caller acts only on a true.
   */
  answerDuel(id: string): DuelInvite | null {
    const found = this.profile.duelsIn.find((d) => d.id === id) ?? null;
    if (!found) return null;
    this.update((p) => { p.duelsIn = p.duelsIn.filter((d) => d.id !== id); });
    return found;
  }

  /**
   * Put one on the list. Only a server will really call this; the local build uses it to
   * put the first invitation there, so the receiving half of the feature is reachable.
   */
  addDuel(invite: DuelInvite): boolean {
    if (this.profile.duelsIn.some((d) => d.id === invite.id)) return false;
    this.update((p) => { p.duelsIn = [invite, ...p.duelsIn].slice(0, DUELS_MAX); });
    return true;
  }

  /* ----------------------------------------------------------- CHALLENGES */

  challengeBeaten(id: string): boolean { return this.profile.challenges.includes(id); }

  /**
   * Mark a challenge beaten. Returns false when it already was, which is what stops the
   * reward paying twice — the caller pays only on a true.
   */
  beatChallenge(id: string): boolean {
    if (this.challengeBeaten(id)) return false;
    this.update((p) => { p.challenges = [...p.challenges, id]; });
    return true;
  }

  /** The daily pays once a DAY rather than once ever, so it is stamped, not listed. */
  dailyBeaten(day: number): boolean { return this.profile.dailyDay === day; }

  beatDaily(day: number): boolean {
    if (this.dailyBeaten(day)) return false;
    this.update((p) => { p.dailyDay = day; });
    return true;
  }

  /* -------------------------------------------------------------- FRIENDS */

  /**
   * Ask to be somebody's friend.
   *
   * Refused for yourself, for somebody already on the list, for a request already sent, and
   * once the list is full — each returns false rather than throwing, so a screen can tap
   * optimistically and re-render on the answer (the rule every purchase follows).
   *
   * A request that has already been sent TO you is accepted instead of sent back: two
   * people tapping Add on each other should end up friends, not with a request each.
   */
  sendFriendRequest(person: Person): boolean {
    const p = this.profile;
    if (person.id === p.playerId) return false;
    if (p.friends.some((f) => f.id === person.id)) return false;
    if (p.friends.length >= FRIEND_MAX) return false;
    if (p.friendsIn.some((f) => f.id === person.id)) return this.acceptFriend(person.id);
    if (p.friendsOut.some((f) => f.id === person.id)) return false;
    this.update((d) => { d.friendsOut = [...d.friendsOut, person]; });
    return true;
  }

  /** Take back a request. The person is never told, because there is nobody to tell. */
  cancelFriendRequest(id: string): boolean {
    if (!this.profile.friendsOut.some((f) => f.id === id)) return false;
    this.update((d) => { d.friendsOut = d.friendsOut.filter((f) => f.id !== id); });
    return true;
  }

  /** Take somebody up on their request. `since` is when the friendship started. */
  acceptFriend(id: string, now: number = Date.now()): boolean {
    const person = this.profile.friendsIn.find((f) => f.id === id);
    if (!person) return false;
    if (this.profile.friends.length >= FRIEND_MAX) return false;
    this.update((d) => {
      d.friendsIn = d.friendsIn.filter((f) => f.id !== id);
      d.friendsOut = d.friendsOut.filter((f) => f.id !== id);
      d.friends = [...d.friends, { ...person, since: now }];
    });
    return true;
  }

  /** Turn a request down. It does not come back — there is nothing to send it again. */
  declineFriend(id: string): boolean {
    if (!this.profile.friendsIn.some((f) => f.id === id)) return false;
    this.update((d) => { d.friendsIn = d.friendsIn.filter((f) => f.id !== id); });
    return true;
  }

  removeFriend(id: string): boolean {
    if (!this.profile.friends.some((f) => f.id === id)) return false;
    this.update((d) => { d.friends = d.friends.filter((f) => f.id !== id); });
    return true;
  }

  /** Where this person stands with you, which is what the button on their row says. */
  friendship(id: string): "none" | "friend" | "sent" | "asked" | "you" {
    const p = this.profile;
    if (id === p.playerId) return "you";
    if (p.friends.some((f) => f.id === id)) return "friend";
    if (p.friendsOut.some((f) => f.id === id)) return "sent";
    if (p.friendsIn.some((f) => f.id === id)) return "asked";
    return "none";
  }

  /* ----------------------------------------------------------- NEWS & SUPPORT */

  /** Posts landed since the player last opened the feed. */
  unread(): number { return unreadNews(this.profile.newsSeen); }

  /** Mark the feed read up to its newest post. */
  markNewsRead(): void {
    const at = newsLatestAt();
    if (this.profile.newsSeen < at) this.update((p) => { p.newsSeen = at; });
  }

  /**
   * Keep a message to support.
   *
   * Kept rather than posted, because there is no server — the screen opens a mail link
   * from the same ticket. Storing it is what makes the Send button honest: the text is
   * still there afterwards whether or not the mail app opened.
   */
  fileTicket(kind: TicketKind, text: string, gateway: SupportGateway): Ticket | null {
    const body = text.trim();
    if (!body) return null;
    const ticket = gateway.send(kind, body, this.profile.playerId);
    this.update((p) => { p.tickets = [...p.tickets, ticket].slice(-30); });
    return ticket;
  }

  /* -------------------------------------------------------------- GRANARY */

  /**
   * What the granary is holding right now.
   *
   * `now` is a parameter rather than a call to the clock inside, so a test can walk time
   * forward without touching the machine's — the same reason the match clock is the
   * screen's and not the engine's.
   */
  granary(now: number = Date.now()): GranaryState {
    const p = this.profile;
    const level = p.granary;
    const elapsed = granaryElapsed(p.granaryAt, now);
    return {
      level,
      def: granaryLevel(level),
      next: granaryNext(level),
      rate: granaryRate(p.colony, level),
      stored: granaryStored(p.colony, level, elapsed),
      full: granaryFull(p.colony, level),
      fillsIn: granaryFillsIn(elapsed, level),
      // What the NEXT level needs, so one call answers everything the room has to show.
      chapter: chapterOf(p.colony),
    };
  }

  /**
   * Empty the store into the colony. Returns what was carried in, 0 if there was nothing.
   *
   * A store holding less than a whole troop is deliberately NOT stamped: rounding down to
   * zero and then restarting the clock would throw away every partial hour, so an early
   * colony producing a third of a troop an hour would never bank anything at all.
   */
  collectGranary(now: number = Date.now()): number {
    const got = this.granary(now).stored;
    if (got < 1) return 0;
    this.update((p) => {
      p.colony += got;
      p.granaryAt = now;
    });
    return got;
  }

  /**
   * Dig the granary one level deeper. Refused if it is at the top, if the road has not
   * reached the chapter that opens the level, or if the mycelium is not there.
   *
   * The store is emptied FIRST, at the old rate. Levelling up with troops still in it
   * would pay for hours already foraged at a rate that was not running then.
   */
  buyGranary(now: number = Date.now()): boolean {
    const next = granaryNext(this.profile.granary);
    if (!next) return false;
    if (chapterOf(this.profile.colony) < next.chapter) return false;
    if (this.profile.mycel < next.cost) return false;
    this.collectGranary(now);
    this.update((p) => {
      p.mycel -= next.cost;
      p.granary = Math.min(GRANARY_MAX, p.granary + 1);
      p.granaryAt = now;
    });
    return true;
  }

  /* ------------------------------------------------------------- SPENDING */

  /**
   * Every purchase in the game goes through one of the four methods below, and each returns
   * false rather than throwing when the player cannot afford it. The screens are therefore
   * free to call optimistically and re-render on the result — nothing can go half-spent.
   */

  /** Buy the next level of a chamber. Returns false if capped or unaffordable. */
  buyChamber(id: ChamberId): boolean {
    const level = this.profile.hill[id] ?? 0;
    if (level >= CHAMBER_MAX[id]) return false;
    const cost = chamberCost(level);
    if (this.profile.mycel < cost) return false;
    this.update((p) => {
      p.mycel -= cost;
      p.hill[id] = (p.hill[id] ?? 0) + 1;
    });
    return true;
  }

  /**
   * Level up one research track of one species. Paid in mycelium, as the legacy build
   * charges for it — mycelium is the one currency the whole colony screen spends.
   */
  buyResearch(species: SpeciesId, track: ResearchTrack): boolean {
    const level = this.profile.research[species]?.[track] ?? 0;
    if (level >= RESEARCH_MAX) return false;
    const cost = researchCost(level);
    if (this.profile.mycel < cost) return false;
    this.update((p) => {
      p.mycel -= cost;
      const r = p.research[species] ?? { reservoir: 0, mandible: 0, cuticle: 0 };
      r[track] = (r[track] ?? 0) + 1;
      p.research[species] = r;
    });
    return true;
  }

  /**
   * Unlock a species with mycelium. Premium species are NOT sold here — they come from the
   * shop (roadmap step 5), so no amount of soft currency can quietly bypass the purchase.
   */
  canUnlock(id: SpeciesId): boolean {
    return !this.isUnlocked(id) && !SPECIES[id].premium && SPECIES_UNLOCK[id] > 0;
  }

  unlockSpecies(id: SpeciesId): boolean {
    if (!this.canUnlock(id)) return false;
    const cost = SPECIES_UNLOCK[id];
    if (this.profile.mycel < cost) return false;
    this.update((p) => {
      p.mycel -= cost;
      p.unlocked.push(id);
    });
    return true;
  }

  /** Grant a species outright — the hook a shop purchase or a reward calls. */
  grantSpecies(id: SpeciesId): void {
    if (this.isUnlocked(id)) return;
    this.update((p) => { p.unlocked.push(id); });
  }

  /* --------------------------------------------------------- TROPHY ROAD */

  /** True when this reward is earned, unclaimed, and (for pass rewards) actually owned. */
  canClaimRoad(key: string): boolean {
    if (this.profile.roadClaimed.includes(key)) return false;
    if (!rewardFor(key)) return false;
    if (isPassKey(key) && !this.profile.pass) return false;
    return this.profile.colony >= roadColony(key);
  }

  /**
   * Pay out one Colony Road reward. Claims are keyed and recorded, so troops lost to a
   * later defeat never claw back a reward the player already banked.
   */
  claimRoad(key: string): boolean {
    if (!this.canClaimRoad(key)) return false;
    const reward = rewardFor(key);
    if (!reward) return false;
    this.update((p) => {
      p.mycel += reward.mycel ?? 0;
      p.pheromone += reward.pheromone ?? 0;
      p.roadClaimed.push(key);
    });
    return true;
  }

  /** The Colony Pass. Bought in the shop, or granted by a bundle. */
  grantPass(): void {
    if (this.profile.pass) return;
    this.update((p) => { p.pass = true; });
  }

  /**
   * Apply everything a purchase handed over.
   *
   * One method so a bundle lands as a single write — a player who closes the app mid-grant
   * never ends up with the mycelium but not the pass.
   */
  applyGrant(grant: Grant): void {
    this.update((p) => {
      p.mycel += grant.mycel ?? 0;
      p.pheromone += grant.pheromone ?? 0;
      p.larva += grant.larva ?? 0;
      if (grant.pass) p.pass = true;
      if (grant.species && !p.unlocked.includes(grant.species)) p.unlocked.push(grant.species);
    });
  }

  /**
   * SPEND ONE LARVA AND HATCH WHAT IT HELD.
   *
   * One method rather than "take a larva" and "add a trait" called in order, because those
   * two must never come apart: a hatch that spent and then failed to roll takes something
   * for nothing, and one that rolled and then failed to spend is free traits for ever. It
   * returns the item so the screen has something to reveal, and `null` when the player
   * cannot afford it — the same contract every other spend on this store has.
   *
   * WHICH TRAITS. The universal ones, and every colony the player actually HAS. A mythic
   * for a colony they may never buy is a mythic they cannot use, and the whole point of
   * the tier is that finding one is the best thing that happens in the feature.
   */
  hatch(random: () => number = Math.random): TraitItem | null {
    if (this.profile.larva < HATCH_COST) return null;
    const drop = rollDrop(random, [null, ...this.profile.unlocked]);
    if (!drop) return null;
    this.update((p) => { p.larva -= HATCH_COST; });
    return this.findTrait(drop.def, drop.tier);
  }

  /** Timestamp of the last daily gift claim, so the shop can offer it once a day. */
  claimDailyGift(now: number = Date.now()): boolean {
    if (!this.dailyGiftReady(now)) return false;
    this.update((p) => {
      p.freeAt = now;
      p.mycel += DAILY_GIFT.mycel;
      p.pheromone += DAILY_GIFT.pheromone;
    });
    return true;
  }

  dailyGiftReady(now: number = Date.now()): boolean {
    return now - this.profile.freeAt >= 864e5;
  }

  /* -------------------------------------------------------- DAILY QUESTS */

  /**
   * Today's three quests, rolling a fresh set the first time this is called on a new day.
   *
   * The streak survives only if the player swept the *previous* day: miss one, and the run
   * is over. Rolling here rather than on a timer means a session left open overnight picks
   * up the new day the next time anything touches quests.
   */
  dailyQuests(now: number = Date.now()): readonly QuestState[] {
    const today = dayIndex(now);
    if (this.profile.questDay === today && this.profile.quests.length) return this.profile.quests;

    // The streak is incremented by the sweep itself (claimQuest); a new day only has to
    // decide whether the run survives — it does when yesterday was swept and was yesterday.
    const swept = this.profile.quests.length > 0 && this.profile.quests.every((q) => q.claimed);
    const consecutive = this.profile.questDay === today - 1;
    this.update((p) => {
      if (!swept || !consecutive) p.questStreak = 0;
      p.questDay = today;
      p.quests = rollQuests(today);
    });
    return this.profile.quests;
  }

  /** Advance every unclaimed quest of this kind. Called by the shell, never by the engine. */
  questProgress(kind: QuestKind, amount = 1, now: number = Date.now()): void {
    if (amount <= 0) return;
    this.dailyQuests(now);
    if (!this.profile.quests.some((q) => !q.claimed && questDef(q.id)?.kind === kind)) return;
    this.update((p) => {
      for (const q of p.quests) {
        const def = questDef(q.id);
        if (!def || def.kind !== kind || q.claimed) continue;
        q.progress = Math.min(def.goal, q.progress + amount);
      }
    });
  }

  /** Claim a finished quest: its reward, its XP, and the sweep bonus on the last one. */
  claimQuest(id: string, now: number = Date.now()): boolean {
    this.dailyQuests(now);
    const state = this.profile.quests.find((q) => q.id === id);
    const def = questDef(id);
    if (!state || !def || !isClaimable(state)) return false;
    this.update((p) => {
      const q = p.quests.find((x) => x.id === id);
      if (!q) return;
      q.claimed = true;
      p.mycel += def.reward.mycel ?? 0;
      p.pheromone += def.reward.pheromone ?? 0;
      p.xp += def.xp;
      if (p.quests.every((x) => x.claimed)) {
        p.questStreak += 1;
        p.mycel += QUEST_SWEEP_BONUS.mycel;
      }
    });
    return true;
  }

  /* --------------------------------------------------------- COLONY LEVEL */

  /** Where the colony stands: level, XP into it, and what the next one costs. */
  level(): ReturnType<typeof levelProgress> {
    return levelProgress(this.profile.xp);
  }

  /** Levels reached whose reward is still sitting there unclaimed. */
  unclaimedLevels(): number[] {
    return unclaimedLevels(this.profile.xp, this.profile.claimedLevels);
  }

  /** Take one level's reward. Returns false if it is not reached, or already taken. */
  claimLevel(level: number): boolean {
    if (!this.unclaimedLevels().includes(level)) return false;
    const reward = levelReward(level);
    this.update((p) => {
      p.mycel += reward.mycel ?? 0;
      p.pheromone += reward.pheromone ?? 0;
      p.claimedLevels.push(level);
    });
    return true;
  }
}

/**
 * Match payout, the legacy build's numbers. Mycelium buys everything on the colony screens
 * — chambers, research and species. Pheromone comes from quests and the Colony Road only,
 * which is why a match pays none of it.
 */
export const MATCH_MYCEL = { win: 25, loss: 8 } as const;

/** XP a finished match pays. Long games are worth a little more, capped at +30. */
export const matchXp = (won: boolean, turns: number): number =>
  (won ? 90 : 35) + Math.min(30, Math.max(0, Math.floor(turns)));

/** The shop's once-a-day free handout. */
export const DAILY_GIFT = { mycel: 60, pheromone: 100 } as const;

/**
 * What the AI gets, always. No chambers, no research and NO TRAITS: it competes on
 * decision quality alone, so nothing a player collects is ever needed to keep up with it
 * (CLAUDE.md §4.10). Spread from the engine's own constant rather than written out, or a
 * field added there is silently zero here and reads as a deliberate neutral value.
 */
function neutralMods(): PlayerMods {
  return { ...NEUTRAL_MODS };
}

/** Fold anthill chambers and per-species research into the engine's PlayerMods shape. */
export function modsFrom(profile: Profile, species: SpeciesId): PlayerMods {
  const r = profile.research[species];
  // The anthill's five and this colony's five, added up here and handed over as three
  // finished percentages — the engine owns what a percentage does, never what a tier is
  // worth (platform/traits.ts).
  const worn = combine(wornTotals(profile, "hill"), wornTotals(profile, species));
  return {
    royal: profile.hill.royal ?? 0,
    brood: profile.hill.brood ?? 0,
    soldierCaste: profile.hill.soldierCaste ?? 0,
    gland: profile.hill.gland ?? 0,
    cultivate: profile.hill.cultivate ?? 0,
    reservoir: r?.reservoir ?? 0,
    mandible: r?.mandible ?? 0,
    cuticle: r?.cuticle ?? 0,
    atkPct: worn.atkPct,
    defPct: worn.defPct,
    boonPct: worn.luckPct,
  };
}

/** What one bench is worth. Slots that resolve to nothing simply do not count. */
export function wornTotals(profile: Profile, scope: TraitScope): TraitTotals {
  return totalsOf(wornItems(profile, scope));
}

/** The items actually in a bench's slots, in slot order, gaps dropped. */
export function wornItems(profile: Profile, scope: TraitScope): TraitItem[] {
  const slots = profile.wearing[scope] ?? [];
  const out: TraitItem[] = [];
  for (const uid of slots) {
    const item = uid ? profile.bag.find((b) => b.uid === uid) : null;
    if (item) out.push(item);
  }
  return out;
}
