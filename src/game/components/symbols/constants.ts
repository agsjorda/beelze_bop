/**
 * Constants for the Symbols component
 * Centralizes all magic numbers and configuration values for easy maintenance
 */

// ============================================================================
// GRID CONFIGURATION
// ============================================================================

/** Width of each symbol in pixels */
export const SYMBOL_DISPLAY_WIDTH = 62;

/** Height of each symbol in pixels */
export const SYMBOL_DISPLAY_HEIGHT = 62;

/** Horizontal spacing between symbols in pixels */
export const SYMBOL_HORIZONTAL_SPACING = 9;

/** Vertical spacing between symbols in pixels */
export const SYMBOL_VERTICAL_SPACING = 4;

/** Mask padding around the symbol grid */
export const GRID_MASK_PADDING = {
  left: 14,
  right: 14,
  top: 20,
  bottom: 50,
} as const;

/** Overlay padding around the symbol grid */
export const GRID_OVERLAY_PADDING = {
  x: 9,
  y: 8,
  offsetX: 1,
  offsetY: 0.7,
} as const;

/** Number of filler symbols for drop animations */
export const FILLER_COUNT = 20;

// ============================================================================
// ANIMATION TIMING
// ============================================================================

/** Stagger delay between symbol animations in milliseconds */
export const ANIMATION_STAGGER_MS = 50;

/** Delay before scale-up animation starts */
export const SCALE_UP_DELAY_MS = 500;

/** Delay before win text appears */
export const WIN_TEXT_DELAY_MS = 800;

/** Stagger between multiplier symbol triggers */
export const MULTIPLIER_STAGGER_MS = 800;

/** Duration for shrink animation when resetting scatters */
export const SCATTER_SHRINK_DURATION_MS = 350;

/** Duration for move animation when resetting scatters */
export const SCATTER_MOVE_DURATION_MS = 500;

/** Duration for gather animation when scatters move to center */
export const SCATTER_GATHER_DURATION_MS = 600;

/** Duration for fade-in animation on winning overlay */
export const OVERLAY_FADE_IN_DURATION_MS = 300;

/** Duration for fade-out animation on winning overlay */
export const OVERLAY_FADE_OUT_DURATION_MS = 200;

// ============================================================================
// SYMBOL SCALES
// ============================================================================

/**
 * Spine animation scales for each symbol type
 * These values are manually tuned for visual appearance
 */
export const SPINE_SYMBOL_SCALES: Record<number, number> = {
  0: 0.135,   // Scatter symbol scale
  1: 0.035,   // Sugar symbol 1 scale
  2: 0.035,   // Sugar symbol 2 scale
  3: 0.035,   // Sugar symbol 3 scale
  4: 0.135,   // Sugar symbol 4 scale
  5: 0.135,   // Sugar symbol 5 scale
  6: 0.135,   // Sugar symbol 6 scale
  7: 0.135,   // Sugar symbol 7 scale
  8: 0.135,   // Sugar symbol 8 scale
  9: 0.135,   // Sugar symbol 9 scale
  10: 0.135,  // Multiplier 2x scale
  11: 0.135,  // Multiplier 3x scale
  12: 0.137,  // Multiplier 4x scale (wildcard x2)
  13: 0.137,  // Multiplier 5x scale (wildcard x3)
  14: 0.137,  // Multiplier 6x scale (wildcard x4)
} as const;

/** Default scale for symbols not in the scale map */
export const DEFAULT_SPINE_SCALE = 0.6;

/** Scale adjustment multiplier applied to all spine symbols */
export const SPINE_SCALE_ADJUSTMENT = 0.93;

/** Visual boost scale for multiplier symbols */
export const MULTIPLIER_VISUAL_SCALE = 1;

/** Scale increase for scatter symbols during animation (1.8x = 80% larger) */
export const SCATTER_ANIMATION_SCALE = 1.8;

/** Scale increase for scatter symbols after gathering (2.5x) */
export const SCATTER_GATHER_SCALE = 2.5;

/** Scale increase for scatter retrigger animation (1.5x) */
export const SCATTER_RETRIGGER_SCALE = 1.5;

// ============================================================================
// DEPTH VALUES (Z-ordering)
// ============================================================================

/** Default depth for symbols in the grid */
export const DEPTH_SYMBOL_DEFAULT = 0;

/** Depth for the dark overlay behind winning symbols */
export const DEPTH_OVERLAY = 500;

/** Depth for winning symbols (above overlay, below win lines) */
export const DEPTH_WINNING_SYMBOL = 600;

/** Depth for the overlay container used during retrigger */
export const DEPTH_OVERLAY_CONTAINER = 930;

/** Depth for symbols during retrigger sequence */
export const DEPTH_RETRIGGER_SYMBOL = 931;

/** Depth for win line drawings */
export const DEPTH_WIN_LINES = 1000;

// ============================================================================
// MULTIPLIER VALUES
// ============================================================================

/**
 * Maps multiplier symbol IDs (10-22) to their numeric multiplier values
 */
export const MULTIPLIER_VALUES: Record<number, number> = {
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 6,
  15: 8,
  16: 10,
  17: 12,
  18: 15,
  19: 20,
  20: 25,
  21: 50,
  22: 100,
} as const;

/**
 * Maps multiplier symbol IDs to their Spine animation base names
 */
export const MULTIPLIER_ANIMATION_BASES: Record<string, number[]> = {
  'Symbols11_SW': [10, 11, 12, 13, 14, 15, 16],
  'Symbols10_SW': [17, 18, 19, 20],
  'Symbols12_SW': [21, 22],
} as const;

// ============================================================================
// SCATTER CONFIGURATION
// ============================================================================

/** Number of scatter symbols needed to trigger bonus in normal mode */
export const SCATTER_TRIGGER_COUNT = 4;

/** Number of scatter symbols needed for retrigger in bonus mode */
export const SCATTER_RETRIGGER_COUNT = 3;

/** Scatter symbol ID */
export const SCATTER_SYMBOL_ID = 0;

/** Payout multipliers for scatter counts: count -> bet multiplier */
export const SCATTER_PAYOUT_MULTIPLIERS: Record<number, number> = {
  4: 3,
  5: 5,
  6: 100,
} as const;

// ============================================================================
// WIN DIALOG THRESHOLDS
// ============================================================================

/** Minimum bet multiplier to trigger a win dialog */
export const WIN_DIALOG_THRESHOLD_MULTIPLIER = 20;

// ============================================================================
// INITIAL SYMBOL DATA
// ============================================================================

/**
 * Default symbols shown on game load (row-major format: [row][col])
 * This is used for testing/demo purposes
 */
export const INITIAL_SYMBOLS: number[][] = [
  [0, 1, 3, 1, 0, 2],
  [1, 5, 2, 5, 2, 4],
  [2, 5, 5, 1, 5, 3],
  [3, 4, 1, 2, 4, 1],
  [4, 2, 0, 3, 1, 5],
] as const;
