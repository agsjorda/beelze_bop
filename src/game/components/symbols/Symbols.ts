/**
 * Symbols - Main orchestrator class for the symbol grid system
 * 
 * This class maintains the same public API as the original implementation
 * but delegates to specialized modules for cleaner organization.
 * 
 * Architecture:
 * - SymbolGrid: Manages the 2D grid of symbols
 * - SymbolFactory: Creates symbol objects (Spine/PNG)
 * - SymbolAnimations: Handles animations and tweens
 * - SymbolOverlay: Manages overlays and win text
 * - FreeSpinController: Manages free spin autoplay
 * - MultiplierSymbols: Utility for multiplier symbols
 * 
 * For new code, prefer importing specific modules directly:
 * @example
 * import { SymbolGrid, MultiplierSymbols } from './symbols';
 */

import { Data } from '../../../tmp_backend/Data';
import { Game } from '../../scenes/Game';
import { GameData, setSpeed, pauseAutoplayForWinlines, resumeAutoplayAfterWinlines } from '../GameData';
import { ScatterAnimationManager } from '../../../managers/ScatterAnimationManager';
import { SymbolDetector, Grid, Wins } from '../../../tmp_backend/SymbolDetector';
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { gameStateManager } from '../../../managers/GameStateManager';
import { TurboConfig } from '../../../config/TurboConfig';
import { SLOT_ROWS, SLOT_COLUMNS, DELAY_BETWEEN_SPINS, MULTIPLIER_SYMBOLS } from '../../../config/GameConfig';
import { SoundEffectType } from '../../../managers/AudioManager';

// Import new modular components
import { SymbolGrid } from './SymbolGrid';
import { SymbolAnimations } from './SymbolAnimations';
import { SymbolFactory } from './SymbolFactory';
import { SymbolOverlay } from './SymbolOverlay';
import { FreeSpinController } from './FreeSpinController';
import { MultiplierSymbols } from './MultiplierSymbols';
import type { 
  SymbolObject, 
  GridPosition, 
  PendingFreeSpinsData,
  PendingScatterRetrigger,
  TumbleData,
} from './types';
import {
  FILLER_COUNT,
  SPINE_SYMBOL_SCALES,
  DEFAULT_SPINE_SCALE,
  SPINE_SCALE_ADJUSTMENT,
  SCATTER_TRIGGER_COUNT,
  SCATTER_RETRIGGER_COUNT,
  SCATTER_SYMBOL_ID,
  WIN_DIALOG_THRESHOLD_MULTIPLIER,
  INITIAL_SYMBOLS,
  DEPTH_WINNING_SYMBOL,
  SCATTER_ANIMATION_SCALE,
  SCATTER_GATHER_SCALE,
  SCATTER_RETRIGGER_SCALE,
  SCATTER_GATHER_DURATION_MS,
  SCATTER_SHRINK_DURATION_MS,
  SCATTER_MOVE_DURATION_MS,
} from './constants';

/**
 * Main Symbols class - orchestrates the symbol grid system
 * 
 * This class maintains backward compatibility with the original API
 * while using the new modular architecture internally.
 */
export class Symbols {
  // ============================================================================
  // STATIC PROPERTIES (Backward Compatibility)
  // ============================================================================
  
  private static readonly WINLINE_CHECKING_DISABLED: boolean = true;
  public static FILLER_COUNT: number = FILLER_COUNT;

  // ============================================================================
  // INTERNAL MODULES
  // ============================================================================
  
  private grid!: SymbolGrid;
  private animationsModule!: SymbolAnimations;
  private factory!: SymbolFactory;
  private overlayModule!: SymbolOverlay;
  private freeSpinController!: FreeSpinController;

  // ============================================================================
  // LEGACY PUBLIC PROPERTIES (Maintained for backward compatibility)
  // ============================================================================
  
  public reelCount: number = 0;
  public scene!: Game;
  public scatterAnimationManager: ScatterAnimationManager;
  public symbolDetector: SymbolDetector;
  public winLineDrawer: any | null = null;
  public currentSpinData: any = null;
  
  // Expose grid properties for backward compatibility
  public get container(): Phaser.GameObjects.Container {
    return this.grid?.container;
  }
  public get displayWidth(): number {
    return this.grid?.displayWidth ?? 62;
  }
  public get displayHeight(): number {
    return this.grid?.displayHeight ?? 62;
  }
  public get horizontalSpacing(): number {
    return this.grid?.horizontalSpacing ?? 9;
  }
  public get verticalSpacing(): number {
    return this.grid?.verticalSpacing ?? 4;
  }
  public get slotX(): number {
    return this.grid?.slotX ?? 0;
  }
  public get slotY(): number {
    return this.grid?.slotY ?? 0;
  }
  public get totalGridWidth(): number {
    return this.grid?.totalGridWidth ?? 0;
  }
  public get totalGridHeight(): number {
    return this.grid?.totalGridHeight ?? 0;
  }
  
  // Symbol arrays - delegate to grid
  public get symbols(): any[][] {
    return this.grid?.getSymbolsArray() ?? [];
  }
  public set symbols(value: any[][]) {
    this.grid?.setSymbolsArray(value);
  }
  public get newSymbols(): any[][] {
    return this.grid?.getNewSymbolsArray() ?? [];
  }
  public set newSymbols(value: any[][]) {
    this.grid?.setNewSymbolsArray(value);
  }
  public get currentSymbolData(): number[][] | null {
    return this.grid?.getSymbolData() ?? null;
  }
  public set currentSymbolData(value: number[][] | null) {
    this.grid?.setSymbolData(value);
  }

  // ============================================================================
  // STATE TRACKING
  // ============================================================================
  
  private hadWinsInCurrentItem: boolean = false;
  private multiplierAnimationsInProgress: boolean = false;
  private scatterRetriggerAnimationInProgress: boolean = false;
  private pendingScatterRetrigger: PendingScatterRetrigger | null = null;
  private transitionBzOverlay: any | null = null;
  private mergedScatterSymbols: SymbolObject[] | null = null;
  private scatterResetInProgress: boolean = false;
  private dialogListenerSetup: boolean = false;
  
  // Free spin autoplay state - delegate to controller
  public get freeSpinAutoplayActive(): boolean {
    return this.freeSpinController?.isActive ?? false;
  }
  public set freeSpinAutoplayActive(value: boolean) {
    // Legacy setter - controller manages this internally
  }
  public get freeSpinAutoplaySpinsRemaining(): number {
    return this.freeSpinController?.getSpinsRemaining() ?? 0;
  }

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor() {
    this.scatterAnimationManager = ScatterAnimationManager.getInstance();
    this.symbolDetector = new SymbolDetector();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the symbols system
   */
  public create(scene: Game): void {
    this.scene = scene;
    this.winLineDrawer = null;
    
    // Initialize modules
    this.grid = new SymbolGrid(scene);
    this.animationsModule = new SymbolAnimations(
      scene,
      this.grid.displayWidth,
      this.grid.displayHeight
    );
    this.factory = new SymbolFactory(
      scene,
      this.animationsModule,
      this.grid.displayWidth,
      this.grid.displayHeight,
      this.grid.container
    );
    this.overlayModule = new SymbolOverlay(scene);
    this.freeSpinController = new FreeSpinController(scene);
    
    // Set up controller callbacks
    this.freeSpinController.setCallbacks({
      onResetScatterSymbols: () => this.resetScatterSymbolsToGrid(),
      onShowCongratsDialog: () => this.showCongratsDialogAfterDelay(),
      onSetTurboMode: (enabled) => this.setTurboMode(enabled),
      getCurrentSpinData: () => this.currentSpinData,
    });
    
    // Set up event listeners
    this.setupSpinEventListener();
    this.setupDialogEventListeners();
    this.freeSpinController.setupEventListeners();
    
    // Listen for START event
    gameEventManager.on(GameEventType.START, () => {
      console.log('[Symbols] START event received, creating initial symbols...');
      this.createInitialSymbols();
    });
    
    // Listen for SPIN_DATA_RESPONSE
    gameEventManager.on(GameEventType.SPIN_DATA_RESPONSE, async (data: any) => {
      console.log('[Symbols] SPIN_DATA_RESPONSE received');
      if (!data.spinData?.slot?.area) {
        console.error('[Symbols] Invalid SpinData received - missing slot.area');
        return;
      }
      this.currentSpinData = data.spinData;
      await this.processSpinData(data.spinData);
    });
    
    // Listen for REELS_STOP
    gameEventManager.on(GameEventType.REELS_STOP, () => {
      console.log('[Symbols] REELS_STOP event received');
      if (this.scatterAnimationManager?.isAnimationInProgress()) {
        console.log('[Symbols] REELS_STOP during scatter bonus - not triggering new spin');
        return;
      }
    });
    
    // Listen for reset
    this.scene.events.on('resetFreeSpinState', () => {
      console.log('[Symbols] resetFreeSpinState received');
      this.freeSpinController.reset();
      this.dialogListenerSetup = false;
    });
    
    // Create overlay
    this.overlayModule.createOverlayRect(this.grid.getGridBounds());
  }

  // ============================================================================
  // SPIN EVENT HANDLING
  // ============================================================================

  private setupSpinEventListener(): void {
    gameEventManager.on(GameEventType.SPIN, () => {
      console.log('[Symbols] Spin event detected, ensuring clean state');
      
      if (gameStateManager.isShowingWinDialog && gameStateManager.isAutoPlaying) {
        console.log('[Symbols] Autoplay SPIN blocked - win dialog showing');
        return;
      }
      
      if (this.scatterAnimationManager?.isAnimationInProgress()) {
        console.log('[Symbols] WARNING: SPIN during scatter bonus');
        return;
      }
      
      this.multiplierAnimationsInProgress = false;
      this.scatterRetriggerAnimationInProgress = false;
      this.ensureCleanSymbolState();
      this.hideWinningOverlay();
      this.resetSymbolDepths();
      this.restoreSymbolVisibility();
    });
  }

  private setupDialogEventListeners(): void {
    // Enable symbols after dialog
    this.scene.events.on('enableSymbols', () => {
      console.log('[Symbols] Re-enabling symbols after dialog');
      this.grid.restoreVisibility();
      this.resetSymbolsState();
    });

    // Scatter bonus activated
    this.scene.events.on('scatterBonusActivated', (data: PendingFreeSpinsData) => {
      console.log(`[Symbols] Scatter bonus activated: ${data.actualFreeSpins} free spins`);
      this.freeSpinController.setPendingFreeSpinsData(data);
    });

    // Scatter bonus completed
    this.scene.events.on('scatterBonusCompleted', () => {
      console.log('[Symbols] Scatter bonus completed');
      this.restoreSymbolVisibility();
      this.ensureScatterSymbolsVisible();
      
      if (this.dialogListenerSetup) {
        return;
      }
      this.dialogListenerSetup = true;

      const triggerAutoplay = () => {
        console.log('[Symbols] Triggering free spin autoplay');
        this.scene.time.delayedCall(1000, () => {
          this.freeSpinController.triggerAutoplay();
        });
      };

      let dialogShowing = false;
      try {
        const gameSceneAny: any = this.scene as any;
        const dialogs = gameSceneAny?.dialogs;
        dialogShowing = !!(dialogs && typeof dialogs.isDialogShowing === 'function' && dialogs.isDialogShowing());
      } catch { /* ignore */ }

      if (dialogShowing || gameStateManager.isShowingWinDialog) {
        this.scene.events.once('dialogAnimationsComplete', () => {
          console.log('[Symbols] Dialog complete - triggering free spin autoplay');
          triggerAutoplay();
        });
      } else {
        triggerAutoplay();
      }
    });

    // WIN_STOP - handle scatter retrigger
    gameEventManager.on(GameEventType.WIN_STOP, async () => {
      if (gameStateManager.isBonus && this.pendingScatterRetrigger?.scatterGrids) {
        const retrigger = this.pendingScatterRetrigger;
        this.pendingScatterRetrigger = null;
        console.log('[Symbols] WIN_STOP: Running scatter retrigger sequence');
        
        this.scatterRetriggerAnimationInProgress = true;
        try {
          const liveGrids = this.getLiveScatterGrids();
          await this.playScatterRetriggerSequence(liveGrids);
          gameEventManager.emit(GameEventType.SCATTER_RETRIGGER_ANIMATION_COMPLETE);
        } catch (e) {
          console.warn('[Symbols] Retrigger sequence failed:', e);
          gameEventManager.emit(GameEventType.SCATTER_RETRIGGER_ANIMATION_COMPLETE);
        }
        
        try {
          this.scatterAnimationManager?.showRetriggerFreeSpinsDialog(5);
        } catch (e) {
          console.warn('[Symbols] Failed to show retrigger dialog:', e);
          this.scatterRetriggerAnimationInProgress = false;
        }
        
        this.scene.events.once('dialogAnimationsComplete', () => {
          this.scatterRetriggerAnimationInProgress = false;
          this.freeSpinController.waitForAllDialogsToCloseThenResume();
        });
        return;
      }
    });

    // WIN_DIALOG_CLOSED
    gameEventManager.on(GameEventType.WIN_DIALOG_CLOSED, () => {
      console.log('[Symbols] WIN_DIALOG_CLOSED');
      gameStateManager.isShowingWinDialog = false;
      
      if (gameStateManager.isBonusFinished) {
        if (this.multiplierAnimationsInProgress) {
          gameEventManager.once(GameEventType.MULTIPLIER_ANIMATIONS_COMPLETE, () => {
            this.showCongratsDialogAfterDelay();
            gameStateManager.isBonusFinished = false;
          });
        } else {
          this.showCongratsDialogAfterDelay();
          gameStateManager.isBonusFinished = false;
        }
      }
    });

    // Track multiplier animations
    gameEventManager.on(GameEventType.MULTIPLIERS_TRIGGERED, () => {
      this.multiplierAnimationsInProgress = true;
    });
    
    gameEventManager.on(GameEventType.MULTIPLIER_ANIMATIONS_COMPLETE, () => {
      this.multiplierAnimationsInProgress = false;
    });
  }

  // ============================================================================
  // PUBLIC METHODS (Backward Compatibility API)
  // ============================================================================

  public setPendingScatterRetrigger(scatterGrids: GridPosition[]): void {
    this.pendingScatterRetrigger = { scatterGrids };
    try {
      if (gameStateManager.isBonusFinished) {
        console.log('[Symbols] Retrigger scheduled - clearing isBonusFinished flag');
      }
      gameStateManager.isBonusFinished = false;
    } catch { /* ignore */ }
  }

  public hasPendingScatterRetrigger(): boolean {
    return !!(this.pendingScatterRetrigger?.scatterGrids?.length);
  }

  public isMultiplierAnimationsInProgress(): boolean {
    return this.multiplierAnimationsInProgress;
  }

  public isScatterRetriggerAnimationInProgress(): boolean {
    return this.scatterRetriggerAnimationInProgress;
  }

  public setFreeSpinAutoplaySpinsRemaining(spinsRemaining: number): void {
    this.freeSpinController.setSpinsRemaining(spinsRemaining);
  }

  public getSpineSymbolScale(symbolValue: number): number {
    return this.animationsModule.getSpineSymbolScale(symbolValue);
  }

  public restoreSymbolVisibility(): void {
    this.grid.restoreVisibility();
  }

  public stopAllSpineAnimations(): void {
    this.animationsModule.stopAllSpineAnimations(this.symbols);
  }

  public stopAllSymbolAnimations(): void {
    this.animationsModule.stopAllSymbolAnimations(this.symbols, this.container);
  }

  public ensureScatterSymbolsVisible(): void {
    const scatters = this.grid.findScatterSymbols();
    for (const pos of scatters) {
      const symbol = this.grid.getSymbol(pos.x, pos.y);
      if (symbol?.setVisible) {
        symbol.setVisible(true);
      }
    }
    console.log(`[Symbols] Made ${scatters.length} scatter symbols visible`);
  }

  public forceAllSymbolsVisible(): void {
    this.grid.forceAllVisible();
  }

  public resetSpineSymbolsToPNG(): void {
    // Delegate to factory for each symbol
    const symbolData = this.currentSymbolData;
    if (!symbolData) return;
    
    this.grid.forEachSymbol((symbol, col, row) => {
      if ((symbol as any).animationState) {
        const value = symbolData[row]?.[col];
        if (value !== undefined) {
          const pos = this.grid.calculateCellPosition(col, row);
          const pngSymbol = this.factory.convertSpineToPng(symbol, value, pos.x, pos.y);
          this.grid.setSymbol(col, row, pngSymbol);
        }
      }
    });
  }

  public resetSymbolsState(): void {
    this.grid.forEachSymbol((symbol) => {
      if (symbol && symbol.active !== false) {
        if (typeof (symbol as any).clearTint === 'function') {
          (symbol as any).clearTint();
        }
        if (typeof (symbol as any).setBlendMode === 'function') {
          (symbol as any).setBlendMode(Phaser.BlendModes.NORMAL);
        }
        if (typeof symbol.setAlpha === 'function') {
          symbol.setAlpha(1);
        }
      }
    });
  }

  public resumeIdleAnimationsForAllSymbols(): void {
    this.animationsModule.resumeIdleAnimationsForAllSymbols(this.symbols);
  }

  public showWinLines(data: Data): void {
    // Win lines disabled in this game
  }

  public clearWinLines(): void {
    // Win lines disabled in this game
  }

  public hasCurrentWins(): boolean {
    return this.overlayModule.isOverlayVisible();
  }

  public showWinningOverlay(): void {
    this.overlayModule.showOverlay();
  }

  public hideWinningOverlay(): void {
    this.overlayModule.hideOverlay();
  }

  public moveWinningSymbolsToFront(data: Data): void {
    if (!data.wins?.allMatching?.size) return;
    
    for (const grids of data.wins.allMatching.values()) {
      for (const grid of grids) {
        const symbol = this.grid.getSymbol(grid.y, grid.x);
        if (symbol && !symbol.destroyed) {
          this.overlayModule.moveSymbolToFront(symbol, this.container);
        }
      }
    }
  }

  public resetSymbolDepths(): void {
    this.grid.resetSymbolDepths();
  }

  public moveScatterSymbolsToFront(data: Data, scatterGrids: GridPosition[]): void {
    for (const grid of scatterGrids) {
      const symbol = this.grid.getSymbol(grid.y, grid.x);
      if (symbol) {
        this.overlayModule.moveSymbolToFront(symbol, this.container);
      }
    }
  }

  public startScatterAnimationSequence(mockData: any): void {
    console.log('[Symbols] Starting scatter animation sequence');
    this.hideWinningOverlay();
    this.clearWinLines();
    this.scatterAnimationManager?.setConfig({ scatterRevealDelay: 300 });
    this.scatterAnimationManager?.playScatterAnimation(mockData);
  }

  public hideAllSymbols(): void {
    this.grid.hideAll();
  }

  public hideScatterSymbols(scatterGrids: GridPosition[]): void {
    for (const grid of scatterGrids) {
      const symbol = this.grid.getSymbol(grid.y, grid.x);
      if (symbol?.setVisible) {
        symbol.setVisible(false);
      }
    }
  }

  public setTurboMode(isEnabled: boolean): void {
    // Win line drawer not used
    console.log(`[Symbols] Turbo mode ${isEnabled ? 'enabled' : 'disabled'}`);
  }

  public resetWinlineTiming(): void {
    // Win line drawer not used
  }

  public ensureSymbolsVisibleAfterAutoplayStop(): void {
    this.grid.forceAllVisible();
    this.hideWinningOverlay();
  }

  public isFreeSpinAutoplayActive(): boolean {
    return this.freeSpinController.isActive;
  }

  public async processSpinData(spinData: any): Promise<void> {
    console.log('[Symbols] Processing spin data');
    
    if (!spinData?.slot?.area) {
      console.error('[Symbols] Invalid SpinData');
      return;
    }
    
    this.currentSpinData = spinData;
    this.hadWinsInCurrentItem = false;
    
    // Clear previous state
    this.scatterAnimationManager?.clearScatterSymbols();
    this.ensureCleanSymbolState();
    this.resetSymbolsState();
    this.clearWinLines();
    this.hideWinningOverlay();
    
    // Only reset depths if we have symbols
    if (this.symbols && this.symbols.length > 0 && this.symbols[0] && this.symbols[0].length > 0) {
      this.resetSymbolDepths();
    }
    
    this.restoreSymbolVisibility();
    
    // Process symbols
    const symbols = spinData.slot.area;
    await this.processSpinDataSymbols(symbols, spinData);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private createInitialSymbols(): void {
    const initialData = INITIAL_SYMBOLS;
    this.grid.setSymbolData(initialData as number[][]);
    
    const symbolTotalWidth = this.displayWidth + this.horizontalSpacing;
    const symbolTotalHeight = this.displayHeight + this.verticalSpacing;
    const startX = this.slotX - this.totalGridWidth * 0.5;
    const startY = this.slotY - this.totalGridHeight * 0.5;
    
    const rowCount = initialData.length;
    const colCount = initialData[0].length;
    
    const symbolsArray: SymbolObject[][] = [];
    
    for (let col = 0; col < colCount; col++) {
      const rows: SymbolObject[] = [];
      for (let row = 0; row < rowCount; row++) {
        // Center the symbols by adding half width/height
        const x = startX + col * symbolTotalWidth + symbolTotalWidth * 0.5;
        const y = startY + row * symbolTotalHeight + symbolTotalHeight * 0.5;
        const value = initialData[row][col];
        const created = this.factory.createSugarOrPngSymbol(value, x, y, 1);
        rows.push(created);
      }
      symbolsArray.push(rows);
    }
    
    // Set the whole array at once
    this.symbols = symbolsArray;
    
    console.log('[Symbols] Initial symbols created');
  }

  private ensureCleanSymbolState(): void {
    this.grid.forEachSymbol((symbol) => {
      if ((symbol as any).animationState) {
        try {
          const pausedInfo = (symbol as any).__pausedMultiplierWin;
          if (pausedInfo) {
            const animState = (symbol as any).animationState;
            if (animState.clearTracks) animState.clearTracks();
            const base = pausedInfo?.base;
            if (base && animState.setAnimation) {
              animState.setAnimation(0, `${base}_Idle`, true);
            }
            delete (symbol as any).__pausedMultiplierWin;
          } else if ((symbol as any).animationState.clearTracks) {
            (symbol as any).animationState.clearTracks();
          }
        } catch { /* ignore */ }
      }
    });
  }

  private getLiveScatterGrids(): GridPosition[] {
    return this.grid.findScatterSymbols();
  }

  private async resetScatterSymbolsToGrid(): Promise<void> {
    if (this.scatterResetInProgress) {
      return;
    }
    this.scatterResetInProgress = true;
    const tweenPromises: Promise<void>[] = [];
    const shrinkDuration = SCATTER_SHRINK_DURATION_MS;
    const moveDuration = SCATTER_MOVE_DURATION_MS;

    this.grid.forEachSymbol((symbol, col, row) => {
      const isScatter = (symbol as any)?.symbolValue === SCATTER_SYMBOL_ID || symbol.texture?.key === 'symbol_0';
      if (!isScatter) return;

      this.scene.tweens.killTweensOf(symbol);

      try {
        this.overlayModule.resetSymbolDepth(symbol, this.container);
      } catch {}

      const targetPos = this.grid.calculateCellPosition(col, row);
      let targetScaleX = 1;
      let targetScaleY = 1;
      const baseScaleX = Number((symbol as any).__scatterBaseScaleX);
      const baseScaleY = Number((symbol as any).__scatterBaseScaleY);
      const hasBaseScale = isFinite(baseScaleX) && isFinite(baseScaleY) && baseScaleX > 0 && baseScaleY > 0;

      const animState = (symbol as any)?.animationState;
      if (animState && typeof animState.setAnimation === 'function') {
        try {
          const idleName = `Symbol${SCATTER_SYMBOL_ID}_BZ_idle`;
          const entry = animState.setAnimation(0, idleName, true);
          if (entry && typeof (entry as any).timeScale === 'number') {
            (entry as any).timeScale = 1;
          }
          if (typeof animState.timeScale === 'number') {
            animState.timeScale = 1;
          }
        } catch {}
        const fallbackScale = this.getSpineSymbolScale(SCATTER_SYMBOL_ID);
        targetScaleX = hasBaseScale ? baseScaleX : fallbackScale;
        targetScaleY = hasBaseScale ? baseScaleY : fallbackScale;
      } else {
        try {
          const baseWidth = (symbol as any).width || this.displayWidth;
          const fallbackScale = baseWidth > 0 ? (this.displayWidth / baseWidth) : 1;
          targetScaleX = hasBaseScale ? baseScaleX : fallbackScale;
          targetScaleY = hasBaseScale ? baseScaleY : fallbackScale;
        } catch {}
      }

      tweenPromises.push(new Promise<void>((resolve) => {
        try {
          if (typeof (symbol as any)?.setAlpha === 'function') {
            (symbol as any).setAlpha(0);
          } else if (typeof (symbol as any)?.alpha === 'number') {
            (symbol as any).alpha = 0;
          }
        } catch {}
        this.scene.tweens.add({
          targets: symbol,
          scaleX: targetScaleX,
          scaleY: targetScaleY,
          x: targetPos.x,
          y: targetPos.y,
          duration: Math.max(shrinkDuration, moveDuration),
          ease: 'Sine.easeInOut',
          onComplete: () => resolve()
        });

        try {
          this.scene.tweens.add({
            targets: symbol,
            alpha: 1,
            duration: Math.max(shrinkDuration, moveDuration),
            ease: 'Sine.easeInOut'
          });
        } catch {}
      }));
    });

    await Promise.all(tweenPromises);
    this.scatterResetInProgress = false;
  }

  private async playScatterRetriggerSequence(scatterGrids: GridPosition[]): Promise<void> {
    if (!scatterGrids.length) return;
    
    console.log(`[Symbols] Playing retrigger sequence for ${scatterGrids.length} scatters`);
    
    const winAnimName = 'Symbol0_BZ_win';
    const idleAnimName = 'Symbol0_BZ_idle';
    
    const tweenPromises = scatterGrids.map((grid) => {
      return new Promise<void>((resolve) => {
        const symbol = this.grid.getSymbol(grid.x, grid.y);
        if (!symbol) {
          resolve();
          return;
        }
        
        const scaleX = (symbol as any)?.scaleX ?? 1;
        const scaleY = (symbol as any)?.scaleY ?? 1;
        
        this.animationsModule.createScaleTween(
          symbol,
          scaleX * SCATTER_RETRIGGER_SCALE,
          scaleY * SCATTER_RETRIGGER_SCALE,
          300
        ).then(() => {
          const animState = (symbol as any).animationState;
          if (animState?.setAnimation) {
            animState.setAnimation(0, winAnimName, false);
            this.scene.time.delayedCall(2500, () => {
              try { animState.setAnimation(0, idleAnimName, true); } catch { /* ignore */ }
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    });
    
    await Promise.all(tweenPromises);
    console.log('[Symbols] Retrigger animation completed');
  }

  private showCongratsDialogAfterDelay(): void {
    console.log('[Symbols] Showing congrats dialog');
    
    if (this.multiplierAnimationsInProgress) {
      gameEventManager.once(GameEventType.MULTIPLIER_ANIMATIONS_COMPLETE, () => {
        this.showCongratsDialogAfterDelay();
      });
      return;
    }
    
    const gameScene = this.scene as any;
    if (gameScene.dialogs?.hideDialog && gameScene.dialogs.isDialogShowing()) {
      gameScene.dialogs.hideDialog();
    }
    
    // Calculate total win
    let totalWin = 0;
    try {
      const bonusHeader = gameScene?.bonusHeader;
      if (bonusHeader?.getCumulativeBonusWin) {
        totalWin = Number(bonusHeader.getCumulativeBonusWin()) || 0;
      }
    } catch { /* ignore */ }
    
    if (totalWin === 0 && this.currentSpinData?.slot) {
      const freespinData = this.currentSpinData.slot.freespin || this.currentSpinData.slot.freeSpin;
      if (typeof freespinData?.totalWin === 'number') {
        totalWin = Number(freespinData.totalWin) || 0;
      } else if (freespinData?.items) {
        totalWin = freespinData.items.reduce((sum: number, item: any) => {
          return sum + (item.totalWin || item.subTotalWin || 0);
        }, 0);
      }
    }
    
    // Get free spin count
    let freeSpinCount = 0;
    try {
      const freespinData = this.currentSpinData?.slot?.freespin || this.currentSpinData?.slot?.freeSpin;
      if (freespinData?.count) {
        freeSpinCount = freespinData.count;
      } else if (freespinData?.items) {
        freeSpinCount = freespinData.items.length;
      }
    } catch { /* ignore */ }
    
    // Show dialog
    if (gameScene.dialogs?.showTotalWin) {
      gameScene.dialogs.showTotalWin(this.scene, {
        winAmount: totalWin
      });
      console.log(`[Symbols] Total win dialog shown: win=${totalWin}, spins=${freeSpinCount}`);
    } else if (gameScene.dialogs?.showCongrats) {
      gameScene.dialogs.showCongrats(this.scene, {
        winAmount: totalWin,
        freeSpins: freeSpinCount,
      });
      console.log(`[Symbols] Congrats shown: win=${totalWin}, spins=${freeSpinCount}`);
    }
  }

  private async processSpinDataSymbols(symbols: number[][], spinData: any): Promise<void> {
    console.log('[Symbols] Processing SpinData symbols:', symbols);
    
    // Reset per-item win tracker
    try { this.hadWinsInCurrentItem = false; } catch {}

    // Clear all scatter symbols from previous spin
    if (this.scatterAnimationManager) {
      this.scatterAnimationManager.clearScatterSymbols();
    }
    
    // Reset symbols and clear previous state before starting new spin
    console.log('[Symbols] Resetting symbols and clearing previous state for new spin');
    this.ensureCleanSymbolState();
    this.resetSymbolsState();
    
    // Always clear win lines and overlay when a new spin starts
    console.log('[Symbols] Clearing win lines and overlay for new spin');
    this.clearWinLines();
    this.hideWinningOverlay();
    
    this.resetSymbolDepths();
    this.restoreSymbolVisibility();
    
    // Create a mock Data object to use with existing functions
    const mockData = new Data();
    mockData.symbols = symbols;
    mockData.balance = 0;
    mockData.bet = parseFloat(spinData.bet);
    mockData.freeSpins = (
      (spinData?.slot?.freeSpin?.items && Array.isArray(spinData.slot.freeSpin.items))
        ? spinData.slot.freeSpin.items.length
        : (spinData?.slot?.freespin?.count || 0)
    );
    
    // Set proper timing for animations
    const baseDelay = DELAY_BETWEEN_SPINS;
    const adjustedDelay = gameStateManager.isTurbo ? 
      baseDelay * TurboConfig.TURBO_SPEED_MULTIPLIER : baseDelay;
    
    console.log('[Symbols] Setting animation timing:', {
      baseDelay,
      isTurbo: gameStateManager.isTurbo,
      adjustedDelay
    });
    
    mockData.delayBetweenSpins = adjustedDelay;
    setSpeed(this.scene.gameData, adjustedDelay);
    
    gameStateManager.isReelSpinning = true;
    
    // Create and drop new symbols
    this.createNewSymbols(mockData);
    await this.dropReels(mockData);
    
    // Update symbols after animation
    this.disposeSymbols(this.symbols);
    this.symbols = this.newSymbols;
    this.newSymbols = [];
    
    gameStateManager.isReelSpinning = false;
    
    console.log('[Symbols] SpinData symbols processed successfully - checking for wins and scatter');
    
    // Apply tumbles if provided by backend
    try {
      const tumbles = spinData?.slot?.tumbles;
      if (Array.isArray(tumbles) && tumbles.length > 0) {
        console.log(`[Symbols] Applying ${tumbles.length} tumble step(s) from SpinData`);
        await this.applyTumbles(tumbles);
        console.log('[Symbols] Tumbles applied successfully');
      }
    } catch (e) {
      console.warn('[Symbols] Failed processing tumbles:', e);
    }
    
    // Check for scatter symbols
    console.log('[Symbols] Checking for scatter symbols...');
    const scatterData = new Data();
    scatterData.symbols = symbols;
    const scatterGrids = this.symbolDetector.getScatterGrids(scatterData);
    console.log('[Symbols] ScatterGrids found:', scatterGrids.length);
    
    const isRetrigger = gameStateManager.isBonus && scatterGrids.length >= 3;
    if (isRetrigger || scatterGrids.length >= 4) {
      console.log(`[Symbols] Scatter detected! Found ${scatterGrids.length} scatter symbols`);
      gameStateManager.isScatter = true;
      
      // Animate and handle scatter
      if (isRetrigger) {
        console.log('[Symbols] Bonus retrigger detected');
        this.setPendingScatterRetrigger(scatterGrids);
      } else {
        console.log('[Symbols] Starting scatter animation sequence');
        await this.animateScatterSymbols(mockData, scatterGrids);
        this.startScatterAnimationSequence(mockData);
      }
    }
    
    // Emit completion events
    if (!this.winLineDrawer || (Symbols as any).WINLINE_CHECKING_DISABLED) {
      gameEventManager.emit(GameEventType.REELS_STOP);
      gameEventManager.emit(GameEventType.WIN_STOP);
    }
  }

  public async animateScatterSymbols(data: Data, scatterGrids: GridPosition[]): Promise<void> {
    if (!scatterGrids.length) {
      console.log('[Symbols] No scatter symbols to animate');
      return;
    }

    console.log(`[Symbols] Animating ${scatterGrids.length} scatter symbols`);

    let scatterWinNomnomPlayed = false;
    const scatterSymbols: SymbolObject[] = [];
    const spineKey = `symbol_${SCATTER_SYMBOL_ID}_sugar_spine`;
    const spineAtlasKey = `${spineKey}-atlas`;
    const idleAnimName = `Symbol${SCATTER_SYMBOL_ID}_BZ_idle`;
    const dropAnimName = `Symbol${SCATTER_SYMBOL_ID}_BZ_drop`;
    const winAnimName = `Symbol${SCATTER_SYMBOL_ID}_BZ_win`;

    const animationPromises = scatterGrids.map((grid) => {
      return new Promise<void>((resolve) => {
        const col = grid.y;
        const row = grid.x;
        let symbol = this.grid.getSymbol(col, row);
        if (!symbol) {
          resolve();
          return;
        }

        let scatterSymbol: any = symbol;
        const hasSpine = !!(scatterSymbol as any).animationState;

        if (!hasSpine) {
          try {
            const x = scatterSymbol.x;
            const y = scatterSymbol.y;
            try { scatterSymbol.destroy?.(); } catch {}
            if (typeof (this.scene.add as any).spine === 'function') {
              const spineSymbol = (this.scene.add as any).spine(x, y, spineKey, spineAtlasKey);
              if (spineSymbol) {
                spineSymbol.setOrigin?.(0.5, 0.5);
                try { (spineSymbol as any).symbolValue = SCATTER_SYMBOL_ID; } catch {}
                this.animationsModule.fitSpineToSymbolBox(spineSymbol);
                scatterSymbol = spineSymbol;
                this.grid.setSymbol(col, row, scatterSymbol);
                try { this.container.add(spineSymbol); } catch {}
              }
            }
          } catch (e) {
            console.warn('[Symbols] Failed to replace scatter with Spine:', e);
          }
        } else {
          try { (scatterSymbol as any).symbolValue = SCATTER_SYMBOL_ID; } catch {}
        }

        try {
          if ((scatterSymbol as any).parentContainer === this.container) {
            this.overlayModule.moveSymbolToFront(scatterSymbol, this.container);
          } else {
            scatterSymbol.setDepth?.(DEPTH_WINNING_SYMBOL);
          }
        } catch {}

        if (this.scatterAnimationManager) {
          this.scatterAnimationManager.registerScatterSymbol(scatterSymbol);
        }

        const animState = (scatterSymbol as any).animationState;
        if (animState && typeof animState.setAnimation === 'function') {
          try { if (typeof animState.clearTracks === 'function') animState.clearTracks(); } catch {}
          try { animState.setAnimation(0, idleAnimName, true); } catch {}
        }

        scatterSymbols.push(scatterSymbol);

        const scaleX = (scatterSymbol as any)?.scaleX ?? 1;
        const scaleY = (scatterSymbol as any)?.scaleY ?? 1;
        try {
          (scatterSymbol as any).__scatterBaseScaleX = scaleX;
          (scatterSymbol as any).__scatterBaseScaleY = scaleY;
        } catch {}

        this.scene.tweens.add({
          targets: scatterSymbol,
          scaleX: scaleX * SCATTER_ANIMATION_SCALE,
          scaleY: scaleY * SCATTER_ANIMATION_SCALE,
          duration: 500,
          ease: 'Power2.easeOut',
          onComplete: () => resolve()
        });
      });
    });

    await Promise.all(animationPromises);

    if (!scatterSymbols.length) {
      return;
    }

    await this.delay(500);

    const centerX = this.slotX;
    const centerY = this.slotY;
    const gatherDuration = SCATTER_GATHER_DURATION_MS;

    const gatherPromises = scatterSymbols.map((symbol: any) => {
      return new Promise<void>((resolve) => {
        let dropCompleted = false;
        let moveCompleted = false;
        let scaleCompleted = false;

        const maybeResolve = () => {
          if (dropCompleted && moveCompleted && scaleCompleted) {
            resolve();
          }
        };

        try {
          const state = (symbol as any)?.animationState;
          const hasDrop = !!(symbol as any)?.skeleton?.data?.findAnimation?.(dropAnimName);
          if (state && hasDrop && typeof state.setAnimation === 'function') {
            let listenerRef: any = null;
            const finishDrop = () => {
              try { state.setAnimation(0, idleAnimName, true); } catch {}
              dropCompleted = true;
              maybeResolve();
            };
            if (state.addListener) {
              listenerRef = {
                complete: (entry: any) => {
                  try {
                    if (!entry || entry.animation?.name !== dropAnimName) return;
                  } catch {}
                  try { if (state.removeListener && listenerRef) state.removeListener(listenerRef); } catch {}
                  finishDrop();
                }
              };
              state.addListener(listenerRef);
            }
            state.setAnimation(0, dropAnimName, false);
            if (!listenerRef) {
              this.scene.time.delayedCall(600, finishDrop);
            }
          } else {
            dropCompleted = true;
          }
        } catch {
          dropCompleted = true;
        }

        const scaleX = (symbol as any)?.scaleX ?? 1;
        const scaleY = (symbol as any)?.scaleY ?? 1;
        this.scene.tweens.add({
          targets: symbol,
          x: centerX,
          y: centerY,
          scaleX: scaleX * SCATTER_GATHER_SCALE,
          scaleY: scaleY * SCATTER_GATHER_SCALE,
          duration: gatherDuration,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            moveCompleted = true;
            scaleCompleted = true;
            maybeResolve();
          }
        });
      });
    });

    await Promise.all(gatherPromises);
    const winPromises: Promise<void>[] = scatterSymbols.map((symbol: any) => {
      return new Promise<void>((resolve) => {
        try {
          const state = (symbol as any).animationState;
          if (state && typeof state.setAnimation === 'function') {
            let finished = false;
            let listenerRef: any = null;
            try {
              if (typeof state.addListener === 'function') {
                listenerRef = {
                  complete: (entry: any) => {
                    try {
                      if (!entry || entry.animation?.name !== winAnimName) return;
                    } catch {}
                    if (finished) return;
                    finished = true;
                    try { state.setAnimation(0, idleAnimName, true); } catch {}
                    try { if (state.removeListener && listenerRef) state.removeListener(listenerRef); } catch {}
                    resolve();
                  }
                };
                state.addListener(listenerRef);
              }
            } catch {}

            const entry = state.setAnimation(0, winAnimName, false);
            if (entry && typeof (entry as any).timeScale === 'number') {
              const base = (entry as any).timeScale > 0 ? (entry as any).timeScale : 1;
              (entry as any).timeScale = base * 1.3;
            }

            if (!scatterWinNomnomPlayed) {
              scatterWinNomnomPlayed = true;
              try {
                const audio = (window as any)?.audioManager;
                if (audio && typeof audio.playSoundEffect === 'function') {
                  const globalScale = (typeof (gameStateManager as any)?.timeScale === 'number'
                    ? (gameStateManager as any).timeScale || 1
                    : 1);
                  const clampedScale = Math.max(0.5, Math.min(1.25, globalScale));
                  audio.playSoundEffect(SoundEffectType.SCATTER_NOMNOM, clampedScale);
                }
              } catch {}
            }

            this.scene.time.delayedCall(2500, () => {
              if (finished) return;
              finished = true;
              try { state.setAnimation(0, idleAnimName, true); } catch {}
              try { if (state.removeListener && listenerRef) state.removeListener(listenerRef); } catch {}
              resolve();
            });
            return;
          }
        } catch {}
        resolve();
      });
    });

    await Promise.all(winPromises);
    await this.playTransitionBzWin(scatterSymbols);
  }

  private async playTransitionBzWin(scatterSymbols: SymbolObject[]): Promise<void> {
    if (!scatterSymbols.length) {
      return;
    }

    scatterSymbols.forEach((symbol) => {
      if (symbol?.setVisible) {
        symbol.setVisible(false);
      }
    });

    try {
      await this.playTransitionBzWinAnimation();
    } finally {
      this.mergedScatterSymbols = scatterSymbols.slice();

      if (this.transitionBzOverlay) {
        this.scene.events.once('dialogAnimationsComplete', () => {
          this.hideTransitionBzOverlay(400);
        });
      }
    }
  }

  private async playTransitionBzWinAnimation(): Promise<void> {
    const transitionKey = 'Transition_BZ';
    const atlasKey = `${transitionKey}-atlas`;
    let transition: any = null;

    this.hideTransitionBzOverlay();

    try {
      if (typeof (this.scene.add as any).spine !== 'function') {
        return;
      }
      transition = (this.scene.add as any).spine(
        this.scene.scale.width * 0.5,
        this.scene.scale.height * 0.5,
        transitionKey,
        atlasKey
      );
    } catch {
      return;
    }

    if (!transition) {
      return;
    }

    this.transitionBzOverlay = transition;

    try { transition.setOrigin?.(0.5, 0.5); } catch {}
    try { transition.setDepth?.(10000); } catch {}

    try {
      const rawWidth = Number(transition.width) || 1;
      const rawHeight = Number(transition.height) || 1;
      const fitScale = Math.min(
        (this.scene.scale.width * 0.9) / rawWidth,
        (this.scene.scale.height * 0.9) / rawHeight
      );
      if (isFinite(fitScale) && fitScale > 0 && transition.setScale) {
        transition.setScale(fitScale, fitScale);
      }
    } catch {}

    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };

      try {
        const state = transition.animationState;
        const animName = 'Transition_BZ_win';
        if (state && typeof state.setAnimation === 'function') {
          let listenerRef: any = null;
          if (typeof state.addListener === 'function') {
            listenerRef = {
              complete: (entry: any) => {
                try {
                  if (!entry || entry.animation?.name !== animName) return;
                } catch {}
                try { if (state.removeListener && listenerRef) state.removeListener(listenerRef); } catch {}
                finish();
              }
            };
            state.addListener(listenerRef);
          }
          state.setAnimation(0, animName, false);
          this.scene.time.delayedCall(3600, () => {
            try { if (state.removeListener && listenerRef) state.removeListener(listenerRef); } catch {}
            finish();
          });
          return;
        }
      } catch {}

      this.scene.time.delayedCall(2200, finish);
    });
  }

  private hideTransitionBzOverlay(delayMs: number = 0): void {
    if (!this.transitionBzOverlay) {
      return;
    }
    const transition = this.transitionBzOverlay;
    const mergedSymbols = this.mergedScatterSymbols;
    const fadeDuration = 600;
    const ensureTransitionVisible = () => {
      try { transition.setVisible?.(true); } catch {}
      try { transition.setAlpha?.(1); } catch {}
      try { (transition as any).alpha = 1; } catch {}
      try {
        const color = transition?.skeleton?.color;
        if (color && typeof color.a === 'number') {
          color.a = 1;
        }
      } catch {}
    };
    const showMergedSymbols = () => {
      if (!mergedSymbols?.length) return;
      mergedSymbols.forEach((symbol) => {
        if (symbol?.setVisible) {
          symbol.setVisible(true);
        }
        if (typeof symbol?.setAlpha === 'function') {
          symbol.setAlpha(0);
        } else if (typeof (symbol as any)?.alpha === 'number') {
          (symbol as any).alpha = 0;
        }
      });
    };

    const complete = () => {
      try { transition.destroy?.(); } catch {}
      if (this.transitionBzOverlay === transition) {
        this.transitionBzOverlay = null;
      }
      if (mergedSymbols?.length) {
        this.scene.tweens.add({
          targets: mergedSymbols,
          alpha: 1,
          duration: fadeDuration,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            this.mergedScatterSymbols = null;
          }
        });
      } else {
        this.mergedScatterSymbols = null;
      }
    };

    const finish = () => {
      if (!transition?.active) {
        complete();
        return;
      }
      ensureTransitionVisible();
      const revealDelay = Math.max(0, fadeDuration - 100);
      const resetDelay = Math.max(0, fadeDuration - 200);
      const fadeState = { alpha: 1 };
      this.scene.tweens.add({
        targets: fadeState,
        alpha: 0,
        duration: fadeDuration,
        ease: 'Sine.easeInOut',
        onStart: () => {
          if (resetDelay > 0) {
            this.scene.time.delayedCall(resetDelay, () => {
              this.resetScatterSymbolsToGrid();
            });
          } else {
            this.resetScatterSymbolsToGrid();
          }
          if (revealDelay > 0) {
            this.scene.time.delayedCall(revealDelay, () => showMergedSymbols());
          } else {
            showMergedSymbols();
          }
        },
        onUpdate: () => {
          const value = Math.max(0, Math.min(1, Number(fadeState.alpha) || 0));
          try { transition.setAlpha?.(value); } catch {}
          try { (transition as any).alpha = value; } catch {}
          try {
            const color = transition?.skeleton?.color;
            if (color && typeof color.a === 'number') {
              color.a = value;
            }
          } catch {}
        },
        onComplete: () => complete()
      });
    };

    if (delayMs > 0) {
      this.scene.time.delayedCall(delayMs, finish);
    } else {
      finish();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.scene.time.delayedCall(ms, resolve);
    });
  }

  public startPreSpinDrop(): void {
    // In the new implementation, old symbols are dropped as part of dropReels
    // This method is kept for compatibility but does nothing
    console.log('[Symbols] startPreSpinDrop called (no-op in new implementation)');
  }

  // Helper methods for symbol processing
  private createNewSymbols(data: Data): void {
    // Clear old new symbols
    this.disposeSymbols(this.newSymbols);

    const symbolTotalWidth = this.displayWidth + this.horizontalSpacing;
    const symbolTotalHeight = this.displayHeight + this.verticalSpacing;
    const adjY = this.scene.scale.height * -1.0;
    const startX = this.slotX - this.totalGridWidth * 0.5;
    const startY = this.slotY - this.totalGridHeight * 0.5 + adjY;

    let symbols = data.symbols;
    console.log('[Symbols] Creating new symbols (column-major):', symbols);
    
    // Update current symbol data for reset purposes (store as row-major for tumble logic)
    try {
      const colCount = symbols.length;
      const rowCount = colCount > 0 ? symbols[0].length : 0;
      const rowMajor: number[][] = [];
      for (let row = 0; row < rowCount; row++) {
        rowMajor[row] = [];
        for (let col = 0; col < colCount; col++) {
          // Invert vertical order: SpinData area is bottom->top; row 0 is top visually
          rowMajor[row][col] = symbols[col][rowCount - 1 - row];
        }
      }
      this.currentSymbolData = rowMajor;
    } catch {
      this.currentSymbolData = symbols;
    }
    
    const newSymbolsArray: SymbolObject[][] = [];

    for (let col = 0; col < symbols.length; col++) {
      const column = symbols[col];
      const rows: SymbolObject[] = [];
      
      for (let row = 0; row < column.length; row++) {
        // Center the symbols by adding half width/height
        const x = startX + col * symbolTotalWidth + symbolTotalWidth * 0.5;
        const y = startY + row * symbolTotalHeight + symbolTotalHeight * 0.5;
        
        // Invert vertical order for display
        const value = symbols[col][symbols[col].length - 1 - row];
        
        const created = this.factory.createSugarOrPngSymbol(value, x, y, 1);
        rows.push(created);
      }
      
      newSymbolsArray.push(rows);
    }
    
    // Set the whole array at once
    this.newSymbols = newSymbolsArray;
  }

  private async dropReels(data: Data): Promise<void> {
    console.log('[Symbols] dropReels called');
    
    const numRows = (this.symbols && this.symbols[0] && this.symbols[0].length)
      ? this.symbols[0].length
      : SLOT_COLUMNS;
    const isTurbo = !!this.scene.gameData?.isTurbo;

    const reelPromises: Promise<void>[] = [];
    
    // Drop symbols row by row from bottom to top
    for (let step = 0; step < numRows; step++) {
      const actualRow = (numRows - 1) - step;
      const isLastReel = actualRow === 0;
      
      // In bonus mode, add small pre-drop delay
      const bonusPreDropDelay = gameStateManager.isBonus
        ? (this.scene.gameData.winUpDuration * 2)
        : 0.5;
      
      // In turbo mode, remove row stagger so all drop together
      const startDelay = bonusPreDropDelay +
        (isTurbo ? 0 : this.scene.gameData.dropReelsDelay * step);
      
      const p = (async () => {
        await this.delay(startDelay);
        console.log(`[Symbols] Processing row ${actualRow}/${numRows - 1}`);
        
        // Drop old symbols first with same animation as new symbols
        await this.dropOldSymbols(actualRow);
        
        // Then drop new symbols
        await this.dropNewSymbols(actualRow, false);
      })();
      reelPromises.push(p);
    }
    
    await Promise.all(reelPromises);
    console.log('[Symbols] All reels completed');
    
    // Turbo mode: play turbo drop sound effect
    if (isTurbo && (window as any).audioManager) {
      try {
        (window as any).audioManager.playSoundEffect(SoundEffectType.TURBO_DROP);
        console.log('[Symbols] Playing turbo drop sound effect');
      } catch (e) {
        console.warn('[Symbols] Failed to play turbo drop sound effect:', e);
      }
    }
  }

  private async dropOldSymbols(rowIndex: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.symbols || this.symbols.length === 0) {
        resolve();
        return;
      }
      
      let completedAnimations = 0;
      const totalAnimations = this.symbols.length;
      const STAGGER_MS = 100; // Same as new symbols
      const symbolHop = this.scene.gameData.winUpHeight * 0.5;
      const isTurbo = !!this.scene.gameData?.isTurbo;
      
      // Calculate drop distance to move off screen
      const gridBottomY = this.slotY + this.totalGridHeight * 0.5;
      const distanceToScreenBottom = Math.max(0, this.scene.scale.height - gridBottomY);
      const extraDistance = this.displayHeight * 3;
      
      for (let col = 0; col < this.symbols.length; col++) {
        const symbol = this.symbols[col]?.[rowIndex];
        if (!symbol || (symbol as any).destroyed) {
          completedAnimations++;
          if (completedAnimations === totalAnimations) {
            resolve();
          }
          continue;
        }
        
        const baseObj: any = symbol as any;
        const overlayObj: any = baseObj?.__overlayImage;
        const tweenTargets: any = overlayObj ? [baseObj, overlayObj] : baseObj;
        
        const tweens: any[] = [
          {
            delay: isTurbo ? 0 : STAGGER_MS * col,
            y: `-= ${symbolHop}`,
            duration: this.scene.gameData.winUpDuration,
            ease: Phaser.Math.Easing.Circular.Out,
          },
          {
            y: `+= ${distanceToScreenBottom + extraDistance}`,
            duration: this.scene.gameData.dropDuration * 0.9,
            ease: isTurbo ? Phaser.Math.Easing.Cubic.Out : Phaser.Math.Easing.Linear,
            onComplete: () => {
              // Destroy the symbol after it drops off screen
              try {
                if (!baseObj.destroyed) baseObj.destroy();
                if (overlayObj && !overlayObj.destroyed) overlayObj.destroy();
              } catch {}
              
              completedAnimations++;
              if (completedAnimations === totalAnimations) {
                resolve();
              }
            }
          },
        ];
        
        this.scene.tweens.chain({
          targets: tweenTargets,
          tweens,
        });
      }
      
      // Safety timeout in case some animations don't complete
      this.scene.time.delayedCall(this.scene.gameData.dropDuration * 2, () => {
        if (completedAnimations < totalAnimations) {
          console.warn('[Symbols] dropOldSymbols timeout, forcing resolve');
          resolve();
        }
      });
    });
  }

  private async dropNewSymbols(index: number, extendDuration: boolean = false): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.symbols || !this.symbols[0] || !this.symbols[0][0]) {
        console.warn('[Symbols] dropNewSymbols: invalid symbols array');
        resolve();
        return;
      }
      
      const height = this.symbols[0][0].displayHeight + this.verticalSpacing;
      const extraMs = extendDuration ? 3000 : 0;

      let completedAnimations = 0;
      const totalAnimations = this.newSymbols.length;
      const STAGGER_MS = 100;
      const symbolHop = this.scene.gameData.winUpHeight * 0.5;
      const isTurbo = !!this.scene.gameData?.isTurbo;
      
      console.log(`[Symbols] dropNewSymbols row ${index}: ${totalAnimations} columns, isTurbo=${isTurbo}, STAGGER_MS=${STAGGER_MS}`);

      for (let col = 0; col < this.newSymbols.length; col++) {
        let symbol = this.newSymbols[col][index];
        const targetY = this.getYPos(index);
        
        // Trigger drop animation if available
        try { this.playDropAnimationIfAvailable(symbol); } catch {}

        const baseObj: any = symbol as any;
        const overlayObj: any = (baseObj as any)?.__overlayImage;
        const tweenTargets: any = overlayObj ? [baseObj, overlayObj] : baseObj;
        
        const delayMs = isTurbo ? 0 : STAGGER_MS * col;
        console.log(`[Symbols] Column ${col}: delay=${delayMs}ms, targetY=${targetY}`);
        
        const tweens: any[] = [
          {
            delay: delayMs,
            y: `-= ${symbolHop}`,
            duration: this.scene.gameData.winUpDuration,
            ease: Phaser.Math.Easing.Circular.Out,
          },
          {
            y: targetY,
            duration: (this.scene.gameData.dropDuration * 0.9) + extraMs,
            ease: isTurbo ? Phaser.Math.Easing.Cubic.Out : Phaser.Math.Easing.Linear,
          },
        ];

        if (!isTurbo) {
          tweens.push(
            {
              y: `+= ${10}`,
              duration: this.scene.gameData.dropDuration * 0.05,
              ease: Phaser.Math.Easing.Linear,
            },
            {
              y: `-= ${10}`,
              duration: this.scene.gameData.dropDuration * 0.05,
              ease: Phaser.Math.Easing.Linear,
              onComplete: () => {
                if (!this.scene.gameData.isTurbo && (window as any).audioManager) {
                  (window as any).audioManager.playSoundEffect(SoundEffectType.REEL_DROP);
                }
                
                completedAnimations++;
                if (completedAnimations === totalAnimations) {
                  resolve();
                }
              }
            },
          );
        } else {
          const last = tweens[tweens.length - 1];
          const prevOnComplete = last.onComplete;
          last.onComplete = () => {
            try { if (prevOnComplete) prevOnComplete(); } catch {}
            completedAnimations++;
            if (completedAnimations === totalAnimations) {
              resolve();
            }
          };
        }

        this.scene.tweens.chain({ 
          targets: tweenTargets,
          tweens,
        });
      }
    });
  }

  private getYPos(index: number): number {
    const symbolTotalHeight = this.displayHeight + this.verticalSpacing;
    const startY = this.slotY - this.totalGridHeight * 0.5;
    return startY + index * symbolTotalHeight + symbolTotalHeight * 0.5;
  }

  private playDropAnimationIfAvailable(obj: any): void {
    if (!obj) return;
    const animState = (obj as any)?.animationState;
    if (!animState?.setAnimation) return;
    
    try {
      const value = (obj as any)?.symbolValue;
      if (value === undefined || value === null) return;
      
      const dropAnimName = `Symbol${value}_BZ_drop`;
      const idleAnimName = `Symbol${value}_BZ_idle`;
      
      animState.setAnimation(0, dropAnimName, false);
      animState.addAnimation(0, idleAnimName, true, 0);
    } catch (e) {
      console.warn('[Symbols] Failed to play drop animation:', e);
    }
  }

  private disposeSymbols(symbols: any[][]): void {
    if (!symbols || symbols.length === 0) return;
    
    for (let i = 0; i < symbols.length; i++) {
      const column = symbols[i];
      if (!column) continue;
      
      for (let j = 0; j < column.length; j++) {
        const symbol = column[j];
        if (!symbol) continue;
        
        try {
          this.scene.tweens.killTweensOf(symbol);
          if (!symbol.destroyed && symbol.destroy) {
            symbol.destroy();
          }
        } catch (e) {
          console.warn('[Symbols] Error disposing symbol:', e);
        }
      }
    }
  }

  // Tumble processing methods
  private async applyTumbles(tumbles: any[]): Promise<void> {
    let cumulativeWin = 0;
    let tumbleIndex = 0;
    
    for (const tumble of tumbles) {
      tumbleIndex++;
      
      // Compute this tumble's total win
      let tumbleTotal = 0;
      try {
        const w = Number(tumble?.win ?? 0);
        if (!isNaN(w) && w > 0) {
          tumbleTotal = w;
        } else {
          const outsArr = Array.isArray(tumble?.symbols?.out) ? tumble.symbols.out : [];
          tumbleTotal = outsArr.reduce((s: number, o: any) => s + (Number(o?.win) || 0), 0);
        }
      } catch {}

      const currentTumbleIndex = tumbleIndex;
      
      await this.applySingleTumble(tumble, currentTumbleIndex, () => {
        // Track cumulative wins
        try {
          cumulativeWin += tumbleTotal;
          if (cumulativeWin > 0) {
            gameEventManager.emit(GameEventType.TUMBLE_WIN_PROGRESS, { cumulativeWin } as any);
          }
        } catch {}
        
        // Play tumble sound effect
        try {
          const am = (window as any)?.audioManager;
          if (am && typeof am.playSymbolWinByTumble === 'function') {
            am.playSymbolWinByTumble(currentTumbleIndex);
          }
        } catch {}
      });
    }
    
    try {
      gameEventManager.emit(GameEventType.TUMBLE_SEQUENCE_DONE, { totalWin: cumulativeWin } as any);
    } catch {}
  }

  private async applySingleTumble(tumble: any, tumbleIndex: number, onFirstWinComplete?: (tumbleTotal: number) => void): Promise<void> {
    const self = this;
    const outs = (tumble?.symbols?.out || []) as Array<{ symbol: number; count: number }>;
    const ins = (tumble?.symbols?.in || []) as number[][]; // per real column (x index)

    // If this tumble removes any symbols, it represents a win event during this item
    try {
      const anyRemoval = Array.isArray(outs) && outs.some(o => (Number(o?.count) || 0) > 0);
      if (anyRemoval) { (self as any).hadWinsInCurrentItem = true; }
    } catch {}

    if (!self.symbols || !self.symbols.length || !self.symbols[0] || !self.symbols[0].length) {
      console.warn('[Symbols] applySingleTumble: Symbols grid not initialized');
      return;
    }

    // Grid orientation: self.symbols[col][row]
    const numCols = self.symbols.length;
    const numRows = self.symbols[0].length;

    // Match manual drop timings and staggering for visual consistency
    const MANUAL_STAGGER_MS: number = (self.scene?.gameData?.tumbleStaggerMs ?? 100);

    // Debug: log incoming tumble payload
    try {
      const totalOutRequested = outs.reduce((s, o) => s + (Number(o?.count) || 0), 0);
      const totalInProvided = (Array.isArray(ins) ? ins.flat().length : 0);
      console.log('[Symbols] Tumble payload:', {
        outs,
        insColumns: Array.isArray(ins) ? ins.map((col, idx) => ({ col: idx, count: Array.isArray(col) ? col.length : 0 })) : [],
        totals: { totalOutRequested, totalInProvided }
      });
    } catch {}

    // Build a removal mask per cell
    // removeMask[col][row]
    const removeMask: boolean[][] = Array.from({ length: numCols }, () => Array<boolean>(numRows).fill(false));

    // Identify symbols that meet the high-count threshold (>=8)
    const highCountSymbols = new Set<number>();
    for (const out of outs) {
      const c = Number(out?.count || 0);
      const s = Number(out?.symbol);
      if (!isNaN(c) && !isNaN(s) && c >= 8) {
        highCountSymbols.add(s);
      }
    }

    // Build position indices by symbol (topmost-first per column)
    const positionsBySymbol: { [key: number]: Array<{ col: number; row: number }> } = {};
    let sequenceIndex = 0; // ensures 1-by-1 ordering across columns left-to-right
    for (let col = 0; col < numCols; col++) {
      for (let row = 0; row < numRows; row++) {
        const val = self.currentSymbolData?.[row]?.[col];
        if (typeof val !== 'number') continue;
        if (!positionsBySymbol[val]) positionsBySymbol[val] = [];
        positionsBySymbol[val].push({ col, row });
      }
    }
    // Sort each symbol's positions top-to-bottom (row asc), then left-to-right (col asc)
    Object.keys(positionsBySymbol).forEach(k => {
      positionsBySymbol[Number(k)].sort((a, b) => a.row - b.row || a.col - b.col);
    });

    // Determine per-column incoming counts
    const insCountByCol: number[] = Array.from({ length: numCols }, (_, c) => (Array.isArray(ins?.[c]) ? ins[c].length : 0));
    let targetRemovalsPerCol: number[] = insCountByCol.slice();

    // Helper to pick and mark a position for a symbol in a preferred column
    function pickAndMark(symbol: number, preferredCol: number | null): boolean {
      const list = positionsBySymbol[symbol] || [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (removeMask[p.col][p.row]) continue; // already marked
        if (preferredCol !== null && p.col !== preferredCol) continue;
        removeMask[p.col][p.row] = true;
        // Remove from list for efficiency
        list.splice(i, 1);
        return true;
      }
      return false;
    }

    // First pass: satisfy per-column targets using outs composition
    for (const out of outs) {
      let remaining = Number(out?.count || 0);
      const targetSymbol = Number(out?.symbol);
      if (isNaN(remaining) || isNaN(targetSymbol) || remaining <= 0) continue;
      // Try to allocate removals in columns that expect incoming symbols first
      while (remaining > 0) {
        let allocated = false;
        for (let col = 0; col < numCols && remaining > 0; col++) {
          if (targetRemovalsPerCol[col] <= 0) continue;
          if (pickAndMark(targetSymbol, col)) {
            targetRemovalsPerCol[col]--;
            remaining--;
            allocated = true;
          }
        }
        if (!allocated) break; // proceed to second pass
      }
      // Second pass: allocate any remainder anywhere
      while (remaining > 0) {
        if (pickAndMark(targetSymbol, null)) {
          remaining--;
        } else {
          console.warn('[Symbols] Not enough matching symbols in grid to satisfy tumble outs for symbol', targetSymbol);
          break;
        }
      }
    }

    // Debug: per-column removal vs incoming
    try {
      const removedPerCol: number[] = Array.from({ length: numCols }, () => 0);
      for (let col = 0; col < numCols; col++) {
        for (let row = 0; row < numRows; row++) {
          if (removeMask[col][row]) removedPerCol[col]++;
        }
      }
      console.log('[Symbols] Tumble per-column removal vs incoming:', removedPerCol.map((r, c) => ({ col: c, removed: r, incoming: insCountByCol[c] })));
    } catch {}

    // Debug: report which cells are marked for removal per symbol
    try {
      const removedBySymbol: { [key: number]: Array<{ col: number; row: number }> } = {};
      let totalRemoved = 0;
      for (let col = 0; col < numCols; col++) {
        for (let row = 0; row < numRows; row++) {
          if (removeMask[col][row]) {
            const val = self.currentSymbolData?.[row]?.[col];
            const key = typeof val === 'number' ? val : -1;
            if (!removedBySymbol[key]) removedBySymbol[key] = [];
            removedBySymbol[key].push({ col, row });
            totalRemoved++;
          }
        }
      }
      console.log('[Symbols] Tumble removal mask summary:', { totalRemoved, removedBySymbol });
    } catch {}

    // Attach ONE win text per winning symbol value, prioritizing columns 2–5 (1–4 zero-based)
    try {
      // Build removal positions by symbol value
      const positionsForSymbol: { [key: number]: Array<{ col: number; row: number }> } = {};
      for (let col = 0; col < numCols; col++) {
        for (let row = 0; row < numRows; row++) {
          if (!removeMask[col][row]) continue;
          const val = self.currentSymbolData?.[row]?.[col];
          if (typeof val !== 'number') continue;
          if (!positionsForSymbol[val]) positionsForSymbol[val] = [];
          positionsForSymbol[val].push({ col, row });
        }
      }
      // Map of per-symbol win amount from outs
      const winBySymbol: { [key: number]: number } = {};
      for (const out of outs as any[]) {
        const s = Number((out as any)?.symbol);
        const w = Number((out as any)?.win);
        if (!isNaN(s) && !isNaN(w) && w > 0) winBySymbol[s] = w;
      }
      const tumbleWin = Number((tumble as any)?.win || 0);
      // Choose one position per winning symbol and display text
      let winTrackerShown = false;
      for (const keyStr of Object.keys(positionsForSymbol)) {
        const sym = Number(keyStr);
        const list = positionsForSymbol[sym] || [];
        if (!list.length) continue;
        // Prioritize columns 1..4 (2–5 human)
        const priority = list.filter(p => p.col >= 1 && p.col <= 4);
        const pool = priority.length ? priority : list;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const obj = self.symbols[pick.col][pick.row];
        if (!obj) continue;
        const amount = (winBySymbol[sym] !== undefined) ? winBySymbol[sym] : (tumbleWin > 0 ? tumbleWin : 0);
        if (amount <= 0) continue;
        // Remove any previous win text on this symbol
        try {
          const prev: any = (obj as any).__winText;
          if (prev && prev.destroy && !prev.destroyed) prev.destroy();
        } catch {}
        // Delay win text to appear ~0.8s after the win animation is triggered
        const baseX = obj.x;
        const baseY = obj.y;
        self.scene.time.delayedCall(800, () => {
          // If scene or container is gone, skip
          try {
            if (!self || !self.scene || !self.container) return;
          } catch { return; }
          // Show WinTracker once at the same moment win text appears
          try {
            if (!winTrackerShown) {
              winTrackerShown = true;
              const wt = (self.scene as any)?.winTracker;
              if (wt) {
                // Announce win start here so coins and listeners sync with text timing
                try { gameEventManager.emit(GameEventType.WIN_START); } catch {}
                // Show only the current tumble's wins
                try {
                  const outsArr = Array.isArray((tumble as any)?.symbols?.out) ? (tumble as any).symbols.out : [];
                  wt.showForTumble(outsArr, self.currentSpinData || null);
                } catch {
                  wt.updateFromSpinData(self.currentSpinData || null);
                  wt.showLatest();
                }
                // Do not auto-hide WinTracker here; it will persist until a new spin starts,
                // at which point the Game scene explicitly clears it.
              }
            }
          } catch {}
          // Create and place text
          const txt = this.overlayModule.createWinText(amount, baseX, baseY, this.displayHeight);
          try { txt.setDepth(700); } catch {}
          self.container.add(txt);
          try { (obj as any).__winText = txt; } catch {}
          // Animate: single pop on appear, then rise and fade
          try {
            const baseSX = (txt as any)?.scaleX ?? 1;
            const baseSY = (txt as any)?.scaleY ?? 1;
            self.scene.tweens.add({
              targets: txt,
              scaleX: baseSX * 1.12,
              scaleY: baseSY * 1.12,
              duration: 160,
              yoyo: true,
              repeat: 0,
              ease: Phaser.Math.Easing.Cubic.Out,
            });
          } catch {}
          try {
            const rise = Math.max(8, Math.round(self.displayHeight * 0.25));
            const holdDuration = Math.max(1000, (self.scene?.gameData?.winUpDuration || 700) + 0);
            const fadeDuration = Math.max(600, (self.scene?.gameData?.winUpDuration || 700) + 0);
            self.scene.tweens.chain({
              targets: txt,
              tweens: [
                {
                  y: txt.y - rise,
                  duration: holdDuration,
                  ease: Phaser.Math.Easing.Cubic.Out,
                },
                {
                  alpha: 0,
                  duration: fadeDuration,
                  ease: Phaser.Math.Easing.Cubic.Out,
                  onComplete: () => {
                    try {
                      if (txt && (txt as any).destroy && !(txt as any).destroyed) (txt as any).destroy();
                      if (obj && (obj as any).__winText === txt) (obj as any).__winText = null;
                    } catch {}
                  }
                }
              ]
            });
          } catch {}
        });
      }
    } catch {}

    // Animate removal: for high-count sugar symbols (1..9), play SW_Win before destroy; otherwise fade out
    const removalPromises: Promise<void>[] = [];
    const STAGGER_MS = 50; // match drop sequence stagger (shortened)
    // Track first win animation notification (we now trigger on animation start for better SFX sync)
    let firstWinNotified = false;
    function notifyFirstWinIfNeeded() {
      if (!firstWinNotified) {
        firstWinNotified = true;
        console.log(`[Symbols] notifyFirstWinIfNeeded called for tumble index: ${tumbleIndex} (first win animation started)`);
        try {
          // Compute tumble total similarly here for safety
          let tumbleTotal = 0;
          try {
            const tw = Number((tumble as any)?.win ?? 0);
            if (!isNaN(tw) && tw > 0) {
              tumbleTotal = tw;
            } else {
              const outsArr = Array.isArray((tumble as any)?.symbols?.out) ? (tumble as any).symbols.out as Array<{ win?: number }> : [];
              tumbleTotal = outsArr.reduce((s, o) => s + (Number(o?.win) || 0), 0);
            }
          } catch {}
          if (typeof onFirstWinComplete === 'function') {
            onFirstWinComplete(tumbleTotal);
          }
        } catch {}
      } else {
        console.log(`[Symbols] notifyFirstWinIfNeeded called again for tumble index: ${tumbleIndex} (already notified, skipping)`);
      }
    }
    
    for (let col = 0; col < numCols; col++) {
      for (let row = 0; row < numRows; row++) {
        if (removeMask[col][row]) {
          const obj = self.symbols[col][row];
          if (obj) {
            removalPromises.push(new Promise<void>((resolve) => {
              const value = self.currentSymbolData?.[row]?.[col];
              const isSugarWin = typeof value === 'number' && value >= 1 && value <= 9 && highCountSymbols.has(value);
              const sugarWinAnim = isSugarWin ? `Symbol${value}_BZ_win` : null;
              const hasSugarWinAnim = !!(sugarWinAnim && (obj as any)?.skeleton?.data?.findAnimation?.(sugarWinAnim));
              const canPlaySugarWin = !!(isSugarWin && hasSugarWinAnim && obj.animationState && obj.animationState.setAnimation);
              const multiBase = typeof value === 'number' ? MultiplierSymbols.getAnimationBase(value) : null;
              // For multipliers, allow win animation only when this item actually had wins
              const canPlayMultiplierWin = !!multiBase && !!(self as any).hadWinsInCurrentItem && obj.animationState && obj.animationState.setAnimation;
              const shouldExplode = !!isSugarWin;
              let vfxTriggered = false;

              const triggerRemovalVfx = () => {
                if (!shouldExplode || vfxTriggered) return;
                vfxTriggered = true;
                try {
                  let x = typeof (obj as any)?.x === 'number' ? (obj as any).x : null;
                  let y = typeof (obj as any)?.y === 'number' ? (obj as any).y : null;
                  const matrix = (obj as any)?.getWorldTransformMatrix?.();
                  if (matrix && typeof matrix.tx === 'number' && typeof matrix.ty === 'number') {
                    x = matrix.tx;
                    y = matrix.ty;
                  }
                  if (x === null || y === null) return;
                  this.playExplosionVfx(x, y);
                } catch {}
              };

              const startRemoval = () => {
                try {
                  if (shouldExplode) {
                    triggerRemovalVfx();
                  }
                  if (canPlaySugarWin || canPlayMultiplierWin) {
                    try { if (obj.animationState.clearTracks) obj.animationState.clearTracks(); } catch {}
                    const winAnim = canPlaySugarWin ? (sugarWinAnim as string) : `${multiBase}_Win`;
                    let completed = false;
                    try {
                      if (obj.animationState.addListener) {
                        const listener = {
                          complete: (entry: any) => {
                            try {
                              if (!entry || entry.animation?.name !== winAnim) return;
                            } catch {}
                            if (completed) return; completed = true;
                            try { this.destroySymbolOverlays(obj); } catch {}
                            try { obj.destroy(); } catch {}
                            self.symbols[col][row] = null as any;
                            if (self.currentSymbolData && self.currentSymbolData[row]) {
                              (self.currentSymbolData[row] as any)[col] = null;
                            }
                            resolve();
                          }
                        } as any;
                        obj.animationState.addListener(listener);
                      }
                      obj.animationState.setAnimation(0, winAnim, false);
                      // Log the tumble index when win animation starts
                      console.log(`[Symbols] Playing win animation "${winAnim}" for tumble index: ${tumbleIndex}`);
                      // First win animation just started – notify once so header + SFX sync with visuals
                      notifyFirstWinIfNeeded();
                      if (!shouldExplode) {
                        // Keep multiplier emphasis without fighting the sugar explosion pulse
                        this.animationsModule.scheduleScaleUp(obj, 500);
                      }
                      // Safety timeout in case complete isn't fired
                      self.scene.time.delayedCall(self.scene.gameData.winUpDuration + 700, () => {
                        if (completed) return; completed = true;
                        try { this.destroySymbolOverlays(obj); } catch {}
                        try { obj.destroy(); } catch {}
                        self.symbols[col][row] = null as any;
                        if (self.currentSymbolData && self.currentSymbolData[row]) {
                          (self.currentSymbolData[row] as any)[col] = null;
                        }
                        resolve();
                      });
                    } catch {
                      // Fallback to fade if animation fails
                      try { self.scene.tweens.killTweensOf(obj); } catch {}
                      const tweenTargets: any = this.getSymbolTweenTargets(obj);
                      self.scene.tweens.add({
                        targets: tweenTargets,
                        alpha: 0,
                        // No scale change to avoid perceived scale-up/down
                        duration: self.scene.gameData.winUpDuration,
                        ease: Phaser.Math.Easing.Cubic.In,
                        onComplete: () => {
                          try { this.destroySymbolOverlays(obj); } catch {}
                          try { obj.destroy(); } catch {}
                          self.symbols[col][row] = null as any;
                          if (self.currentSymbolData && self.currentSymbolData[row]) {
                            (self.currentSymbolData[row] as any)[col] = null;
                          }
                          resolve();
                        }
                      });
                    }
                  } else {
                    // Non-sugar or low-count: soft fade without scale change
                    try { self.scene.tweens.killTweensOf(obj); } catch {}
                    const tweenTargets: any = this.getSymbolTweenTargets(obj);
                    self.scene.tweens.add({
                      targets: tweenTargets,
                      alpha: 0,
                      // No scale change
                      duration: self.scene.gameData.winUpDuration,
                      ease: Phaser.Math.Easing.Cubic.In,
                      onComplete: () => {
                        try { this.destroySymbolOverlays(obj); } catch {}
                        try { obj.destroy(); } catch {}
                        // Leave null placeholder for compression step
                        self.symbols[col][row] = null as any;
                        if (self.currentSymbolData && self.currentSymbolData[row]) {
                          (self.currentSymbolData[row] as any)[col] = null;
                        }
                        resolve();
                      }
                    });
                  }
                } catch {
                  try { obj.destroy(); } catch {}
                  self.symbols[col][row] = null as any;
                  if (self.currentSymbolData && self.currentSymbolData[row]) {
                    (self.currentSymbolData[row] as any)[col] = null;
                  }
                  resolve();
                }
              };

              if (shouldExplode) {
                this.playPreExplosionPulse(obj, startRemoval);
              } else {
                startRemoval();
              }
            }));
          } else {
            self.symbols[col][row] = null as any;
            if (self.currentSymbolData && self.currentSymbolData[row]) {
              (self.currentSymbolData[row] as any)[col] = null;
            }
          }
        }
      }
    }

    await Promise.all(removalPromises);
    // If we had a tumble win but did not notify (e.g., no win animations played), notify now
    try {
      if (!firstWinNotified) {
        const w = Number((tumble as any)?.win ?? 0);
        const outsArr = Array.isArray((tumble as any)?.symbols?.out) ? (tumble as any).symbols.out as Array<{ win?: number }> : [];
        const sumOuts = outsArr.reduce((s, o) => s + (Number(o?.win) || 0), 0);
        const tumbleTotal = (!isNaN(w) && w > 0) ? w : sumOuts;
        if (tumbleTotal > 0) {
          notifyFirstWinIfNeeded();
        }
      }
    } catch {}

    // Compress each column downwards and compute target indices for remaining symbols
    const symbolTotalHeight = self.displayHeight + self.verticalSpacing;
    const startY = self.slotY - self.totalGridHeight * 0.5;

    // Prepare a new grid to place references post-compression
    const newGrid: any[][] = Array.from({ length: numCols }, () => Array<any>(numRows).fill(null));
    const compressPromises: Promise<void>[] = [];

    for (let col = 0; col < numCols; col++) {
      const kept: Array<{ obj: any, oldRow: number }> = [];
      for (let row = 0; row < numRows; row++) {
        const obj = self.symbols[col][row];
        if (obj) kept.push({ obj, oldRow: row });
      }
      const bottomStart = numRows - kept.length; // first row index for packed symbols at bottom
      kept.forEach((entry, idx) => {
        const obj = entry.obj;
        const oldRow = entry.oldRow;
        const newRow = bottomStart + idx;
        const targetY = startY + newRow * symbolTotalHeight + symbolTotalHeight * 0.5;
        newGrid[col][newRow] = obj;
        // Track updated logical grid coordinates on the symbol
        try { (obj as any).__gridCol = col; (obj as any).__gridRow = newRow; } catch {}
        const needsMove = newRow !== oldRow;
        if (!needsMove) {
          // No movement needed; ensure y is correct and resolve immediately
          try {
            if (typeof obj.setY === 'function') obj.setY(targetY);
            const winTextObj: any = (obj as any)?.__winText;
            if (winTextObj && typeof winTextObj.setY === 'function') winTextObj.setY(targetY);
          } catch {}
          return; // no promise push to avoid waiting on a non-existent tween
        }
        compressPromises.push(new Promise<void>((resolve) => {
          try {
            const tweenTargetsMove: any = this.getSymbolTweenTargets(obj);
            const isTurbo = !!self.scene.gameData?.isTurbo;
            const baseDuration = self.scene.gameData.dropDuration;
            // Use a slightly shorter duration in turbo, but long enough for easing
            // to be visible so the motion doesn't feel rigid.
            const compressionDuration = isTurbo
              ? Math.max(160, baseDuration * 0.6)
              : baseDuration;
            const baseDelayMultiplier = (self.scene?.gameData?.compressionDelayMultiplier ?? 1);
            const colDelay = STAGGER_MS * col * baseDelayMultiplier;
            // In turbo, keep some stagger but reduce it so columns still feel snappy.
            const delay = isTurbo ? colDelay * 0.4 : colDelay;
            self.scene.tweens.add({
              targets: tweenTargetsMove,
              y: targetY,
              delay,
              duration: compressionDuration,
              // In turbo mode, keep motion snappy but smoothly decelerating
              ease: self.scene.gameData?.isTurbo
                ? Phaser.Math.Easing.Cubic.Out
                : Phaser.Math.Easing.Bounce.Out,
              onComplete: () => resolve(),
            });
          } catch { resolve(); }
        }));
      });
    }

    // Overlap-aware drop scheduling: if enabled, start drops during compression; otherwise, drop after compression completes
    const overlapDrops = !!(self.scene?.gameData?.tumbleOverlapDropsDuringCompression);
    const dropPromises: Promise<void>[] = [];
    const symbolTotalWidth = self.displayWidth + self.horizontalSpacing;
    const startX = self.slotX - self.totalGridWidth * 0.5;
    let totalSpawned = 0;

    if (overlapDrops) {
      // Replace grid immediately so top nulls represent empty slots while compression runs
      self.symbols = newGrid;
      // Update all objects with their current grid coordinates for consistency
      try {
        for (let c = 0; c < numCols; c++) {
          for (let r = 0; r < numRows; r++) {
            const o = self.symbols[c][r];
            if (o) { try { (o as any).__gridCol = c; (o as any).__gridRow = r; } catch {} }
          }
        }
      } catch {}
      // Rebuild currentSymbolData to reflect compressed positions now
      try {
        if (self.currentSymbolData) {
          const rebuilt: (number | null)[][] = Array.from({ length: numRows }, () => Array<number | null>(numCols).fill(null));
          for (let col = 0; col < numCols; col++) {
            const keptValues: number[] = [];
            for (let row = 0; row < numRows; row++) {
              const v = self.currentSymbolData[row]?.[col];
              if (typeof v === 'number') keptValues.push(v);
            }
            const bottomStart = numRows - keptValues.length;
            for (let i = 0; i < keptValues.length; i++) {
              const newRow = bottomStart + i;
              rebuilt[newRow][col] = keptValues[i];
            }
          }
          const finalized: number[][] = rebuilt.map(row => row.map(v => (typeof v === 'number' ? v : 0)));
          self.currentSymbolData = finalized;
        }
      } catch {}

      // Start drops now, while compression tweens are in-flight
      for (let col = 0; col < numCols; col++) {
        const incoming = Array.isArray(ins?.[col]) ? ins[col] : [];
        if (incoming.length === 0) continue;

        let emptyCount = 0;
        for (let row = 0; row < numRows; row++) {
          if (!self.symbols[col][row]) emptyCount++;
          else break;
        }
        const spawnCount = Math.min(emptyCount, incoming.length);
        console.log(`[Symbols] (overlap) Column ${col}: empty=${emptyCount}, incoming=${incoming.length}, spawning=${spawnCount}`);
        for (let j = 0; j < spawnCount; j++) {
          const targetRow = Math.max(0, emptyCount - 1 - j);
          const targetY = startY + targetRow * symbolTotalHeight + symbolTotalHeight * 0.5;
          const xPos = startX + col * symbolTotalWidth + symbolTotalWidth * 0.5;

          const srcIndex = Math.max(0, incoming.length - 1 - j);
          const value = incoming[srcIndex];
          const topOfGridCenterY = startY + symbolTotalHeight * 0.5;
          const startYPos = topOfGridCenterY - self.scene.scale.height + (j * symbolTotalHeight);
          const created: any = this.factory.createSugarOrPngSymbol(value, xPos, startYPos, 1);

          self.symbols[col][targetRow] = created;
          try { (created as any).__gridCol = col; (created as any).__gridRow = targetRow; } catch {}
          if (self.currentSymbolData && self.currentSymbolData[targetRow]) {
            (self.currentSymbolData[targetRow] as any)[col] = value;
          }

          try { this.animationsModule.playDropAnimation(created); } catch {}

          const DROP_STAGGER_MS = (self.scene?.gameData?.tumbleDropStaggerMs ?? (MANUAL_STAGGER_MS * 0.25));
          const symbolHop = self.scene.gameData.winUpHeight * 0.5;
          const isTurbo = !!self.scene.gameData?.isTurbo;
          dropPromises.push(new Promise<void>((resolve) => {
            try {
              const computedStartDelay = (self.scene?.gameData?.tumbleDropStartDelayMs ?? 0) + (DROP_STAGGER_MS * sequenceIndex);
              const skipPreHop = !!(self.scene?.gameData?.tumbleSkipPreHop);
              const tweensArr: any[] = [];
              if (!skipPreHop) {
                tweensArr.push({
                  delay: computedStartDelay,
                  y: `-= ${symbolHop}`,
                  duration: self.scene.gameData.winUpDuration,
                  ease: Phaser.Math.Easing.Circular.Out,
                });
                tweensArr.push({
                  y: targetY,
                  duration: (self.scene.gameData.dropDuration * 0.9),
                  ease: Phaser.Math.Easing.Linear,
                });
              } else {
                tweensArr.push({
                  delay: computedStartDelay,
                  y: targetY,
                  duration: (self.scene.gameData.dropDuration * 0.9),
                  ease: Phaser.Math.Easing.Linear,
                });
              }
              if (!isTurbo) {
                // Normal mode: include the small post-drop bounce and SFX
                tweensArr.push(
                  {
                    y: `+= ${10}`,
                    duration: self.scene.gameData.dropDuration * 0.05,
                    ease: Phaser.Math.Easing.Linear,
                  },
                  {
                    y: `-= ${10}`,
                    duration: self.scene.gameData.dropDuration * 0.05,
                    ease: Phaser.Math.Easing.Linear,
                    onComplete: () => {
                      try {
                        if (!self.scene.gameData.isTurbo && (window as any).audioManager) {
                          (window as any).audioManager.playSoundEffect(SoundEffectType.REEL_DROP);
                        }
                      } catch {}
                      resolve();
                    }
                  }
                );
              } else {
                // Turbo mode: no post-drop bounce; resolve on the main drop completion
                const last = tweensArr[tweensArr.length - 1];
                const prevOnComplete = last.onComplete;
                last.onComplete = () => {
                  try { 
                    if (prevOnComplete) prevOnComplete(); 
                    // Play tumble sound for every symbol dropped after compression in turbo mode
                    if ((window as any).audioManager) {
                      (window as any).audioManager.playSoundEffect(SoundEffectType.REEL_DROP);
                    }
                  } catch (e) {
                    console.warn('[Symbols] Error playing reel drop sound in turbo mode:', e);
                  }
                  resolve();
                };
              }
              try { 
                self.scene.tweens.chain({ 
                  targets: this.getSymbolTweenTargets(created), 
                  tweens: tweensArr 
                }); 
              } catch { 
                self.scene.tweens.chain({ targets: created, tweens: tweensArr }); 
              }
            } catch { resolve(); }
          }));
          sequenceIndex++;
          totalSpawned++;
        }
      }

      // Wait for both compression and drop to finish
      await Promise.all([...compressPromises, ...dropPromises]);
    } else {
      // Default behavior: wait compression, then set grid and drop
      await Promise.all(compressPromises);
      self.symbols = newGrid;
      // Update all objects with their current grid coordinates for consistency
      try {
        for (let c = 0; c < numCols; c++) {
          for (let r = 0; r < numRows; r++) {
            const o = self.symbols[c][r];
            if (o) { try { (o as any).__gridCol = c; (o as any).__gridRow = r; } catch {} }
          }
        }
      } catch {}
      try {
        if (self.currentSymbolData) {
          const rebuilt: (number | null)[][] = Array.from({ length: numRows }, () => Array<number | null>(numCols).fill(null));
          for (let col = 0; col < numCols; col++) {
            const keptValues: number[] = [];
            for (let row = 0; row < numRows; row++) {
              const v = self.currentSymbolData[row]?.[col];
              if (typeof v === 'number') keptValues.push(v);
            }
            const bottomStart = numRows - keptValues.length;
            for (let i = 0; i < keptValues.length; i++) {
              const newRow = bottomStart + i;
              rebuilt[newRow][col] = keptValues[i];
            }
          }
          const finalized: number[][] = rebuilt.map(row => row.map(v => (typeof v === 'number' ? v : 0)));
          self.currentSymbolData = finalized;
        }
      } catch {}

      for (let col = 0; col < numCols; col++) {
        const incoming = Array.isArray(ins?.[col]) ? ins[col] : [];
        if (incoming.length === 0) continue;
        let emptyCount = 0;
        for (let row = 0; row < numRows; row++) {
          if (!self.symbols[col][row]) emptyCount++;
          else break;
        }
        const spawnCount = Math.min(emptyCount, incoming.length);
        console.log(`[Symbols] Column ${col}: empty=${emptyCount}, incoming=${incoming.length}, spawning=${spawnCount}`);
        for (let j = 0; j < spawnCount; j++) {
          const targetRow = Math.max(0, emptyCount - 1 - j);
          const targetY = startY + targetRow * symbolTotalHeight + symbolTotalHeight * 0.5;
          const xPos = startX + col * symbolTotalWidth + symbolTotalWidth * 0.5;
          const srcIndex = Math.max(0, incoming.length - 1 - j);
          const value = incoming[srcIndex];
          const topOfGridCenterY = startY + symbolTotalHeight * 0.5;
          const startYPos = topOfGridCenterY - self.scene.scale.height + (j * symbolTotalHeight);
          const created: any = this.factory.createSugarOrPngSymbol(value, xPos, startYPos, 1);
          self.symbols[col][targetRow] = created;
          try { (created as any).__gridCol = col; (created as any).__gridRow = targetRow; } catch {}
          if (self.currentSymbolData && self.currentSymbolData[targetRow]) {
            (self.currentSymbolData[targetRow] as any)[col] = value;
          }
          try { this.animationsModule.playDropAnimation(created); } catch {}
          const DROP_STAGGER_MS = (self.scene?.gameData?.tumbleDropStaggerMs ?? (MANUAL_STAGGER_MS * 0.25));
          const symbolHop = self.scene.gameData.winUpHeight * 0.5;
          const isTurbo = !!self.scene.gameData?.isTurbo;
          dropPromises.push(new Promise<void>((resolve) => {
            try {
              const computedStartDelay = (self.scene?.gameData?.tumbleDropStartDelayMs ?? 0) + (DROP_STAGGER_MS * sequenceIndex);
              const skipPreHop = !!(self.scene?.gameData?.tumbleSkipPreHop);
              const tweensArr: any[] = [];
              if (!skipPreHop) {
                tweensArr.push({ delay: computedStartDelay, y: `-= ${symbolHop}`, duration: self.scene.gameData.winUpDuration, ease: Phaser.Math.Easing.Circular.Out });
                tweensArr.push({ y: targetY, duration: (self.scene.gameData.dropDuration * 0.9), ease: Phaser.Math.Easing.Linear });
              } else {
                tweensArr.push({ delay: computedStartDelay, y: targetY, duration: (self.scene.gameData.dropDuration * 0.9), ease: Phaser.Math.Easing.Linear });
              }
              if (!isTurbo) {
                // Normal mode: include the small post-drop bounce and SFX
                tweensArr.push(
                  { y: `+= ${10}`, duration: self.scene.gameData.dropDuration * 0.05, ease: Phaser.Math.Easing.Linear },
                  {
                    y: `-= ${10}`,
                    duration: self.scene.gameData.dropDuration * 0.05,
                    ease: Phaser.Math.Easing.Linear,
                    onComplete: () => {
                      try {
                        if (!self.scene.gameData.isTurbo && (window as any).audioManager) {
                          (window as any).audioManager.playSoundEffect(SoundEffectType.REEL_DROP);
                        }
                      } catch {}
                      resolve();
                    }
                  }
                );
              } else {
                // Turbo mode: no post-drop bounce; resolve on the main drop completion
                const last = tweensArr[tweensArr.length - 1];
                const prevOnComplete = last.onComplete;
                last.onComplete = () => {
                  try { 
                    if (prevOnComplete) prevOnComplete(); 
                    // Play tumble sound for every symbol dropped after compression in turbo mode
                    if ((window as any).audioManager) {
                      (window as any).audioManager.playSoundEffect(SoundEffectType.REEL_DROP);
                    }
                  } catch (e) {
                    console.warn('[Symbols] Error playing reel drop sound in turbo mode:', e);
                  }
                  resolve();
                };
              }
              self.scene.tweens.chain({ targets: created, tweens: tweensArr });
            } catch { resolve(); }
          }));
          sequenceIndex++;
          totalSpawned++;
        }
      }
      await Promise.all(dropPromises);
    }

    // Debug: validate totals between outs and ins after spawn
    try {
      const totalOutRequested = outs.reduce((s, o) => s + (Number(o?.count) || 0), 0);
      if (totalOutRequested !== totalSpawned) {
        console.warn('[Symbols] Tumble total mismatch: out.count sum != spawned', {
          totalOutRequested,
          totalSpawned
        });
      } else {
        console.log('[Symbols] Tumble totals OK: removed == spawned', { totalSpawned });
      }
    } catch {}

    // Re-evaluate wins after each tumble drop completes
    try { this.reevaluateWinsFromGrid(); } catch {}
    
    // Check for scatter hits from the updated grid after this tumble (both normal and bonus mode)
    try {
      // Scan the live symbols grid to find actual scatter objects and positions
      const grids: Array<{ x: number; y: number }> = [];
      if (self.symbols && self.symbols.length > 0) {
        for (let col = 0; col < self.symbols.length; col++) {
          const column = self.symbols[col];
          if (!Array.isArray(column)) continue;
          for (let row = 0; row < column.length; row++) {
            const obj: any = column[row];
            if (!obj) continue;
            const isScatter = (obj as any)?.symbolValue === 0 || (obj?.texture?.key === 'symbol_0');
            if (isScatter) grids.push({ x: col, y: row });
          }
        }
      }
      const count = grids.length;
      
      if (gameStateManager.isBonus) {
        // Bonus mode: check for retrigger (3+ scatters)
        if (count >= 3) {
          console.log(`[Symbols] Scatter detected during tumble in bonus: ${count} scatter(s)`);
          // Defer retrigger to run after all wins/tumbles/multipliers complete (WIN_STOP)
          if (!(self as any).pendingScatterRetrigger) {
            self.setPendingScatterRetrigger(grids);
            console.log('[Symbols] Scheduled retrigger sequence to run after WIN_STOP');
          } else {
            console.log('[Symbols] Retrigger already scheduled; skipping duplicate schedule');
          }
        }
      } else {
        // Normal mode: check for scatter trigger (4+ scatters)
        if (count >= 4 && !gameStateManager.isScatter) {
          console.log(`[Symbols] Scatter detected during tumble in normal mode: ${count} scatter(s)`);
          // Mark scatter as detected - the final scatter check after all tumbles will handle the animation
          gameStateManager.isScatter = true;
          console.log('[Symbols] Scatter marked for processing after all tumbles complete');
        }
      }
    } catch (e) {
      console.warn('[Symbols] Failed to evaluate scatter during tumble:', e);
    }
  }

  private reevaluateWinsFromGrid(): void {
    // Re-evaluate wins after tumble drop completes
    // This would call the symbol detector logic to check for new wins
    // For now, this is a placeholder
  }

  private playExplosionVfx(x: number, y: number): void {
    const spineKey = 'Explosion_BZ_VFX';
    const atlasKey = `${spineKey}-atlas`;

    if (!this.scene || typeof (this.scene.add as any).spine !== 'function') {
      return;
    }

    try {
      const cacheJson: any = this.scene.cache.json;
      if (cacheJson && typeof cacheJson.has === 'function' && !cacheJson.has(spineKey)) {
        return;
      }
    } catch {}

    let vfx: any;
    try {
      vfx = (this.scene.add as any).spine(x, y, spineKey, atlasKey);
    } catch {
      return;
    }
    if (!vfx) return;

    try { vfx.setOrigin?.(0.5, 0.5); } catch {}
    try { this.animationsModule.fitSpineToSymbolBox(vfx); } catch {}
    try {
      const baseX = (vfx as any).scaleX ?? 1;
      const baseY = (vfx as any).scaleY ?? 1;
      vfx.setScale(baseX * 0.5, baseY * 0.5); //adjust explosion size
    } catch {}
    try { vfx.setDepth?.(DEPTH_WINNING_SYMBOL + 10); } catch {}

    const destroyVfx = () => {
      try {
        if (vfx && !vfx.destroyed) vfx.destroy();
      } catch {}
    };

    try {
      const animState = vfx.animationState;
      if (animState && typeof animState.setAnimation === 'function') {
        if (animState.clearTracks) animState.clearTracks();
        if (animState.addListener) {
          const listener = {
            complete: (entry: any) => {
              try {
                if (entry?.animation?.name !== 'BZ_Explosion') return;
              } catch {}
              try { animState.removeListener?.(listener); } catch {}
              destroyVfx();
            }
          };
          animState.addListener(listener);
        }
        animState.setAnimation(0, 'BZ_Explosion', false);
      }
    } catch {}

    this.scene.time.delayedCall(1200, destroyVfx);
  }

  private playPreExplosionPulse(target: any, onComplete: () => void): void {
    try {
      if (!this.scene || !target) {
        onComplete();
        return;
      }
      const baseX = (target as any)?.scaleX;
      const baseY = (target as any)?.scaleY;
      const safeBaseX = (typeof baseX === 'number' && isFinite(baseX)) ? baseX : 1;
      const safeBaseY = (typeof baseY === 'number' && isFinite(baseY)) ? baseY : 1;
      const shrinkFactor = 0.85;
      const shrinkDuration = 90;
      const restoreDuration = 110;

      try { this.scene.tweens.killTweensOf(target); } catch {}
      this.scene.tweens.add({
        targets: target,
        scaleX: safeBaseX * shrinkFactor,
        scaleY: safeBaseY * shrinkFactor,
        duration: shrinkDuration,
        ease: Phaser.Math.Easing.Cubic.Out,
        onComplete: () => {
          this.scene.tweens.add({
            targets: target,
            scaleX: safeBaseX,
            scaleY: safeBaseY,
            duration: restoreDuration,
            ease: Phaser.Math.Easing.Cubic.Out,
            onComplete: () => onComplete(),
          });
        }
      });
    } catch {
      try { onComplete(); } catch {}
    }
  }

  /**
   * Get tween targets for a symbol (includes overlay if present)
   */
  private getSymbolTweenTargets(baseObj: any): any {
    try {
      const overlayObj: any = (baseObj as any)?.__overlayImage;
      if (overlayObj) return [baseObj, overlayObj];
    } catch {}
    return baseObj;
  }

  /**
   * Destroy overlay image associated with a symbol
   */
  private destroySymbolOverlays(baseObj: any): void {
    try {
      const overlayObj: any = (baseObj as any)?.__overlayImage;
      if (overlayObj && overlayObj.destroy && !overlayObj.destroyed) overlayObj.destroy();
    } catch {}
    try {
      const winTextObj: any = (baseObj as any)?.__winText;
      // Detach from symbol so later cleanup doesn't double-handle it; let its tween onComplete destroy it
      if (winTextObj) { (baseObj as any).__winText = null; }
    } catch {}
  }
}
