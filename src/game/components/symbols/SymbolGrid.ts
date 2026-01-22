/**
 * SymbolGrid - Manages the 2D grid of symbol objects
 * 
 * Responsibilities:
 * - Store and access symbols by grid position
 * - Calculate grid positions and coordinates
 * - Manage grid dimensions and bounds
 * - Dispose of symbol objects
 */

import type { Game } from '../../scenes/Game';
import type { 
  SymbolObject, 
  GridPosition, 
  CellPosition, 
  GridBounds,
  SymbolPositionConfig,
  SymbolIteratorCallback
} from './types';
import {
  SYMBOL_DISPLAY_WIDTH,
  SYMBOL_DISPLAY_HEIGHT,
  SYMBOL_HORIZONTAL_SPACING,
  SYMBOL_VERTICAL_SPACING,
  GRID_MASK_PADDING,
  GRID_OVERLAY_PADDING,
  DEPTH_SYMBOL_DEFAULT,
} from './constants';
import { SLOT_ROWS, SLOT_COLUMNS } from '../../../config/GameConfig';

/**
 * Manages the symbol grid for the slot game
 */
export class SymbolGrid {
  /** Reference to the game scene */
  private scene: Game;
  
  /** Main symbol grid [col][row] - column-major for rendering */
  private symbols: (SymbolObject | null)[][] = [];
  
  /** New symbols during drop animation */
  private newSymbols: (SymbolObject | null)[][] = [];
  
  /** Current symbol data in row-major format for tumble logic */
  private symbolData: number[][] | null = null;
  
  /** Container for all symbols */
  public container!: Phaser.GameObjects.Container;
  
  /** Grid dimensions */
  public displayWidth: number = SYMBOL_DISPLAY_WIDTH * 0.9;
  public displayHeight: number = SYMBOL_DISPLAY_HEIGHT * 0.9;
  public horizontalSpacing: number = SYMBOL_HORIZONTAL_SPACING;
  public verticalSpacing: number = SYMBOL_VERTICAL_SPACING;
  
  /** Slot center position */
  public slotX: number = 0;
  public slotY: number = 0;
  
  /** Total grid dimensions */
  public totalGridWidth: number = 0;
  public totalGridHeight: number = 0;

  constructor(scene: Game) {
    this.scene = scene;
    this.initializeVariables();
    this.createContainer();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize grid variables and calculate dimensions
   */
  private initializeVariables(): void {
    const centerX = this.scene.scale.width * 0.5 - 5;
    const centerY = this.scene.scale.height * 0.56; // Move grid higher

    this.symbols = [];
    this.newSymbols = [];
    
    const spacingX = this.horizontalSpacing * (SLOT_ROWS - 1);
    const spacingY = this.verticalSpacing * (SLOT_COLUMNS - 1);
    
    this.totalGridWidth = (this.displayWidth * SLOT_ROWS) + spacingX;
    this.totalGridHeight = (this.displayHeight * SLOT_COLUMNS) + spacingY;

    this.slotX = centerX;
    this.slotY = centerY;
  }

  /**
   * Create the container with mask for symbol clipping
   */
  private createContainer(): void {
    this.container = this.scene.add.container(0, 0);

    const maskShape = this.scene.add.graphics();

    // Adjust mask y position to match grid y position (slotY)
    const maskY = this.slotY - this.totalGridHeight * 0.5 - GRID_MASK_PADDING.top;
    maskShape.fillRect(
      this.slotX - this.totalGridWidth * 0.5 - GRID_MASK_PADDING.left,
      maskY,
      this.totalGridWidth + GRID_MASK_PADDING.left + GRID_MASK_PADDING.right,
      this.totalGridHeight + GRID_MASK_PADDING.top + GRID_MASK_PADDING.bottom
    );

    const mask = maskShape.createGeometryMask();
    this.container.setMask(mask);
    maskShape.setVisible(false);

    console.log(`[SymbolGrid] Mask created with padding - Left: ${GRID_MASK_PADDING.left}, Right: ${GRID_MASK_PADDING.right}, Top: ${GRID_MASK_PADDING.top}, Bottom: ${GRID_MASK_PADDING.bottom}, Mask Y: ${maskY}`);
  }

  // ============================================================================
  // GRID ACCESS
  // ============================================================================

  /**
   * Get a symbol at the specified grid position
   */
  public getSymbol(col: number, row: number): SymbolObject | null {
    return this.symbols[col]?.[row] ?? null;
  }

  /**
   * Set a symbol at the specified grid position
   */
  public setSymbol(col: number, row: number, symbol: SymbolObject | null): void {
    if (!this.symbols[col]) {
      this.symbols[col] = [];
    }
    this.symbols[col][row] = symbol;
    
    // Update grid position tracking on the symbol
    if (symbol) {
      try {
        (symbol as any).__gridCol = col;
        (symbol as any).__gridRow = row;
      } catch { /* ignore */ }
    }
  }

  /**
   * Get the raw symbols array (for backward compatibility)
   */
  public getSymbolsArray(): (SymbolObject | null)[][] {
    return this.symbols;
  }

  /**
   * Set the raw symbols array (for backward compatibility)
   */
  public setSymbolsArray(symbols: (SymbolObject | null)[][]): void {
    this.symbols = symbols;
  }

  /**
   * Get the new symbols array (during drop animation)
   */
  public getNewSymbolsArray(): (SymbolObject | null)[][] {
    return this.newSymbols;
  }

  /**
   * Set the new symbols array
   */
  public setNewSymbolsArray(symbols: (SymbolObject | null)[][]): void {
    this.newSymbols = symbols;
  }

  /**
   * Clear the new symbols array
   */
  public clearNewSymbols(): void {
    this.newSymbols = [];
  }

  /**
   * Get current symbol data (row-major format)
   */
  public getSymbolData(): number[][] | null {
    return this.symbolData;
  }

  /**
   * Set current symbol data
   */
  public setSymbolData(data: number[][] | null): void {
    this.symbolData = data;
  }

  /**
   * Get the number of columns in the grid
   */
  public getColumnCount(): number {
    return this.symbols.length;
  }

  /**
   * Get the number of rows in the grid
   */
  public getRowCount(): number {
    return this.symbols[0]?.length ?? 0;
  }

  /**
   * Check if grid is initialized
   */
  public isInitialized(): boolean {
    return this.symbols.length > 0 && (this.symbols[0]?.length ?? 0) > 0;
  }

  // ============================================================================
  // POSITION CALCULATIONS
  // ============================================================================

  /**
   * Get the position configuration for symbol placement
   */
  public getPositionConfig(): SymbolPositionConfig {
    const symbolTotalWidth = this.displayWidth + this.horizontalSpacing;
    const symbolTotalHeight = this.displayHeight + this.verticalSpacing;
    const startX = this.slotX - this.totalGridWidth * 0.5;
    const startY = this.slotY - this.totalGridHeight * 0.5;

    return {
      displayWidth: this.displayWidth,
      displayHeight: this.displayHeight,
      horizontalSpacing: this.horizontalSpacing,
      verticalSpacing: this.verticalSpacing,
      slotX: this.slotX,
      slotY: this.slotY,
      totalGridWidth: this.totalGridWidth,
      totalGridHeight: this.totalGridHeight,
      symbolTotalWidth,
      symbolTotalHeight,
      startX,
      startY,
    };
  }

  /**
   * Calculate the center position for a grid cell
   */
  public calculateCellPosition(col: number, row: number): { x: number; y: number } {
    const config = this.getPositionConfig();
    return {
      x: config.startX + col * config.symbolTotalWidth + config.symbolTotalWidth * 0.5,
      y: config.startY + row * config.symbolTotalHeight + config.symbolTotalHeight * 0.5,
    };
  }

  /**
   * Calculate Y position for a specific row
   */
  public calculateRowY(row: number): number {
    const config = this.getPositionConfig();
    return config.startY + row * config.symbolTotalHeight + config.symbolTotalHeight * 0.5;
  }

  /**
   * Get the bounds of the symbol grid (for overlay positioning)
   */
  public getGridBounds(): GridBounds {
    const x = this.slotX - this.totalGridWidth * 0.5 - GRID_OVERLAY_PADDING.x + GRID_OVERLAY_PADDING.offsetX;
    const y = this.slotY - this.totalGridHeight * 0.5 - GRID_OVERLAY_PADDING.y + GRID_OVERLAY_PADDING.offsetY;
    
    return {
      x: x + GRID_OVERLAY_PADDING.offsetX,
      y: y + GRID_OVERLAY_PADDING.offsetY,
      width: this.totalGridWidth + (GRID_OVERLAY_PADDING.x * 2),
      height: this.totalGridHeight + (GRID_OVERLAY_PADDING.y * 2),
    };
  }

  // ============================================================================
  // ITERATION
  // ============================================================================

  /**
   * Iterate over all symbols in the grid
   */
  public forEachSymbol(callback: SymbolIteratorCallback): void {
    for (let col = 0; col < this.symbols.length; col++) {
      const column = this.symbols[col];
      if (!column) continue;
      
      for (let row = 0; row < column.length; row++) {
        const symbol = column[row];
        if (symbol) {
          callback(symbol as SymbolObject, col, row);
        }
      }
    }
  }

  /**
   * Find all symbols matching a condition
   */
  public findSymbols(predicate: (symbol: SymbolObject, col: number, row: number) => boolean): GridPosition[] {
    const results: GridPosition[] = [];
    
    this.forEachSymbol((symbol, col, row) => {
      if (predicate(symbol, col, row)) {
        results.push({ x: col, y: row });
      }
    });
    
    return results;
  }

  /**
   * Find all scatter symbols in the grid
   */
  public findScatterSymbols(): GridPosition[] {
    return this.findSymbols((symbol) => {
      const isScatterByValue = (symbol as any)?.symbolValue === 0;
      const isScatterByTexture = symbol.texture?.key === 'symbol_0';
      return isScatterByValue || isScatterByTexture;
    });
  }

  // ============================================================================
  // DEPTH MANAGEMENT
  // ============================================================================

  /**
   * Reset all symbol depths to default
   */
  public resetSymbolDepths(): void {
    let resetCount = 0;
    
    this.forEachSymbol((symbol) => {
      // Skip if symbol is destroyed or invalid
      if (!symbol || (symbol as any).destroyed) return;
      
      try {
        // Move symbol back to container if it's not already there
        if ((symbol as any).parentContainer !== this.container) {
          this.scene.children.remove(symbol as any);
          this.container.add(symbol as any);
        }
        
        if (typeof symbol.setDepth === 'function') {
          symbol.setDepth(DEPTH_SYMBOL_DEFAULT);
        }
        
        // Move overlay back to container if present
        try {
          const overlayObj = (symbol as any)?.__overlayImage;
          if (overlayObj && !overlayObj.destroyed) {
            this.scene.tweens.killTweensOf(overlayObj);
            if (overlayObj.parentContainer !== this.container) {
              this.scene.children.remove(overlayObj);
              this.container.add(overlayObj);
            }
            overlayObj.setDepth(1);
          }
        } catch { /* ignore */ }
      } catch { /* ignore */ }
      
      resetCount++;
    });
    
    console.log(`[SymbolGrid] Reset depths for ${resetCount} symbols`);
  }

  // ============================================================================
  // VISIBILITY
  // ============================================================================

  /**
   * Restore visibility for all symbols
   */
  public restoreVisibility(): void {
    if (this.container) {
      this.container.setAlpha(1);
    }
    
    let visibleCount = 0;
    this.forEachSymbol((symbol) => {
      if (typeof symbol.setVisible === 'function') {
        symbol.setVisible(true);
        visibleCount++;
      }
    });
    
    console.log(`[SymbolGrid] Restored visibility for ${visibleCount} symbols`);
  }

  /**
   * Force all symbols to be visible
   */
  public forceAllVisible(): void {
    this.forEachSymbol((symbol) => {
      if (typeof symbol.setVisible === 'function') {
        symbol.setVisible(true);
      }
    });
    
    if (this.container) {
      this.container.setAlpha(1);
      this.container.setVisible(true);
    }
  }

  /**
   * Hide all symbols
   */
  public hideAll(): void {
    if (this.container) {
      this.container.setAlpha(0);
    }
  }

  // ============================================================================
  // DISPOSAL
  // ============================================================================

  /**
   * Dispose of a 2D array of symbols
   */
  public disposeSymbolArray(symbolArray: (SymbolObject | null)[][]): void {
    if (!symbolArray || symbolArray.length === 0) return;
    
    let disposedCount = 0;
    
    for (const column of symbolArray) {
      if (!Array.isArray(column)) continue;
      
      for (const symbol of column) {
        if (!symbol) continue;
        
        try {
          // Destroy overlay image if present
          const overlayImage = (symbol as any)?.__overlayImage;
          if (overlayImage && typeof overlayImage.destroy === 'function' && !overlayImage.destroyed) {
            overlayImage.destroy();
          }
          
          // Destroy win text if present
          const winText = (symbol as any)?.__winText;
          if (winText && typeof winText.destroy === 'function' && !winText.destroyed) {
            winText.destroy();
          }
          
          // Destroy the symbol itself
          if (typeof symbol.destroy === 'function' && !symbol.destroyed) {
            symbol.destroy();
            disposedCount++;
          }
        } catch (error) {
          console.warn('[SymbolGrid] Error disposing symbol:', error);
        }
      }
    }
    
    if (disposedCount > 0) {
      console.log(`[SymbolGrid] Disposed ${disposedCount} symbols`);
    }
  }

  /**
   * Dispose of the current symbols and swap in new symbols
   */
  public swapInNewSymbols(): void {
    this.disposeSymbolArray(this.symbols);
    this.symbols = this.newSymbols;
    this.newSymbols = [];
  }

  /**
   * Clear all symbols from the grid
   */
  public clear(): void {
    this.disposeSymbolArray(this.symbols);
    this.symbols = [];
    this.symbolData = null;
  }
}
