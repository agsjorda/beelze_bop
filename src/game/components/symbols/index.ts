/**
 * Symbols Module - Barrel Export
 * 
 * This module contains all the refactored components for the symbol grid system.
 * Import from this file to access all symbol-related functionality.
 * 
 * @example
 * import { Symbols, SymbolGrid, MultiplierSymbols } from './symbols';
 */

// Main Symbols class (backward compatibility)
export { Symbols } from './Symbols';

// Core modules
export { SymbolGrid } from './SymbolGrid';
export { SymbolAnimations } from './SymbolAnimations';
export { SymbolFactory } from './SymbolFactory';
export { SymbolOverlay } from './SymbolOverlay';

// Specialized controllers
export { FreeSpinController } from './FreeSpinController';
export { MultiplierSymbols } from './MultiplierSymbols';

// Constants (all magic numbers centralized)
export * from './constants';

// Types (for TypeScript consumers)
export type {
  GridPosition,
  CellPosition,
  SymbolObject,
  SpineAnimationState,
  SpineTrackEntry,
  SpineAnimationListener,
  SpineSkeleton,
  TumbleOut,
  TumbleData,
  RemovalMask,
  SpinData,
  FreeSpinData,
  FreeSpinItem,
  PendingFreeSpinsData,
  PendingScatterRetrigger,
  OverlayRestoreEntry,
  GridBounds,
  GridConfig,
  SymbolPositionConfig,
  FirstWinCallback,
  SymbolIteratorCallback,
} from './types';
