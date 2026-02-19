// BackendEvent import removed - no longer needed in this file

import { DROP_REEL_START_INTERVAL_RATIO, TIMING_CONFIG, ANIMATION_CONFIG } from '../../config/GameConfig';
import { Logger } from '../../utils/Logger';

/**
 * GameData - Holds runtime game state and timing configuration
 * 
 * Note: Most game state should use GameStateManager instead.
 * This class is primarily for animation timing and legacy compatibility.
 */
export class GameData {
	/** Default height for win-up animation (symbol hop before drop) */
	static WIN_UP_HEIGHT: number = 50;

	// Legacy state flags (prefer GameStateManager for new code)
	public isAutoPlaying: boolean = false;
	public isTurbo: boolean = false;
	public isReelSpinning: boolean = false;
	public isEnhancedBet: boolean = false;
	
	/**
	 * Bet ladder; single source of truth for SlotController, BetOptions,
	 * AutoplayOptions, BuyFeature, and any controllers that read bet levels.
	 * Overwritten from initialization data in Game.create() when available.
	 */
	public betLevels: number[] = [
		0.2, 0.4, 0.6, 0.8, 1,
		1.2, 1.6, 2, 2.4, 2.8,
		3.2, 3.6, 4, 5, 6,
		8, 10, 14, 18, 24,
		32, 40, 60, 80, 100,
		110, 120, 130, 140, 150
	];
	
	// Animation timing properties
	public winUpHeight: number = GameData.WIN_UP_HEIGHT;
	public winUpDuration: number = 0;
	public dropDuration: number = 0;
	public dropReelsDelay: number = 0;
	public dropReelsDuration: number = 0;
	public compressionDelayMultiplier: number = 1;
	
	// Tumble-specific timing controls
	public tumbleStaggerMs: number = TIMING_CONFIG.SYMBOL_STAGGER_MS * 2;
	public tumbleExplosionStartDelayMs: number = 300;
	// Delay for multiplier explosion SFX relative to explosion start (ms).
	// 0 = same time as explosion, positive = after, negative = before.
	public bonusMultiplierExplosionSoundDelayMs: number = 100;
	// Delay for bonus multiplier number relative to explosion start (ms).
	// 0 = same time as explosion, positive = after, negative = before.
	public bonusMultiplierNumberDelayMs: number = 700;
	public tumbleDropStaggerMs: number | null = null;
	public tumbleDropStartDelayMs: number = 0;
	public tumbleSkipPreHop: boolean = true;
	public tumbleOverlapDropsDuringCompression: boolean = true;

	public constructor() {
		setSpeed(this, 1.0);
	}
}

/** Global time multiplier for symbol drop and reset animations (< 1.0 = faster) */
export const DROP_RESET_TIME_MULTIPLIER: number = 0.8;

export function setSpeed(data: GameData, DELAY_BETWEEN_SPINS: number) {
	// Apply global multiplier to win-up (reset) and drop durations
	data.winUpDuration = DELAY_BETWEEN_SPINS * 0.1 * DROP_RESET_TIME_MULTIPLIER;
	data.dropDuration = DELAY_BETWEEN_SPINS * 0.4 * DROP_RESET_TIME_MULTIPLIER;
	data.dropReelsDelay = DELAY_BETWEEN_SPINS * DROP_REEL_START_INTERVAL_RATIO;
	data.dropReelsDuration = DELAY_BETWEEN_SPINS * 0.4 * DROP_RESET_TIME_MULTIPLIER;
}

/**
 * @deprecated Use GameStateManager.isReelSpinning instead
 */
export function gameSpin(data: GameData) {
	Logger.create('GameData').warn('gameSpin function is deprecated - use GameStateManager.isReelSpinning instead');
}
