/**
 * SymbolFactory - Creates symbol objects (Spine and PNG sprites)
 * 
 * Responsibilities:
 * - Create Spine symbol animations
 * - Create PNG sprite fallbacks
 * - Handle symbol initialization with proper scaling
 */

import type { Game } from '../../scenes/Game';
import type { SymbolObject } from './types';
import { SymbolAnimations } from './SymbolAnimations';
import { MultiplierSymbols } from './MultiplierSymbols';
import type { SymbolOverlay } from './SymbolOverlay';
import { MULTIPLIER_VISUAL_SCALE } from './constants';
import { gameStateManager } from '../../../managers/GameStateManager';

/**
 * Factory for creating symbol objects
 */
export class SymbolFactory {
  private scene: Game;
  private animations: SymbolAnimations;
  private displayWidth: number;
  private displayHeight: number;
  private container: Phaser.GameObjects.Container;
  private overlay: SymbolOverlay | null;

  constructor(
    scene: Game,
    animations: SymbolAnimations,
    displayWidth: number,
    displayHeight: number,
    container: Phaser.GameObjects.Container,
    overlay?: SymbolOverlay
  ) {
    this.scene = scene;
    this.animations = animations;
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
    this.container = container;
    this.overlay = overlay ?? null;
  }

  /**
   * Update the container reference (if container changes)
   */
  public setContainer(container: Phaser.GameObjects.Container): void {
    this.container = container;
  }

  public setOverlay(overlay: SymbolOverlay | null): void {
    this.overlay = overlay;
  }

  // ============================================================================
  // SYMBOL CREATION
  // ============================================================================

  /**
   * Create a sugar Spine symbol or PNG fallback
   * Handles symbols 0-9 (scatter and regular sugar symbols)
   */
  public createSugarOrPngSymbol(
    value: number,
    x: number,
    y: number,
    alpha: number = 1
  ): SymbolObject {
    let created: SymbolObject | null = null;

    // Try Spine for symbols 0-9
    if (value >= 0 && value <= 9) {
      try {
        const spineSymbol = this.createSpineSymbol(value, x, y, alpha);
        if (spineSymbol) {
          created = spineSymbol;
        }
      } catch (error) {
        console.warn(`[SymbolFactory] Failed to create Spine symbol ${value}, falling back to PNG:`, error);
        // Only fallback to PNG for 0-9
        created = this.createPngSymbol(value, x, y, alpha);
      }
      // If not returned, fallback to PNG for 0-9
      if (!created) {
        created = this.createPngSymbol(value, x, y, alpha);
      }
    }

    // Try multiplier symbols (10-22)
    if (!created && MultiplierSymbols.isMultiplier(value)) {
      try {
        const multiplierSymbol = this.createMultiplierSymbol(value, x, y, alpha);
        if (multiplierSymbol) {
          created = multiplierSymbol;
        }
      } catch (error) {
        console.warn(`[SymbolFactory] Failed to create multiplier symbol ${value}:`, error);
      }
      // Create a placeholder sprite if multiplier symbol creation failed
      if (!created) {
        console.warn(`[SymbolFactory] Creating placeholder for multiplier value ${value}`);
        created = this.createPlaceholderSymbol(value, x, y, alpha);
      }
    }

    // Fallback to PNG sprite for any other values (should not happen)
    if (!created) {
      created = this.createPngSymbol(value, x, y, alpha);
    }

    this.attachMultiplierOverlay(created, value, x, y);

    return created;
  }

  /**
   * Create a Spine symbol animation
   */
  private createSpineSymbol(
    value: number,
    x: number,
    y: number,
    alpha: number
  ): SymbolObject | null {
    const spineKey = `symbol_${value}_sugar_spine`;
    const atlasKey = `${spineKey}-atlas`;
    
    // Check if add.spine exists
    if (typeof (this.scene.add as any).spine !== 'function') {
      return null;
    }
    
    const spineObj: any = (this.scene.add as any).spine(x, y, spineKey, atlasKey);
    if (!spineObj) return null;
    
    // Set symbol value for tracking
    try { spineObj.symbolValue = value; } catch { /* ignore */ }
    
    // Set origin
    if (typeof spineObj.setOrigin === 'function') {
      spineObj.setOrigin(0.5, 0.5);
    }
    
    // Fit to symbol box
    this.animations.fitSpineToSymbolBox(spineObj);
    
    // Set alpha
    if (typeof spineObj.setAlpha === 'function') {
      spineObj.setAlpha(alpha);
    }
    
    // Play drop animation, then transition to idle
    this.playDropThenIdle(spineObj, value);
    
    // Add to container
    this.container.add(spineObj);
    
    return spineObj as SymbolObject;
  }

  /**
   * Play drop animation followed by idle
   */
  private playDropThenIdle(spineObj: any, value: number): void {
    try {
      // Animation names in BZ assets are lowercase: drop, idle
      const dropName = `Symbol${value}_BZ_drop`;
      const idleName = `Symbol${value}_BZ_idle`;
      
      const animState = spineObj.animationState;
      if (!animState || typeof animState.setAnimation !== 'function') {
        console.warn(`[SymbolFactory] No animation state for symbol ${value}`);
        return;
      }
      
      // Check if drop animation exists
      const hasDrop = !!spineObj?.skeleton?.data?.findAnimation?.(dropName);
      
      console.log(`[SymbolFactory] Symbol ${value}: dropName=${dropName}, idleName=${idleName}, hasDrop=${hasDrop}`);
      
      if (hasDrop) {
        animState.setAnimation(0, dropName, false);
        console.log(`[SymbolFactory] Playing drop animation: ${dropName}`);
        
        // Add listener to transition to idle
        if (animState.addListener) {
          const listener = {
            complete: (entry: any) => {
              try {
                if (!entry || entry.animation?.name !== dropName) return;
                
                console.log(`[SymbolFactory] Drop complete, transitioning to idle: ${idleName}`);
                // Transition to idle with random offset
                const idleEntry = animState.setAnimation(0, idleName, true);
                
                // Add speed jitter and random start offset
                const speedJitter = 0.95 + Math.random() * 0.1;
                if (idleEntry && typeof idleEntry.timeScale === 'number') {
                  idleEntry.timeScale = speedJitter;
                }
                
                // Random start time
                try {
                  const duration = spineObj?.skeleton?.data?.findAnimation?.(idleName)?.duration;
                  if (typeof duration === 'number' && duration > 0 && idleEntry) {
                    idleEntry.trackTime = Math.random() * duration;
                  }
                } catch { /* ignore */ }
                
                // Remove listener
                try {
                  if (animState.removeListener) {
                    animState.removeListener(listener);
                  }
                } catch { /* ignore */ }
              } catch { /* ignore */ }
            }
          };
          animState.addListener(listener);
        }
      } else {
        // No drop animation, just play idle
        console.log(`[SymbolFactory] No drop animation, playing idle directly: ${idleName}`);
        const idleEntry = animState.setAnimation(0, idleName, true);
        
        if (idleEntry) {
          // Add speed jitter
          const speedJitter = 0.95 + Math.random() * 0.1;
          if (typeof idleEntry.timeScale === 'number') {
            idleEntry.timeScale = speedJitter;
          }
          console.log(`[SymbolFactory] Idle animation set successfully for symbol ${value}`);
        } else {
          console.warn(`[SymbolFactory] Failed to set idle animation ${idleName} for symbol ${value}`);
        }
      }
    } catch (err) {
      console.error(`[SymbolFactory] Error in playDropThenIdle for symbol ${value}:`, err);
    }
  }

  /**
   * Create a multiplier symbol (values 10-22)
   */
  private createMultiplierSymbol(
    value: number,
    x: number,
    y: number,
    alpha: number
  ): SymbolObject | null {
    const idleName = MultiplierSymbols.getIdleAnimationName(value);
    if (!idleName) return null;
    
    const spineKey = 'symbol_10_sugar_spine';
    const atlasKey = `${spineKey}-atlas`;
    
    // Check if add.spine exists
    if (typeof (this.scene.add as any).spine !== 'function') {
      return null;
    }
    
    try {
      const spineObj: any = (this.scene.add as any).spine(x, y, spineKey, atlasKey);
      if (!spineObj) return null;
      
      // Set symbol value
      try { spineObj.symbolValue = value; } catch { /* ignore */ }
      
      // Set origin
      if (typeof spineObj.setOrigin === 'function') {
        spineObj.setOrigin(0.5, 0.5);
      }
      
      // Fit to symbol box then apply multiplier visual boost
      this.animations.fitSpineToSymbolBox(spineObj);
      try {
        const baseX = (spineObj as any)?.scaleX ?? 1;
        const baseY = (spineObj as any)?.scaleY ?? 1;
        if (typeof spineObj.setScale === 'function') {
          spineObj.setScale(baseX * MULTIPLIER_VISUAL_SCALE, baseY * MULTIPLIER_VISUAL_SCALE);
        }
      } catch { /* ignore */ }
      
      // Set alpha
      if (typeof spineObj.setAlpha === 'function') {
        spineObj.setAlpha(alpha);
      }
      
      // Play idle animation
      const animState = spineObj.animationState;
      if (animState && typeof animState.setAnimation === 'function') {
        animState.setAnimation(0, idleName, true);
      }
      
      // Add to container
      this.container.add(spineObj);
      
      return spineObj as SymbolObject;
    } catch {
      return null;
    }
  }

  /**
   * Create a placeholder symbol (colored rectangle with value text)
   */
  private createPlaceholderSymbol(
    value: number,
    x: number,
    y: number,
    alpha: number = 1
  ): SymbolObject {
    // Create a container for the placeholder
    const container = this.scene.add.container(x, y);
    
    // Create a colored rectangle as background
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(0x333333, alpha);
    graphics.fillRect(-this.displayWidth / 2, -this.displayHeight / 2, this.displayWidth, this.displayHeight);
    graphics.lineStyle(2, 0x666666, alpha);
    graphics.strokeRect(-this.displayWidth / 2, -this.displayHeight / 2, this.displayWidth, this.displayHeight);
    container.add(graphics);
    
    // Add value text
    const text = this.scene.add.text(0, 0, `M${value}`, {
      fontSize: '24px',
      fontFamily: 'Poppins-Bold',
      color: '#ffffff'
    });
    text.setOrigin(0.5, 0.5);
    container.add(text);
    
    // Store symbol value
    (container as any).symbolValue = value;
    
    // Add to main container
    this.container.add(container);
    
    return container as any as SymbolObject;
  }

  /**
   * Create a PNG sprite symbol
   */
  public createPngSymbol(
    value: number,
    x: number,
    y: number,
    alpha: number = 1
  ): SymbolObject {
    const spriteKey = `symbol_${value}`;
    
    // Check if texture exists
    if (!this.scene.textures.exists(spriteKey)) {
      throw new Error(`[SymbolFactory] Texture '${spriteKey}' not found`);
    }
    const sprite = this.scene.add.sprite(x, y, spriteKey);
    
    sprite.displayWidth = this.displayWidth;
    sprite.displayHeight = this.displayHeight;
    sprite.setAlpha(alpha);
    
    // Store symbol value
    (sprite as any).symbolValue = value;
    
    // Add to container
    this.container.add(sprite);
    
    return sprite as SymbolObject;
  }

  private attachMultiplierOverlay(symbol: SymbolObject, value: number, x: number, y: number): void {
    if (!this.overlay || !symbol) return;
    try {
      this.overlay.attachMultiplierOverlay(symbol, value, x, y, this.displayWidth, this.container);
    } catch { /* ignore */ }
  }

  // ============================================================================
  // SYMBOL REPLACEMENT
  // ============================================================================

  /**
   * Replace a symbol with a Spine animation (for win animations)
   */
  public replaceWithSpineAnimation(
    currentSymbol: SymbolObject,
    symbolValue: number,
    col: number,
    row: number
  ): SymbolObject | null {
    // Don't replace scatter (0) or multipliers (10-21) - keep as PNG
    if (symbolValue === 0 || (symbolValue >= 10 && symbolValue <= 21)) {
      return null;
    }
    
    const x = currentSymbol.x;
    const y = currentSymbol.y;
    
    const spineKey = `symbol_${symbolValue}_spine`;
    const atlasKey = `${spineKey}-atlas`;
    
    try {
      console.log(`[SymbolFactory] Replacing sprite with Spine: ${spineKey} at (${col}, ${row})`);
      
      // Destroy current symbol
      if (currentSymbol.destroy) {
        currentSymbol.destroy();
      }
      
      // Create Spine animation
      if (typeof (this.scene.add as any).spine !== 'function') {
        return null;
      }
      
      const spineSymbol: any = (this.scene.add as any).spine(x, y, spineKey, atlasKey);
      if (!spineSymbol) return null;
      
      // Set properties
      try { spineSymbol.symbolValue = symbolValue; } catch { /* ignore */ }
      
      if (typeof spineSymbol.setOrigin === 'function') {
        spineSymbol.setOrigin(0.5, 0.5);
      }
      
      // Apply configured scale
      const scale = this.animations.getSpineSymbolScale(symbolValue);
      if (typeof spineSymbol.setScale === 'function') {
        spineSymbol.setScale(scale);
      }
      
      // Schedule scale-up effect
      // this.animations.scheduleScaleUp(spineSymbol, 500);
      
      // Add to container
      this.container.add(spineSymbol);
      
      console.log(`[SymbolFactory] Successfully replaced at (${col}, ${row})`);
      
      return spineSymbol as SymbolObject;
    } catch (error) {
      console.warn(`[SymbolFactory] Failed to replace at (${col}, ${row}):`, error);
      
      // Fallback: recreate as static symbol
      try {
        const recreated = this.createPngSymbol(symbolValue, x, y, 1);
        return recreated;
      } catch {
        return null;
      }
    }
  }

  /**
   * Convert a Spine symbol back to PNG
   */
  public convertSpineToPng(
    spineSymbol: SymbolObject,
    symbolValue: number,
    x: number,
    y: number
  ): SymbolObject {
    // Destroy Spine object
    if (spineSymbol.destroy) {
      spineSymbol.destroy();
    }
    
    // Create PNG replacement
    return this.createPngSymbol(symbolValue, x, y, 1);
  }
}
