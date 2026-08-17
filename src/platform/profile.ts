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
import { CHAMBER_MAX, RESEARCH_MAX, SPECIES, TROPHY_LOSS, TROPHY_WIN, chamberCost } from "../engine";
import type { MapId, Player, PlayerMods, SpeciesId } from "../engine";
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

export interface Stats {
  games: number;
  wins: number;
  conquered: number;
  abilities: number;
  tunnels: number;
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
  /** Last setup choices, so the pickers open where the player left off. */
  lastSpecies: SpeciesId;
  lastMap: MapId;
  lastShape: string;
  tutorialDone: boolean;
}

/** Species available from the very first launch. The rest are unlocked in the Antarium. */
const STARTER_SPECIES: SpeciesId[] = ["fire", "leafcutter", "ghost"];

export function defaultProfile(): Profile {
  return {
    v: VERSION,
    name: "Commander",
    trophies: 0,
    mycel: 0,
    pheromone: 0,
    stats: { games: 0, wins: 0, conquered: 0, abilities: 0, tunnels: 0 },
    unlocked: [...STARTER_SPECIES],
    research: {},
    hill: {},
    equip: {},
    lastSpecies: "fire",
    lastMap: "small",
    lastShape: "wedge",
    tutorialDone: false,
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
  if (!raw || typeof raw !== "object") return base;
  const p = raw as Partial<Profile>;

  const int = (v: unknown, min: number, max: number, fallback: number): number => {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : fallback;
    return Math.max(min, Math.min(max, n));
  };
  const isSpecies = (v: unknown): v is SpeciesId => typeof v === "string" && v in SPECIES;

  const out: Profile = {
    ...base,
    name: typeof p.name === "string" && p.name.trim() ? p.name.slice(0, 18) : base.name,
    trophies: int(p.trophies, 0, 1e9, 0),
    mycel: int(p.mycel, 0, 1e9, 0),
    pheromone: int(p.pheromone, 0, 1e9, 0),
    stats: {
      games: int(p.stats?.games, 0, 1e9, 0),
      wins: int(p.stats?.wins, 0, 1e9, 0),
      conquered: int(p.stats?.conquered, 0, 1e9, 0),
      abilities: int(p.stats?.abilities, 0, 1e9, 0),
      tunnels: int(p.stats?.tunnels, 0, 1e9, 0),
    },
    unlocked: Array.isArray(p.unlocked) ? p.unlocked.filter(isSpecies) : [...STARTER_SPECIES],
    research: {},
    hill: {},
    equip: {},
    lastSpecies: isSpecies(p.lastSpecies) ? p.lastSpecies : base.lastSpecies,
    lastMap: p.lastMap === "tiny" || p.lastMap === "small" || p.lastMap === "mid" ? p.lastMap : base.lastMap,
    lastShape: typeof p.lastShape === "string" ? p.lastShape : base.lastShape,
    tutorialDone: p.tutorialDone === true,
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

  /** Record a finished match. Trophies floor at zero (CLAUDE.md §8). */
  recordResult(won: boolean, species: SpeciesId): Readonly<Profile> {
    return this.update((p) => {
      p.stats.games++;
      if (won) p.stats.wins++;
      p.trophies = Math.max(0, p.trophies + (won ? TROPHY_WIN : TROPHY_LOSS));
      p.mycel += won ? 40 : 15;
      p.pheromone += won ? 12 : 5;
      p.lastSpecies = species;
    });
  }

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
}

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
