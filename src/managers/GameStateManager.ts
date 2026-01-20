import { gameEventManager, GameEventType } from '../event/EventManager';
import { Logger } from '../utils/Logger';

/**
 * Centralized Game State Manager
 * Manages specific game-related states that need to be shared across components
 */
export class GameStateManager {
  private static instance: GameStateManager;
  
  // Game state properties
  private _timeScale: number = 1;
  private _isScatter: boolean = false;
  private _isBonus: boolean = false;
  private _isReelSpinning: boolean = false;
  private _isNormalSpin: boolean = false;
  private _isAutoPlaying: boolean = false;
  private _isTurbo: boolean = false;
  private _isAutoPlaySpinRequested: boolean = false;
  private _isShowingWinlines: boolean = false;
  private _isShowingWinDialog: boolean = false;
  private _scatterIndex: number = 0;
  private _isBonusFinished: boolean = false;

  private constructor() {
    this.initializeEventListeners();
  }

  public static getInstance(): GameStateManager {
    if (!GameStateManager.instance) {
      GameStateManager.instance = new GameStateManager();
    }
    return GameStateManager.instance;
  }

  /**
   * Initialize event listeners for state synchronization
   */
  private initializeEventListeners(): void {
    // Note: SPIN_RESPONSE event listener removed - now using SPIN_DATA_RESPONSE

    // Listen for turbo state changes
    gameEventManager.on(GameEventType.TURBO_ON, () => {
      this._isTurbo = true;
    });

    gameEventManager.on(GameEventType.TURBO_OFF, () => {
      this._isTurbo = false;
    });

    // Listen for autoplay state changes
    gameEventManager.on(GameEventType.AUTO_START, () => {
      console.log('[GameStateManager] AUTO_START received, setting isAutoPlaying to true');
      this._isAutoPlaying = true;
    });

    gameEventManager.on(GameEventType.AUTO_STOP, () => {
      console.log('[GameStateManager] AUTO_STOP received, setting isAutoPlaying to false');
      this._isAutoPlaying = false;
    });

    // Listen for win animation states
    gameEventManager.on(GameEventType.WIN_START, () => {
      this._isShowingWinlines = true;
    });

    gameEventManager.on(GameEventType.WIN_STOP, () => {
      this._isShowingWinlines = false;
    });
  }

  /**
   * Update state from backend data
   */
  private updateFromBackend(data: any): void {
    if (data.isBonus !== undefined) this._isBonus = data.isBonus;
    if (data.isScatter !== undefined) this._isScatter = data.isScatter;
  }

  // Getters for all state properties
  public get timeScale(): number { return this._timeScale; }
  public get isScatter(): boolean { return this._isScatter; }
  public get isBonus(): boolean { return this._isBonus; }
  public get isReelSpinning(): boolean { return this._isReelSpinning; }
  public get isNormalSpin(): boolean { return this._isNormalSpin; }
  public get isAutoPlaying(): boolean { return this._isAutoPlaying; }
  public get isTurbo(): boolean { return this._isTurbo; }
  public get isAutoPlaySpinRequested(): boolean { return this._isAutoPlaySpinRequested; }
  public get isShowingWinlines(): boolean { return this._isShowingWinlines; }
  public get isShowingWinDialog(): boolean { return this._isShowingWinDialog; }
  public get scatterIndex(): number { return this._scatterIndex; }
  public get isBonusFinished(): boolean { return this._isBonusFinished; }

  // Setters for state properties (with event emission where appropriate)
  public set timeScale(value: number) {
    this._timeScale = value;
  }

  public set isScatter(value: boolean) {
    this._isScatter = value;
  }

  public set isBonus(value: boolean) {
    console.log(`[GameStateManager] Setting isBonus to: ${value}`);
    this._isBonus = value;
    console.log(`[GameStateManager] isBonus is now: ${this._isBonus}`);
  }

  public set isReelSpinning(value: boolean) {
    this._isReelSpinning = value;
    // Emit reel state events - these are safe because they're state changes, not circular
    if (value) {
      gameEventManager.emit(GameEventType.REELS_START);
    } else {
      gameEventManager.emit(GameEventType.REELS_STOP);
    }
  }

  public set isNormalSpin(value: boolean) {
    this._isNormalSpin = value;
  }

  public set isAutoPlaying(value: boolean) {
    this._isAutoPlaying = value;
  }

  public set isTurbo(value: boolean) {
    this._isTurbo = value;
    // Don't emit events here to avoid circular emission
    // Events are emitted by the components that change the state
  }

  public set isAutoPlaySpinRequested(value: boolean) {
    this._isAutoPlaySpinRequested = value;
  }

  public set isShowingWinlines(value: boolean) {
    this._isShowingWinlines = value;
  }

  public set isShowingWinDialog(value: boolean) {
    this._isShowingWinDialog = value;
  }

  public set scatterIndex(value: number) {
    this._scatterIndex = value;
  }

  public set isBonusFinished(value: boolean) {
    if (this._isBonusFinished !== value) {
      console.log(`[GameStateManager] isBonusFinished set to: ${value}`);
    } else {
      console.log(`[GameStateManager] isBonusFinished re-set to same value: ${value}`);
    }
    this._isBonusFinished = value;
  }

  /**
   * Start a spin
   */
  public startSpin(): void {
    // Check if we're in bonus mode - if so, let the free spin autoplay system handle it
    if (this.isBonus) {
      console.log('[GameStateManager] In bonus mode - skipping old spin system, free spin autoplay will handle it');
      return;
    }
    
    this._isNormalSpin = true;
    this._isAutoPlaySpinRequested = false;
    // Emit SPIN event to trigger the backend
    // This is safe because it's called from the Game scene, not from event listeners
    gameEventManager.emit(GameEventType.SPIN, { betAmount: 0.20 });
  }

  /**
   * Toggle turbo mode
   */
  public toggleTurbo(): void {
    this._isTurbo = !this._isTurbo;
    if (this._isTurbo) {
      gameEventManager.emit(GameEventType.TURBO_ON);
    } else {
      gameEventManager.emit(GameEventType.TURBO_OFF);
    }
  }

  /**
   * Reset game state
   */
  public reset(): void {
    this._timeScale = 1;
    this._isScatter = false;
    this._isBonus = false;
    this._isReelSpinning = false;
    this._isNormalSpin = false;
    this._isAutoPlaying = false;
    this._isTurbo = false;
    this._isAutoPlaySpinRequested = false;
    this._isShowingWinlines = false;
    this._isShowingWinDialog = false;
    this._scatterIndex = 0;
    this._isBonusFinished = false;
  }

  /**
   * Get current state as a plain object (for debugging/logging)
   */
  public getState(): object {
    return {
      timeScale: this._timeScale,
      isScatter: this._isScatter,
      isBonus: this._isBonus,
      isReelSpinning: this._isReelSpinning,
      isNormalSpin: this._isNormalSpin,
      isAutoPlaying: this._isAutoPlaying,
      isTurbo: this._isTurbo,
      isAutoPlaySpinRequested: this._isAutoPlaySpinRequested,
      isShowingWinlines: this._isShowingWinlines,
      isShowingWinDialog: this._isShowingWinDialog,
      scatterIndex: this._scatterIndex,
      isBonusFinished: this._isBonusFinished
    };
  }
}

// Export singleton instance
export const gameStateManager = GameStateManager.getInstance();
