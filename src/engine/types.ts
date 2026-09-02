/**
 * Core engine types.
 *
 * Tile state is modelled as unions on purpose: most bugs in the original build were
 * state-shape errors (a captured nest silently relabelled "stable", a hive tile made a
 * vein and then pruned away). Those are now compile errors.
 */

export type Player = "you" | "ai";

/** What a tile *is* structurally. `null` = unowned ground. */
export type Structure = "nest" | "stable" | "vein" | null;

/** What a tile is made of. Terrain never changes during normal play. */
export type Terrain = "ground" | "resource" | "blocked" | "hiveQ" | "hiveG";

export interface Tile {
  readonly c: number;
  readonly r: number;
  terrain: Terrain;
  owner: Player | null;
  struct: Structure;
  /** Garrison held by the owner. Always >= 1 on an owned non-vein tile. */
  soldiers: number;
  /** Neutral wild garrison defending an unowned tile. */
  guard: number;
  /** Ghost Ant gallery mouth: always connected, must hold 5 workers. */
  tunnel: boolean;
  /** Ghost Ant cloak: soldier count hidden from the enemy. */
  hidden: boolean;
  /** Carries fractional production between turns so slow economies still tick. */
  prodAcc: number;
}

export type Grid = Tile[][];

/**
 * dormant → awake → buff → cooling → awake, one level stronger.
 *
 * `cooling` is the gap after a surge ends: the queen is dead, her tiles are neutral ground
 * again, and nothing is there to capture until she returns. Without it a colony could take
 * the queen, ride the surge, and walk straight back onto a fresh one the moment it lapsed.
 */
export type HivePhase = "dormant" | "awake" | "buff" | "cooling";

export interface HiveState {
  phase: HivePhase;
  /** Rises by 1 each time the queen is captured and respawns. */
  level: number;
  owner: Player | null;
  buffLeft: number;
  /** Turns left before a dead queen returns. Only meaningful while `cooling`. */
  coolLeft: number;
  /**
   * Soldiers the hive has eaten and will come back with.
   *
   * Anything standing on the five tiles when the surge lapses, and anything standing there
   * when she grows back, is absorbed rather than destroyed — leaving a garrison on the hive
   * feeds the next queen instead of quietly vanishing.
   */
  banked: number;
  /** The turn the hive first woke. NOT reset by a respawn — see HIVE_LEVEL_GROWTH. */
  awokeTurn: number | null;
}

export type EffectKind = "fire" | "venom" | "leaf" | "armor";

export interface TileEffect {
  c: number;
  r: number;
  kind: EffectKind;
  owner: Player;
  /** Turns remaining. PERMANENT marks a Leafcutter permanent wall. */
  left: number;
}

/** Sentinel for a leaf wall that lasts the whole match. */
export const PERMANENT = 99999;

export interface GameState {
  grid: Grid;
  size: number;
  turn: number;
  current: Player;
  over: boolean;
  winner: Player | null;
  hive: HiveState;
  effects: TileEffect[];
  species: Record<Player, SpeciesId>;
  /** Ability cooldown remaining, per player. */
  cooldown: Record<Player, number>;
  /** Carpenter Fortify: colony-wide defence multiplier while > 0. */
  shield: Record<Player, number>;
  /** Ghost cloak turns remaining. */
  cloak: Record<Player, number>;
  /** Cached nest-anchored connectivity, keyed "c,r". Rebuilt by recomputeConnectivity. */
  conn: Record<Player, Set<string>>;
  limits: MapLimits;
  /**
   * Seeded PRNG state. Only ability scatter reads it — never combat (CLAUDE.md §4.1).
   * Snapshot/restored with the board so AI search cannot advance the real stream.
   */
  rng: number;
  /**
   * Turns shaved off this colony's ability cooldown for the WHOLE match — 0 or 1.
   *
   * Rolled once at `createGame` against `boonPct` (traits), and it is a property of the
   * match rather than of the turn: a chance re-rolled every cast would make the same
   * ability come back at a different speed each time, which reads as a bug rather than as
   * luck. Snapshot/restored with the board like everything else, so AI search cannot see
   * a different roll from the one the real match is playing on.
   */
  boon: Record<Player, number>;
}

export interface MapLimits {
  awakenTurn: number;
  turnLimit: number;
  buffTurns: number;
}

export type SpeciesId =
  | "ghost" | "pharaoh" | "leafcutter" | "fire" | "army"
  | "weaver" | "carpenter" | "bullet" | "demon";

export type AbilityKind =
  | "tunnel" | "bud" | "leaf" | "fire" | "swarm"
  | "spread" | "fortify" | "venom" | "flee";

export interface Ability {
  name: string;
  kind: AbilityKind;
  cooldown: number;
  /** Ghost Tunnelling begins the match on cooldown. */
  startSpent?: boolean;
  desc: string;
}

export interface Species {
  id: SpeciesId;
  name: string;
  atk: number;
  def: number;
  prod: number;
  premium?: boolean;
  blurb: string;
  trait: string;
  ability: Ability;
}

/** Per-player modifiers supplied by the meta game. The AI always gets the neutral set. */
export interface PlayerMods {
  /** Anthill chamber levels. */
  royal: number;
  brood: number;
  soldierCaste: number;
  gland: number;
  cultivate: number;
  /** Per-species research levels. */
  reservoir: number;
  mandible: number;
  cuticle: number;
  /*
   * TRAITS, and they arrive here already ADDED UP.
   *
   * A chamber and a research track are LEVELS — the engine owns the curve that turns a
   * level into a number, because that curve is a rule of the game. A trait is not a level:
   * it is one of a hundred collectable things with a tier, and what a tier is worth is a
   * progression decision that belongs beside the prices (platform/traits.ts). So what
   * crosses the boundary is the finished percentage, and the engine owns only what a
   * percentage DOES.
   */
  /** Extra attack, as a percentage. */
  atkPct: number;
  /** Extra defence, as a percentage. */
  defPct: number;
  /**
   * The CHANCE, as a percentage, that this colony's ability comes back a turn sooner —
   * rolled once at the start of a match, for the whole match. Rolled in the engine off
   * the seeded generator rather than handed in already decided, so the same seed replays
   * to the same match and a server can verify a result it never watched (CLAUDE.md §4.1).
   */
  boonPct: number;
}

export const NEUTRAL_MODS: PlayerMods = {
  royal: 0, brood: 0, soldierCaste: 0, gland: 0, cultivate: 0,
  reservoir: 0, mandible: 0, cuticle: 0,
  atkPct: 0, defPct: 0, boonPct: 0,
};

/* ---------------------------------------------------------------------------
 * Events — the engine's only output channel to the view layer.
 * The engine NEVER animates. It reports what happened; the renderer dramatises it.
 * ------------------------------------------------------------------------- */

export type Direction = "L" | "R" | "U" | "D";

export type EngineEvent =
  | { type: "move"; from: Coord; to: Coord; owner: Player; count: number }
  | { type: "travel"; path: Coord[]; owner: Player; count: number }
  | { type: "capture"; at: Coord; owner: Player; from: Direction; previous: Player | null }
  /** `from` is the direction the attack travelled, so the view can find the attacker's tile. */
  | { type: "combat"; at: Coord; attacker: Player; from: Direction; won: boolean; survivors: number }
  | { type: "veinLaid"; at: Coord; owner: Player }
  | { type: "veinPruned"; at: Coord; owner: Player }
  | { type: "rally"; to: Coord; owner: Player; sources: Coord[]; count: number }
  | { type: "production"; owner: Player; gained: number }
  | { type: "effectApplied"; at: Coord; kind: EffectKind; owner: Player; turns: number }
  | { type: "effectExpired"; at: Coord; kind: EffectKind }
  | { type: "effectDamage"; at: Coord; kind: EffectKind; lost: number; wiped: boolean;
      /** Who held the tile — the renderer crumbles it in their colour. */
      owner: Player | null }
  | { type: "abilityCast"; owner: Player; kind: AbilityKind; name: string }
  | { type: "budded"; at: Coord; owner: Player; count: number }
  | { type: "devoured"; at: Coord; into: Coord; owner: Player; count: number }
  | {
      type: "fled"; from: Coord; to: Coord | null; owner: Player; count: number;
      /**
       * Did the garrison land on ground it did not already hold? Two fleers can be pushed
       * onto the same tile, and one can be pushed onto a tile its colony already holds —
       * re-filling those makes the colony look rebuilt from scratch (CLAUDE.md §5, travel).
       */
      claimed: boolean;
    }
  | { type: "fortified"; at: Coord; owner: Player; gained: number }
  | { type: "tunnelDug"; at: Coord; owner: Player }
  | { type: "hiveAwake" }
  /** `cells` are the five hive tiles that changed hands, so the renderer can fill them. */
  | { type: "hiveCaptured"; owner: Player; level: number; cells: Coord[] }
  /** The surge lapsed. The tiles stay with whoever took them; only the bonus ends. */
  | { type: "hiveSurgeEnded"; level: number }
  | { type: "hiveRespawn"; level: number }
  | { type: "gameOver"; winner: Player; reason: GameOverReason };

/**
 * Why a match ended. "objective" is for scenario play (challenges): the shell decides the
 * objective was met or missed and tells the engine to stop — the engine has no notion of
 * what the objective was, only that the match is over.
 */
/**
 * A match ends when a queen falls, and only then (CLAUDE.md §4.8). There is no turn
 * limit: running the clock out used to hand the win to whoever held more ground, which
 * decided matches nobody had won.
 */
export type GameOverReason = "nest" | "wipe" | "surrender" | "objective";

export interface Coord { c: number; r: number }

export const key = (c: number, r: number): string => `${c},${r}`;
