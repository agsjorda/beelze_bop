/**
 * Game Configuration Constants
 * Centralized configuration for the slot game
 */

// =============================================================================
// GRID CONFIGURATION
// =============================================================================
export const SLOT_COLUMNS: number = 6; // number of columns (vertical reels)
export const SLOT_ROWS: number = 5; // number of rows (horizontal)

/** Symbol reel center: slotY = scene.scale.height * GRID_CENTER_Y_RATIO + GRID_CENTER_Y_OFFSET_PX */
export const GRID_CENTER_Y_RATIO = 0.56;
export const GRID_CENTER_Y_OFFSET_PX = 0; // negative = up, positive = down

/** Reel frame (NormalGame_BZ Spine) Y offset in pixels. negative = up, positive = down */
export const REEL_FRAME_Y_OFFSET_PX = 0;

// =============================================================================
// SYMBOL CONFIGURATION
// =============================================================================
export const SCATTER_SYMBOL: number[] = [0];
export const NORMAL_SYMBOLS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const MULTIPLIER_SYMBOLS: number[] = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
export const ALL_SYMBOLS: number[] = [...SCATTER_SYMBOL, ...NORMAL_SYMBOLS, ...MULTIPLIER_SYMBOLS];

/** Minimum cluster size to trigger a win */
export const MIN_CLUSTER_SIZE: number = 8;

/** Minimum scatter symbols to trigger bonus */
export const MIN_SCATTER_FOR_BONUS: number = 4;

/** Minimum scatter symbols to trigger retrigger during bonus */
export const MIN_SCATTER_FOR_RETRIGGER: number = 3;

// =============================================================================
// SYMBOL DISPLAY CONFIGURATION
// =============================================================================
export const SYMBOL_CONFIG = {
  /** Display width of each symbol in pixels */
  DISPLAY_WIDTH: 62,
  /** Display height of each symbol in pixels */
  DISPLAY_HEIGHT: 62,
  /** Horizontal spacing between symbols */
  HORIZONTAL_SPACING: 9,
  /** Vertical spacing between symbols */
  VERTICAL_SPACING: 4,
  /** Number of filler symbols during reel spin */
  FILLER_COUNT: 20,
} as const;

// =============================================================================
// TIMING CONFIGURATION
// =============================================================================
export const DELAY_BETWEEN_SPINS: number = 2000;
/** Ratio for time between column starts relative to DELAY_BETWEEN_SPINS */
export const DROP_REEL_START_INTERVAL_RATIO: number = 0.08;

export const TIMING_CONFIG = {
  /** Extended duration for scatter anticipation (ms) */
  EXTEND_DURATION_MS: 3000,
  /** Stagger delay between symbols within a column (ms) */
  SYMBOL_STAGGER_MS: 100,
  /** Stagger delay between columns (ms) */
  COLUMN_STAGGER_MS: 50,
  /** Win dialog auto-close delay (ms) */
  WIN_DIALOG_AUTO_CLOSE_MS: 2500,
  /** Grace period before showing congrats dialog (ms) */
  CONGRATS_GRACE_MS: 1200,
} as const;

// =============================================================================
// ANIMATION CONFIGURATION
// =============================================================================
export const ANIMATION_CONFIG = {
  /** Multiplier visual scale boost (applied on top of base scale) */
  MULTIPLIER_VISUAL_SCALE: 1.6,
  /** Stagger between triggering multiplier symbols (ms) */
  MULTIPLIER_TRIGGER_STAGGER_MS: 800,
  /** Symbol hop height for drop animation */
  SYMBOL_HOP_HEIGHT: 10,
  /** Symbol bounce after landing */
  SYMBOL_BOUNCE_HEIGHT: 5,
  /** Filler symbol bounce after landing */
  FILLER_BOUNCE_HEIGHT: 40,
} as const;

// =============================================================================
// UI CONFIGURATION
// =============================================================================
export const UI_CONFIG = {
  /** Depth layers for UI elements */
  DEPTH: {
    SYMBOLS: 10,
    SYMBOL_OVERLAY: 500,
    WINNING_SYMBOLS: 501,
    CONTROLLER: 900,
    DIALOGS: 1000,
    COIN_ANIMATION: 800,
  },
  /** Controller button configuration */
  BUTTON: {
    DEFAULT_DEPTH: 10,
    ANIMATION_DEPTH: 11,
    SPIN_ANIMATION_SCALE: 0.435,
    AUTOPLAY_ANIMATION_SCALE: 0.16,
  },
} as const;

// =============================================================================
// WIN THRESHOLDS (multipliers of bet amount)
// =============================================================================
export const WIN_THRESHOLDS = {
  /** Threshold for "Big Win" dialog */
  BIG_WIN: 20,
  /** Threshold for "Mega Win" dialog */
  MEGA_WIN: 30,
  /** Threshold for "Epic Win" dialog */
  EPIC_WIN: 45,
  /** Threshold for "Super Win" dialog */
  SUPER_WIN: 60,
} as const;

// Winline Configuration
export const WINLINES: number[][][] = [
  [
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
  ],
  [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
  ],
  [
    [0, 0, 1, 0, 0],
    [1, 1, 0, 1, 1],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [1, 1, 0, 1, 1],
    [0, 0, 1, 0, 0],
  ],
  [
    [1, 1, 0, 1, 1],
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
  ],
  [
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
    [1, 1, 0, 1, 1],
  ],
  [
    [1, 0, 0, 0, 1],
    [0, 1, 0, 1, 0],
    [0, 0, 1, 0, 0],
  ],
  [
    [0, 0, 1, 0, 0],
    [0, 1, 0, 1, 0],
    [1, 0, 0, 0, 1],
  ],
  [
    [0, 0, 0, 1, 1],
    [0, 0, 1, 0, 0],
    [1, 1, 0, 0, 0],
  ],
  [
    [1, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 1],
  ],
  [
    [0, 0, 0, 1, 0],
    [1, 0, 1, 0, 1],
    [0, 1, 0, 0, 0],
  ],
  [
    [1, 0, 0, 0, 1],
    [0, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
  ],
  [
    [0, 1, 0, 0, 0],
    [1, 0, 1, 0, 1],
    [0, 0, 0, 1, 0],
  ],
  [
    [1, 0, 0, 0, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
  ],
  [
    [1, 0, 1, 0, 1],
    [0, 1, 0, 1, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 0, 0, 0, 0],
    [0, 1, 0, 1, 0],
    [1, 0, 1, 0, 1],
  ],
];
