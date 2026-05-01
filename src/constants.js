// ── Canvas ────────────────────────────────────────────────────────────────────
export const CANVAS_W = 1280;
export const CANVAS_H = 720;

// ── Grid layout ───────────────────────────────────────────────────────────────
export const GRID_COLS   = 21;
export const GRID_ROWS   = 13;
export const TILE_SIZE   = 46;   // drawn pixel size (gap = STRIDE - SIZE = 2px)
export const TILE_STRIDE = 48;   // spacing between tile origins
export const GRID_LEFT   = Math.floor((CANVAS_W - GRID_COLS * TILE_STRIDE) / 2); // 136
export const GRID_TOP    = 52;   // below top HUD bar

// ── Enums ─────────────────────────────────────────────────────────────────────
export const OWNER = Object.freeze({ NONE: 0, PLAYER: 1, AI: 2, HIVE: 3 });
export const TILE_TYPE = Object.freeze({
  EMPTY: 0, RESOURCE: 1, HIVE_GUARD: 2, HIVE_QUEEN: 3, NEST: 4,
});

// ── Hive positions (queen at grid center) ─────────────────────────────────────
export const HIVE_QUEEN  = { col: 10, row: 6 };
export const HIVE_GUARDS = [
  { col: 9,  row: 6 },
  { col: 11, row: 6 },
  { col: 10, row: 5 },
  { col: 10, row: 7 },
];

// ── Nest positions ────────────────────────────────────────────────────────────
export const PLAYER_NEST = { col: 2,  row: 11 };
export const AI_NEST     = { col: 18, row: 1  };

// ── Timing (sped up for demo; real game values in GDD) ────────────────────────
export const SOLDIER_GEN_INTERVAL = 10_000;  // ms between passive income ticks
export const HIVE_AWAKEN_TIME     = 90_000;  // ms until Hive first awakens
export const HIVE_BUFF_DURATION   = 30_000;  // ms the Hive buff lasts
export const HIVE_RESPAWN_DELAY   =  8_000;  // ms between buff expiry and re-activation
export const AI_THINK_INTERVAL    =  1_500;  // ms between AI decision ticks

// ── Soldier economy ───────────────────────────────────────────────────────────
export const SOLDIERS_EMPTY    = 1;
export const SOLDIERS_RESOURCE = 3;
export const SOLDIERS_CAP      = 99;

// ── Combat ────────────────────────────────────────────────────────────────────
export const DEFENSE_BONUS_RESOURCE = 5;
export const DEFENSE_BONUS_NEST     = 50;

// ── Palette ───────────────────────────────────────────────────────────────────
export const COL = Object.freeze({
  BG:               0x0d160d,
  HUD_BG:           0x080f08,

  NEUTRAL:          0x252525,
  NEUTRAL_RESOURCE: 0x1a3a1a,

  PLAYER:           0x8b3a1a,
  PLAYER_NEST:      0xd05018,
  PLAYER_RESOURCE:  0x9e4422,
  PLAYER_BRIGHT:    0xc4571f,

  AI:               0x1a3a8b,
  AI_NEST:          0x1850d0,
  AI_RESOURCE:      0x224499,
  AI_BRIGHT:        0x1f5dc4,

  HIVE_DORMANT:     0x2a0f45,
  HIVE_ACTIVE:      0x6622bb,
  HIVE_RESPAWNING:  0x441a88,

  SEL_BORDER:       0xffee00,
  MOVE_BORDER:      0x44ff88,
  ATTACK_BORDER:    0xff4444,

  FLASH_CAPTURE:    0xffd700,
  FLASH_REPEL:      0xff3333,
  FLASH_MOVE:       0x66ffaa,
});
