// ── Canvas ────────────────────────────────────────────────────────────────────
export const CANVAS_W = 1280;
export const CANVAS_H = 720;

// ── Grid (Crossroads 13×13 — medium format) ───────────────────────────────────
export const GRID_SIZE   = 13;
export const TILE_SIZE   = 42;
export const TILE_STRIDE = 44;
export const GRID_LEFT   = 32;
export const GRID_TOP    = 70;

// ── Right panel ───────────────────────────────────────────────────────────────
export const PANEL_X = GRID_LEFT + GRID_SIZE * TILE_STRIDE + 18;  // ~622
export const PANEL_W = CANVAS_W - PANEL_X - 10;                    // ~648

// ── Enums ─────────────────────────────────────────────────────────────────────
export const OWNER = Object.freeze({ NONE: 0, P1: 1, P2: 2, HIVE: 3 });
export const KIND  = Object.freeze({ NEUTRAL: 0, STABLE: 1, VEIN: 2 });
export const TTYPE = Object.freeze({ EMPTY: 0, RESOURCE: 1, NEST: 2, HIVE_GUARD: 3, HIVE_QUEEN: 4 });

// ── Hive positions (queen at grid center) ─────────────────────────────────────
export const HIVE_CENTER = { col: 6, row: 6 };
export const HIVE_GUARDS = [
  { col: 5, row: 6 },
  { col: 7, row: 6 },
  { col: 6, row: 5 },
  { col: 6, row: 7 },
];

// ── Nest positions ────────────────────────────────────────────────────────────
export const P1_NEST = { col: 1, row: 1 };
export const P2_NEST = { col: 11, row: 11 };

// ── Starting clusters (T-chamber: plus-sign shape) ────────────────────────────
export const P1_CLUSTER = [
  [1, 1], // nest
  [0, 1], [2, 1], [1, 0], [1, 2],
];
export const P2_CLUSTER = [
  [11, 11], // nest
  [10, 11], [12, 11], [11, 10], [11, 12],
];

// ── Resource tile positions (6 total for 13×13) ───────────────────────────────
export const RESOURCE_TILES = [
  [2, 2],   // near P1 spawn
  [10, 10], // near P2 spawn
  [3, 6],   // west of Hive (contested)
  [9, 6],   // east of Hive (contested)
  [6, 3],   // north of Hive (contested)
  [6, 9],   // south of Hive (contested)
];

// ── Turn-based timing ─────────────────────────────────────────────────────────
export const HIVE_AWAKEN_TURN  = 20;  // total turns before first awakening
export const HIVE_BUFF_TURNS   = 10;  // captor's turns the buff lasts
export const HIVE_REDORMANT    = 20;  // turns dormant after buff expires
export const RESOURCE_DEPLETE  = 15;  // turns until resource tile depletes

// ── Economy ───────────────────────────────────────────────────────────────────
export const PROD_EMPTY    = 1;
export const PROD_RESOURCE = 3;
export const START_SOLDIERS = 5;

// ── Vein mechanics ────────────────────────────────────────────────────────────
export const VEIN_HP_CAP       = 10;
export const VEIN_HEAL_AMT     = 1;
export const VEIN_HEAL_THRESHOLD = 5;  // endpoint garrison needed to heal

// ── Defense bonuses ───────────────────────────────────────────────────────────
export const DEF_RESOURCE = 5;
export const DEF_NEST     = 50;

// ── Species (P1 = Fire Ant, P2 = Army Ant) ────────────────────────────────────
export const SPECIES = Object.freeze({
  P1: { name: 'Fire Ant',  atk: 1.0, def: 1.0, color: 0xc4571f, colorDim: 0x6b2e10, nestColor: 0xe06020 },
  P2: { name: 'Army Ant',  atk: 1.4, def: 0.7, color: 0x1f5dc4, colorDim: 0x10306b, nestColor: 0x2060e0 },
});

// ── Hive Palette ──────────────────────────────────────────────────────────────
export const HIVE_COL_DORMANT  = 0x2a0f45;
export const HIVE_COL_ACTIVE   = 0x7a2acc;
export const HIVE_COL_BUFF     = 0xaa44ff;

// ── Speed presets (ms between turns) ─────────────────────────────────────────
export const SPEEDS = Object.freeze({
  TURBO:  80,
  FAST:   400,
  NORMAL: 1000,
  SLOW:   2500,
  STEP:   Infinity,
});
