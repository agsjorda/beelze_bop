/**
 * MultiplierSymbols - Utilities for handling multiplier symbols (values 10-22)
 * 
 * Responsibilities:
 * - Check if a symbol is a multiplier
 * - Get multiplier numeric values
 * - Get animation base names
 * - Get overlay texture keys
 */

import { MULTIPLIER_VALUES, MULTIPLIER_ANIMATION_BASES } from './constants';

/**
 * Static utility class for multiplier symbol operations
 */
export class MultiplierSymbols {
  
  // ============================================================================
  // TYPE CHECKING
  // ============================================================================

  /**
   * Check if a symbol value represents a multiplier symbol
   * Multiplier symbols are values 10-22
   */
  public static isMultiplier(symbolValue: number): boolean {
    return symbolValue >= 10 && symbolValue <= 22;
  }

  /**
   * Check if a symbol value is a scatter symbol
   */
  public static isScatter(symbolValue: number): boolean {
    return symbolValue === 0;
  }

  /**
   * Check if a symbol value is a regular sugar symbol (1-9)
   */
  public static isSugarSymbol(symbolValue: number): boolean {
    return symbolValue >= 1 && symbolValue <= 9;
  }

  // ============================================================================
  // VALUE LOOKUPS
  // ============================================================================

  /**
   * Get the numeric multiplier value for a multiplier symbol
   * Returns 0 if the symbol is not a multiplier
   * 
   * @example
   * MultiplierSymbols.getNumericValue(10) // returns 2
   * MultiplierSymbols.getNumericValue(22) // returns 100
   */
  public static getNumericValue(symbolValue: number): number {
    return MULTIPLIER_VALUES[symbolValue] ?? 0;
  }

  /**
   * Get all multiplier symbol values sorted by their numeric multiplier
   * @returns Array of symbol values from lowest to highest multiplier
   */
  public static getSymbolsByMultiplierValue(): number[] {
    return Object.entries(MULTIPLIER_VALUES)
      .sort((a, b) => a[1] - b[1])
      .map(([key]) => parseInt(key, 10));
  }

  // ============================================================================
  // ANIMATION LOOKUPS
  // ============================================================================

  /**
   * Get the Spine animation base name for a multiplier symbol
   * Returns null if the symbol is not a multiplier
   * 
   * @example
   * MultiplierSymbols.getAnimationBase(10) // returns 'Symbols11_SW'
   * MultiplierSymbols.getAnimationBase(21) // returns 'Symbols12_SW'
   */
  public static getAnimationBase(symbolValue: number): string | null {
    for (const [baseName, values] of Object.entries(MULTIPLIER_ANIMATION_BASES)) {
      if (values.includes(symbolValue)) {
        return baseName;
      }
    }
    return null;
  }

  /**
   * Get the idle animation name for a multiplier symbol
   */
  public static getIdleAnimationName(symbolValue: number): string | null {
    const base = this.getAnimationBase(symbolValue);
    if (!base) return null;
    return `${base}_Idle`;
  }

  /**
   * Get the win animation name for a multiplier symbol
   */
  public static getWinAnimationName(symbolValue: number): string | null {
    const base = this.getAnimationBase(symbolValue);
    if (!base) return null;
    return `${base}_Win`;
  }

  // ============================================================================
  // OVERLAY LOOKUPS
  // ============================================================================

  /**
   * Get the PNG overlay texture key for a multiplier symbol
   * Returns null if the symbol is not a multiplier
   * 
   * @example
   * MultiplierSymbols.getOverlayKey(10) // returns 'multiplier_overlay_10'
   */
  public static getOverlayKey(symbolValue: number): string | null {
    if (!this.isMultiplier(symbolValue)) {
      return null;
    }
    return `multiplier_overlay_${symbolValue}`;
  }

  // ============================================================================
  // SORTING
  // ============================================================================

  /**
   * Sort an array of multiplier symbol values by their numeric multiplier
   * Lower multipliers come first
   */
  public static sortByMultiplierAscending(symbolValues: number[]): number[] {
    return [...symbolValues].sort((a, b) => {
      const aValue = this.getNumericValue(a);
      const bValue = this.getNumericValue(b);
      return aValue - bValue;
    });
  }

  /**
   * Sort an array of multiplier symbol values by their numeric multiplier
   * Higher multipliers come first
   */
  public static sortByMultiplierDescending(symbolValues: number[]): number[] {
    return [...symbolValues].sort((a, b) => {
      const aValue = this.getNumericValue(a);
      const bValue = this.getNumericValue(b);
      return bValue - aValue;
    });
  }

  // ============================================================================
  // DISPLAY HELPERS
  // ============================================================================

  /**
   * Get a human-readable string for a multiplier value
   * @example
   * MultiplierSymbols.getDisplayString(10) // returns 'x2'
   * MultiplierSymbols.getDisplayString(22) // returns 'x100'
   */
  public static getDisplayString(symbolValue: number): string {
    const numericValue = this.getNumericValue(symbolValue);
    return numericValue > 0 ? `x${numericValue}` : '';
  }
}
