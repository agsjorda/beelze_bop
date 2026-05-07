/**
 * SymbolFactory - Creates symbol objects (Spine and PNG sprites)
 * 
 * Responsibilities:
 * - Create Spine symbol animations
 * - Create PNG sprite fallbacks
 * - Handle symbol initialization with proper scaling
 */

import type { Game } from '../../scenes/Game';
import type { SpineAnimationListener, SymbolObject } from './types';
import { SymbolAnimations } from './SymbolAnimations';
import { MultiplierSymbols } from './MultiplierSymbols';
import type { SymbolOverlay } from './SymbolOverlay';
import { MULTIPLIER_VISUAL_SCALE } from './constants';
import { gameStateManager } from '../../../managers/GameStateManager';

/**
 * Factory for creating symbol objects
 */
export class SymbolFactory {
  private static readonly POOLED_HIDE_POSITION = -10000;
  private static readonly PREWARM_SPINE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7];
  private static readonly PREWARM_INSTANCES_PER_VALUE = 10;
  private scene: Game;
  private animations: SymbolAnimations;
  private displayWidth: number;
  private displayHeight: number;
  private container: Phaser.GameObjects.Container;
  private overlay: SymbolOverlay | null;
  private readonly spinePool = new Map<number, SymbolObject[]>();
  private readonly pngPool = new Map<number, SymbolObject[]>();

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
    this.prewarmPools();
  }

  private getPool(kind: 'spine' | 'png', value: number): SymbolObject[] {
    const poolMap = kind === 'spine' ? this.spinePool : this.pngPool;
    let pool = poolMap.get(value);
    if (!pool) {
      pool = [];
      poolMap.set(value, pool);
    }
    return pool;
  }

  private acquireFromPool(kind: 'spine' | 'png', value: number): SymbolObject | null {
    const pool = this.getPool(kind, value);
    while (pool.length > 0) {
      const pooled = pool.pop();
      if (pooled) {
        return pooled;
      }
    }
    return null;
  }

  private detachSymbol(obj: any): void {
    try { obj?.parentContainer?.remove?.(obj); } catch { /* ignore */ }
    try { this.scene.children.remove(obj); } catch { /* ignore */ }
  }

  private resetCommonSymbolState(obj: any, value: number, x: number, y: number, alpha: number): void {
    try { obj.symbolValue = value; } catch { /* ignore */ }
    try { obj.__pooled = false; } catch { /* ignore */ }
    try { obj.active = true; } catch { /* ignore */ }
    try { obj.setVisible?.(true); } catch { /* ignore */ }
    try { obj.setAlpha?.(alpha); } catch { /* ignore */ }
    try { obj.alpha = alpha; } catch { /* ignore */ }
    try { obj.clearTint?.(); } catch { /* ignore */ }
    try { obj.setPosition?.(x, y); } catch { /* ignore */ }
    try { obj.x = x; obj.y = y; } catch { /* ignore */ }
    try { obj.__gridCol = undefined; obj.__gridRow = undefined; } catch { /* ignore */ }
    try { obj.__bounceTween = null; } catch { /* ignore */ }
    try { obj.__winText = null; } catch { /* ignore */ }
    try {
      if (obj.parentContainer !== this.container) {
        this.detachSymbol(obj);
        this.container.add(obj);
      }
    } catch {
      try { this.container.add(obj); } catch { /* ignore */ }
    }
  }

  private prepareSpineSymbol(spineObj: any, value: number, x: number, y: number, alpha: number): SymbolObject {
    this.resetCommonSymbolState(spineObj, value, x, y, alpha);
    try { spineObj.setOrigin?.(0.5, 0.5); } catch { /* ignore */ }
    this.animations.fitSpineToSymbolBox(spineObj);
    this.playIdleAnimation(spineObj, value);
    return spineObj as SymbolObject;
  }

  private preparePngSymbol(sprite: any, value: number, x: number, y: number, alpha: number): SymbolObject {
    this.resetCommonSymbolState(sprite, value, x, y, alpha);
    try {
      sprite.displayWidth = this.displayWidth;
      sprite.displayHeight = this.displayHeight;
    } catch { /* ignore */ }
    return sprite as SymbolObject;
  }

  private prewarmPools(): void {
    for (const value of SymbolFactory.PREWARM_SPINE_VALUES) {
      for (let i = 0; i < SymbolFactory.PREWARM_INSTANCES_PER_VALUE; i++) {
        try {
          const created =
            this.instantiateSpineSymbol(value, SymbolFactory.POOLED_HIDE_POSITION, SymbolFactory.POOLED_HIDE_POSITION, 1)
            ?? this.instantiatePngSymbol(value, SymbolFactory.POOLED_HIDE_POSITION, SymbolFactory.POOLED_HIDE_POSITION, 1);
          this.releaseSymbol(created);
        } catch (error) {
          console.warn(`[SymbolFactory] Failed to prewarm symbol pool for value ${value}:`, error);
          break;
        }
      }
    }
  }

  public releaseSymbol(symbol: SymbolObject | null | undefined): void {
    const obj: any = symbol as any;
    if (!obj || obj.__pooled) return;

    const value = Number(obj.symbolValue);
    const kind = obj.__poolKind as 'spine' | 'png' | undefined;
    if (!Number.isFinite(value) || (kind !== 'spine' && kind !== 'png')) {
      try { if (!obj.destroyed && typeof obj.destroy === 'function') obj.destroy(); } catch { /* ignore */ }
      return;
    }

    try { this.scene.tweens.killTweensOf(obj); } catch { /* ignore */ }
    try {
      const overlayObj = obj.__overlayImage;
      if (overlayObj) {
        this.scene.tweens.killTweensOf(overlayObj);
        if (!overlayObj.destroyed && typeof overlayObj.destroy === 'function') {
          overlayObj.destroy();
        }
      }
      obj.__overlayImage = null;
    } catch { /* ignore */ }
    try {
      const listener: SpineAnimationListener | null = obj.__dropIdleListener ?? null;
      if (listener && obj.animationState?.removeListener) {
        obj.animationState.removeListener(listener);
      }
      obj.__dropIdleListener = null;
    } catch { /* ignore */ }
    try { obj.animationState?.clearTracks?.(); } catch { /* ignore */ }
    try { obj.skeleton?.setToSetupPose?.(); } catch { /* ignore */ }
    try { obj.disableInteractive?.(); } catch { /* ignore */ }
    try { obj.clearTint?.(); } catch { /* ignore */ }
    try { obj.setVisible?.(false); } catch { /* ignore */ }
    try { obj.active = false; } catch { /* ignore */ }
    try { obj.setAlpha?.(1); } catch { /* ignore */ }
    try { obj.__winText = null; } catch { /* ignore */ }
    try { obj.__bounceTween = null; } catch { /* ignore */ }
    try { obj.__gridCol = undefined; obj.__gridRow = undefined; } catch { /* ignore */ }

    this.detachSymbol(obj);
    try {
      obj.setPosition?.(SymbolFactory.POOLED_HIDE_POSITION, SymbolFactory.POOLED_HIDE_POSITION);
      obj.x = SymbolFactory.POOLED_HIDE_POSITION;
      obj.y = SymbolFactory.POOLED_HIDE_POSITION;
    } catch { /* ignore */ }
    try { obj.__pooled = true; } catch { /* ignore */ }

    this.getPool(kind, value).push(obj as SymbolObject);
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
    const pooled = this.acquireFromPool('spine', value);
    if (pooled) {
      return this.prepareSpineSymbol(pooled as any, value, x, y, alpha);
    }

    return this.instantiateSpineSymbol(value, x, y, alpha);
  }

  private instantiateSpineSymbol(
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
    try { spineObj.__poolKind = 'spine'; } catch { /* ignore */ }
    
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
    
    return this.prepareSpineSymbol(spineObj, value, x, y, alpha);
  }

  /**
   * Play idle animation with small desync so symbols do not look synchronized.
   */
  private playIdleAnimation(spineObj: any, value: number): void {
    try {
      const idleName = `Symbol${value}_BZ_idle`;
      
      const animState = spineObj.animationState;
      if (!animState || typeof animState.setAnimation !== 'function') {
        console.warn(`[SymbolFactory] No animation state for symbol ${value}`);
        return;
      }

      const idleEntry = animState.setAnimation(0, idleName, true);
      if (idleEntry) {
        const speedJitter = 0.95 + Math.random() * 0.1;
        if (typeof idleEntry.timeScale === 'number') {
          idleEntry.timeScale = speedJitter;
        }

        try {
          const duration = spineObj?.skeleton?.data?.findAnimation?.(idleName)?.duration;
          if (typeof duration === 'number' && duration > 0) {
            idleEntry.trackTime = Math.random() * duration;
          }
        } catch { /* ignore */ }

      } else {
        console.warn(`[SymbolFactory] Failed to set idle animation ${idleName} for symbol ${value}`);
      }
    } catch (err) {
      console.error(`[SymbolFactory] Error in playIdleAnimation for symbol ${value}:`, err);
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

    const pooled = this.acquireFromPool('spine', value);
    if (pooled) {
      const spineObj: any = pooled as any;
      this.resetCommonSymbolState(spineObj, value, x, y, alpha);
      try { spineObj.setOrigin?.(0.5, 0.5); } catch { /* ignore */ }
      this.animations.fitSpineToSymbolBox(spineObj);
      try {
        const baseX = (spineObj as any)?.scaleX ?? 1;
        const baseY = (spineObj as any)?.scaleY ?? 1;
        if (typeof spineObj.setScale === 'function') {
          spineObj.setScale(baseX * MULTIPLIER_VISUAL_SCALE, baseY * MULTIPLIER_VISUAL_SCALE);
        }
      } catch { /* ignore */ }
      const animState = spineObj.animationState;
      if (animState && typeof animState.setAnimation === 'function') {
        animState.setAnimation(0, idleName, true);
      }
      return spineObj as SymbolObject;
    }
    
    const spineKey = 'symbol_10_sugar_spine';
    const atlasKey = `${spineKey}-atlas`;
    
    // Check if add.spine exists
    if (typeof (this.scene.add as any).spine !== 'function') {
      return null;
    }
    
    try {
      const spineObj: any = (this.scene.add as any).spine(x, y, spineKey, atlasKey);
      if (!spineObj) return null;
      try { spineObj.__poolKind = 'spine'; } catch { /* ignore */ }
      
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
    const pooled = this.acquireFromPool('png', value);
    if (pooled) {
      return this.preparePngSymbol(pooled as any, value, x, y, alpha);
    }

    return this.instantiatePngSymbol(value, x, y, alpha);
  }

  private instantiatePngSymbol(
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
    try { (sprite as any).__poolKind = 'png'; } catch { /* ignore */ }
    
    sprite.displayWidth = this.displayWidth;
    sprite.displayHeight = this.displayHeight;
    sprite.setAlpha(alpha);
    
    // Store symbol value
    (sprite as any).symbolValue = value;
    
    return this.preparePngSymbol(sprite as any, value, x, y, alpha);
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
      // Return current symbol to pool
      this.releaseSymbol(currentSymbol);
      
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
    // Return Spine object to pool
    this.releaseSymbol(spineSymbol);
    
    // Create PNG replacement
    return this.createPngSymbol(symbolValue, x, y, 1);
  }
}
