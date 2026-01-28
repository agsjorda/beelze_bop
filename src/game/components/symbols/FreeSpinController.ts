/**
 * FreeSpinController - Manages free spin autoplay during bonus mode
 * 
 * Responsibilities:
 * - Track free spin state (active, remaining spins)
 * - Handle free spin autoplay flow
 * - Coordinate with game events for spin timing
 */

import type { Game } from '../../scenes/Game';
import type { PendingFreeSpinsData } from './types';
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { gameStateManager } from '../../../managers/GameStateManager';
import { TurboConfig } from '../../../config/TurboConfig';

/**
 * Manages the free spin autoplay system during bonus mode
 */
export class FreeSpinController {
  private scene: Game;
  
  /** Whether free spin autoplay is currently active */
  private _isActive: boolean = false;
  
  /** Number of free spins remaining */
  private spinsRemaining: number = 0;
  
  /** Timer for scheduling next spin */
  private autoplayTimer: Phaser.Time.TimerEvent | null = null;
  
  /** Waiting for reels to stop before continuing */
  private waitingForReelsStop: boolean = false;
  
  /** Waiting for win lines to complete before continuing */
  private waitingForWinlines: boolean = false;
  
  /** Whether free spin autoplay has been triggered (prevents duplicates) */
  private hasTriggered: boolean = false;
  
  /** Waiting for reels to start to decrement counter */
  private awaitingReelsStart: boolean = false;
  
  /** Pending free spins data from scatter bonus activation */
  private pendingFreeSpinsData: PendingFreeSpinsData | null = null;
  
  /** Whether dialog listener has been set up */
  private dialogListenerSetup: boolean = false;

  /** Callbacks to integrate with main Symbols class */
  private callbacks: {
    onResetScatterSymbols?: () => Promise<void>;
    onShowCongratsDialog?: () => void;
    onSetTurboMode?: (enabled: boolean) => void;
    getCurrentSpinData?: () => any;
  } = {};

  constructor(scene: Game) {
    this.scene = scene;
  }

  // ============================================================================
  // PUBLIC ACCESSORS
  // ============================================================================

  /**
   * Check if free spin autoplay is currently active
   */
  public get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Get the number of spins remaining
   */
  public getSpinsRemaining(): number {
    return this.spinsRemaining;
  }

  /**
   * Synchronize the internal counter with server-reported spinsLeft
   * Used when a retrigger occurs during bonus
   */
  public setSpinsRemaining(spinsRemaining: number): void {
    const normalized = Math.max(0, Number(spinsRemaining) || 0);
    this.spinsRemaining = normalized;
    console.log(`[FreeSpinController] Synced spins remaining to: ${normalized}`);
  }

  /**
   * Set pending free spins data (from scatter bonus activation)
   */
  public setPendingFreeSpinsData(data: PendingFreeSpinsData): void {
    console.log(`[FreeSpinController] Storing pending free spins data: ${data.actualFreeSpins} spins`);
    this.pendingFreeSpinsData = data;
  }

  /**
   * Register callbacks for integration with main Symbols class
   */
  public setCallbacks(callbacks: {
    onResetScatterSymbols?: () => Promise<void>;
    onShowCongratsDialog?: () => void;
    onSetTurboMode?: (enabled: boolean) => void;
    getCurrentSpinData?: () => any;
  }): void {
    this.callbacks = callbacks;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Set up event listeners for free spin autoplay
   */
  public setupEventListeners(): void {
    // Listen for reels stop to continue autoplay
    gameEventManager.on(GameEventType.REELS_STOP, () => {
      if (this._isActive && this.waitingForReelsStop) {
        console.log('[FreeSpinController] REELS_STOP received - continuing autoplay');
        this.waitingForReelsStop = false;
        this.continueAutoplay();
      }
    });
    
    // Listen for reels start to safely decrement counter
    gameEventManager.on(GameEventType.REELS_START, () => {
      if (this._isActive && this.awaitingReelsStart) {
        const before = this.spinsRemaining;
        if (this.spinsRemaining > 0) {
          this.spinsRemaining -= 1;
        }
        this.awaitingReelsStart = false;
        console.log(`[FreeSpinController] Counter decremented: ${before} -> ${this.spinsRemaining}`);
      }
    });
    
    // Listen for win stop to schedule next spin
    gameEventManager.on(GameEventType.WIN_STOP, () => {
      if (this._isActive && this.waitingForWinlines) {
        this.handleWinStop();
      }
    });
  }

  /**
   * Reset the dialog listener setup flag
   */
  public resetDialogListenerSetup(): void {
    this.dialogListenerSetup = false;
  }

  // ============================================================================
  // TRIGGER & START
  // ============================================================================

  /**
   * Trigger autoplay for free spins if available
   */
  public triggerAutoplay(): void {
    // Prevent duplicate triggering
    if (this.hasTriggered || this._isActive) {
      console.log('[FreeSpinController] Already triggered or active, skipping');
      return;
    }
    
    // Check if we're in bonus mode
    if (!gameStateManager.isBonus) {
      console.log('[FreeSpinController] Not in bonus mode, skipping');
      return;
    }

    let freeSpinsCount = 0;
    
    console.log('[FreeSpinController] ===== TRIGGERING AUTOPLAY =====');
    
    // Check pending data first
    if (this.pendingFreeSpinsData) {
      if (this.pendingFreeSpinsData.actualFreeSpins > 0) {
        freeSpinsCount = this.pendingFreeSpinsData.actualFreeSpins;
        console.log(`[FreeSpinController] Using pending data: ${freeSpinsCount} spins`);
        this.pendingFreeSpinsData = null;
      } else {
        console.log('[FreeSpinController] Pending data is 0, falling back to spinData');
        this.pendingFreeSpinsData = null;
      }
    } else if (gameStateManager.isBonus && this.callbacks.getCurrentSpinData) {
      // Try to get from current spin data
      const spinData = this.callbacks.getCurrentSpinData();
      const fsLegacy = spinData?.slot?.freespin?.count || 0;
      const fsItems = spinData?.slot?.freeSpin?.items || spinData?.slot?.freespin?.items || [];
      const firstItemSpinsLeft = Array.isArray(fsItems) && fsItems.length > 0 && typeof fsItems[0]?.spinsLeft === 'number'
        ? fsItems[0].spinsLeft
        : 0;
      const fsItemsLen = Array.isArray(fsItems) ? fsItems.length : 0;
      freeSpinsCount = Math.max(firstItemSpinsLeft, fsLegacy, fsItemsLen);
      
      if (freeSpinsCount > 0) {
        console.log(`[FreeSpinController] Using spin data: ${freeSpinsCount} spins`);
      }
    }
    
    if (freeSpinsCount > 0) {
      console.log(`[FreeSpinController] Starting autoplay with ${freeSpinsCount} spins`);
      this.hasTriggered = true;
      this.start(freeSpinsCount);
    } else {
      console.log('[FreeSpinController] No free spins available');
    }
  }

  /**
   * Start free spin autoplay
   */
  public async start(spinCount: number): Promise<void> {
    console.log(`[FreeSpinController] ===== STARTING WITH ${spinCount} SPINS =====`);
    
    this._isActive = true;
    this.spinsRemaining = spinCount;
    
    // Set global autoplay state
    gameStateManager.isAutoPlaying = true;
    gameStateManager.isAutoPlaySpinRequested = true;
    if (this.scene.gameData) {
      this.scene.gameData.isAutoPlaying = true;
    }
    
    // Apply turbo mode if enabled
    if (gameStateManager.isTurbo && this.callbacks.onSetTurboMode) {
      console.log('[FreeSpinController] Applying turbo mode');
      this.callbacks.onSetTurboMode(true);
    }
    
    // Reset scatter symbols before starting
    if (this.callbacks.onResetScatterSymbols) {
      try {
        await this.callbacks.onResetScatterSymbols();
      } catch (e) {
        console.warn('[FreeSpinController] Failed to reset scatter symbols:', e);
      }
    }
    
    // Perform first spin
    this.performSpin();
  }

  // ============================================================================
  // SPIN EXECUTION
  // ============================================================================

  /**
   * Perform a single free spin
   */
  private async performSpin(): Promise<void> {
    if (!this._isActive || this.spinsRemaining <= 0) {
      console.log('[FreeSpinController] Stopping - no spins remaining');
      this.stop();
      return;
    }

    console.log(`[FreeSpinController] ===== SPIN ${this.spinsRemaining} =====`);
    
    // Check if still in bonus mode
    if (!gameStateManager.isBonus) {
      console.log('[FreeSpinController] No longer in bonus mode - stopping');
      this.stop();
      return;
    }

    // Check if win dialog is showing
    if (gameStateManager.isShowingWinDialog) {
      console.log('[FreeSpinController] Win dialog showing - waiting');
      this.scene.events.once('dialogAnimationsComplete', () => {
        console.log('[FreeSpinController] Dialog complete - retrying spin');
        const baseDelay = 0;
        const turboDelay = gameStateManager.isTurbo 
          ? baseDelay * TurboConfig.TURBO_DELAY_MULTIPLIER 
          : baseDelay;
        this.scene.time.delayedCall(turboDelay, () => this.performSpin());
      });
      return;
    }

    try {
      console.log('[FreeSpinController] Emitting FREE_SPIN_AUTOPLAY event');
      gameEventManager.emit(GameEventType.FREE_SPIN_AUTOPLAY);
      
      this.awaitingReelsStart = true;
      this.waitingForReelsStop = true;
      console.log('[FreeSpinController] Waiting for reels to stop');
    } catch (error) {
      console.error('[FreeSpinController] Error during spin:', error);
      this.stop();
    }
  }

  /**
   * Continue autoplay after reels stop
   */
  private continueAutoplay(): void {
    console.log(`[FreeSpinController] Continuing - ${this.spinsRemaining} spins remaining`);
    
    if (this.spinsRemaining > 0) {
      console.log('[FreeSpinController] Waiting for WIN_STOP');
      this.waitingForWinlines = true;
    } else {
      // If a scatter retrigger is pending, keep autoplay active until retrigger flow completes.
      try {
        const symbolsAny: any = this.scene as any;
        const symbols = symbolsAny?.symbols;
        if (
          gameStateManager.isBonus &&
          symbols &&
          typeof symbols.hasPendingScatterRetrigger === 'function' &&
          symbols.hasPendingScatterRetrigger()
        ) {
          console.log('[FreeSpinController] Retrigger pending - deferring stop until retrigger sequence completes');
          return;
        }
      } catch { }

      console.log('[FreeSpinController] All spins completed');
      this.stop();
    }
  }

  /**
   * Handle WIN_STOP event
   */
  private handleWinStop(): void {
    console.log('[FreeSpinController] WIN_STOP received');
    
    if (!this.waitingForWinlines) {
      return;
    }

    this.waitingForWinlines = false;
    
    // Clear existing timer
    if (this.autoplayTimer) {
      this.autoplayTimer.destroy();
      this.autoplayTimer = null;
    }
    
    // Schedule next spin with appropriate delay
    const baseDelay = 500;
    const turboDelay = gameStateManager.isTurbo 
      ? baseDelay * TurboConfig.TURBO_DELAY_MULTIPLIER 
      : baseDelay;
    
    console.log(`[FreeSpinController] Scheduling next spin in ${turboDelay}ms`);
    
    this.autoplayTimer = this.scene.time.delayedCall(turboDelay, () => {
      this.performSpin();
    });
  }

  /**
   * Wait for all dialogs to close then resume autoplay
   */
  public waitForAllDialogsToCloseThenResume(): void {
    const gameScene = this.scene as any;
    const dialogs = gameScene?.dialogs;

    this.scene.time.delayedCall(0, () => {
      const anyDialogShowing = !!(dialogs && typeof dialogs.isDialogShowing === 'function' && dialogs.isDialogShowing());
      const winDialogShowing = !!gameStateManager.isShowingWinDialog;

      if (anyDialogShowing || winDialogShowing) {
        console.log('[FreeSpinController] Waiting for dialogs to close...');
        this.scene.events.once('dialogAnimationsComplete', () => {
          this.waitForAllDialogsToCloseThenResume();
        });
        return;
      }

      // Grace window for new dialogs
      let settled = false;
      const onDialogShown = () => {
        if (settled) return;
        settled = true;
        console.log('[FreeSpinController] Dialog shown during grace window - waiting');
        this.scene.events.once('dialogAnimationsComplete', () => {
          this.waitForAllDialogsToCloseThenResume();
        });
      };

      this.scene.events.once('dialogShown', onDialogShown);

      this.scene.time.delayedCall(0, () => {
        if (settled) return;
        
        const showingNow = !!(dialogs && typeof dialogs.isDialogShowing === 'function' && dialogs.isDialogShowing());
        const winNow = !!gameStateManager.isShowingWinDialog;
        
        if (showingNow || winNow) {
          settled = true;
          this.waitForAllDialogsToCloseThenResume();
          return;
        }
        
        settled = true;
        this.scene.time.delayedCall(120, () => this.performSpin());
      });
    });
  }

  // ============================================================================
  // STOP & CLEANUP
  // ============================================================================

  /**
   * Stop free spin autoplay
   */
  public stop(): void {
    console.log('[FreeSpinController] ===== STOPPING =====');
    
    // Clear timer
    if (this.autoplayTimer) {
      this.autoplayTimer.destroy();
      this.autoplayTimer = null;
    }
    
    // Reset state
    this._isActive = false;
    this.spinsRemaining = 0;
    this.waitingForReelsStop = false;
    this.waitingForWinlines = false;
    this.hasTriggered = false;
    this.awaitingReelsStart = false;
    this.dialogListenerSetup = false;
    
    // Reset global autoplay state
    gameStateManager.isAutoPlaying = false;
    gameStateManager.isAutoPlaySpinRequested = false;
    if (this.scene.gameData) {
      this.scene.gameData.isAutoPlaying = false;
    }
    
    // Restore winline timing
    if (this.callbacks.onSetTurboMode) {
      this.callbacks.onSetTurboMode(false);
    }
    
    // Schedule congrats dialog
    this.scheduleCongratsDialog();
    
    // Emit AUTO_STOP event
    gameEventManager.emit(GameEventType.AUTO_STOP);
    
    console.log('[FreeSpinController] Stopped');
  }

  /**
   * Reset all state (called on bonus end)
   */
  public reset(): void {
    if (this.autoplayTimer) {
      this.autoplayTimer.destroy();
      this.autoplayTimer = null;
    }
    
    this._isActive = false;
    this.spinsRemaining = 0;
    this.waitingForReelsStop = false;
    this.waitingForWinlines = false;
    this.hasTriggered = false;
    this.awaitingReelsStart = false;
    this.dialogListenerSetup = false;
    this.pendingFreeSpinsData = null;
  }

  // ============================================================================
  // CONGRATS DIALOG
  // ============================================================================

  /**
   * Schedule the congrats dialog after autoplay ends
   */
  private scheduleCongratsDialog(): void {
    console.log('[FreeSpinController] Scheduling congrats dialog');

    const gameScene = this.scene as any;
    const dialogs = gameScene.dialogs;

    const isWinDialogActive = (): boolean => {
      try {
        const hasDialog = dialogs && typeof dialogs.isDialogShowing === 'function' && dialogs.isDialogShowing();
        const isWin = hasDialog && typeof dialogs.isWinDialog === 'function' && dialogs.isWinDialog();
        return (!!isWin) || !!gameStateManager.isShowingWinDialog;
      } catch {
        return !!gameStateManager.isShowingWinDialog;
      }
    };

    // If win dialog already active, defer to WIN_DIALOG_CLOSED handler
    if (isWinDialogActive()) {
      console.log('[FreeSpinController] Win dialog active - deferring congrats');
      return;
    }

    // Grace window to catch win dialogs
    let settled = false;

    const onDialogShown = (dialogType?: string) => {
      if (settled) return;

      const type = String(dialogType || '');
			const isWinDialog = ['BigW_BZ', 'MegaW_BZ', 'EpicW_BZ', 'SuperW_BZ'].includes(type);

      if (!isWinDialog) return;

      console.log('[FreeSpinController] Win dialog shown - deferring congrats');
      settled = true;
      this.scene.events.off('dialogShown', onDialogShown);
    };

    this.scene.events.on('dialogShown', onDialogShown);

    const graceMs = 1200;

    this.scene.time.delayedCall(graceMs, () => {
      if (settled) return;

      this.scene.events.off('dialogShown', onDialogShown);

      if (isWinDialogActive()) {
        console.log('[FreeSpinController] Win dialog active after grace - deferring');
        return;
      }

      if (gameStateManager.isBonusFinished && this.callbacks.onShowCongratsDialog) {
        console.log('[FreeSpinController] Showing congrats dialog');
        this.callbacks.onShowCongratsDialog();
      }
    });
  }
}
