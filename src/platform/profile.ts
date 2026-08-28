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
  CHAMBER_MAX, RESEARCH_MAX, SPECIES, TROPHY_LOSS, TROPHY_WIN, chamberCost, researchCost,
} from "../engine";
import type { MapId, Player, PlayerMods, SpeciesId } from "../engine";
import { SPECIES_UNLOCK, type ResearchTrack } from "./catalogue";
import {
  QUEST_SWEEP_BONUS, dayIndex, isClaimable, levelProgress, levelReward, questDef, rollQuests,
  unclaimedLevels, type QuestKind, type QuestState,
} from "./quests";
import { isPassKey, rewardFor, roadTrophies } from "./road";
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
  trophies: number;
  /** Soft currency (mycelium) and research currency (pheromone). */
  mycel: number;
  pheromone: number;
  stats: Stats;
  unlocked: SpeciesId[];
  research: Partial<Record<SpeciesId, Research>>;
  hill: Partial<Record<ChamberId, number>>;
  equip: Partial<Record<SpeciesId, Equipped>>;
  /** How often each colony has been fielded, for the "favourite species" readout. */
  fav: Partial<Record<SpeciesId, number>>;
  /** Trophy Road: the reward keys already paid out, and whether the pass is owned. */
  roadClaimed: string[];
  pass: boolean;
  /** When the shop's daily gift was last taken. */
  freeAt: number;
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
    trophies: 0,
    // A new colony starts with nothing. The legacy build handed out 120 mycelium so the
    // Anthill had something to do on the first visit; earning the first chamber from a
    // match instead is what gives that visit a point.
    mycel: 0,
    pheromone: 0,
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
    trophies: int(p.trophies, 0, 1e9, base.trophies),
    mycel: int(p.mycel, 0, 1e9, base.mycel),
    pheromone: int(p.pheromone, 0, 1e9, base.pheromone),
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
    roadClaimed: Array.isArray(p.roadClaimed)
      ? [...new Set(p.roadClaimed.filter((k): k is string => typeof k === "string" && !!rewardFor(k)))]
      : [],
    pass: p.pass === true,
    freeAt: int(p.freeAt, 0, 1e15, 0),
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

/* ---------------------------------------------------------------- ACCESS */

export class ProfileStore {
  private profile: Profile;

  constructor(private store: KeyValueStore = defaultStore()) {
    this.profile = normalise(readJson<Profile>(store, KEY));
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
   * Record a finished match: trophies (floored at zero, CLAUDE.md §8), mycelium, the
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
      p.trophies = Math.max(0, p.trophies + (won ? TROPHY_WIN : TROPHY_LOSS));
      p.mycel += won ? MATCH_MYCEL.win : MATCH_MYCEL.loss;
      p.fav[species] = (p.fav[species] ?? 0) + 1;
      p.xp += matchXp(won, turns);
      p.lastSpecies = species;
    });
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
    return this.profile.trophies >= roadTrophies(key);
  }

  /**
   * Pay out one Trophy Road reward. Claims are keyed and recorded, so trophies lost to a
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

  /** The Trophy Pass. Bought in the shop, or granted by a bundle. */
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
      if (grant.pass) p.pass = true;
      if (grant.species && !p.unlocked.includes(grant.species)) p.unlocked.push(grant.species);
    });
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
 * — chambers, research and species. Pheromone comes from quests and the Trophy Road only,
 * which is why a match pays none of it.
 */
export const MATCH_MYCEL = { win: 25, loss: 8 } as const;

/** XP a finished match pays. Long games are worth a little more, capped at +30. */
export const matchXp = (won: boolean, turns: number): number =>
  (won ? 90 : 35) + Math.min(30, Math.max(0, Math.floor(turns)));

/** The shop's once-a-day free handout. */
export const DAILY_GIFT = { mycel: 60, pheromone: 100 } as const;

function neutralMods(): PlayerMods {
  return {
    royal: 0, brood: 0, soldierCaste: 0, gland: 0, cultivate: 0,
    reservoir: 0, mandible: 0, cuticle: 0,
  };
}

/** Fold anthill chambers and per-species research into the engine's PlayerMods shape. */
export function modsFrom(profile: Profile, species: SpeciesId): PlayerMods {
  const r = profile.research[species];
  return {
    royal: profile.hill.royal ?? 0,
    brood: profile.hill.brood ?? 0,
    soldierCaste: profile.hill.soldierCaste ?? 0,
    gland: profile.hill.gland ?? 0,
    cultivate: profile.hill.cultivate ?? 0,
    reservoir: r?.reservoir ?? 0,
    mandible: r?.mandible ?? 0,
    cuticle: r?.cuticle ?? 0,
  };
}
