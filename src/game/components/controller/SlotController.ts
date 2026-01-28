import { Scene } from "phaser";
import { NetworkManager } from "../../../managers/NetworkManager";
import { ScreenModeManager } from "../../../managers/ScreenModeManager";
import { EventBus } from "../../EventBus";
import { GameData, setSpeed } from "../GameData";
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { gameStateManager } from '../../../managers/GameStateManager';
import { TurboConfig } from '../../../config/TurboConfig';
import { UI_CONFIG, TIMING_CONFIG } from '../../../config/GameConfig';
import { GameAPI } from '../../../backend/GameAPI';
import { SpinData, SpinDataUtils } from '../../../backend/SpinData';
import { BuyFeature } from '../BuyFeature';
import { Symbols } from '../symbols/index';
import { SoundEffectType } from '../../../managers/AudioManager';
import { LoadingSpinner } from '../LoadingSpinner';
import { ensureSpineFactory } from '../../../utils/SpineGuard';
import { Logger } from '../../../utils/Logger';
import { 
	createControlButton, 
	createTextLabel, 
	createButtonWithLabel,
	updateButtonState as uiUpdateButtonState,
	disableButton,
	enableButton,
	createBounceAnimation,
	formatAmount,
	getDefaultTextStyle,
} from '../../../utils/UIFactory';
import { 
	BetController, 
	AutoplayController, 
	SpinButtonController 
} from './index';

export class SlotController {
	private controllerContainer!: Phaser.GameObjects.Container;
	private controllerVerticalOffset: number = 0;
	// Horizontal offset for SlotController container
	private controllerHorizontalOffset: number = 0;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private scene: Scene | null = null;
	private gameData: GameData | null = null;
	private gameAPI: GameAPI | null = null;
	private symbols: Symbols | null = null;
	private buttons: Map<string, Phaser.GameObjects.Image> = new Map();
	
	// Controller modules
	private betController!: BetController;
	private autoplayController!: AutoplayController;
	private spinButtonController!: SpinButtonController;
	
	// Properties still needed (not yet migrated to controllers)
	private spinButtonAnimation: any = null;
	private freeRoundSpinButtonAnimation: any = null;
	private spinIcon!: Phaser.GameObjects.Image;
	private spinIconTween: Phaser.Tweens.Tween | null = null;
	private autoplayStopIcon!: Phaser.GameObjects.Image;
	private autoplayButtonAnimation: any = null;
	private autoplaySpinsRemainingText!: Phaser.GameObjects.Text;
	private baseBetAmount: number = 0.2;
	private betAmountText!: Phaser.GameObjects.Text;
	private betDollarText!: Phaser.GameObjects.Text;
	private amplifyBetAnimation: any = null;
	private enhanceBetIdleAnimation: any = null;
	
	// UI elements not managed by controllers
	private balanceAmountText!: Phaser.GameObjects.Text;
	private balanceDollarText!: Phaser.GameObjects.Text;
	private featureAmountText!: Phaser.GameObjects.Text;
	private featureDollarText!: Phaser.GameObjects.Text;
	private featureLabelText: Phaser.GameObjects.Text | null = null;
	private featureButtonHitZone: Phaser.GameObjects.Zone | null = null;
	private primaryControllers!: Phaser.GameObjects.Container;
	private controllerTexts: Phaser.GameObjects.Text[] = [];
	private amplifyDescriptionContainer!: Phaser.GameObjects.Container;
	private freeSpinLabel!: Phaser.GameObjects.Text;
	private freeSpinNumber!: Phaser.GameObjects.Text;
	private freeSpinSubLabel!: Phaser.GameObjects.Text;
	
	// UI override for free spin remaining display
	private freeSpinDisplayOverride: number | null = null;
	private pendingFreeSpinsData: { scatterIndex: number; actualFreeSpins: number } | null = null;
	
	// Store pending balance updates until reels stop spinning
	private pendingBalanceUpdate: { balance: number; bet: number; winnings?: number } | null = null;
	
	// Spine animation for turbo button (looping when active)
	private turboButtonAnimation: any = null;
	
	// Loading spinner for when API requests take > 2 seconds (after symbols clear)
	private loadingSpinner: LoadingSpinner | null = null;
	
	// When true, prevent the free spin display from being shown (e.g., after congrats)
	private freeSpinDisplaySuppressed: boolean = false;
	
	// For free spin autoplay UI sync: subtract 1 from server value for current spin
	private shouldSubtractOneFromServerFsDisplay: boolean = false;
	private uiFsDecrementApplied: boolean = false;
	
	
	// Buy feature drawer component
	private buyFeature: BuyFeature | null = null;
	// One-time debug override: force scatter trigger on first buy feature spin
	private didForceFirstBuyFeatureScatter: boolean = false;
	
	// Amplify bet pulsing system
	private amplifyBetBounceTimer: Phaser.Time.TimerEvent | null = null;
	
	// Flag to prevent amplify bet reset during internal bet changes
	private isInternalBetChange: boolean = false;

	// Feature button enable guard: only allow enabling after explicit setBonusMode(false)
	private canEnableFeatureButton: boolean = true;
	
	// When true, current autoplay session is a dedicated "freeround autoplay"
	private isFreeRoundAutoplay: boolean = false;
	// Flag to track if we need to re-enable spin button after first autoplay spin in normal mode
	private shouldReenableSpinButtonAfterFirstAutoplay: boolean = false;
	// Debounce for fast spin clicks
	private lastSpinClickAt: number = 0;
	private readonly spinClickDebounceMs: number = 250;
	// Throttle API spin requests to prevent spam
	private lastSpinRequestAt: number = 0;
	private readonly spinRequestMinIntervalMs: number = 200;
	// Local lock to prevent rapid spin re-entry before reel state updates
	private isSpinLocked: boolean = false;

	// Debug: visualize button hitboxes (red outlines)
	private showButtonHitboxes: boolean = false;
	private buttonHitboxGraphics: Phaser.GameObjects.Graphics | null = null;
	// Buy feature hitbox scale (1 = full image size)
	private buyFeatureHitboxScale: number = 1;

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
		
		// Initialize buy feature component
		this.buyFeature = new BuyFeature();
		
		// Listen for autoplay state changes
		this.setupAutoplayEventListeners();
	}

	/**
	 * Initialize the loading spinner
	 * Should be called after the scene and symbols are set up
	 */
	private initializeLoadingSpinner(): void {
		if (!this.scene) {
			console.warn('[SlotController] Cannot initialize spinner - scene not set');
			return;
		}

		// Get the center position of the symbols grid
		const centerX = this.scene.scale.width * 0.5 - 5;
		const centerY = this.scene.scale.height * 0.445;

		this.loadingSpinner = new LoadingSpinner(this.scene, centerX, centerY);
		console.log('[SlotController] Loading spinner initialized');
	}

	/**
	 * Start the spinner timer (shows spinner after 2 seconds if still loading)
	 * Delayed to allow previous symbols to clear before showing
	 */
	private startSpinnerTimer(): void {
		if (!this.loadingSpinner) {
			return;
		}
		this.loadingSpinner.startDelayedShow();
	}

	/**
	 * Hide the spinner (call when data is received)
	 */
	private hideSpinner(): void {
		if (!this.loadingSpinner) {
			return;
		}
		this.loadingSpinner.hide();
	}

	private showOutOfBalancePopup(message?: string): void {
		const scene = this.scene as Scene | null;
		if (!scene) return;
		import('../OutOfBalancePopup').then(module => {
			const Popup = module.OutOfBalancePopup;
			const popup = new Popup(scene);
			if (message) popup.updateMessage(message);
			popup.show();
		}).catch(() => {});
	}

	/**
	 * Expose the primary controllers container so external UI (e.g., FreeRoundManager)
	 * can align itself within the same coordinate space as the spin button.
	 */
	public getPrimaryControllersContainer(): Phaser.GameObjects.Container | null {
		return this.primaryControllers || null;
	}

	/**
	 * Expose the main spin button image for other UI components (e.g., FreeRoundManager).
	 */
	public getSpinButton(): Phaser.GameObjects.Image | null {
		return this.buttons.get('spin') || null;
	}

	/**
	 * Expose the spin icon overlay image (if created).
	 */
	public getSpinIcon(): Phaser.GameObjects.Image | null {
		return this.spinIcon;
	}

	/**
	 * Expose the autoplay stop icon overlay image (if created).
	 */
	public getAutoplayStopIcon(): Phaser.GameObjects.Image | null {
		return this.autoplayStopIcon;
	}

	/**
	 * Disable UI controls that should not be usable during free rounds.
	 * - Buy Feature button
	 * - Autoplay button
	 * - Amplify bet button
	 * - Bet +/- buttons
	 * - Bet background (that opens bet options)
	 */
	public disableControlsForFreeRounds(): void {
		console.log('[SlotController] Disabling controls for free rounds');

		// Reuse existing helpers where possible
		this.disableBetButtons();
		this.disableFeatureButton();

		// Completely hide the Buy Feature visuals while free rounds are active so the
		// center row can be used by the FreeRoundManager info panel instead.
		const featureButton = this.buttons.get('feature');
		if (featureButton) {
			featureButton.setVisible(false);
		}
		if (this.featureButtonHitZone) {
			this.featureButtonHitZone.setVisible(false);
		}
		if (this.featureAmountText) {
			this.featureAmountText.setVisible(false);
		}
		if (this.featureDollarText) {
			this.featureDollarText.setVisible(false);
		}
		if (this.featureLabelText) {
			this.featureLabelText.setVisible(false);
		}

		// Autoplay button
		const autoplayButton = this.buttons.get('autoplay');
		if (autoplayButton) {
			autoplayButton.setAlpha(0.5);
			autoplayButton.disableInteractive();
			console.log('[SlotController] Autoplay button disabled for free rounds');
		}

		// Amplify bet button
		const amplifyButton = this.buttons.get('amplify');
		if (amplifyButton) {
			amplifyButton.setAlpha(0.5);
			amplifyButton.disableInteractive();
			console.log('[SlotController] Amplify bet button disabled for free rounds');
		}

		// Bet background (that opens bet options)
		this.disableBetBackgroundInteraction('free rounds');
	}

	/**
	 * Re-enable UI controls after free rounds end.
	 */
	public enableControlsAfterFreeRounds(): void {
		console.log('[SlotController] Enabling controls after free rounds');

		this.enableSpinButton();
		this.enableBetButtons();
		this.enableFeatureButton();

		// Restore Buy Feature visuals after free rounds end
		const featureButton = this.buttons.get('feature');
		if (featureButton) {
			featureButton.setVisible(true);
		}
		if (this.featureButtonHitZone) {
			this.featureButtonHitZone.setVisible(true);
		}
		if (this.featureAmountText) {
			this.featureAmountText.setVisible(true);
		}
		if (this.featureDollarText) {
			this.featureDollarText.setVisible(true);
		}
		if (this.featureLabelText) {
			this.featureLabelText.setVisible(true);
		}

		const autoplayButton = this.buttons.get('autoplay');
		if (autoplayButton) {
			autoplayButton.setAlpha(1.0);
			autoplayButton.setInteractive();
			console.log('[SlotController] Autoplay button re-enabled after free rounds');
		}

		const amplifyButton = this.buttons.get('amplify');
		if (amplifyButton) {
			amplifyButton.setAlpha(1.0);
			amplifyButton.setInteractive();
			console.log('[SlotController] Amplify bet button re-enabled after free rounds');
		}

		// Bet background (that opens bet options)
		this.enableBetBackgroundInteraction('after free rounds');
	}

	/**
	 * Disable interaction on the bet background that opens the bet options panel.
	 * This is used in multiple states (free rounds, buy feature, etc.).
	 */
	private disableBetBackgroundInteraction(reason: string = ''): void {
		if (!this.controllerContainer) {
			return;
		}

		this.controllerContainer.iterate((child: any) => {
			if (child && child.getData && child.getData('isBetBackground')) {
				// Do NOT grey it out; just disable interaction so bet options cannot be opened.
				child.disableInteractive();
				const suffix = reason ? ` (${reason})` : '';
				console.log(`[SlotController] Bet background interaction disabled${suffix}`);
			}
		});
	}

	/**
	 * Re-enable interaction on the bet background that opens the bet options panel.
	 */
	private enableBetBackgroundInteraction(reason: string = ''): void {
		if (!this.controllerContainer) {
			return;
		}

		this.controllerContainer.iterate((child: any) => {
			if (child && child.getData && child.getData('isBetBackground')) {
				// Restore interaction only (keep original alpha as designed)
				child.setInteractive();
				const suffix = reason ? ` (${reason})` : '';
				console.log(`[SlotController] Bet background interaction re-enabled${suffix}`);
			}
		});
	}

	/**
	 * Prevent the free spin display from appearing until cleared.
	 * Also immediately hides the display if it is currently visible.
	 */
	public suppressFreeSpinDisplay(): void {
		this.freeSpinDisplaySuppressed = true;
		this.hideFreeSpinDisplay();
		console.log('[SlotController] Free spin display suppression enabled');
	}

	/**
	 * Allow the free spin display to appear again.
	 */
	public clearFreeSpinDisplaySuppression(): void {
		this.freeSpinDisplaySuppressed = false;
		console.log('[SlotController] Free spin display suppression cleared');
	}

	/**
	 * Set the symbols component reference
	 * This allows the SlotController to access free spin data from the Symbols component
	 */
	public setSymbols(symbols: Symbols): void {
		this.symbols = symbols;
		console.log('[SlotController] Symbols component reference set');
		
		// Update loading spinner position at center of symbols grid
		if (this.loadingSpinner && this.scene) {
			const centerX = this.scene.scale.width * 0.5 - 5;
			const centerY = this.scene.scale.height * 0.445; // Same as symbols center
			this.loadingSpinner.updatePosition(centerX, centerY);
			console.log('[SlotController] Loading spinner position updated to symbols center');
		}
	}

	/**
	 * Set the BuyFeature reference in the BuyFeature component
	 * This allows the BuyFeature to access current bet information
	 */
	public setBuyFeatureReference(): void {
		if (this.buyFeature) {
			this.buyFeature.setSlotController(this);
			console.log('[SlotController] BuyFeature reference set');
		}
	}

	preload(scene: Scene): void {
		// Assets are now loaded centrally through AssetConfig in Preloader
		console.log(`[SlotController] Assets loaded centrally through AssetConfig`);
	}

	create(scene: Scene): void {
		console.log("[SlotController] Creating controller elements");
		
		// Store scene reference for event listening
		this.scene = scene;
		
		// Initialize loading spinner at center of symbols grid
		const centerX = scene.scale.width * 0.5 - 20;
		const centerY = scene.scale.height * 0.445;
		this.loadingSpinner = new LoadingSpinner(scene, centerX, centerY);
		
		// Get GameData from the scene
		if (scene.scene.key === 'Game') {
			this.gameData = (scene as any).gameData;
			this.gameAPI = (scene as any).gameAPI;
		}
		
		// Create main container for all controller elements
		this.controllerContainer = scene.add.container(0, 0);
		// Scale the SlotController container to 0.95 (adjust as needed)
		this.controllerContainer.setScale(0.95);
		// The scale affects all child elements proportionally

		// Apply a small downward offset to move the whole controller slightly down
		this.controllerVerticalOffset = scene.scale.height * 0.1;
		this.controllerContainer.setY(this.controllerVerticalOffset);

		// Ensure controller UI renders above coin animations (800) but below dialogs (1000)
		this.controllerContainer.setDepth(900);
		
		const screenConfig = this.screenModeManager.getScreenConfig();
		const assetScale = this.networkManager.getAssetScale();
		
		console.log(`[SlotController] Creating controller with scale: ${assetScale}x`);

		// Initialize controller modules
		this.betController = new BetController(scene, this.controllerContainer, {
			onBetChange: (newBet: number, prevBet: number) => this.handleBetChange(newBet, prevBet),
			getBaseBetAmount: () => this.baseBetAmount || 0,
			getGameData: () => this.gameData,
		});
		
		this.autoplayController = new AutoplayController(scene, this.controllerContainer, {
			onSpinRequested: () => this.handleSpin(),
			onAutoplayStarted: () => this.handleAutoplayStart(),
			onAutoplayStopped: () => this.handleAutoplayStop(),
			getSymbols: () => (this.scene as any)?.symbols,
		});
		
		this.spinButtonController = new SpinButtonController(scene, this.controllerContainer, {
			onSpinRequested: () => this.handleSpin(),
			onSpinBlocked: (reason: string) => console.log('[SlotController] Spin blocked:', reason),
			isAutoplayActive: () => this.autoplayController?.isActive() || false,
			stopAutoplay: () => this.stopAutoplay(),
		});

		// Add controller elements
		this.createControllerElements(scene, assetScale);
		// Center the full controller UI as a block *after* children are created.
		// (Children currently use screen-based coordinates; centering earlier will push them off-screen.)
		this.recenterControllerContainer(scene);
		
		// Create buy feature component
		if (this.buyFeature) {
			this.buyFeature.create(scene);
		}
		
		// Setup bonus mode event listener
		this.setupBonusModeEventListener();
		
		// Setup spin state change listener
		this.setupSpinStateListener();
		
		// No need to set initial spin button state here - will be handled when reels finish
	}

	/**
	 * Centers the controller container horizontally based on its visual bounds.
	 * This is robust to changes in controller width (e.g. different button sets, scaling).
	 */
	private recenterControllerContainer(scene: Scene): void {
		if (!this.controllerContainer) {
			return;
		}

		// Measure bounds with a stable baseline x so the math is deterministic.
		this.controllerContainer.x = 0;
		const bounds = this.controllerContainer.getBounds();
		const targetCenterX = scene.scale.width * 0.5;
		const horizontalOffsetPx = this.controllerHorizontalOffset;

		// Shift container so its bounds' center lines up with the screen center.
		this.controllerContainer.x = (targetCenterX - bounds.centerX) + horizontalOffsetPx;
		this.renderButtonHitboxes();
	}

	/**
	 * Toggle debug visualization for button hitboxes.
	 */
	public setShowButtonHitboxes(enabled: boolean): void {
		this.showButtonHitboxes = enabled;
		this.renderButtonHitboxes();
	}

	/**
	 * Draw red outlines around all button hitboxes for debugging.
	 */
	private renderButtonHitboxes(): void {
		if (!this.scene) {
			return;
		}

		if (!this.showButtonHitboxes) {
			if (this.buttonHitboxGraphics) {
				this.buttonHitboxGraphics.clear();
				this.buttonHitboxGraphics.setVisible(false);
			}
			return;
		}

		if (!this.buttonHitboxGraphics) {
			this.buttonHitboxGraphics = this.scene.add.graphics();
			this.buttonHitboxGraphics.setDepth(999);
		}

		const graphics = this.buttonHitboxGraphics;
		if (!graphics) {
			return;
		}

		graphics.setVisible(true);
		graphics.clear();
		graphics.lineStyle(2, 0xff0000, 0.9);

		this.buttons.forEach((button) => {
			if (!button || !button.visible) {
				return;
			}
			const bounds = button.getBounds();
			graphics.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
		});
	}

	// ============================================================================
	// Controller Callback Handlers
	// ============================================================================

	/**
	 * Handle bet change from BetController
	 */
	private handleBetChange(newBet: number, prevBet: number): void {
		console.log(`[SlotController] Bet changed: ${prevBet} -> ${newBet}`);
		this.updateBetAmount(newBet);
	}

	/**
	 * Handle autoplay start from AutoplayController
	 */
	private handleAutoplayStart(): void {
		console.log('[SlotController] Autoplay started via controller');
		const gameData = this.getGameData();
		if (gameData) {
			gameData.isAutoPlaying = true;
		}
	}

	/**
	 * Handle autoplay stop from AutoplayController
	 */
	private handleAutoplayStop(): void {
		console.log('[SlotController] Autoplay stopped via controller');
		const gameData = this.getGameData();
		if (gameData) {
			gameData.isAutoPlaying = false;
		}
	}

	private getAutoplaySpinsRemaining(): number {
		return this.autoplayController?.getSpinsRemaining() ?? 0;
	}

	// ============================================================================
	// Existing Methods
	// ============================================================================

	private getTextStyle(): Phaser.Types.GameObjects.Text.TextStyle {
		return {
			fontSize: '10px',
			color: '#ffffff',
			fontFamily: 'poppins-regular'
		};
	}

	private playSpinButtonClickSfx(): void {
		try {
			const audioManager = (window as any)?.audioManager;
			if (audioManager && typeof audioManager.playSoundEffect === 'function') {
				audioManager.playSoundEffect(SoundEffectType.SPIN_CLICK);
			}
		} catch {}
	}

	private createControllerElements(scene: Scene, assetScale: number): void {
		const screenConfig = this.screenModeManager.getScreenConfig();
		
		if (screenConfig.isPortrait) {
			this.createPortraitController(scene, assetScale);
		} else {
			this.createLandscapeController(scene, assetScale);
		}
	}

	/**
	 * Helper to center a Spine animation visually on top of the main spin button.
	 * This uses the Spine bounds (offset + size) so the visual center of the
	 * animation lines up with the spin button's center, not just the skeleton
	 * origin. Falls back to simple x/y copy if bounds are not available.
	 */
	private centerSpineOnSpinButton(spineObj: any, spinButton: Phaser.GameObjects.Image): void {
		if (!spineObj || !spinButton) {
			return;
		}

		try {
			const anySpine: any = spineObj as any;

			if (typeof anySpine.getBounds !== 'function') {
				spineObj.setPosition(spinButton.x, spinButton.y);
				return;
			}

			const bounds = anySpine.getBounds();
			if (!bounds || !bounds.offset || !bounds.size) {
				spineObj.setPosition(spinButton.x, spinButton.y);
				return;
			}

			const centerX = bounds.offset.x + bounds.size.x * 0.5;
			const centerY = bounds.offset.y + bounds.size.y * 0.5;

			const scaleX = (spineObj.scaleX !== undefined ? spineObj.scaleX : spineObj.scale) || 1;
			const scaleY = (spineObj.scaleY !== undefined ? spineObj.scaleY : spineObj.scale) || 1;

			spineObj.x = spinButton.x - centerX * scaleX;
			spineObj.y = spinButton.y - centerY * scaleY;
		} catch (e) {
			console.warn('[SlotController] Failed to auto-center spin button animation:', e);
			spineObj.setPosition(spinButton.x, spinButton.y);
		}
	}

	/**
	 * Create the spin button spine animation
	 */
	private createSpinButtonAnimation(scene: Scene, assetScale: number): void {
		try {
			if (!ensureSpineFactory(scene, '[SlotController] createSpinButtonAnimation')) {
				console.warn('[SlotController] Spine factory not available yet; will retry spin button spine shortly');
				scene.time.delayedCall(250, () => this.createSpinButtonAnimation(scene, assetScale));
				return;
			}

			if (!scene.cache.json.has('spin_button_animation')) {
				console.warn('[SlotController] spin_button_animation spine assets not loaded yet, will retry later');
				scene.time.delayedCall(1000, () => this.createSpinButtonAnimation(scene, assetScale));
				return;
			}

			const spinButton = this.buttons.get('spin');
			if (!spinButton) {
				console.warn('[SlotController] Spin button not found, cannot position animation');
				return;
			}

			this.spinButtonAnimation = scene.add.spine(
				spinButton.x,
				spinButton.y,
				"spin_button_animation",
				"spin_button_animation-atlas"
			);

			this.spinButtonAnimation.setOrigin(0.5, 0.5);
			this.spinButtonAnimation.setScale(assetScale * 0.435);
			this.spinButtonAnimation.setDepth(9);

			this.centerSpineOnSpinButton(this.spinButtonAnimation, spinButton);

			this.spinButtonAnimation.animationState.timeScale = 1.3;
			this.spinButtonAnimation.setVisible(false);

			if (this.primaryControllers) {
				const spinIndex = this.primaryControllers.getIndex(spinButton);
				this.primaryControllers.addAt(this.spinButtonAnimation, spinIndex);
			} else {
				this.controllerContainer.add(this.spinButtonAnimation);
			}

			console.log('[SlotController] Spin button spine animation created successfully with 1.3x speed');

			if (scene.cache.json.has('fr_spin_button_animation')) {
				try {
					const spineScale = assetScale * 1.2;

					this.freeRoundSpinButtonAnimation = scene.add.spine(
						spinButton.x,
						spinButton.y,
						"fr_spin_button_animation",
						"fr_spin_button_animation-atlas"
					);
					this.freeRoundSpinButtonAnimation.setOrigin(0.5, 0.5);
					this.freeRoundSpinButtonAnimation.setScale(spineScale);
					this.freeRoundSpinButtonAnimation.setDepth(11);
					this.freeRoundSpinButtonAnimation.setVisible(false);

					this.centerSpineOnSpinButton(this.freeRoundSpinButtonAnimation, spinButton);

					try {
						const anySpine: any = this.freeRoundSpinButtonAnimation as any;
						if (typeof anySpine.getBounds === 'function') {
							const bounds = anySpine.getBounds();
							if (bounds && bounds.offset && bounds.size) {
								this.freeRoundSpinButtonAnimation.x = spinButton.x * spineScale;
								this.freeRoundSpinButtonAnimation.y = spinButton.y * spineScale;
							}
						}
					} catch (e) {
						console.warn('[SlotController] Failed to auto-center free-round spin animation:', e);
					}

					if (this.primaryControllers) {
						const spinIndex = this.primaryControllers.getIndex(spinButton);
						this.primaryControllers.addAt(this.freeRoundSpinButtonAnimation, spinIndex + 1);
					} else {
						this.controllerContainer.add(this.freeRoundSpinButtonAnimation);
					}

					console.log('[SlotController] Free-round spin button spine animation created successfully');
				} catch (e) {
					console.warn('[SlotController] Failed to create free-round spin button animation:', e);
					this.freeRoundSpinButtonAnimation = null;
				}
			} else {
				console.warn('[SlotController] fr_spin_button_animation spine assets not found in cache; free-round spin animation will be skipped');
			}
		} catch (error) {
			console.error('[SlotController] Error creating Spine button animation:', error);
		}
	}

	/**
	 * Create the autoplay button spine animation
	 */
	private createAutoplayButtonAnimation(scene: Scene, assetScale: number): void {
		// Now handled by AutoplayController
		console.log('[SlotController] Autoplay button animation managed by AutoplayController');
	}

	/**
	 * Create the turbo button spine animation
	 */
	private createTurboButtonAnimation(scene: Scene, assetScale: number): void {
		try {
			if (!ensureSpineFactory(scene, '[SlotController] createTurboButtonAnimation')) {
				console.warn('[SlotController] Spine factory not available yet; will retry turbo spine shortly');
				scene.time.delayedCall(250, () => this.createTurboButtonAnimation(scene, assetScale));
				return;
			}

			// Check if the spine assets are loaded
			if (!scene.cache.json.has('turbo_animation')) {
				console.warn('[SlotController] turbo_animation spine assets not loaded yet, will retry later');
				// Set up a retry mechanism
				scene.time.delayedCall(1000, () => {
					this.createTurboButtonAnimation(scene, assetScale);
				});
				return;
			}

			// Get the turbo button position to place the animation at the same location
			const turboButton = this.buttons.get('turbo');
			if (!turboButton) {
				console.warn('[SlotController] Turbo button not found, cannot position animation');
				return;
			}

			// Create spine animation at the same position as the turbo button
			// Following the exact same pattern as kobi-ass animation in Header.ts
			this.turboButtonAnimation = scene.add.spine(
				turboButton.x, 
				turboButton.y + 7, 
				"turbo_animation", 
				"turbo_animation-atlas"
			);
			
			// Set properties following the same pattern as kobi-ass
			this.turboButtonAnimation.setOrigin(0.5, 0.5);
			this.turboButtonAnimation.setScale(assetScale * 1); // Same scale as turbo button
			this.turboButtonAnimation.setDepth(11); // Above the turbo button
			
			// Set animation speed to 1.3x (same as spin button)
			this.turboButtonAnimation.animationState.timeScale = 1;
			
			// Initially hide the animation
			this.turboButtonAnimation.setVisible(false);
			
			// Add to the primary controllers container so it gets disabled/enabled with other controls
			this.primaryControllers.add(this.turboButtonAnimation);
			
			console.log('[SlotController] Turbo button spine animation created successfully with 1.3x speed');
		} catch (error) {
			console.error('[SlotController] Error creating Spine turbo button animation:', error);
		}
	}

	/**
	 * Create the autoplay spins remaining text
	 */
	private createAutoplaySpinsRemainingText(scene: Scene, assetScale: number): void {
		const spinButton = this.buttons.get('spin');
		if (!spinButton) {
			console.warn('[SlotController] Spin button not found, cannot position autoplay spins text');
			return;
		}

		this.autoplaySpinsRemainingText = scene.add.text(
			spinButton.x,
			spinButton.y,
			'0',
			{
				fontSize: '24px',
				color: '#ffffff',
				fontFamily: 'poppins-regular',
				stroke: '#379557',
				strokeThickness: 4
			}
		);
		this.autoplaySpinsRemainingText.setOrigin(0.5, 0.5);
		this.autoplaySpinsRemainingText.setDepth(20);
		this.autoplaySpinsRemainingText.setVisible(false);

		if (this.primaryControllers) {
			this.primaryControllers.add(this.autoplaySpinsRemainingText);
			this.primaryControllers.bringToTop(this.autoplaySpinsRemainingText);
		}
		console.log('[SlotController] Autoplay spins remaining text created successfully');
	}

	/**
	 * Show the autoplay spins remaining text - now handled by AutoplayController
	 */
	private showAutoplaySpinsRemainingText(): void {
		if (this.autoplaySpinsRemainingText) {
			this.autoplaySpinsRemainingText.setVisible(true);
			if (this.primaryControllers) {
				this.primaryControllers.bringToTop(this.autoplaySpinsRemainingText);
			}
		}
	}

	/**
	 * Hide the autoplay spins remaining text - now handled by AutoplayController
	 */
	private hideAutoplaySpinsRemainingText(): void {
		if (this.autoplaySpinsRemainingText) {
			this.autoplaySpinsRemainingText.setVisible(false);
		}
	}

	/**
	 * Disable bet buttons (grey out and disable interaction)
	 */
	private disableBetButtons(): void {
		if (this.betController) {
			this.betController.disableBetButtons();
		} else {
			// Fallback for initialization phase
			const decreaseBetButton = this.buttons.get('decrease_bet');
			const increaseBetButton = this.buttons.get('increase_bet');
			if (decreaseBetButton) {
				decreaseBetButton.setAlpha(0.3);
				decreaseBetButton.setTint(0x777777);
				decreaseBetButton.disableInteractive();
			}
			if (increaseBetButton) {
				increaseBetButton.setAlpha(0.3);
				increaseBetButton.setTint(0x777777);
				increaseBetButton.disableInteractive();
			}
		}
	}

	/**
	 * Enable bet buttons (restore opacity and enable interaction)
	 */
	private enableBetButtons(): void {
		if (this.betController) {
			this.betController.enableBetButtons();
		} else {
			// Fallback for initialization phase
			const currentBaseBet = this.getBaseBetAmount() || 0.2;
			this.updateBetLimitButtons(currentBaseBet);
		}
	}

	/**
	 * Get the bet ladder levels - delegated to BetController
	 */
	private getBetLevels(): number[] {
		// Now handled by BetController
		const levels = this.betController?.getBetLevels();
		return levels ? [...levels] : [];
	}

	/**
	 * Grey out and disable the bet +/- buttons when the current bet
	 * is at the minimum or maximum level in the bet ladder.
	 */
	private updateBetLimitButtons(currentBet: number): void {
		const decreaseBetButton = this.buttons.get('decrease_bet');
		const increaseBetButton = this.buttons.get('increase_bet');
		if (!decreaseBetButton && !increaseBetButton) {
			return;
		}

		const betLevels = this.getBetLevels();
		if (!betLevels.length) {
			return;
		}

		let idx = 0;
		let bestDiff = Number.POSITIVE_INFINITY;
		for (let i = 0; i < betLevels.length; i++) {
			const diff = Math.abs(betLevels[i] - currentBet);
			if (diff < bestDiff) {
				bestDiff = diff;
				idx = i;
			}
		}

		const minBet = betLevels[0] ?? 0.2;
		const isAtMin = idx === 0 || currentBet <= minBet + 1e-6;
		const isAtMax = idx === betLevels.length - 1;

		if (decreaseBetButton) {
			if (isAtMin) {
				decreaseBetButton.setAlpha(0.3);
				decreaseBetButton.setTint(0x777777);
				decreaseBetButton.disableInteractive();
			} else {
				decreaseBetButton.setAlpha(1.0);
				decreaseBetButton.clearTint();
				decreaseBetButton.setInteractive();
			}
		}

		if (increaseBetButton) {
			if (isAtMax) {
				increaseBetButton.setAlpha(0.3);
				increaseBetButton.setTint(0x777777);
				increaseBetButton.disableInteractive();
			} else {
				increaseBetButton.setAlpha(1.0);
				increaseBetButton.clearTint();
				increaseBetButton.setInteractive();
			}
		}
	}

	/**
	 * Disable feature button (grey out and disable interaction)
	 */
	private disableFeatureButton(): void {
		const featureButton = this.buttons.get('feature');
		
		if (featureButton) {
			featureButton.setAlpha(0.3); // Make it semi-transparent/greyed out
			featureButton.disableInteractive(); // Disable clicking
			if (this.featureButtonHitZone) {
				this.featureButtonHitZone.disableInteractive();
			}
			console.log('[SlotController] Feature button disabled');
		}
	}

	/**
	 * Enable feature button (restore opacity and enable interaction)
	 */
	private enableFeatureButton(): void {
		const featureButton = this.buttons.get('feature');

		if (featureButton) {
			// Guard: do not re-enable during bonus or before explicit allow
			if (gameStateManager.isBonus || !this.canEnableFeatureButton) {
				console.log('[SlotController] Skipping feature enable (bonus active or not allowed yet)');
				return;
			}
			// Also keep Buy Feature disabled while enhance/amplify bet is active
			const gameData = this.getGameData();
			if (gameData && gameData.isEnhancedBet) {
				console.log('[SlotController] Skipping feature enable (enhance/amplify bet is ON)');
				return;
			}
			featureButton.setAlpha(1.0); // Restore full opacity
			this.applyBuyFeatureHitbox(featureButton);
			if (this.featureButtonHitZone) {
				this.featureButtonHitZone.setInteractive();
			}
			console.log('[SlotController] Feature button enabled');
		}
	}

	private handleBuyFeaturePress(): void {
		const featureButton = this.buttons.get('feature');
		const inputEnabled = (featureButton as any)?.input?.enabled;
		if (featureButton && inputEnabled === false) {
			return;
		}
		this.showBuyFeatureDrawer();
	}

	/**
	 * Apply the buy feature button hitbox scaling.
	 */
	private applyBuyFeatureHitbox(featureButton: Phaser.GameObjects.Image): void {
		const hitW = featureButton.displayWidth * this.buyFeatureHitboxScale;
		const hitH = featureButton.displayHeight * this.buyFeatureHitboxScale;
		featureButton.setInteractive(
			new Phaser.Geom.Rectangle(
				-hitW * 0.5,
				-hitH * 0.5,
				hitW,
				hitH
			),
			Phaser.Geom.Rectangle.Contains
		);

		if (!this.scene) {
			return;
		}

		if (!this.featureButtonHitZone) {
			this.featureButtonHitZone = this.scene.add.zone(
				featureButton.x,
				featureButton.y,
				hitW,
				hitH
			).setOrigin(0.5, 0.5);
			this.featureButtonHitZone.setDepth(featureButton.depth + 1);
			this.featureButtonHitZone.setInteractive();
			this.featureButtonHitZone.on('pointerdown', () => this.handleBuyFeaturePress());
			this.controllerContainer.add(this.featureButtonHitZone);
		} else {
			this.featureButtonHitZone.setPosition(featureButton.x, featureButton.y);
			this.featureButtonHitZone.setSize(hitW, hitH);
		}
	}

	/**
	 * Update the autoplay spins remaining text - now handled by AutoplayController
	 */
	private updateAutoplaySpinsRemainingText(spinsRemaining: number): void {
		if (this.autoplaySpinsRemainingText) {
			this.autoplaySpinsRemainingText.setText(spinsRemaining.toString());
			if (this.primaryControllers) {
				this.primaryControllers.bringToTop(this.autoplaySpinsRemainingText);
			}
		}
	}

	/**
	 * Bounce the autoplay spins remaining text - now handled by AutoplayController
	 */
	private bounceAutoplaySpinsRemainingText(): void {
		if (!this.autoplaySpinsRemainingText || !this.scene) {
			return;
		}
		try {
			this.scene.tweens.add({
				targets: this.autoplaySpinsRemainingText,
				scaleX: 1.45,
				scaleY: 1.45,
				duration: 100,
				ease: 'Power2',
				yoyo: true,
				onComplete: () => {
					this.autoplaySpinsRemainingText?.setScale(1, 1);
				}
			});
		} catch (error) {
			console.warn('[SlotController] Failed to bounce autoplay spins text:', error);
		}
	}

	/**
	 * Play the autoplay button animation once per spin
	 */
	private playAutoplayAnimation(): void {
		// Ensure the animation exists
		this.ensureAutoplayAnimationExists();
		
		if (!this.autoplayButtonAnimation) {
			console.warn('[SlotController] Autoplay button animation not available');
			return;
		}

		try {
			// Show the animation
			this.autoplayButtonAnimation.setVisible(true);
			
			// Play animation once following the same pattern as spin button
			this.autoplayButtonAnimation.animationState.setAnimation(0, "animation", false);
			
			// Listen for animation completion to hide it
			this.autoplayButtonAnimation.animationState.addListener({
				complete: (entry: any) => {
					if (entry.animation.name === "animation") {
						this.autoplayButtonAnimation.setVisible(false);
					}
				}
			});
			
			console.log('[SlotController] Autoplay button spine animation played once');
		} catch (error) {
			console.error('[SlotController] Error playing autoplay button animation:', error);
			// Hide the animation if there's an error
			if (this.autoplayButtonAnimation) {
				this.autoplayButtonAnimation.setVisible(false);
			}
		}
	}

	/**
	 * Start the autoplay button animation - now handled by AutoplayController
	 */
	private startAutoplayAnimation(): void {
		// Now handled by AutoplayController
	}

	/**
	 * Stop the autoplay button animation - now handled by AutoplayController
	 */
	private stopAutoplayAnimation(): void {
		// Now handled by AutoplayController
	}

	/**
	 * Ensure the autoplay animation exists - now handled by AutoplayController
	 */
	private ensureAutoplayAnimationExists(): void {
		// Now handled by AutoplayController
	}

	/**
	 * Play the spin button spine animation
	 */
	private playSpinButtonAnimation(): void {
		// During initialization free-round spins, prefer the dedicated free-round
		// animation when available. This flag is managed by FreeRoundManager.
		const isInFreeRoundSpins =
			(gameStateManager as any)?.isInFreeSpinRound === true;

		const targetAnimation = isInFreeRoundSpins && this.freeRoundSpinButtonAnimation
			? this.freeRoundSpinButtonAnimation
			: this.spinButtonAnimation;

		if (!targetAnimation) {
			console.warn('[SlotController] Spin button animation not available (no default or free-round animation)');
			return;
		}

		try {
			// Hide the non-selected animation (if any) so only one effect plays
			if (targetAnimation === this.freeRoundSpinButtonAnimation && this.spinButtonAnimation) {
				this.spinButtonAnimation.setVisible(false);
			}
			if (targetAnimation === this.spinButtonAnimation && this.freeRoundSpinButtonAnimation) {
				this.freeRoundSpinButtonAnimation.setVisible(false);
			}

			// Show the chosen animation
			targetAnimation.setVisible(true);
			
			// Play the animation following the same pattern as kobi-ass
			// Use animationState.setAnimation like in Header.ts.
			// For the free-round button animation, the Spine animation name is
			// "Button_Bonus_Bottom" (see Button_Bonus_VFX.json). The default
			// spin button animation uses "animation".
			const animationName =
				targetAnimation === this.freeRoundSpinButtonAnimation
					? "Button_Bonus_Bottom"
					: "animation";

			// Start the animation and obtain the track entry so we can adjust
			// its effective duration for the free-round Spine.
			const trackEntry: any = targetAnimation.animationState.setAnimation(0, animationName, false);

			// For the free-round Spine, stop the animation 0.5s before the end so
			// the last few frames are not played.
			if (targetAnimation === this.freeRoundSpinButtonAnimation && trackEntry) {
				try {
					const anySpine: any = targetAnimation as any;
					const animData = anySpine?.skeleton?.data?.findAnimation?.(animationName);
					const duration: number | undefined = animData?.duration;
					if (typeof duration === 'number' && duration > 0.01) {
						trackEntry.animationEnd = Math.max(0, duration - 0.01);
						console.log(
							`[SlotController] Free-round spin animation duration=${duration.toFixed(
								3
							)}s, clamped to ${trackEntry.animationEnd.toFixed(3)}s (cut last 0.5s)`
						);
					}
				} catch (e) {
					console.warn('[SlotController] Failed to clamp free-round spin animationEnd:', e);
				}
			}
			
			// Listen for animation completion to hide it
			targetAnimation.animationState.addListener({
				complete: (entry: any) => {
				if (entry.animation.name === animationName) {
						targetAnimation.setVisible(false);
				}
				}
			});
			
			console.log('[SlotController] Spin button spine animation played');
		} catch (error) {
			console.error('[SlotController] Error playing Spine button animation:', error);
			// Hide the animation if there's an error
			if (this.spinButtonAnimation) {
				this.spinButtonAnimation.setVisible(false);
			}
			if (this.freeRoundSpinButtonAnimation) {
				this.freeRoundSpinButtonAnimation.setVisible(false);
			}
		}
	}

	/**
	 * Rotate the spin button - now handled by SpinButtonController
	 */
	private rotateSpinButton(): void {
		// Now handled by SpinButtonController
	}

	private createPortraitController(scene: Scene, assetScale: number): void {
		console.log("[SlotController] Creating portrait controller layout");
		
		// Create primary controllers container
		this.primaryControllers = scene.add.container(0, 0);
		this.controllerContainer.add(this.primaryControllers);
		
		// Create vertical buttons on the right side
		const middleRef = scene.scale.height * 0.82;
		const buttonSpacing = 80;
		
		// Spin button (main action)
		const spinButton = scene.add.image(
			scene.scale.width * 0.5,
			middleRef,
			'spin'
		).setOrigin(0.5, 0.5).setScale(assetScale * 1.2).setDepth(10);


		// Spin icon overlay in front of and aligned with the spin button
		// (kept above the free-round Spine effect)
		this.spinIcon = scene.add.image(
			spinButton.x,
			spinButton.y,
			'spin_icon'
		).setOrigin(0.5, 0.5).setScale(assetScale * 1.2).setDepth(12);
		this.primaryControllers.add(this.spinIcon);

		// Gentle rotation animation for the icon
		this.spinIconTween = scene.tweens.add({
			targets: this.spinIcon,
			angle: 360,
			duration: 4000,
			repeat: -1,
			ease: 'Linear'
		});

		// Autoplay stop icon overlay (hidden by default), same position as spin
		// (on top of both the spin icon and the Spine effect)
		this.autoplayStopIcon = scene.add.image(
			spinButton.x,
			spinButton.y,
			'autoplay_stop_icon'
		).setOrigin(0.5, 0.5).setScale(assetScale * 0.45).setDepth(13).setVisible(false);
		this.primaryControllers.add(this.autoplayStopIcon);

		spinButton.setInteractive();
		spinButton.on('pointerdown', async () => {
			console.log('[SlotController] Spin button clicked');
			const now = Date.now();
			if (now - this.lastSpinClickAt < this.spinClickDebounceMs) {
				console.log('[SlotController] Spin click ignored - debounce');
				return;
			}
			this.lastSpinClickAt = now;
			this.playSpinButtonClickSfx();
			// If autoplay is active (or about to start), clicking spin will stop autoplay instead
			if (gameStateManager.isAutoPlaying || gameStateManager.isAutoPlaySpinRequested) {
				console.log('[SlotController] Stopping autoplay via spin button click');
				this.stopAutoplay();
				return;
			}
			if (gameStateManager.isReelSpinning) {
				console.log('[SlotController] Spin blocked - already spinning');
				return;
			}
			
			// Disable spin button, bet buttons, feature button and play animations
			this.disableSpinButton();
			this.disableBetButtons();
			this.disableFeatureButton();
			// Disable and grey out autoplay and turbo buttons while symbols are dropping
			this.disableAutoplayButton();
			this.disableTurboButton();
			this.playSpinButtonAnimation();
			this.rotateSpinButton();
			
			// Use the centralized spin handler
			await this.handleSpin();
		});
		this.buttons.set('spin', spinButton);
		this.primaryControllers.add(spinButton);

		// Ensure icon is positioned exactly and rendered above the spin button
		if (this.spinIcon) {
			this.spinIcon.setPosition(spinButton.x, spinButton.y);
			this.primaryControllers.bringToTop(this.spinIcon);
		}

		// Ensure icon is positioned exactly and rendered above the spin button
		if (this.spinIcon) {
			this.spinIcon.setPosition(spinButton.x, spinButton.y);
			this.primaryControllers.bringToTop(this.spinIcon);
		}

		// Turbo button
		const turboButton = scene.add.image(
			scene.scale.width * 0.9,
			middleRef + 5,
			'turbo_off'
		).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
		turboButton.setInteractive();
		turboButton.on('pointerdown', () => {
			console.log('[SlotController] Turbo button clicked');
			this.handleTurboButtonClick();
		});
		this.buttons.set('turbo', turboButton);
		this.primaryControllers.add(turboButton);

		// Turbo text label
		const turboText = scene.add.text(
			scene.scale.width * 0.9,
			middleRef + 5 + (turboButton.displayHeight * 0.5) + 15,
			'Turbo',
			this.getTextStyle()
		).setOrigin(0.5, 0.5).setDepth(10);
		this.controllerContainer.add(turboText);
		this.controllerTexts.push(turboText);

		// Amplify button
		const amplifyButton = scene.add.image(
			scene.scale.width * 0.73,
			middleRef,
			'amplify'
		).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
		amplifyButton.setInteractive();
		amplifyButton.on('pointerdown', () => {
			console.log('[SlotController] Amplify button clicked');
			this.handleAmplifyButtonClick();
		});
		this.buttons.set('amplify', amplifyButton);
		this.primaryControllers.add(amplifyButton);

		// Amplify text label
		const amplifyText = scene.add.text(
			scene.scale.width * 0.73,
			middleRef + (amplifyButton.displayHeight * 0.5) + 15,
			'Amplify Bet',
			this.getTextStyle()
		).setOrigin(0.5, 0.5).setDepth(10);
		this.controllerContainer.add(amplifyText);
		this.controllerTexts.push(amplifyText);

		// Amplify description container
		this.createAmplifyDescription(scene, assetScale);

		// Autoplay button
		const autoplayButton = scene.add.image(
			scene.scale.width * 0.27,
			middleRef,
			'autoplay_off'
		).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
		autoplayButton.setInteractive();
		autoplayButton.on('pointerdown', () => {
			console.log('[SlotController] Autoplay button clicked');
			this.handleAutoplayButtonClick();
		});
		this.buttons.set('autoplay', autoplayButton);
		this.primaryControllers.add(autoplayButton);

		// Autoplay text label
		const autoplayText = scene.add.text(
			scene.scale.width * 0.27,
			middleRef + (autoplayButton.displayHeight * 0.5) + 15,
			'Autoplay',
			this.getTextStyle()
		).setOrigin(0.5, 0.5).setDepth(10);
		this.controllerContainer.add(autoplayText);
		this.controllerTexts.push(autoplayText);

		// Menu button
		const menuButton = scene.add.image(
			scene.scale.width * 0.1,
			middleRef + 5,
			'menu'
		).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
		menuButton.setInteractive();
		menuButton.on('pointerdown', () => {
			console.log('[SlotController] Menu button clicked');
			EventBus.emit('menu');
		});
		this.buttons.set('menu', menuButton);
		this.primaryControllers.add(menuButton);

		// Menu text label
		const menuText = scene.add.text(
			scene.scale.width * 0.1,
			middleRef + 5 + (menuButton.displayHeight * 0.5) + 15,
			'Menu',
			this.getTextStyle()
		).setOrigin(0.5, 0.5).setDepth(10);
		this.controllerContainer.add(menuText);
		this.controllerTexts.push(menuText);

		// Balance display container
		this.createBalanceDisplay(scene, assetScale);

		// Bet display container
		this.createBetDisplay(scene, assetScale);
		
		// Feature button container
		this.createFeatureButton(scene, assetScale);
		
		// Free spin display container
		this.createFreeSpinDisplay(scene, assetScale);
		
		// Create the spin button animation
		this.createSpinButtonAnimation(scene, assetScale);
		
		// Create the autoplay button animation
		this.createAutoplayButtonAnimation(scene, assetScale);
		
		// Create the turbo button animation
		this.createTurboButtonAnimation(scene, assetScale);
		
		// Create the autoplay spins remaining text
		this.createAutoplaySpinsRemainingText(scene, assetScale);

		// Hand off autoplay UI elements to AutoplayController
		this.autoplayController?.attachUiElements({
			button: autoplayButton,
			stopIcon: this.autoplayStopIcon,
			spinsText: this.autoplaySpinsRemainingText,
			buttonTextureOn: 'autoplay_on',
			buttonTextureOff: 'autoplay_off',
			uiContainer: this.primaryControllers
		});
		
		// Initialize amplify button state
		this.initializeAmplifyButtonState();
	}

	private createAmplifyDescription(scene: Scene, assetScale: number): void {
		// Position for amplify description (above amplify button)
		const amplifyX = scene.scale.width * 0.73;
		const amplifyY = scene.scale.height * 0.833;
		const descriptionX = amplifyX;
		const descriptionY = amplifyY - 50; // Higher than amplify button
		const containerWidth = 90;
		const containerHeight = 30;
		const cornerRadius = 8;

		// Create container for amplify description elements
		this.amplifyDescriptionContainer = scene.add.container(0, 0);

		// Create rounded rectangle background with green outline
		const descriptionBg = scene.add.graphics();
		descriptionBg.fillStyle(0x000000, 0.65); // Dark background
		descriptionBg.fillRoundedRect(
			descriptionX - containerWidth / 2,
			descriptionY - containerHeight / 2,
			containerWidth,
			containerHeight,
			cornerRadius
		);
		descriptionBg.lineStyle(1, 0x00ff00, 1); // Green outline
		descriptionBg.strokeRoundedRect(
			descriptionX - containerWidth / 2,
			descriptionY - containerHeight / 2,
			containerWidth,
			containerHeight,
			cornerRadius
		);
		descriptionBg.setDepth(8);
		this.amplifyDescriptionContainer.add(descriptionBg);

		// "Double Chance" label (1st line)
		const descriptionLabel1 = scene.add.text(
			descriptionX,
			descriptionY - 5,
			'Double Chance',
			{
				fontSize: '9px',
				color: '#ffffff', // Green color
				fontFamily: 'poppins-regular'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		this.amplifyDescriptionContainer.add(descriptionLabel1);

		// "For Feature" label (2nd line)
		const descriptionLabel2 = scene.add.text(
			descriptionX,
			descriptionY + 6,
			'For Feature',
			{
				fontSize: '9px',
				color: '#ffffff', // White color
				fontFamily: 'poppins-regular'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		this.amplifyDescriptionContainer.add(descriptionLabel2);

		// Add the container to the main controller container
		this.controllerContainer.add(this.amplifyDescriptionContainer);
	}

	private createBalanceDisplay(scene: Scene, assetScale: number): void {
		// Position for balance display (top center)
		const balanceX = scene.scale.width * 0.19;
		const balanceY = scene.scale.height * 0.724;
		const containerWidth = 125;
		const containerHeight = 55;
		const cornerRadius = 10;
		// Check if demo mode is active - if so, use blank currency symbol and center the text
		const isDemoBalance = this.gameAPI?.getDemoState();
		const balanceValueOffset = isDemoBalance ? 0 : 5; // Center in demo mode, offset right when currency symbol exists

		// Create rounded rectangle background
		const balanceBg = scene.add.graphics();
		balanceBg.fillStyle(0x000000, 0.65); // Dark gray with 80% alpha
		balanceBg.fillRoundedRect(
			balanceX - containerWidth / 2,
			balanceY - containerHeight / 2,
			containerWidth,
			containerHeight,
			cornerRadius
		);
		balanceBg.setDepth(8);
		this.controllerContainer.add(balanceBg);

		// "BALANCE" label (1st line)
		const balanceLabel = scene.add.text(
			balanceX,
			balanceY - 8,
			'BALANCE',
			{
				fontSize: '12px',
				color: '#00ff00', // Green color
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		this.controllerContainer.add(balanceLabel);

		// "200,000.00" amount (2nd line, right part)
		this.balanceAmountText = scene.add.text(
			balanceX + balanceValueOffset,
			balanceY + 8,
			'0',
			{
				fontSize: '14px',
				color: '#ffffff', // White color
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		this.controllerContainer.add(this.balanceAmountText);

		// "$" symbol (2nd line, left part) - positioned dynamically
		this.balanceDollarText = scene.add.text(
			balanceX - (this.balanceAmountText.width / 2) - 3.5,
			balanceY + 8,
			isDemoBalance ? '' : '$',
			{
				fontSize: '14px',
				color: '#ffffff', // White color
				fontFamily: 'poppins-regular'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		// Hide currency symbol in demo mode
		this.balanceDollarText.setVisible(!isDemoBalance);
		this.controllerContainer.add(this.balanceDollarText);
	}

	private createBetDisplay(scene: Scene, assetScale: number): void {
		// Position for bet display (proportionate opposite side of balance display)
		const betX = scene.scale.width * 0.81;
		const betY = scene.scale.height * 0.724;
		const containerWidth = 125;
		const containerHeight = 55;
		const cornerRadius = 10;
		// Check if demo mode is active - if so, center the text (no currency symbol)
		const isDemoBet = this.gameAPI?.getDemoState();
		const betValueOffset = isDemoBet ? 0 : 3; // Center in demo mode, offset right when currency symbol exists


		// Create amplify bet spine animation (behind bet background)
		this.createAmplifyBetAnimation(scene, betX, betY, containerWidth, containerHeight);
		// Create enhance-bet idle spine animation (behind bet background)
		this.createEnhanceBetIdleAnimation(scene, betX, betY, containerWidth, containerHeight);
		
		// Create rounded rectangle background
		const betBg = scene.add.graphics();
		betBg.fillStyle(0x000000, 0.65); // Dark gray with 65% alpha
		betBg.fillRoundedRect(
			betX - containerWidth / 2,
			betY - containerHeight / 2,
			containerWidth,
			containerHeight,
			cornerRadius
		);
		betBg.setDepth(8);
		// Tag this graphics as the bet background so it can be disabled/enabled for free rounds
		(betBg as any).setData && betBg.setData('isBetBackground', true);
		this.controllerContainer.add(betBg);

		// Bet background is visual only; bet options open via bet amount text
		

		// "BET" label (1st line)
		const betLabel = scene.add.text(
			betX,
			betY - 8,
			'BET',
			{
				fontSize: '12px',
				color: '#00ff00', // Green color
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		this.controllerContainer.add(betLabel);

		// "0.60" amount (2nd line, right part)
		this.betAmountText = scene.add.text(
			betX + betValueOffset,
			betY + 8,
			'0.20',
			{
				fontSize: '14px',
				color: '#ffffff', // White color
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		this.controllerContainer.add(this.betAmountText);
		this.betAmountText.setInteractive();
		this.betAmountText.on('pointerdown', () => {
			console.log('[SlotController] Bet amount clicked');

			// Prevent opening bet options while reels are spinning or autoplay is active
			if (gameStateManager.isReelSpinning || gameStateManager.isAutoPlaying) {
				console.log(
					'[SlotController] Bet options panel disabled while spinning or autoplaying'
				);
				return;
			}

			// Also prevent opening bet options while scatter animation is in progress
			// (so the player cannot raise the bet once a scatter has triggered)
			let isScatterAnimating = false;
			try {
				if (this.scene) {
					const gameScene: any = this.scene as any;
					const symbolsComponent = gameScene.symbols;
					const scatterManager = symbolsComponent && symbolsComponent.scatterAnimationManager;
					if (scatterManager && typeof scatterManager.isAnimationInProgress === 'function') {
						isScatterAnimating = !!scatterManager.isAnimationInProgress();
					}
				}
			} catch (e) {
				console.warn('[SlotController] Unable to determine scatter animation state:', e);
			}

			if (gameStateManager.isScatter || isScatterAnimating) {
				console.log(
					'[SlotController] Bet options panel disabled while scatter animation is playing'
				);
				return;
			}

			EventBus.emit('show-bet-options');
		});

		// Initialize base bet amount
		this.baseBetAmount = 0.20;

		// "$" symbol (2nd line, left part) - positioned dynamically
		this.betDollarText = scene.add.text(
			betX - (this.betAmountText.width / 2) - 3.5,
			betY + 8,
			isDemoBet ? '' : '$',
			{
				fontSize: '14px',
				color: '#ffffff', // White color
				fontFamily: 'poppins-regular'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		// Hide currency symbol in demo mode
		this.betDollarText.setVisible(!isDemoBet);
		this.controllerContainer.add(this.betDollarText);

		// Decrease bet button (left side within container)
		const decreaseBetButton = scene.add.image(
			betX - 42, // Left side within container
			betY + 8,
			'decrease_bet'
		).setOrigin(0.5, 0.5).setScale(assetScale * 0.55).setDepth(10);
		decreaseBetButton.setInteractive();
		decreaseBetButton.on('pointerdown', () => {
			console.log('[SlotController] Decrease bet button clicked');
			this.adjustBetByStep(-1);
		});
		this.buttons.set('decrease_bet', decreaseBetButton);
		this.controllerContainer.add(decreaseBetButton);

		// Increase bet button (right side within container)
		const increaseBetButton = scene.add.image(
			betX + 42, // Right side within container
			betY + 8,
			'increase_bet'
		).setOrigin(0.5, 0.5).setScale(assetScale * 0.55).setDepth(10);
		increaseBetButton.setInteractive();
		increaseBetButton.on('pointerdown', () => {
			console.log('[SlotController] Increase bet button clicked');
			this.adjustBetByStep(1);
		});
		this.buttons.set('increase_bet', increaseBetButton);
		this.controllerContainer.add(increaseBetButton);

		// Initialize bet button states based on the starting bet (min bet greys out the decrement button)
		this.updateBetLimitButtons(this.baseBetAmount);
	}

	/** Move the bet to the next/previous level based on the BetOptions ladder */
	private adjustBetByStep(direction: 1 | -1): void {
		if (this.betController) {
			this.betController.adjustBetByStep(direction);
		} else {
			console.warn('[SlotController] BetController not initialized');
		}
	}

	/**
	 * Create amplify bet spine animation behind the bet background
	 */
	private createAmplifyBetAnimation(scene: Scene, betX: number, betY: number, containerWidth: number, containerHeight: number): void {
		try {
			if (!ensureSpineFactory(scene, '[SlotController] createAmplifyBetAnimation')) {
				return;
			}

			if (!scene.cache.json.has('amplify_bet')) {
				console.warn('[SlotController] Amplify bet spine assets not loaded');
				return;
			}

			const amplifyOffsetX = -4;
			const amplifyOffsetY = 0;

			this.amplifyBetAnimation = scene.add.spine(
				betX + amplifyOffsetX,
				betY + amplifyOffsetY,
				'amplify_bet',
				'amplify_bet-atlas'
			);

			this.amplifyBetAnimation.setScale(1);
			this.amplifyBetAnimation.setDepth(7);
			this.amplifyBetAnimation.setVisible(false);

			this.controllerContainer.add(this.amplifyBetAnimation);
			console.log('[SlotController] Amplify bet animation created');
		} catch (error) {
			console.warn('[SlotController] Failed to create amplify bet animation:', error);
		}
	}

	/**
	 * Create the Enhance Bet idle loop spine animation - now handled by BetController
	 */
	private createEnhanceBetIdleAnimation(scene: Scene, betX: number, betY: number, containerWidth: number, containerHeight: number): void {
		try {
			if (!ensureSpineFactory(scene, '[SlotController] createEnhanceBetIdleAnimation')) {
				return;
			}

			if (!scene.cache.json.has('enhance_bet_idle_on')) {
				console.warn('[SlotController] Enhance bet idle spine assets not loaded');
				return;
			}

			const targetX = this.amplifyBetAnimation ? this.amplifyBetAnimation.x : (betX - 4);
			const targetY = this.amplifyBetAnimation ? this.amplifyBetAnimation.y : betY;

			this.enhanceBetIdleAnimation = scene.add.spine(
				targetX,
				targetY,
				'enhance_bet_idle_on',
				'enhance_bet_idle_on-atlas'
			);

			this.enhanceBetIdleAnimation.setOrigin(0.5, 0.5);

			if (this.amplifyBetAnimation) {
				this.enhanceBetIdleAnimation.setScale(
					this.amplifyBetAnimation.scaleX,
					this.amplifyBetAnimation.scaleY
				);
				this.enhanceBetIdleAnimation.setDepth(this.amplifyBetAnimation.depth);
			} else {
				this.enhanceBetIdleAnimation.setScale(1);
				this.enhanceBetIdleAnimation.setDepth(7);
			}

			this.enhanceBetIdleAnimation.setVisible(false);
			this.controllerContainer.add(this.enhanceBetIdleAnimation);
			console.log('[SlotController] Enhance bet idle animation created');
		} catch (error) {
			console.warn('[SlotController] Failed to create enhance bet idle animation:', error);
		}
	}

	/** Start the enhance bet idle loop - now handled by BetController */
	private showEnhanceBetIdleLoop(): void {
		if (!this.enhanceBetIdleAnimation) return;
		this.enhanceBetIdleAnimation.setVisible(true);
		const idleName = 'animation';
		if (this.enhanceBetIdleAnimation.skeleton?.data.findAnimation(idleName)) {
			this.enhanceBetIdleAnimation.animationState.setAnimation(0, idleName, true);
		} else {
			const animations = this.enhanceBetIdleAnimation.skeleton?.data.animations || [];
			if (animations.length > 0) {
				this.enhanceBetIdleAnimation.animationState.setAnimation(0, animations[0].name, true);
			}
		}
	}

	/** Stop and hide the enhance bet idle loop - now handled by BetController */
	private hideEnhanceBetIdleLoop(): void {
		if (!this.enhanceBetIdleAnimation) return;
		this.enhanceBetIdleAnimation.animationState.clearTracks();
		this.enhanceBetIdleAnimation.setVisible(false);
	}

	private createFeatureButton(scene: Scene, assetScale: number): void {
		// Position for feature button (between balance and bet containers)
		const featureX = scene.scale.width * 0.5; // Center between balance and bet
		const featureY = scene.scale.height * 0.724; // Same Y as balance and bet containers
		// Check if demo mode is active - if so, center the text (no currency symbol)
		const isDemoFeature = this.gameAPI?.getDemoState();
		const featureXOffset = isDemoFeature ? 0 : 5; // Center in demo mode, offset right when currency symbol exists

		// Feature button image (serves as background)
		const featureButton = scene.add.image(
			featureX,
			featureY,
			'feature'
		).setOrigin(0.5, 0.5).setDepth(10);
		const featureContainerWidth = 125 * assetScale;
		const featureContainerHeight = 100 * assetScale;
		const featureScale = Math.min(
			featureContainerWidth / featureButton.width,
			featureContainerHeight / featureButton.height
		);
		featureButton.setScale(featureScale);
		featureButton.setSize(featureButton.displayWidth, featureButton.displayHeight);
		this.applyBuyFeatureHitbox(featureButton);
		featureButton.on('pointerdown', () => {
			console.log('[SlotController] Feature button clicked');
			this.handleBuyFeaturePress();
		});
		this.buttons.set('feature', featureButton);
		this.controllerContainer.add(featureButton);

		// "BUY FEATURE" label (1st line)
		const featureLabel1 = scene.add.text(
			featureX,
			featureY - 8,
			'BUY FEATURE',
			{
				fontSize: '12px',
				color: '#000000',
				fontFamily: 'poppins-regular'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		this.controllerContainer.add(featureLabel1);
		this.featureLabelText = featureLabel1;
		featureLabel1.setInteractive();
		featureLabel1.on('pointerdown', () => this.handleBuyFeaturePress());

		// Amount (2nd line, right part) - bound to current bet x100
		this.featureAmountText = scene.add.text(
			featureX + featureXOffset,
			featureY + 8,
			'0',
			{
				fontSize: '14px',
				color: '#000000',
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		this.controllerContainer.add(this.featureAmountText);
		this.featureAmountText.setInteractive();
		this.featureAmountText.on('pointerdown', () => this.handleBuyFeaturePress());

		// "$" symbol (2nd line, left part) - positioned dynamically
		this.featureDollarText = scene.add.text(
			featureX - (this.featureAmountText.width / 2) - 3,
			featureY + 8,
			isDemoFeature ? '' : '$',
			{
				fontSize: '14px',
				color: '#ffffff',
				fontFamily: 'poppins-regular'
			}
		).setOrigin(0.5, 0.5).setDepth(9);
		// Hide currency symbol in demo mode
		this.featureDollarText.setVisible(!isDemoFeature);
		this.controllerContainer.add(this.featureDollarText);
		this.featureDollarText.setInteractive();
		this.featureDollarText.on('pointerdown', () => this.handleBuyFeaturePress());

		// Initialize amount from current bet
		this.updateFeatureAmountFromCurrentBet();
	}

	private createLandscapeController(scene: Scene, assetScale: number): void {
		console.log("[SlotController] Creating landscape controller layout");
		
		// Create primary controllers container
		this.primaryControllers = scene.add.container(0, 0);
		this.controllerContainer.add(this.primaryControllers);
		
		// Create buttons for landscape layout
		const middleRef = scene.scale.height * 0.9;
		const buttonSpacing = 100;
		
		// Spin button (main action)
		const spinButton = scene.add.image(
			scene.scale.width * 0.5,
			middleRef,
			'spin'
		).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);

		// Spin icon overlay in front of and aligned with the spin button (landscape)
		// (kept above the free-round Spine effect)
		if (!this.spinIcon) {
			this.spinIcon = scene.add.image(
				spinButton.x,
				spinButton.y,
				'spin_icon'
			).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(12);
			this.primaryControllers.add(this.spinIcon);
			this.spinIconTween = scene.tweens.add({
				targets: this.spinIcon,
				angle: 360,
				duration: 4000,
				repeat: -1,
				ease: 'Linear'
			});
		}

		// Autoplay stop icon overlay (hidden by default), same position as spin (landscape)
		// (on top of both the spin icon and the Spine effect)
		if (!this.autoplayStopIcon) {
			this.autoplayStopIcon = scene.add.image(
				spinButton.x,
				spinButton.y,
				'autoplay_stop_icon'
			).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(13).setVisible(false);
			this.primaryControllers.add(this.autoplayStopIcon);
		}

		spinButton.setInteractive();
		spinButton.on('pointerdown', async () => {
			console.log('[SlotController] Spin button clicked');
			const now = Date.now();
			if (now - this.lastSpinClickAt < this.spinClickDebounceMs) {
				console.log('[SlotController] Spin click ignored - debounce');
				return;
			}
			this.lastSpinClickAt = now;
			this.playSpinButtonClickSfx();
			// If autoplay is active (or about to start), clicking spin will stop autoplay instead
			if (gameStateManager.isAutoPlaying || gameStateManager.isAutoPlaySpinRequested) {
				console.log('[SlotController] Stopping autoplay via spin button click');
				this.stopAutoplay();
				return;
			}
			if (gameStateManager.isReelSpinning) {
				console.log('[SlotController] Spin blocked - already spinning');
				return;
			}
			
			// Disable spin button, bet buttons, feature button and play animations
			this.disableSpinButton();
			this.disableBetButtons();
			this.disableFeatureButton();
			// Disable and grey out autoplay and turbo buttons while symbols are dropping
			this.disableAutoplayButton();
			this.disableTurboButton();
			this.playSpinButtonAnimation();
			this.rotateSpinButton();
			
			// Use the centralized spin handler
			await this.handleSpin();
		});
		this.buttons.set('spin', spinButton);
		this.primaryControllers.add(spinButton);

		// Turbo button
		const turboButton = scene.add.image(
			scene.scale.width * 0.5 - buttonSpacing,
			middleRef,
			'turbo_off'
		).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
		turboButton.setInteractive();
		turboButton.on('pointerdown', () => {
			console.log('[SlotController] Turbo button clicked');
			this.handleTurboButtonClick();
		});
		this.buttons.set('turbo', turboButton);
		this.primaryControllers.add(turboButton);

		// Turbo text label
		const turboText = scene.add.text(
			scene.scale.width * 0.5 - buttonSpacing,
			middleRef + (turboButton.displayHeight * 0.5) + 15,
			'Turbo',
			this.getTextStyle()
		).setOrigin(0.5, 0.5).setDepth(10);
		this.controllerContainer.add(turboText);
		this.controllerTexts.push(turboText);

		// Autoplay button
		const autoplayButton = scene.add.image(
			scene.scale.width * 0.5 + buttonSpacing,
			middleRef,
			'autoplay_off'
		).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
		autoplayButton.setInteractive();
		autoplayButton.on('pointerdown', () => {
			console.log('[SlotController] Autoplay button clicked');
			this.handleAutoplayButtonClick();
		});
		this.buttons.set('autoplay', autoplayButton);
		this.primaryControllers.add(autoplayButton);

		// Autoplay text label
		const autoplayText = scene.add.text(
			scene.scale.width * 0.5 + buttonSpacing,
			middleRef + (autoplayButton.displayHeight * 0.5) + 15,
			'Autoplay',
			this.getTextStyle(),
		).setOrigin(0.5, 0.5).setDepth(10);
		this.controllerContainer.add(autoplayText);
		this.controllerTexts.push(autoplayText);

		// Menu button
		const menuButton = scene.add.image(
			scene.scale.width * 0.5 + buttonSpacing * 2,
			middleRef,
			'menu'
		).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);
		menuButton.setInteractive();
		menuButton.on('pointerdown', () => {
			console.log('[SlotController] Menu button clicked');
			EventBus.emit('menu');
		});
		this.buttons.set('menu', menuButton);
		this.primaryControllers.add(menuButton);

		// Menu text label
		const menuText = scene.add.text(
			scene.scale.width * 0.5 + buttonSpacing * 2,
			middleRef + (menuButton.displayHeight * 0.5) + 15,
			'Menu',
			this.getTextStyle()
		).setOrigin(0.5, 0.5).setDepth(10);
		this.controllerContainer.add(menuText);
		this.controllerTexts.push(menuText);

		// Amplify description container
		this.createAmplifyDescription(scene, assetScale);

		// Balance display container
		this.createBalanceDisplay(scene, assetScale);

		// Bet display container
		this.createBetDisplay(scene, assetScale);
		
		// Feature button container
		this.createFeatureButton(scene, assetScale);
		
		// Free spin display container
		this.createFreeSpinDisplay(scene, assetScale);
		
		// Create the spin button animation
		this.createSpinButtonAnimation(scene, assetScale);
		
		// Create the autoplay button animation
		this.createAutoplayButtonAnimation(scene, assetScale);
		
		// Create the turbo button animation
		this.createTurboButtonAnimation(scene, assetScale);
		
		// Create the autoplay spins remaining text
		this.createAutoplaySpinsRemainingText(scene, assetScale);

		// Hand off autoplay UI elements to AutoplayController
		this.autoplayController?.attachUiElements({
			button: autoplayButton,
			stopIcon: this.autoplayStopIcon,
			spinsText: this.autoplaySpinsRemainingText,
			buttonTextureOn: 'autoplay_on',
			buttonTextureOff: 'autoplay_off',
			uiContainer: this.primaryControllers
		});
	}

	updateButtonState(buttonName: string, isActive: boolean): void {
		const button = this.buttons.get(buttonName);
		if (button) {
			const newTexture = isActive ? `${buttonName}_on` : `${buttonName}_off`;
			button.setTexture(newTexture);
		}
	}

	resize(scene: Scene): void {
		if (this.controllerContainer) {
			// Reapply vertical offset on resize to maintain spacing
			if (this.controllerVerticalOffset === 0) {
				this.controllerVerticalOffset = scene.scale.height * 0.02;
			}
			this.controllerContainer.setY(this.controllerVerticalOffset);
			// Recenter horizontally in case layout/scale changes with the new size.
			this.recenterControllerContainer(scene);
		}
	}

	getContainer(): Phaser.GameObjects.Container {
		return this.controllerContainer;
	}

	getButton(buttonName: string): Phaser.GameObjects.Image | undefined {
		return this.buttons.get(buttonName);
	}

	/**
	 * Update bet amount from autoplay panel without resetting amplify/enhanced bet state.
	 * This preserves existing enhance bet if it was enabled before autoplay starts.
	 */
	public updateBetAmountFromAutoplay(betAmount: number): void {
		// Treat this as an internal bet change so resetAmplifyBetOnBetChange is not triggered
		this.isInternalBetChange = true;
		try {
			this.updateBetAmount(betAmount);

			// If enhance/amplify bet is currently ON, keep the displayed bet at +25%
			// while the underlying base bet (used for API and Buy Feature price) is betAmount.
			const gameData = this.getGameData();
			if (gameData && gameData.isEnhancedBet && this.betAmountText) {
				const increasedBet = betAmount * 1.25;
				this.betAmountText.setText(increasedBet.toFixed(2));

				// Update currency symbol position based on new bet amount width
				const isDemo = this.gameAPI?.getDemoState();
				if (this.betDollarText && this.scene) {
					const betX = this.scene.scale.width * 0.81;
					const betY = this.betAmountText.y;
					this.betAmountText.setPosition(betX + (isDemo ? 0 : 3), betY);
					if (isDemo) {
						this.betDollarText.setVisible(false);
						this.betDollarText.setText('');
					} else {
						this.betDollarText.setVisible(true);
						this.betDollarText.setText('$');
						this.betDollarText.setPosition(this.betAmountText.x - (this.betAmountText.width / 2) - 5, betY);
					}
				}
			}
		} finally {
			this.isInternalBetChange = false;
		}
	}

	updateBetAmount(betAmount: number): void {
		if (this.betAmountText) {
			this.betAmountText.setText(betAmount.toFixed(2));

			const isDemo = this.gameAPI?.getDemoState();
			if (this.scene) {
				const betX = this.scene.scale.width * 0.81;
				const betY = this.betAmountText.y;
				// Center amount text in demo mode; maintain offset when currency symbol exists
				this.betAmountText.setPosition(betX + (isDemo ? 0 : 3), betY);
			}

			// Update currency symbol position based on new bet amount width
			if (this.betDollarText) {
				const betY = this.betAmountText.y;
				if (isDemo) {
					this.betDollarText.setVisible(false);
					this.betDollarText.setText('');
				} else {
					this.betDollarText.setVisible(true);
					this.betDollarText.setText('$');
					this.betDollarText.setPosition(this.betAmountText.x - (this.betAmountText.width / 2) - 5, betY);
				}
			}
		}

		// Update base bet amount when changed externally (not by amplify bet)
		if (!this.isInternalBetChange) {
			this.baseBetAmount = betAmount;
			// Reset amplify bet state when bet amount is changed externally
			this.resetAmplifyBetOnBetChange();
		}

		// Keep the Buy Feature amount synced with current base bet (using the updated baseBetAmount)
		this.updateFeatureAmountFromCurrentBet();

		// Update bet +/- button states based on the new bet (for min/max greying)
		this.updateBetLimitButtons(betAmount);
	}

	/**
	 * Update the Buy Feature button amount to current base bet x100
	 */
	private updateFeatureAmountFromCurrentBet(): void {
		if (!this.featureAmountText || !this.featureDollarText) {
			return;
		}
		// Always use base bet for Buy Feature price; enhanced bet's +25% is display-only
		const baseBet = this.getBaseBetAmount() || 0;
		const price = baseBet * 100;
		// Format with thousands separators and 2 decimals
		this.featureAmountText.setText(price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		const isDemo = this.gameAPI?.getDemoState();
		if (this.scene) {
			const featureX = this.scene.scale.width * 0.5;
			const y = this.featureAmountText.y;
			this.featureAmountText.setPosition(featureX + (isDemo ? 0 : 5), y);
			if (isDemo) {
				   this.featureDollarText.setVisible(false);
				   this.featureDollarText.setText('');
			} else {
				   this.featureDollarText.setVisible(true);
				   this.featureDollarText.setText('$');
				   this.featureDollarText.setColor && this.featureDollarText.setColor('#000000');
				   this.featureDollarText.setPosition(this.featureAmountText.x - (this.featureAmountText.width / 2) - 3, y);
			}
		}
	}

	getBetAmountText(): string | null {
		return this.betAmountText ? this.betAmountText.text : null;
	}

	/**
	 * Get the base bet amount for API calls (without amplify bet increase)
	 */
	getBaseBetAmount(): number {
		return this.baseBetAmount;
	}

	updateBalanceAmount(balanceAmount: number): void {
		if (this.balanceAmountText) {
			this.balanceAmountText.setText(balanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
			
			const isDemo = this.gameAPI?.getDemoState();
			if (this.scene) {
				const balanceX = this.scene.scale.width * 0.19;
				const balanceY = this.balanceAmountText.y;
				// Center amount text in demo mode; maintain offset when currency symbol exists
				this.balanceAmountText.setPosition(balanceX + (isDemo ? 0 : 2.5), balanceY);

				if (this.balanceDollarText) {
					if (isDemo) {
						this.balanceDollarText.setVisible(false);
						this.balanceDollarText.setText('');
					} else {
						this.balanceDollarText.setVisible(true);
						this.balanceDollarText.setText('$');
						this.balanceDollarText.setPosition(balanceX - (this.balanceAmountText.width / 2) - 2.5, balanceY);
					}
				}
			}
		}
	}

	/**
	 * Decrement balance by the current bet amount (frontend only)
	 */
	private decrementBalanceByBet(): void {
		try {
			// Get current balance and bet amount
			const currentBalance = this.getBalanceAmount();
			const currentBet = this.getBaseBetAmount();
			const gameData = this.getGameData();

			// If Enhanced Bet is active, include the additional 25% in the deducted amount (frontend only)
			const totalBetToCharge = (gameData && gameData.isEnhancedBet)
				? currentBet * 1.25
				: currentBet;
			
			console.log(`[SlotController] Decrementing balance: $${currentBalance} - $${totalBetToCharge} ${gameData && gameData.isEnhancedBet ? '(enhanced bet +25%)' : ''}`);
			
			// Calculate new balance
			const newBalance = Math.max(0, currentBalance - totalBetToCharge); // Ensure balance doesn't go below 0
			
			// Update balance display immediately
			this.updateBalanceAmount(newBalance);

			// Sync demo balance if demo mode is active
			if (this.gameAPI?.getDemoState()) {
				this.gameAPI.updateDemoBalance(newBalance);
			}
			
			console.log(`[SlotController] Balance decremented: $${currentBalance} -> $${newBalance} (bet charged: $${totalBetToCharge})`);
			
		} catch (error) {
			console.error('[SlotController] Error decrementing balance:', error);
		}
	}

	getBalanceAmountText(): string | null {
		return this.balanceAmountText ? this.balanceAmountText.text : null;
	}

	getBalanceAmount(): number {
		if (this.balanceAmountText) {
			// Remove the "$" symbol and parse the numeric value
			const balanceText = this.balanceAmountText.text.replace('$', '').replace(/,/g, '');
			return parseFloat(balanceText) || 0;
		}
		return 0;
	}

	enablePrimaryControllers(): void {
		if (this.primaryControllers) {
			this.primaryControllers.setVisible(true);
			this.primaryControllers.setInteractive(true);
		}
	}

	disablePrimaryControllers(): void {
		if (this.primaryControllers) {
			this.primaryControllers.setVisible(false);
			this.primaryControllers.setInteractive(false);
		}
	}

	/**
	 * Setup event listeners for autoplay state changes
	 */
	private setupAutoplayEventListeners(): void {
		// Listen for balance initialization
		gameEventManager.on(GameEventType.BALANCE_INITIALIZED, (data: any) => {
			console.log('[SlotController] Balance initialized event received:', data);
			
			if (data && data.newBalance !== undefined) {
				console.log(`[SlotController] Updating balance display to: $${data.newBalance}`);
				this.updateBalanceAmount(data.newBalance);
			}
		});

		// Listen for any spin to start (manual or autoplay)
		gameEventManager.on(GameEventType.SPIN, () => {
			console.log('[SlotController] Spin event received');
			
			// CRITICAL: Block autoplay spins if win dialog is showing, but allow manual spins
			// This fixes the timing issue where manual spin button animation was blocked
			if (gameStateManager.isShowingWinDialog && this.gameData?.isAutoPlaying) {
				console.log('[SlotController] Autoplay SPIN event BLOCKED - win dialog is showing');
				console.log('[SlotController] Manual spins are still allowed to proceed');
				return;
			}
			
			// Check if free spin autoplay is active - if so, don't play spin button animation
			const symbolsComponent = (this.scene as any).symbols;
			if (symbolsComponent && typeof symbolsComponent.isFreeSpinAutoplayActive === 'function' && symbolsComponent.isFreeSpinAutoplayActive()) {
				console.log('[SlotController] Free spin autoplay is active - skipping spin button animation');
				return;
			}
			
			// For manual spins, disable spin. Keep enabled during autoplay to allow stopping autoplay
			if (!gameStateManager.isAutoPlaying) {
				this.disableSpinButton();
			}
			
			// Play the spin button spine animation for all spins (manual and autoplay)
			this.playSpinButtonAnimation();
			
			// Rotate the spin button for all spins (manual and autoplay)
			this.rotateSpinButton();
			
			
			// Removed pulsing of autoplay spins remaining text during spin
			
			// Log current GameData animation values to debug turbo mode
			console.log('[SlotController] Spin started - GameData animation values:', this.getGameDataAnimationInfo());
			
			// Ensure turbo speed is applied to scene GameData before winline animations start
			this.forceApplyTurboToSceneGameData();
			
			// Ensure turbo speed is applied to winline animations via Symbols component
			this.applyTurboToWinlineAnimations();
		});

		// Listen for reels start to disable amplify button
		gameEventManager.on(GameEventType.REELS_START, () => {
			console.log('[SlotController] Reels started - disabling spin button and amplify button');
			this.disableSpinButton();
			this.disableAmplifyButton();
			// Autoplay counter is managed by AutoplayController
			const spinsRemaining = this.getAutoplaySpinsRemaining();
			if (spinsRemaining > 0 && gameStateManager.isAutoPlaying && !gameStateManager.isBonus) {
				// If this autoplay session is a freeround autoplay, broadcast remaining spins
				// so FreeRoundManager can update its text display.
				if (this.isFreeRoundAutoplay && this.scene) {
					this.scene.events.emit('freeround-autoplay-remaining', spinsRemaining);
				}

				// Re-enable spin button interaction after first autoplay spin is triggered in normal mode
				if (this.shouldReenableSpinButtonAfterFirstAutoplay) {
					const spinButton = this.buttons.get('spin');
					if (spinButton) {
						spinButton.setInteractive();
						this.shouldReenableSpinButtonAfterFirstAutoplay = false;
						console.log('[SlotController] Re-enabled spin button interaction after first autoplay spin');
					}
				}
			}
			// During bonus mode, keep the displayed count stable while reels spin.
		});

		gameEventManager.on(GameEventType.REELS_STOP, () => {
			console.log('[SlotController] Reels stopped event received - updating spin button state');
			
			// Update balance from server every time reels stop (skip during scatter/bonus)
			if (!gameStateManager.isScatter && !gameStateManager.isBonus) {
				this.updateBalanceFromServer();
			} else {
				console.log('[SlotController] Skipping server balance update on REELS_STOP (scatter/bonus active)');
			}
			
			// Apply pending balance update now that reels have stopped spinning
			if (this.pendingBalanceUpdate) {
				console.log('[SlotController] Applying pending balance update after reels stopped:', this.pendingBalanceUpdate);
				
				// Update balance display with final balance (including winnings)
				if (this.pendingBalanceUpdate.balance !== undefined) {
					const oldBalance = this.getBalanceAmountText();
					this.updateBalanceAmount(this.pendingBalanceUpdate.balance);
					
					if (this.pendingBalanceUpdate.winnings && this.pendingBalanceUpdate.winnings > 0) {
						console.log(`[SlotController] Balance updated after reels stopped: ${oldBalance} -> ${this.pendingBalanceUpdate.balance} (added winnings: ${this.pendingBalanceUpdate.winnings})`);
					} else {
						console.log(`[SlotController] Balance updated after reels stopped: ${oldBalance} -> ${this.pendingBalanceUpdate.balance}`);
					}
				}
				
				// Clear the pending update
				this.pendingBalanceUpdate = null;
				console.log('[SlotController] Pending balance update cleared');
			} else {
				console.log('[SlotController] No pending balance update to apply');
			}
			
			// If we're in bonus mode, check if free spins are finishing now
			if (gameStateManager.isBonus) {
				try {
					// Sync free spin display after the spin completes
					try {
						const symbolsComponent = (this.scene as any)?.symbols;
						if (symbolsComponent && this.freeSpinNumber) {
							const rem = symbolsComponent.freeSpinAutoplaySpinsRemaining;
							if (typeof rem === 'number') {
								this.updateFreeSpinNumber(rem);
								console.log(`[SlotController] REELS_STOP: synced free spin display to ${rem}`);
							}
						}
					} catch (e) {
						console.warn('[SlotController] Failed to sync free spin display on REELS_STOP:', e);
					}

					// Frontend-only: increment balance by the current free spin subtotal win
					if (this.gameAPI) {
						const currentSpin = this.gameAPI.getCurrentSpinData();
						if (currentSpin && currentSpin.slot) {
							const spinSubtotalWin = this.getBonusSpinWin(currentSpin);
							if (spinSubtotalWin && spinSubtotalWin > 0) {
								const oldBalanceVal = this.getBalanceAmount();
								const newBalanceVal = oldBalanceVal + spinSubtotalWin;
								this.updateBalanceAmount(newBalanceVal);
								console.log(`[SlotController] Bonus mode: incremented balance by subtotalWin ${spinSubtotalWin}. ${oldBalanceVal} -> ${newBalanceVal}`);
							}
						}
					}
					
					const gameScene: any = this.scene as any;
					const symbolsComponent = gameScene?.symbols;
					
					// Check if there's a pending scatter retrigger that will add more free spins
					// If so, don't set isBonusFinished because the bonus will continue
					const hasPendingRetrigger = symbolsComponent && typeof symbolsComponent.hasPendingScatterRetrigger === 'function' 
						? symbolsComponent.hasPendingScatterRetrigger() 
						: false;
					
					if (hasPendingRetrigger) {
						console.log('[SlotController] REELS_STOP: Pending scatter retrigger detected - NOT setting isBonusFinished (bonus will continue)');
					} else {
						// Prefer Symbols' remaining counter if available
						if (symbolsComponent && typeof symbolsComponent.freeSpinAutoplaySpinsRemaining === 'number') {
							const remaining: number = symbolsComponent.freeSpinAutoplaySpinsRemaining;
							// If after this spin there are no spins remaining, flag bonus finished
							if (remaining <= 0) {
								console.log('[SlotController] REELS_STOP: remaining free spins <= 0 – setting isBonusFinished=true');
								gameStateManager.isBonusFinished = true;
							}
						} else if (this.gameAPI && typeof this.gameAPI.getCurrentSpinData === 'function') {
							// Fallback: inspect GameAPI spin data for remaining spins
							const apiSpinData: any = this.gameAPI.getCurrentSpinData();
							const fs = apiSpinData?.slot?.freespin || apiSpinData?.slot?.freeSpin;
							if (fs?.items && Array.isArray(fs.items)) {
								const totalRemaining = fs.items.reduce((sum: number, it: any) => sum + (it?.spinsLeft || 0), 0);
								if (totalRemaining <= 1) {
									console.log('[SlotController] REELS_STOP: totalRemaining free spins <= 1 – setting isBonusFinished=true');
									gameStateManager.isBonusFinished = true;
								}
							}
						}
					}
				} catch (e) {
					console.warn('[SlotController] REELS_STOP: Unable to evaluate bonus finish state:', e);
				}
			}
			
			// If scatter bonus just triggered or bonus mode is active, keep buttons disabled
			if (gameStateManager.isScatter || gameStateManager.isBonus) {
				console.log('[SlotController] Scatter/Bonus active - keeping buttons disabled on REELS_STOP');
				return;
			}

			// If we are in initialization free-round mode, keep autoplay/bet controls
			// disabled/greyed-out for the duration of the free rounds. Only the spin
			// button should be re-enabled between spins.
			const gsmAny: any = gameStateManager as any;
			if (gsmAny.isInFreeSpinRound === true) {
				this.enableSpinButton();
				console.log('[SlotController] Initialization free-round mode active - re-enabled spin only on REELS_STOP');
				return;
			}
			
			// Check if free spin autoplay is active - if so, don't re-enable buttons
			const symbolsComponent = (this.scene as any).symbols;
			if (symbolsComponent && typeof symbolsComponent.isFreeSpinAutoplayActive === 'function' && symbolsComponent.isFreeSpinAutoplayActive()) {
				console.log('[SlotController] Free spin autoplay is active - keeping buttons disabled');
				return;
			}
			
			// Note: autoplay counter is managed by AutoplayController
			
			// Note: AUTO_STOP is emitted by AutoplayController when autoplay finishes
			
			// For manual spins, re-enable spin button and hide autoplay counter immediately after REELS_STOP
			// Check autoplay counter instead of state manager to avoid timing issues
			const spinsRemaining = this.getAutoplaySpinsRemaining();
			if (spinsRemaining === 0 && !gameStateManager.isAutoPlaying) {
				this.enableSpinButton();
				this.enableAutoplayButton();
				this.enableTurboButton();
				this.enableBetButtons();
				// Keep feature disabled during bonus or until explicitly allowed
				if (!gameStateManager.isBonus && this.canEnableFeatureButton) {
					this.enableFeatureButton();
				}
				this.enableAmplifyButton();
				this.enableBetBackgroundInteraction('after manual spin REELS_STOP');
				this.hideAutoplaySpinsRemainingText();
				this.updateAutoplayButtonState();
				this.updateTurboButtonState();
				console.log('[SlotController] Manual spin - all buttons re-enabled after REELS_STOP');
				return;
			}
			
			// Update spin button state when spin completes
			// Only enable spin button if not autoplaying AND reels are not spinning
			if(!this.gameData?.isAutoPlaying && !gameStateManager.isReelSpinning) {
				this.enableSpinButton();
				this.enableAutoplayButton();
				this.enableTurboButton();
				this.enableBetButtons();
				// Keep feature disabled during bonus or until explicitly allowed
				if (!gameStateManager.isBonus && this.canEnableFeatureButton) {
					this.enableFeatureButton();
				}
				this.enableAmplifyButton();
				this.enableBetBackgroundInteraction('after manual spin complete');
				this.updateTurboButtonState();
				console.log('[SlotController] All buttons enabled - manual spin completed and reels stopped');
				return;
			}
			
			// If autoplaying or reels still spinning, keep button disabled
			if(this.gameData?.isAutoPlaying) {
				console.log('[SlotController] Spin button remains disabled - autoplay active');
			} else if(gameStateManager.isReelSpinning) {
				console.log('[SlotController] Spin button remains disabled - reels still spinning');
			}
		});

		// Disable spin during tumble sequence; re-enable when tumbles finish
		gameEventManager.on(GameEventType.TUMBLE_WIN_PROGRESS, () => {
			if (!gameStateManager.isAutoPlaying) {
				this.disableSpinButton();
			}
		});
		gameEventManager.on(GameEventType.TUMBLE_SEQUENCE_DONE, () => {
			if (!gameStateManager.isAutoPlaying) {
				this.updateSpinButtonState();
			}
		});

		// Listen for autoplay start
		gameEventManager.on(GameEventType.AUTO_START, () => {
			console.log('[SlotController] Autoplay started - changing button to ON state');
			
			// Update GameData autoplay state
			if (this.gameData) {
				this.gameData.isAutoPlaying = true;
				console.log('[SlotController] Updated GameData.isAutoPlaying to true');
			}
			
			this.setAutoplayButtonState(true);
			// Keep spin button enabled during autoplay (allow stopping autoplay)
			// Hide and pause spin icon completely during autoplay, show stop icon
			if (this.spinIcon) {
				this.spinIcon.setVisible(false);
			}
			if (this.spinIconTween) {
				this.spinIconTween.pause();
			}
			if (this.autoplayStopIcon) {
				this.autoplayStopIcon.setVisible(true);
				this.primaryControllers.bringToTop(this.autoplayStopIcon);
			}
			// Keep spins text above all
			if (this.autoplaySpinsRemainingText && this.primaryControllers) {
				this.primaryControllers.bringToTop(this.autoplaySpinsRemainingText);
			}
			// No need to update spin button state here - will be handled when reels finish
		});

		// Listen for autoplay stop
		gameEventManager.on(GameEventType.AUTO_STOP, () => {
			console.log('[SlotController] AUTO_STOP event received');
			console.log('[SlotController] Current state - isAutoPlaying:', gameStateManager.isAutoPlaying, 'isReelSpinning:', gameStateManager.isReelSpinning);
			console.log('[SlotController] Autoplay counter:', this.getAutoplaySpinsRemaining());
			
			// Always reset autoplay UI when AUTO_STOP is received
			// (AUTO_STOP should only be emitted when autoplay is finished)
			console.log('[SlotController] Resetting autoplay UI on AUTO_STOP');
			
			// Reset autoplay button to off
			this.setAutoplayButtonState(false);
			console.log('[SlotController] Autoplay button set to OFF');
			
			// Hide autoplay spin count display
			this.hideAutoplaySpinsRemainingText();
			console.log('[SlotController] Autoplay spin count hidden');

			// If we are in initialization free-round mode, do not re-enable autoplay
			// or bet controls here; they stay disabled/greyed-out until free rounds
			// are fully completed.
			const gsmAny: any = gameStateManager as any;
			if (gsmAny.isInFreeSpinRound === true && !gameStateManager.isBonus) {
				// Ensure spin button itself is usable for manual free-round spins.
				this.enableSpinButton();
				console.log('[SlotController] AUTO_STOP during initialization free-round mode - kept autoplay/bet controls disabled');
				return;
			}
			
			// Re-enable spin button, autoplay button, bet buttons, feature button, and bet background
			this.enableSpinButton();
			this.enableAutoplayButton();
			this.enableBetButtons();
			this.enableFeatureButton();
			this.enableAmplifyButton();
			this.enableBetBackgroundInteraction('after autoplay stop');
		// Show and resume spin icon after autoplay stops, hide stop icon
			if (this.spinIcon) {
				this.spinIcon.setVisible(true);
			}
			if (this.spinIconTween) {
				this.spinIconTween.resume();
			}
			if (this.autoplayStopIcon) {
				this.autoplayStopIcon.setVisible(false);
			}
			// Keep spins text above all
			if (this.autoplaySpinsRemainingText && this.primaryControllers) {
				this.primaryControllers.bringToTop(this.autoplaySpinsRemainingText);
			}
			console.log('[SlotController] Spin, autoplay, bet, feature, and amplify buttons enabled');
			
			console.log('[SlotController] Autoplay UI reset completed');
		});


		// Listen for when reels stop spinning to enable spin button for manual spins
		gameEventManager.on(GameEventType.WIN_STOP, () => {
			console.log('[SlotController] WIN_STOP received - checking if spin button should be enabled');
			
			// If scatter bonus is in progress or bonus mode is active, keep buttons disabled
			if (gameStateManager.isScatter || gameStateManager.isBonus) {
				console.log('[SlotController] Scatter/Bonus in progress - skipping UI re-enable in WIN_STOP');
				return;
			}
			
			// Check if free spin autoplay is active - if so, don't re-enable buttons
			const symbolsComponent = (this.scene as any).symbols;
			if (symbolsComponent && typeof symbolsComponent.isFreeSpinAutoplayActive === 'function' && symbolsComponent.isFreeSpinAutoplayActive()) {
				console.log('[SlotController] Free spin autoplay is active - skipping button re-enable in WIN_STOP');
				return;
			}
			
			// Handle autoplay spin completion
			// Check if autoplay is active by checking both the counter and the game state
			const spinsRemaining = this.getAutoplaySpinsRemaining();
			const isAutoplayActive = spinsRemaining > 0 || gameStateManager.isAutoPlaying;

			if (isAutoplayActive) {
				console.log('[SlotController] Autoplay spin completed - handled by AutoplayController');
				console.log(`[SlotController] Autoplay state: spinsRemaining=${spinsRemaining}, isAutoPlaying=${gameStateManager.isAutoPlaying}`);
				return;
			}

			// Manual spin completed - emit AUTO_STOP for UI reset
			console.log('[SlotController] Manual spin completed - emitting AUTO_STOP for UI reset');
			gameEventManager.emit(GameEventType.AUTO_STOP);
		});

		// Listen for win dialog close (for high winnings case)
		gameEventManager.on(GameEventType.WIN_DIALOG_CLOSED, () => {
			console.log('[SlotController] WIN_DIALOG_CLOSED received');
			console.log('[SlotController] Current autoplay state:', {
				autoplaySpinsRemaining: this.getAutoplaySpinsRemaining(),
				isAutoPlaying: gameStateManager.isAutoPlaying,
				isShowingWinDialog: gameStateManager.isShowingWinDialog
			});

			// Autoplay continuation is handled by AutoplayController
			if (gameStateManager.isAutoPlaying || this.getAutoplaySpinsRemaining() > 0) {
				console.log('[SlotController] Autoplay continuation handled by AutoplayController');
			}
		});

		// Note: SPIN_RESPONSE event listeners removed - now using SPIN_DATA_RESPONSE
	}

	/**
	 * Handle turbo button click - toggle between on and off states
	 */
	private handleTurboButtonClick(): void {
		// Check GameData state to determine current turbo status
		const gameData = this.getGameData();
		if (!gameData) {
			console.error('[SlotController] GameData not available for turbo button click');
			return;
		}
		
		if (gameData.isTurbo) {
			// Turbo is active, turn it off
			console.log('[SlotController] Turning turbo OFF via button click');
			gameData.isTurbo = false;
			this.setTurboButtonState(false);
		} else {
			// Turbo is not active, turn it on
			console.log('[SlotController] Turning turbo ON via button click');
			gameData.isTurbo = true;
			this.setTurboButtonState(true);
		}
		
		// Apply turbo speed modifications
		this.applyTurboSpeedModifications();
		
		// Force apply turbo to scene GameData (used by Symbols component)
		this.forceApplyTurboToSceneGameData();
		
		// Apply turbo to winline animations via Symbols component
		this.applyTurboToWinlineAnimations();
		
		// Emit turbo event for other components to handle
		EventBus.emit('turbo', gameData.isTurbo);
		
		// Send turbo state to backend for speed modifications
		if (gameData.isTurbo) {
			gameEventManager.emit(GameEventType.TURBO_ON);
		} else {
			gameEventManager.emit(GameEventType.TURBO_OFF);
		}
		
		console.log(`[SlotController] Turbo state changed to: ${gameData.isTurbo} and sent to backend`);
	}

	/**
	 * Handle amplify button click - toggle between on and off states
	 */
	private handleAmplifyButtonClick(): void {
		// Check GameData state to determine current amplify bet status
		const gameData = this.getGameData();
		if (!gameData) {
			console.error('[SlotController] GameData not available for amplify button click');
			return;
		}
		
		if (gameData.isEnhancedBet) {
			// Amplify bet is active, turn it off
			console.log('[SlotController] Turning amplify bet OFF via button click');
			gameData.isEnhancedBet = false;
			this.setAmplifyButtonState(false);
			// Hide the animation when turning off
			this.hideAmplifyBetAnimation();
			this.hideEnhanceBetIdleLoop();
			// Restore original bet amount (remove 25% increase)
			this.restoreOriginalBetAmount();

			// Re-enable Buy Feature button now that enhance/amplify bet is OFF
			if (!gameStateManager.isBonus) {
				this.enableFeatureButton();
			}
		} else {
			// Amplify bet is not active, turn it on
			console.log('[SlotController] Turning amplify bet ON via button click');
			gameData.isEnhancedBet = true;
			this.setAmplifyButtonState(true);
			// Trigger animation when turning ON
			this.triggerAmplifyBetAnimation();
			// Apply 25% bet increase
			this.applyAmplifyBetIncrease();

			// Disable Buy Feature button while enhance/amplify bet is ON
			this.disableFeatureButton();
		}
		
		// Control the amplify bet button pulsing based on state
		this.controlAmplifyBetAnimation();
		
		// Emit amplify event for other components to handle
		EventBus.emit('amplify', gameData.isEnhancedBet);
		
		console.log(`[SlotController] Amplify bet state changed to: ${gameData.isEnhancedBet}`);
	}

	/**
	 * Handle autoplay button click - either start autoplay or stop if already running
	 */
	private handleAutoplayButtonClick(): void {
		// Check if autoplay is currently active
		if (this.autoplayController?.isActive() || gameStateManager.isAutoPlaying) {
			// Autoplay is active, stop it
			console.log('[SlotController] Stopping autoplay via button click');
			this.stopAutoplay();
		} else {
			// Autoplay is not active, show options to start it
			console.log('[SlotController] Showing autoplay options');
			EventBus.emit('autoplay');
		}
	}

	/**
	 * Start autoplay with specified number of spins
	 */
	public startAutoplay(spins: number): void {
		console.log(`[SlotController] Starting autoplay with ${spins} spins`);

		// Safety: if we're not in any free spin / bonus context, ensure we treat this
		// as a normal base-game autoplay (not a leftover freeround autoplay state).
		const inFreeRoundContext =
			gameStateManager.isBonus ||
			((gameStateManager as any).isInFreeSpinRound === true);
		if (!inFreeRoundContext) {
			this.isFreeRoundAutoplay = false;
		}
		const showBaseUi = !(this.isFreeRoundAutoplay || inFreeRoundContext);
		this.autoplayController?.startAutoplay(spins, { showBaseUi });

		// For normal autoplay, hide the spin icon and pause rotation.
		// For free-round autoplay, keep the base spin icon visible.
		if (showBaseUi) {
			if (this.spinIcon) {
				this.spinIcon.setVisible(false);
			}
			if (this.spinIconTween) {
				this.spinIconTween.pause();
			}
			// Disable spin button interaction for normal mode autoplay until first spin is triggered
			const spinButton = this.buttons.get('spin');
			if (spinButton) {
				spinButton.disableInteractive();
				this.shouldReenableSpinButtonAfterFirstAutoplay = true;
				console.log('[SlotController] Disabled spin button interaction - will re-enable after first autoplay spin');
			}
		} else {
			if (this.spinIcon) {
				this.spinIcon.setVisible(true);
			}
		}

		// Keep spin button enabled during autoplay (allow stopping autoplay)
		this.disableBetButtons();
		this.disableFeatureButton();
	}

	/**
	 * Start a dedicated "freeround autoplay" sequence.
	 * This uses the same internal autoplay system, but is logged separately so we can
	 * distinguish it from normal autoplay in debugging/analytics.
	 */
	public startFreeRoundAutoplay(spins: number): void {
		console.log(`[SlotController] Starting freeround autoplay with ${spins} spins`);
		this.isFreeRoundAutoplay = true;
		this.startAutoplay(spins);
	}

	/**
	 * Stop autoplay
	 */
	public stopAutoplay(): void {
		console.log('[SlotController] Stopping autoplay');
		console.log('[SlotController] Before stopAutoplay - isAutoPlaying:', gameStateManager.isAutoPlaying, 'isReelSpinning:', gameStateManager.isReelSpinning);
		this.autoplayController?.stopAutoplay(false);
		this.isFreeRoundAutoplay = false;
		this.shouldReenableSpinButtonAfterFirstAutoplay = false;

		console.log('[SlotController] After stopAutoplay - isAutoPlaying:', gameStateManager.isAutoPlaying, 'isReelSpinning:', gameStateManager.isReelSpinning);
		
		// Update UI
		// Show and resume spin icon after autoplay stops, hide stop icon
		if (this.spinIcon) {
			this.spinIcon.setVisible(true);
		}
		if (this.spinIconTween) {
			this.spinIconTween.resume();
		}
		
		// If scatter/bonus active, keep controls disabled
		if (gameStateManager.isScatter || gameStateManager.isBonus) {
			this.disableSpinButton();
			this.disableAutoplayButton();
			this.disableAmplifyButton();
			return;
		}
		
		// Re-enable controls if not spinning and we're back in normal mode
		if (!gameStateManager.isReelSpinning) {
			this.enableSpinButton();
			this.enableAutoplayButton();
			this.enableBetButtons();
			// Keep feature disabled during bonus or until explicitly allowed
			if (!gameStateManager.isBonus && this.canEnableFeatureButton) {
				this.enableFeatureButton();
			}
			this.enableAmplifyButton();
			this.enableBetBackgroundInteraction('after stopAutoplay');
			this.updateAutoplayButtonState();
			console.log('[SlotController] Autoplay stopped - controls re-enabled in normal mode');
		}
	}

	/**
	 * Change autoplay button visual state
	 */
	public setAutoplayButtonState(isOn: boolean): void {
		const autoplayButton = this.buttons.get('autoplay');
		if (autoplayButton) {
			const textureKey = isOn ? 'autoplay_on' : 'autoplay_off';
			autoplayButton.setTexture(textureKey);
			console.log(`[SlotController] Autoplay button texture changed to: ${textureKey}`);
		}
		
		// Control the autoplay animation based on state
		if (isOn) {
			this.startAutoplayAnimation();
		} else {
			this.stopAutoplayAnimation();
		}
	}

	/**
	 * Disable the turbo button (grey out and disable interaction)
	 */
	public disableTurboButton(): void {
		const turboButton = this.buttons.get('turbo');
		if (turboButton) {
			turboButton.setTint(0x666666); // Grey out the button
			turboButton.disableInteractive();
			console.log('[SlotController] Turbo button disabled and greyed out');
		}
	}

	/**
	 * Enable the turbo button (remove grey tint and enable interaction)
	 */
	public enableTurboButton(): void {
		const turboButton = this.buttons.get('turbo');
		if (turboButton) {
			turboButton.clearTint(); // Remove grey tint
			turboButton.setInteractive();
			console.log('[SlotController] Turbo button enabled');
		}
	}

	/**
	 * Disable the amplify button (disable interaction only, no visual changes)
	 */
	public disableAmplifyButton(): void {
		const amplifyButton = this.buttons.get('amplify');
		if (amplifyButton) {
			amplifyButton.removeInteractive();
			console.log('[SlotController] Amplify button disabled');
		}
	}

	/**
	 * Enable the amplify button (enable interaction)
	 */
	public enableAmplifyButton(): void {
		const amplifyButton = this.buttons.get('amplify');
		if (amplifyButton) {
			amplifyButton.setInteractive();
			console.log('[SlotController] Amplify button enabled');
		}
	}

	/**
	 * Update turbo button state based on game conditions
	 */
	public updateTurboButtonState(): void {
		const gameData = this.getGameData();
		if (!gameData || !this.buttons.has('turbo')) {
			return;
		}

		const turboButton = this.buttons.get('turbo');
		if (!turboButton) return;

		// Disable turbo button if spinning, enable otherwise
		if (gameStateManager.isReelSpinning) {
			console.log(`[SlotController] Disabling turbo button - isReelSpinning: ${gameStateManager.isReelSpinning}`);
			this.disableTurboButton();
		} else {
			console.log(`[SlotController] Enabling turbo button - not spinning`);
			this.enableTurboButton();
		}
	}

	/**
	 * Change turbo button visual state
	 */
	public setTurboButtonState(isOn: boolean): void {
		const turboButton = this.buttons.get('turbo');
		if (turboButton) {
			const textureKey = isOn ? 'turbo_on' : 'turbo_off';
			turboButton.setTexture(textureKey);
			console.log(`[SlotController] Turbo button texture changed to: ${textureKey}`);
		}
		
		// Control the turbo animation based on state
		if (isOn) {
			this.startTurboAnimation();
		} else {
			this.stopTurboAnimation();
		}
	}

	/**
	 * Change amplify button visual state
	 */
	public setAmplifyButtonState(isOn: boolean): void {
		const amplifyButton = this.buttons.get('amplify');
		if (amplifyButton) {
			if (isOn) {
				// Add a yellow tint when active
				amplifyButton.setTint(0xffff00); // Yellow tint to indicate active
				// Don't change scale here - let the pulsing handle it
			} else {
				// Remove effects when inactive
				amplifyButton.clearTint();
				// Don't change scale here - let the pulsing handle it
			}
			console.log(`[SlotController] Amplify button state changed to: ${isOn ? 'ON' : 'OFF'}`);
		}
	}

	/**
	 * Initialize amplify button state based on GameData
	 */
	private initializeAmplifyButtonState(): void {
		const gameData = this.getGameData();
		if (!gameData) {
			return;
		}

		// Set the initial button state
		this.setAmplifyButtonState(gameData.isEnhancedBet);
		
		// Control the animation based on initial state
		this.controlAmplifyBetAnimation();

		// Ensure Buy Feature button respects initial enhance/amplify state
		if (gameData.isEnhancedBet) {
			this.disableFeatureButton();
		}
		
		console.log(`[SlotController] Amplify button initialized with state: ${gameData.isEnhancedBet ? 'ON' : 'OFF'}`);
	}

	/**
	 * Control the amplify bet animation based on toggle state
	 */
	private controlAmplifyBetAnimation(): void {
		const gameData = this.getGameData();
		if (!gameData) {
			return;
		}

		// Remove pulsing/bouncing regardless of state; keep only color/tint change
		this.stopAmplifyBetBouncing();

		// Only hide idle when turning off/resetting; show is handled after toggle animation completes
		if (!gameData.isEnhancedBet) {
			this.hideEnhanceBetIdleLoop();
		}
	}



	/**
	 * Start the amplify button pulsing effect
	 */
	private startAmplifyBetBouncing(): void {
		const amplifyButton = this.buttons.get('amplify');
		if (!amplifyButton || !this.scene) {
			console.warn('[SlotController] Amplify button or scene not available for pulsing');
			return;
		}

		// Clear any existing timer
		if (this.amplifyBetBounceTimer) {
			this.amplifyBetBounceTimer.destroy();
		}

		// Create a continuous pulsing animation
		this.scene.tweens.add({
			targets: amplifyButton,
			scaleX: amplifyButton.scaleX * 1.1,
			scaleY: amplifyButton.scaleY * 1.1,
			duration: 500,
			ease: 'Sine.easeInOut',
			yoyo: true,
			repeat: -1 // Infinite repeat
		});

		console.log('[SlotController] Amplify button pulsing started');
	}

	/**
	 * Stop the amplify button pulsing effect
	 */
	private stopAmplifyBetBouncing(): void {
		const amplifyButton = this.buttons.get('amplify');
		if (amplifyButton && this.scene) {
			// Stop any active tweens on the button
			this.scene.tweens.killTweensOf(amplifyButton);
			
			// Reset to original scale
			const originalScale = this.getAmplifyButtonOriginalScale();
			amplifyButton.setScale(originalScale, originalScale);
		}

		// Clear any existing timer
		if (this.amplifyBetBounceTimer) {
			this.amplifyBetBounceTimer.destroy();
			this.amplifyBetBounceTimer = null;
		}

		console.log('[SlotController] Amplify button pulsing stopped');
	}

	/**
	 * Get the original scale of the amplify button
	 */
	private getAmplifyButtonOriginalScale(): number {
		// Return the base scale used when creating the button
		// This should match the scale used in createPortraitController
		const screenConfig = this.screenModeManager.getScreenConfig();
		const assetScale = this.networkManager.getAssetScale();
		return assetScale; // This is the original scale used for the amplify button
	}

	/**
	 * Trigger amplify bet spine animation when spin occurs while amplify bet is on
	 */
	private triggerAmplifyBetAnimation(): void {
		const gameData = this.getGameData();
		if (!gameData || !gameData.isEnhancedBet) {
			console.log('[SlotController] Amplify bet not active, skipping animation');
			return;
		}

		if (this.amplifyBetAnimation) {
			// Stop and clear any existing animation first
			this.amplifyBetAnimation.animationState.clearTracks();
			this.amplifyBetAnimation.animationState.clearListeners();

			// Reset the skeleton to its initial pose
			this.amplifyBetAnimation.skeleton.setToSetupPose();
			this.amplifyBetAnimation.animationState.setEmptyAnimation(0, 0);

			// Hide the animation to reset it
			this.amplifyBetAnimation.setVisible(false);

			// Small delay to ensure proper reset, then show and play
			this.scene?.time.delayedCall(50, () => {
				this.amplifyBetAnimation.setVisible(true);
				this.playAmplifyBetAnimation();
			});
		}
	}

	/**
	 * Play the amplify bet animation once
	 */
	private playAmplifyBetAnimation(): void {
		if (!this.amplifyBetAnimation) {
			console.warn('[SlotController] Amplify bet animation not available for playing');
			return;
		}

		const animationName = 'animation';
		
		// Try to play the animation using animationState.setAnimation (play once)
		if (this.amplifyBetAnimation.skeleton && this.amplifyBetAnimation.skeleton.data.findAnimation(animationName)) {
			this.amplifyBetAnimation.animationState.setAnimation(0, animationName, false); // Play once, no loop
			
			// Listen for animation completion to hide it and start idle loop
			this.amplifyBetAnimation.animationState.addListener({
				complete: (entry: any) => {
					if (entry.animation.name === animationName) {
						this.amplifyBetAnimation.setVisible(false);
						console.log('[SlotController] Amplify bet animation completed and hidden');
						// After toggle animation completes, show the idle loop if enhanced bet is still ON
						const gameData = this.getGameData();
						if (gameData && gameData.isEnhancedBet) {
							this.showEnhanceBetIdleLoop();
						}
					}
				}
			});
			
			console.log('[SlotController] Playing amplify bet animation once:', animationName);
		} else {
			// Fallback: try to play any available animation
			const animations = this.amplifyBetAnimation.skeleton?.data.animations || [];
			if (animations.length > 0) {
				console.log('[SlotController] Using fallback animation:', animations[0].name);
				this.amplifyBetAnimation.animationState.setAnimation(0, animations[0].name, false);
				
				// Listen for animation completion to hide it and start idle loop
				this.amplifyBetAnimation.animationState.addListener({
					complete: (entry: any) => {
						if (entry.animation.name === animations[0].name) {
							this.amplifyBetAnimation.setVisible(false);
							console.log('[SlotController] Amplify bet fallback animation completed and hidden');
							const gameData = this.getGameData();
							if (gameData && gameData.isEnhancedBet) {
								this.showEnhanceBetIdleLoop();
							}
						}
					}
				});
			} else {
				console.warn('[SlotController] No animations found for amplify bet spine');
			}
		}
	}

	/**
	 * Hide amplify bet animation
	 */
	private hideAmplifyBetAnimation(): void {
		if (this.amplifyBetAnimation) {
			this.amplifyBetAnimation.setVisible(false);
			// Stop the animation
			this.amplifyBetAnimation.animationState.clearTracks();
			console.log('[SlotController] Amplify bet animation hidden and stopped');
		}
	}

	/**
	 * Apply 25% bet increase when amplify bet is activated
	 */
	private applyAmplifyBetIncrease(): void {
		const currentBetText = this.getBetAmountText();
		if (!currentBetText) {
			console.warn('[SlotController] No current bet amount to increase');
			return;
		}

		const currentBet = parseFloat(currentBetText);
		const increasedBet = currentBet * 1.25; // Add 25%
		
		// Only update the display, keep baseBetAmount unchanged for API calls
		if (this.betAmountText) {
			this.betAmountText.setText(increasedBet.toFixed(2));
			
			// Update dollar sign position based on new bet amount width
			if (this.betDollarText) {
				const betX = this.betAmountText.x;
				const betY = this.betAmountText.y;
				this.betDollarText.setPosition(betX - (this.betAmountText.width / 2) - 5, betY);
			}
		}
		
		// Even though base bet doesn't change, price uses base bet x100
		this.updateFeatureAmountFromCurrentBet();
		
		console.log(`[SlotController] Amplify bet applied: $${currentBet} -> $${increasedBet.toFixed(2)} (+25%) - Base bet for API: $${this.baseBetAmount}`);
	}

	/**
	 * Restore original bet amount when amplify bet is deactivated
	 */
	private restoreOriginalBetAmount(): void {
		// Restore display to base bet amount
		if (this.betAmountText) {
			this.betAmountText.setText(this.baseBetAmount.toFixed(2));
			
			// Update dollar sign position based on new bet amount width
			if (this.betDollarText) {
				const betX = this.betAmountText.x;
				const betY = this.betAmountText.y;
				this.betDollarText.setPosition(betX - (this.betAmountText.width / 2) - 5, betY);
			}
		}
		
		// Keep Buy Feature price in sync
		this.updateFeatureAmountFromCurrentBet();
		
		console.log(`[SlotController] Amplify bet removed: Display restored to base bet: $${this.baseBetAmount}`);
	}

	/**
	 * Reset amplify bet state when bet amount is changed externally
	 */
	private resetAmplifyBetOnBetChange(): void {
		const gameData = this.getGameData();
		if (!gameData || !gameData.isEnhancedBet) {
			return; // Amplify bet is not active, nothing to reset
		}

		console.log('[SlotController] Bet amount changed externally - resetting amplify bet state');
		
		// Reset amplify bet state
		gameData.isEnhancedBet = false;
		this.setAmplifyButtonState(false);
		this.hideAmplifyBetAnimation();
		this.hideEnhanceBetIdleLoop();
		this.stopAmplifyBetBouncing();
		// Price still reflects base bet x100, so refresh it
		this.updateFeatureAmountFromCurrentBet();
		
		console.log('[SlotController] Amplify bet state reset due to bet change');
	}


	/**
	 * Apply turbo speed modifications to winline animations
	 */
	private applyTurboSpeedModifications(): void {
		const gameData = this.getGameData();
		if (!gameData) {
			console.warn('[SlotController] GameData not available for turbo speed modifications');
			return;
		}

		console.log(`[SlotController] Applying turbo speed modifications - isTurbo: ${gameData.isTurbo}`);
		console.log(`[SlotController] Current GameData reference:`, gameData);
		console.log(`[SlotController] GameData memory address:`, gameData.toString());

		if (gameData.isTurbo) {
			// Apply turbo speed to the UI GameData only.
			// Scene GameData (used by Symbols) will be synchronized separately via
			// forceApplyTurboToSceneGameData to avoid double-scaling.
			const originalWinUp = gameData.winUpDuration;
			const originalDrop = gameData.dropDuration;
			const originalDelay = gameData.dropReelsDelay;
			const originalDuration = gameData.dropReelsDuration;
			
			gameData.winUpDuration = gameData.winUpDuration * TurboConfig.TURBO_DURATION_MULTIPLIER;
			gameData.dropDuration = gameData.dropDuration * TurboConfig.TURBO_DURATION_MULTIPLIER;
			gameData.dropReelsDelay = gameData.dropReelsDelay * TurboConfig.TURBO_DELAY_MULTIPLIER;
			gameData.dropReelsDuration = gameData.dropReelsDuration * TurboConfig.TURBO_DURATION_MULTIPLIER;
			(gameData as any).compressionDelayMultiplier = TurboConfig.TURBO_DELAY_MULTIPLIER;
			
			console.log(`[SlotController] Turbo speed applied to winline animations (4x faster):`);
			console.log(`  winUpDuration: ${originalWinUp} -> ${gameData.winUpDuration}`);
			console.log(`  dropDuration: ${originalDrop} -> ${gameData.dropDuration}`);
			console.log(`  dropReelsDelay: ${originalDelay} -> ${gameData.dropReelsDelay}`);
			console.log(`  dropReelsDuration: ${originalDuration} -> ${gameData.dropReelsDuration}`);
		} else {
			// Reset to normal speed by calling setSpeed with the original delay
			const originalDelay = 2500; // This should match Data.DELAY_BETWEEN_SPINS
			setSpeed(gameData, originalDelay);
			(gameData as any).compressionDelayMultiplier = 1;
			console.log('[SlotController] Normal speed restored for winline animations');
		}
	}

	/**
	 * Hide the primary controller during bonus mode
	 */
	public hidePrimaryController(): void {
		if (this.primaryControllers) {
			console.log('[SlotController] Hiding primary controller');
			this.primaryControllers.setVisible(false);
		}
		
		// Hide all controller text labels
		this.controllerTexts.forEach(text => {
			text.setVisible(false);
		});
		console.log(`[SlotController] Hiding ${this.controllerTexts.length} controller text labels`);
		
		// Hide amplify description container
		if (this.amplifyDescriptionContainer) {
			this.amplifyDescriptionContainer.setVisible(false);
		 console.log('[SlotController] Hiding amplify description');
		}
		
		// Grey out the feature button
		const featureButton = this.buttons.get('feature');
		if (featureButton) {
			featureButton.setAlpha(0.3); // Make it semi-transparent/greyed out
			featureButton.disableInteractive(); // Disable clicking
			console.log('[SlotController] Feature button greyed out and disabled');
		}
		
		// Grey out the bet buttons
		const decreaseBetButton = this.buttons.get('decrease_bet');
		const increaseBetButton = this.buttons.get('increase_bet');
		
		if (decreaseBetButton) {
			decreaseBetButton.setAlpha(0.3); // Make it semi-transparent/greyed out
			decreaseBetButton.disableInteractive(); // Disable clicking
			console.log('[SlotController] Decrease bet button greyed out and disabled');
		}
		
		if (increaseBetButton) {
			increaseBetButton.setAlpha(0.3); // Make it semi-transparent/greyed out
			increaseBetButton.disableInteractive(); // Disable clicking
			console.log('[SlotController] Increase bet button greyed out and disabled');
		}
		
		// Note: Free spin display will be shown separately with actual scatter data
		console.log('[SlotController] Primary controller hidden, free spin display will be shown separately');
	}

	/**
	 * Hide the primary controller during bonus mode with scatter data
	 */
	public hidePrimaryControllerWithScatter(scatterIndex: number): void {
		// Hide the primary controller first
		this.hidePrimaryController();
		
		// Note: Free spin display will be shown after dialog animations complete
		console.log(`[SlotController] Primary controller hidden for scatter index ${scatterIndex}, free spin display will appear after dialog closes`);
	}

	/**
	 * Show the primary controller after bonus mode ends
	 */
	public showPrimaryController(): void {
		if (this.primaryControllers) {
			console.log('[SlotController] Showing primary controller');
			this.primaryControllers.setVisible(true);
		}
		
		// Show all controller text labels
		this.controllerTexts.forEach(text => {
			text.setVisible(true);
		});
		console.log(`[SlotController] Showing ${this.controllerTexts.length} controller text labels`);
		
		// Show amplify description container
		if (this.amplifyDescriptionContainer) {
			this.amplifyDescriptionContainer.setVisible(true);
			console.log('[SlotController] Showing amplify description');
		}
		
		// Restore the feature button
		const featureButton = this.buttons.get('feature');
		if (featureButton) {
			featureButton.setAlpha(1.0); // Restore full opacity
			featureButton.setInteractive(); // Re-enable clicking
			console.log('[SlotController] Feature button restored and enabled');
		}
		
		// Restore the bet buttons
		const decreaseBetButton = this.buttons.get('decrease_bet');
		const increaseBetButton = this.buttons.get('increase_bet');

		if (decreaseBetButton) {
			decreaseBetButton.setAlpha(1.0); // Restore full opacity before applying limit logic
			decreaseBetButton.setInteractive(); // Re-enable clicking before applying limit logic
			console.log('[SlotController] Decrease bet button restored and enabled (pre limit check)');
		}

		if (increaseBetButton) {
			increaseBetButton.setAlpha(1.0); // Restore full opacity before applying limit logic
			increaseBetButton.setInteractive(); // Re-enable clicking before applying limit logic
			console.log('[SlotController] Increase bet button restored and enabled (pre limit check)');
		}

		// Apply min/max greying based on the current base bet after bonus ends
		const currentBaseBet = this.getBaseBetAmount() || 0.2;
		this.updateBetLimitButtons(currentBaseBet);
		
		// Hide the free spin display when bonus mode ends
		this.hideFreeSpinDisplay();
		
		// Clear any pending free spins data
		if (this.pendingFreeSpinsData) {
			console.log('[SlotController] Bonus mode ended - clearing pending free spins data');
			this.pendingFreeSpinsData = null;
		}
	}

	/**
	 * Create the free spin display elements
	 */
	private createFreeSpinDisplay(scene: Scene, assetScale: number): void {
		// Position for free spin display (centrally below control panel)
		const freeSpinX = scene.scale.width * 0.45;
		const freeSpinY = scene.scale.height * 0.81; // Below the control panel
		
		// Create "Remaining" label (first line)
		this.freeSpinLabel = scene.add.text(
			freeSpinX - 20, // Offset to the left to center with the number
			freeSpinY - 10, // First line, positioned above
			'Remaining',
			{
				fontSize: '30px',
				color: '#00ff00', // Bright vibrant green as shown in image
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(15);
		this.controllerContainer.add(this.freeSpinLabel);
		
		// Create "Free Spin : " label (second line)
		this.freeSpinSubLabel = scene.add.text(
			freeSpinX - 15, // Same X position as first line
			freeSpinY + 20, // Second line, positioned below
			'Free Spin : ',
			{
				fontSize: '30px',
				color: '#00ff00', // Bright vibrant green as shown in image
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(15);
		this.controllerContainer.add(this.freeSpinSubLabel);
		
		// Create free spin number display
		this.freeSpinNumber = scene.add.text(
			freeSpinX + 110, // Positioned to the right of the label
			freeSpinY + 5, // Centered vertically between the two lines
			'3', // Default value, will be updated dynamically
			{
				fontSize: '80px', // Larger and bolder than the label
				color: '#ffffff', // Pure white as shown in image
				fontFamily: 'poppins-bold'
			}
		).setOrigin(0.5, 0.5).setDepth(15);
		this.controllerContainer.add(this.freeSpinNumber);
		
		// Initially hide the free spin display (only show during bonus mode)
		this.freeSpinLabel.setVisible(false);
		this.freeSpinSubLabel.setVisible(false);
		this.freeSpinNumber.setVisible(false);
		
		console.log('[SlotController] Free spin display created');
	}

	/**
	 * Show the free spin display with the specified number of spins
	 */
	public showFreeSpinDisplay(spinsRemaining: number): void {
		if (this.freeSpinDisplaySuppressed) {
			console.log('[SlotController] Suppressed: skipping showFreeSpinDisplay');
			return;
		}
		if (this.freeSpinLabel && this.freeSpinNumber && this.freeSpinSubLabel) {
			this.freeSpinNumber.setText(spinsRemaining.toString());
			this.freeSpinLabel.setVisible(true);
			this.freeSpinSubLabel.setVisible(true);
			this.freeSpinNumber.setVisible(true);
			console.log(`[SlotController] Free spin display shown with ${spinsRemaining} spins remaining`);
		}
	}

	/**
	 * Show the free spin display with the actual free spins won from scatter bonus
	 */
	public showFreeSpinDisplayFromScatter(scatterIndex: number): void {
		if (this.freeSpinDisplaySuppressed) {
			console.log('[SlotController] Suppressed: skipping showFreeSpinDisplayFromScatter');
			return;
		}
		// The actual free spins value will be passed directly from ScatterAnimationManager
		// This method is called when scatterBonusActivated event is received
		if (this.freeSpinLabel && this.freeSpinNumber && this.freeSpinSubLabel) {
			// Initially show with the scatter index, will be updated with actual value
			this.freeSpinNumber.setText(`Index: ${scatterIndex}`);
			this.freeSpinLabel.setVisible(true);
			this.freeSpinSubLabel.setVisible(true);
			this.freeSpinNumber.setVisible(true);
			console.log(`[SlotController] Free spin display shown for scatter index ${scatterIndex}`);
		}
	}

	/**
	 * Show the free spin display with the actual free spins value
	 */
	public showFreeSpinDisplayWithActualValue(actualFreeSpins: number): void {
		if (this.freeSpinDisplaySuppressed) {
			console.log('[SlotController] Suppressed: skipping showFreeSpinDisplayWithActualValue');
			return;
		}
		if (this.freeSpinLabel && this.freeSpinNumber && this.freeSpinSubLabel) {
			this.freeSpinNumber.setText(actualFreeSpins.toString());
			this.freeSpinLabel.setVisible(true);
			this.freeSpinSubLabel.setVisible(true);
			this.freeSpinNumber.setVisible(true);
			console.log(`[SlotController] Free spin display shown with actual value: ${actualFreeSpins} spins`);
		}
	}

	/**
	 * Update the free spin display with the actual free spins value
	 */
	public updateFreeSpinDisplayWithActualValue(actualFreeSpins: number): void {
		if (this.freeSpinLabel && this.freeSpinNumber && this.freeSpinSubLabel) {
			this.freeSpinNumber.setText(actualFreeSpins.toString());
			console.log(`[SlotController] Free spin display updated with actual value: ${actualFreeSpins} spins`);
		}
	}

	/**
 * Disable the autoplay button (grey out and disable interaction)
 */
public disableAutoplayButton(): void {
    const autoplayButton = this.buttons.get('autoplay');
    if (autoplayButton) {
        autoplayButton.setTint(0x666666); // Grey out the button
        autoplayButton.disableInteractive();
        console.log('[SlotController] Autoplay button disabled and greyed out');
    }
}

/**
 * Enable the autoplay button (remove grey tint and enable interaction)
 */
public enableAutoplayButton(): void {
    const autoplayButton = this.buttons.get('autoplay');
    if (autoplayButton) {
        autoplayButton.clearTint(); // Remove grey tint
        autoplayButton.setInteractive();
        console.log('[SlotController] Autoplay button enabled');
    }
}

/**
 * Update autoplay button state based on game conditions
 */
public updateAutoplayButtonState(): void {
    const gameData = this.getGameData();
    if (!gameData || !this.buttons.has('autoplay')) {
        return;
    }

    const autoplayButton = this.buttons.get('autoplay');
    if (!autoplayButton) return;

    		// Disable autoplay button if spinning, enable otherwise
		if (gameStateManager.isReelSpinning) {
			console.log(`[SlotController] Disabling autoplay button - isReelSpinning: ${gameStateManager.isReelSpinning}`);
			this.disableAutoplayButton();
		} else {
			console.log(`[SlotController] Enabling autoplay button - not spinning`);
			this.enableAutoplayButton();
		}
}

	/**
	 * Hide the free spin display
	 */
	public hideFreeSpinDisplay(): void {
		if (this.freeSpinLabel && this.freeSpinNumber && this.freeSpinSubLabel) {
			this.freeSpinLabel.setVisible(false);
			this.freeSpinSubLabel.setVisible(false);
			this.freeSpinNumber.setVisible(false);
			console.log('[SlotController] Free spin display hidden');
		}
	}

	/**
	 * Update the free spin number display
	 * In bonus mode, decrement the display value by 1 for frontend only
	 */
	public updateFreeSpinNumber(spinsRemaining: number): void {
		if (this.freeSpinNumber) {
			// In bonus mode, decrement display value by 1 for frontend only
			let displayValue = spinsRemaining;
			if (gameStateManager.isBonus && spinsRemaining > 0) {
				displayValue = spinsRemaining;
				console.log(`[SlotController] Bonus mode: displaying ${displayValue} (actual: ${spinsRemaining})`);
			}
			
			this.freeSpinNumber.setText(displayValue.toString());
			console.log(`[SlotController] Free spin number updated to ${displayValue} (actual: ${spinsRemaining})`);
		}
	}

	/**
	 * Safely get freespin items from either legacy 'freespin' or camelCase 'freeSpin'
	 */
	private getFreeSpinItems(spinData: SpinData): any[] {
		const fs = spinData?.slot?.freespin || (spinData as any)?.slot?.freeSpin;
		return Array.isArray(fs?.items) ? fs.items : [];
	}

	/**
	 * Compare two 2D number arrays for equality
	 */
	private areasEqual(a: number[][] | undefined, b: number[][] | undefined): boolean {
		if (!a || !b) return false;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			const rowA = a[i];
			const rowB = b[i];
			if (!rowA || !rowB || rowA.length !== rowB.length) return false;
			for (let j = 0; j < rowA.length; j++) {
				if (rowA[j] !== rowB[j]) return false;
			}
		}
		return true;
	}

	/**
	 * Determine the spinsLeft to display from the provided spinData.
	 * Priority:
	 * 1) Match the item whose area equals the current slot area
	 * 2) First item with spinsLeft > 0
	 * 3) Fallback to Symbols.freeSpinAutoplaySpinsRemaining if available
	 */
	private computeDisplaySpinsLeft(spinData: SpinData): number {
		const items = this.getFreeSpinItems(spinData);
		if (items.length === 0) {
			const fs = spinData?.slot?.freespin || (spinData as any)?.slot?.freeSpin;
			const count = typeof fs?.count === 'number' ? fs.count : 0;
			if (count > 0) return count;
		}

		// Try to match by area
		const currentArea = spinData?.slot?.area;
		if (currentArea) {
			const matched = items.find((it: any) => this.areasEqual(it?.area, currentArea));
			if (matched && typeof matched.spinsLeft === 'number') {
				return matched.spinsLeft;
			}
		}

		// Fallback: first with spinsLeft > 0
		const firstWithSpins = items.find((it: any) => typeof it?.spinsLeft === 'number' && it.spinsLeft > 0);
		if (firstWithSpins) return firstWithSpins.spinsLeft;

		const fs = spinData?.slot?.freespin || (spinData as any)?.slot?.freeSpin;
		const count = typeof fs?.count === 'number' ? fs.count : 0;
		if (count > 0) return count;

		// Last resort: use Symbols tracker if present
		const gameScene = this.scene as any;
		const remaining = gameScene?.symbols?.freeSpinAutoplaySpinsRemaining;
		if (typeof remaining === 'number') return remaining;

		return 0;
	}

	/**
	 * Prefer the free spin item's totalWin/subTotalWin when in bonus mode.
	 * Falls back to payline total win if a matching item isn't found.
	 */
	private getBonusSpinWin(spinData: SpinData): number {
		let totalWin = SpinDataUtils.getTotalWin(spinData);
		try {
			const slotAny: any = spinData?.slot || {};
			const fs = slotAny.freespin || slotAny.freeSpin;
			const items = Array.isArray(fs?.items) ? fs.items : [];
			const area = slotAny.area;

			if (items.length > 0 && Array.isArray(area)) {
				const areaJson = JSON.stringify(area);
				const currentItem = items.find((item: any) =>
					Array.isArray(item?.area) && JSON.stringify(item.area) === areaJson
				);

				if (currentItem) {
					const itemTotalWinRaw = (currentItem as any).totalWin ?? (currentItem as any).subTotalWin ?? 0;
					const itemTotalWin = Number(itemTotalWinRaw);
					if (!isNaN(itemTotalWin) && itemTotalWin > 0) {
						totalWin = itemTotalWin;
					}
				}
			}
		} catch (e) {
			console.warn('[SlotController] Failed to derive free spin item totalWin; using payline totalWin', e);
		}
		return totalWin;
	}

	/**
	 * Handle spin logic - either normal API call or free spin simulation
	 */
	private async handleSpin(): Promise<void> {
		if (this.isSpinLocked || gameStateManager.isReelSpinning) {
			console.log('[SlotController] handleSpin blocked - spin locked or reels spinning');
			return;
		}
		this.isSpinLocked = true;
		try {
			if (!this.gameAPI) {
				console.warn('[SlotController] GameAPI not available, falling back to EventBus');
				EventBus.emit('spin');
				return;
			}

			// Throttle spin requests slightly to avoid API spam
			try {
				const now = Date.now();
				const elapsed = now - this.lastSpinRequestAt;
				if (elapsed < this.spinRequestMinIntervalMs) {
					const waitMs = this.spinRequestMinIntervalMs - elapsed;
					await new Promise<void>((resolve) => this.scene?.time?.delayedCall?.(waitMs, () => resolve()) || setTimeout(resolve, waitMs));
				}
				this.lastSpinRequestAt = Date.now();
			} catch { }

			// Guard: ensure sufficient balance before proceeding
			try {
				const currentBalance = this.getBalanceAmount();
				const currentBet = this.getBaseBetAmount() || 0;
				const gd = this.getGameData();
				const totalBetToCharge = gd && gd.isEnhancedBet ? currentBet * 1.25 : currentBet;
				if (currentBalance < totalBetToCharge) {
					console.error(`[SlotController] Insufficient balance for spin: ${currentBalance} < ${totalBetToCharge}`);
					if (this.autoplayController?.isActive() || this.gameData?.isAutoPlaying || gameStateManager.isAutoPlaying) {
						this.stopAutoplay();
					}
					this.showOutOfBalancePopup();
					this.enableSpinButton();
					this.enableAutoplayButton();
					this.enableBetButtons();
					this.enableFeatureButton();
					this.enableAmplifyButton();
					return;
				}
			} catch {}

			// Start clearing/dropping existing symbols immediately at spin start
			try {
				const gameScene: any = this.scene as any;
				const symbolsComponent = gameScene?.symbols;
				if (symbolsComponent && typeof symbolsComponent.startPreSpinDrop === 'function') {
					console.log('[SlotController] Triggering pre-spin symbol drop');
					symbolsComponent.startPreSpinDrop();
				}
			} catch (e) {
				console.warn('[SlotController] Failed to start pre-spin symbol drop:', e);
			}

			// Play spin sound effect
			if ((window as any).audioManager) {
				(window as any).audioManager.playSoundEffect(SoundEffectType.SPIN);
				console.log('[SlotController] Playing spin sound effect');
			}
			
			// Decrement balance by bet amount (frontend only) for paid spins only.
			// During freeround autoplay or initialization free rounds, spins are free
			// so we do NOT touch the balance here.
			const inInitFreeRoundContext =
				(gameStateManager as any)?.isInFreeSpinRound === true && !gameStateManager.isBonus;
			if (!this.isFreeRoundAutoplay && !inInitFreeRoundContext) {
				this.decrementBalanceByBet();
			}

			try {
				let spinData: SpinData;

				// Start spinner timer - show spinner if fetch takes longer than 2 seconds (after symbols clear)
				this.startSpinnerTimer();

				// Check if we're in bonus mode and use free spin simulation
				if (gameStateManager.isBonus) {
					console.log('[SlotController] In bonus mode - using free spin simulation...');
					spinData = await this.gameAPI.simulateFreeSpin();
					
					// Hide spinner immediately after receiving data
					this.hideSpinner();
					
					// Update free spin display directly from spinData.freeSpin.items[].spinsLeft
					const serverSpinsLeft = this.computeDisplaySpinsLeft(spinData);
					// Prefer UI override (e.g., +5 on retrigger) if set
					const displaySpinsOverrideApplied = this.freeSpinDisplayOverride !== null;
					let displaySpins = displaySpinsOverrideApplied ? (this.freeSpinDisplayOverride as number) : serverSpinsLeft;
					let symbolsRemaining: number | null = null;
					let isAutoplayActive = false;
					try {
						const symbolsComponent = (this.scene as any)?.symbols;
						if (symbolsComponent) {
							if (typeof symbolsComponent.isFreeSpinAutoplayActive === 'function') {
								isAutoplayActive = symbolsComponent.isFreeSpinAutoplayActive();
							}
							if (typeof symbolsComponent.freeSpinAutoplaySpinsRemaining === 'number') {
								symbolsRemaining = symbolsComponent.freeSpinAutoplaySpinsRemaining;
								if (!displaySpinsOverrideApplied && isAutoplayActive) {
									displaySpins = symbolsRemaining;
								}
							}
							if (typeof symbolsComponent.setFreeSpinAutoplaySpinsRemaining === 'function') {
								if (!isAutoplayActive || symbolsRemaining === null) {
									symbolsComponent.setFreeSpinAutoplaySpinsRemaining(displaySpins);
								} else if (serverSpinsLeft > symbolsRemaining) {
									// Only resync when backend indicates more spins (retrigger).
									symbolsComponent.setFreeSpinAutoplaySpinsRemaining(serverSpinsLeft);
								}
							}
						}
					} catch (e) {
						console.warn('[SlotController] Failed to sync Symbols free spin counter from spin data:', e);
					}
					this.updateFreeSpinNumber(displaySpins);
					console.log(`[SlotController] Updated free spin display to ${displaySpins} remaining (${displaySpinsOverrideApplied ? 'override' : 'from spin data'})`);
					
					// Check if there are any more free spins available
					let remainingAfterSpin = displaySpins;
					if (!displaySpinsOverrideApplied && isAutoplayActive && typeof symbolsRemaining === 'number') {
						if (serverSpinsLeft >= symbolsRemaining && symbolsRemaining > 0) {
							remainingAfterSpin = symbolsRemaining - 1;
						} else {
							remainingAfterSpin = serverSpinsLeft;
						}
					}
					if (remainingAfterSpin <= 0) {
						// No more free spins - mark bonus finished and show total win dialog
						console.log('[SlotController] No more free spins available - marking bonus finished');
						gameStateManager.isBonusFinished = true;
						this.freeSpinDisplayOverride = null;
					}
				} else {
					console.log('[SlotController] Normal mode - calling GameAPI.doSpin...');
					// Use base bet amount for API calls (without amplify bet increase)
					const currentBet = this.getBaseBetAmount() || 10;
					const gameData = this.getGameData();
					const isEnhancedBet = gameData ? gameData.isEnhancedBet : false;
					
					// Check if this is an initialization free spin
					const isInitFreeRound = inInitFreeRoundContext;
					spinData = await this.gameAPI.doSpin(currentBet, false, isEnhancedBet, isInitFreeRound);
					
					// Hide spinner immediately after receiving data
					this.hideSpinner();
					
					console.log('[SlotController] Spin data:', spinData);
					
					// If spinData is null, it means the free spins have ended (422 error handled gracefully)
					if (!spinData) {
						console.log('[SlotController] No spin data received - free spins have ended, creating dummy spin with initial symbols');
						
						// Create a dummy SpinData with initial symbols so reels drop naturally
						spinData = this.createDummySpinDataWithInitialSymbols(currentBet);
						console.log('[SlotController] Created dummy spin data with initial symbols:', spinData);
					}
				}

				// Display comprehensive spin data information
				console.log('[SlotController] 🎰 ===== SPIN DATA RECEIVED =====');
				console.log('[SlotController] 📊 Basic Info:');
				console.log('  - Player ID:', spinData.playerId);
				console.log('  - Bet Amount:', spinData.bet);
				console.log('  - Total Win:', SpinDataUtils.getTotalWin(spinData));
				console.log('  - Has Wins:', SpinDataUtils.hasWins(spinData));
				console.log('  - Has Free Spins:', SpinDataUtils.hasFreeSpins(spinData));
				console.log('  - Win Multiplier:', SpinDataUtils.getWinMultiplier(spinData));
				
            console.log('[SlotController] 🎯 Grid Layout (columns x rows):');
            if (spinData.slot?.area) {
                // area is [column][row]
                for (let col = 0; col < spinData.slot.area.length; col++) {
                    console.log(`  Column ${col}: [${spinData.slot.area[col].join(', ')}]`);
                }
                // Also show a row-wise view for readability
                const cols = spinData.slot.area.length;
                const rows = cols > 0 ? spinData.slot.area[0].length : 0;
                for (let row = 0; row < rows; row++) {
                    const rowValues: number[] = [];
                    for (let col = 0; col < cols; col++) {
                        rowValues.push(spinData.slot.area[col][row]);
                    }
                    console.log(`  Row ${row}: [${rowValues.join(', ')}]`);
                }
            } else {
                console.log('  No area data available');
            }
				
				console.log('[SlotController] 💎 Paylines:');
				if (spinData.slot?.paylines && spinData.slot.paylines.length > 0) {
					spinData.slot.paylines.forEach((payline, index) => {
						console.log(`  Payline ${index}:`, {
							lineKey: payline.lineKey,
							symbol: payline.symbol,
							count: payline.count,
							win: payline.win,
							multipliers: payline.multipliers
						});
					});
				} else {
					console.log('  No paylines data available');
				}
				
				console.log('[SlotController] 🎁 Free Spins Info:');
				if (spinData.slot?.freespin) {
					console.log(`  - Count: ${spinData.slot.freespin.count}`);
					console.log(`  - Total Win: ${spinData.slot.freespin.totalWin}`);
					console.log(`  - Items: ${spinData.slot.freespin.items.length} items`);
				} else {
					console.log('  No free spins data available');
				}
				
				console.log('[SlotController] 🎰 ===== END SPIN DATA =====');
				
				// Emit the spin data response event
				gameEventManager.emit(GameEventType.SPIN_DATA_RESPONSE, {
					spinData: spinData
				});

			} catch (error) {
				console.error('[SlotController] ❌ Spin failed:', error);
				// Don't emit the spin event if the API call failed
			}
		} finally {
			this.isSpinLocked = false;
		}
	}

	/**
	 * Show the buy feature drawer
	 */
	private showBuyFeatureDrawer(): void {
		console.log('[SlotController] Showing buy feature drawer');
		
		if (!this.buyFeature) {
			console.warn('[SlotController] Buy feature component not initialized');
			return;
		}
		
		// Show the buy feature drawer
		this.buyFeature.show({
			featurePrice: 24000.00, // Default feature price
			onClose: () => {
				console.log('[SlotController] Buy feature drawer closed');
			},
			onConfirm: () => {
				console.log('[SlotController] Buy feature confirmed');
				// Immediately disable interactions to prevent other actions
				this.disableSpinButton();
				this.disableAutoplayButton();
				this.disableFeatureButton();
				this.disableBetButtons();
				this.disableAmplifyButton();
				this.disableBetBackgroundInteraction('buy feature confirmed');
				this.handleBuyFeature();
			}
		});
	}

	/**
	 * Handle buy feature purchase
	 */
	private async handleBuyFeature(): Promise<void> {
		console.log('[SlotController] Processing buy feature purchase');
		
		if (!this.buyFeature || !this.gameAPI) {
			console.error('[SlotController] Buy feature or GameAPI not available');
			return;
		}
		
		try {
			let shouldKeepBuyFeatureFlag = false;
			// Get the current bet from BuyFeature
			const buyFeatureBet = this.buyFeature.getCurrentBetAmount();
			const calculatedPrice = buyFeatureBet * 100; // Same multiplier as BuyFeature uses
			
			// Update SlotController bet to match the selected Buy Feature bet
			// This updates both the displayed bet and the internal baseBetAmount
			this.updateBetAmount(buyFeatureBet);
			
			console.log(`[SlotController] Buy feature bet: $${buyFeatureBet.toFixed(2)}, calculated price: $${calculatedPrice.toFixed(2)}`);
			
			// Check if player has enough balance
			const currentBalance = this.getBalanceAmount();
			if (currentBalance < calculatedPrice) {
			console.error(`[SlotController] Insufficient balance: $${currentBalance.toFixed(2)} < $${calculatedPrice.toFixed(2)}`);
			// Re-enable controls since purchase cannot proceed
			this.enableSpinButton();
			this.enableAutoplayButton();
			this.enableFeatureButton();
			this.enableBetButtons();
			this.enableAmplifyButton();
			this.enableBetBackgroundInteraction('buy feature insufficient balance');
			this.showOutOfBalancePopup();
			return;
			}
			
			// Deduct the calculated price from balance (frontend only)
			const newBalance = currentBalance - calculatedPrice;
			if (this.gameAPI?.getDemoState()) {
				this.gameAPI.updateDemoBalance(newBalance);
			}
			this.updateBalanceAmount(newBalance);
			console.log(`[SlotController] Balance deducted: $${currentBalance.toFixed(2)} -> $${newBalance.toFixed(2)}`);
			
			// Trigger pre-spin symbol drop so previous symbols are cleared before
			// the buy feature spin result applies new symbols.
			try {
				const gameScene: any = this.scene as any;
				const symbolsComponent = gameScene?.symbols;
				if (symbolsComponent && typeof symbolsComponent.startPreSpinDrop === 'function') {
					console.log('[SlotController] Triggering pre-spin symbol drop for buy feature spin');
					symbolsComponent.startPreSpinDrop();
				}
			} catch (e) {
				console.warn('[SlotController] Failed to start pre-spin symbol drop for buy feature spin:', e);
			}

			// Call doSpin with buy feature parameters
			console.log('[SlotController] Calling doSpin for buy feature...');
			gameStateManager.isBuyFeatureSpin = true;
			let spinData = await this.gameAPI.doSpin(buyFeatureBet, true, false); // isBuyFs: true, isEnhancedBet: false
			console.log('[BUY_FEATURE_SPIN_DATA]', spinData);
			// Server-driven behavior: do not force scatters on the frontend.
			
			console.log('[SlotController] Buy feature spin completed:', spinData);
			const hasFreeSpinItems = !!(spinData?.slot?.freespin?.items || spinData?.slot?.freeSpin?.items);
			shouldKeepBuyFeatureFlag = hasFreeSpinItems || SpinDataUtils.hasFreeSpins(spinData);
			if (!shouldKeepBuyFeatureFlag) {
				gameStateManager.isBuyFeatureSpin = false;
			}
			
			// If this buy feature spin contains free spin data (scatter), temporarily disable turbo so
			// scatter symbol animations and sequence play at normal speed, then restore after dialogs
			try {
				if (hasFreeSpinItems) {
					const gd = this.getGameData();
					if (gd) {
						const wasTurboGD = !!gd.isTurbo;
						const wasTurboGSM = !!gameStateManager.isTurbo;
						if (wasTurboGD || wasTurboGSM) {
							console.log('[SlotController] Buy feature with scatter during turbo - temporarily disabling turbo for scatter sequence');
							// Disable both UI/gameData and central state turbo flags
							gd.isTurbo = false;
							gameStateManager.isTurbo = false;
							// Restore turbo after dialog animations complete
							if (this.scene) {
								this.scene.events.once('dialogAnimationsComplete', () => {
									try {
										if (wasTurboGD) {
											gd.isTurbo = true;
										}
										if (wasTurboGSM) {
											gameStateManager.isTurbo = true;
										}
										console.log('[SlotController] Restored turbo after scatter sequence dialogs completed');
									} catch (e) {
										console.warn('[SlotController] Failed to restore turbo after dialogs:', e);
									}
								});
							}
						}
					}
				}
			} catch (e) {
				console.warn('[SlotController] Turbo normalization for buy feature scatter failed:', e);
			}
			
			// Process the spin result (same as normal spin)
			if (spinData) {
				// Emit spin data response event to trigger game logic
				gameEventManager.emit(GameEventType.SPIN_DATA_RESPONSE, { spinData });
			}
			
		} catch (error) {
			console.error('[SlotController] Error processing buy feature purchase:', error);
			gameStateManager.isBuyFeatureSpin = false;
			// Re-enable controls on error to avoid locking the UI
			this.enableSpinButton();
			this.enableAutoplayButton();
			this.enableFeatureButton();
			this.enableBetButtons();
			this.enableAmplifyButton();
			this.enableBetBackgroundInteraction('buy feature error');
			// TODO: Show error message to user and restore balance if needed
		}
	}

	private forceBuyFeatureScatterSpin(spinData: SpinData): SpinData {
		try {
			const slot: any = spinData?.slot;
			if (!slot || !Array.isArray(slot.area)) return spinData;

			const area = slot.area as number[][];
			const requiredScatters = 4;
			let scatterCount = 0;
			for (let col = 0; col < area.length; col++) {
				if (!Array.isArray(area[col])) continue;
				for (let row = 0; row < area[col].length; row++) {
					if (area[col][row] === 0) {
						scatterCount++;
					}
				}
			}
			if (scatterCount < requiredScatters) {
				for (let col = 0; col < area.length && scatterCount < requiredScatters; col++) {
					if (!Array.isArray(area[col]) || area[col].length === 0) continue;
					for (let row = 0; row < area[col].length && scatterCount < requiredScatters; row++) {
						if (area[col][row] !== 0) {
							area[col][row] = 0; // scatter symbol id
							scatterCount++;
						}
					}
				}
			}

			const baseFreeSpins = 10;
			const existing = slot.freeSpin || slot.freespin;
			const fsData = existing && typeof existing === 'object' ? existing : {};
			if (!Array.isArray(fsData.items) || fsData.items.length === 0) {
				fsData.items = [{
					spinsLeft: baseFreeSpins,
					subTotalWin: 0,
					area: area,
					payline: []
				}];
			} else if (typeof fsData.items[0]?.spinsLeft !== 'number' || fsData.items[0].spinsLeft <= 0) {
				fsData.items[0].spinsLeft = baseFreeSpins;
			}
			if (fsData.items && fsData.items[0]) {
				fsData.items[0].area = area;
			}
			if (typeof fsData.count !== 'number' || fsData.count <= 0) {
				fsData.count = baseFreeSpins;
			}
			if (typeof fsData.totalWin !== 'number') {
				fsData.totalWin = 0;
			}

			if (slot.freeSpin) {
				slot.freeSpin = fsData;
			}
			if (slot.freespin) {
				slot.freespin = fsData;
			}
			if (!slot.freeSpin && !slot.freespin) {
				slot.freeSpin = fsData;
			}
		} catch (e) {
			console.warn('[SlotController] Failed to force buy feature scatter spin:', e);
		}
		return spinData;
	}

	/**
	 * Update balance from server using getBalance API
	 */
	private async updateBalanceFromServer(): Promise<void> {
		// Check if demo mode is active
		if (this.gameAPI?.getDemoState()) {
			console.log('[SlotController] Demo mode active - skipping balance update from server');
			return;
		}

		try {
			console.log('[SlotController] 💰 Updating balance from server after reels stopped...');
			
			if (!this.gameAPI) {
				console.warn('[SlotController] GameAPI not available for balance update');
				return;
			}
			
			const balanceResponse = await this.gameAPI.getBalance();
			console.log('[SlotController] Balance response received:', balanceResponse);
			
			// Extract balance from response - adjust this based on actual API response structure
			let newBalance = 0;
			if (balanceResponse && balanceResponse.data && balanceResponse.data.balance !== undefined) {
				newBalance = parseFloat(balanceResponse.data.balance);
			} else if (balanceResponse && balanceResponse.balance !== undefined) {
				newBalance = parseFloat(balanceResponse.balance);
			} else {
				console.warn('[SlotController] Unexpected balance response structure:', balanceResponse);
				return;
			}
			
			const oldBalance = this.getBalanceAmount();
			console.log(`[SlotController] 💰 Server balance update: $${oldBalance} -> $${newBalance}`);
			
			// Update the balance display
			this.updateBalanceAmount(newBalance);
			if (newBalance <= 0) {
				this.showOutOfBalancePopup();
			}
			
			console.log('[SlotController] ✅ Balance updated from server successfully');
			
		} catch (error) {
			console.error('[SlotController] ❌ Error updating balance from server:', error);
		}
	}

	/**
	 * Setup bonus mode event listener to hide/show primary controller
	 */
	private setupBonusModeEventListener(): void {
		if (!this.scene) {
			console.warn('[SlotController] Cannot setup bonus mode listener - scene not available');
			return;
		}

		console.log('[SlotController] Setting up bonus mode event listener');
		
		// Listen for bonus mode events from the scene
		this.scene.events.on('setBonusMode', (isBonus: boolean) => {
			if (isBonus) {
				console.log('[SlotController] Bonus mode activated - hiding primary controller');
				this.hidePrimaryController();
				// Always keep the buy feature disabled during bonus mode
				this.canEnableFeatureButton = false;
				this.disableFeatureButton();
			} else {
				console.log('[SlotController] Bonus mode deactivated - showing primary controller');
				this.showPrimaryController();
				// Clear any pending free spins data when bonus mode ends
				if (this.pendingFreeSpinsData) {
					console.log('[SlotController] Bonus mode ended - clearing pending free spins data');
					this.pendingFreeSpinsData = null;
				}
				// Allow feature button to be enabled again (now that bonus is off)
				this.canEnableFeatureButton = true;
				// Re-enable buy feature only after bonus is fully deactivated
				this.enableFeatureButton();
			}
		});

		// Ensure free spin UI is hidden on generic bonus-reset events as well
		this.scene.events.on('resetFreeSpinState', () => {
			console.log('[SlotController] resetFreeSpinState received - hiding free spin display and clearing overrides');
			this.hideFreeSpinDisplay();
			this.freeSpinDisplayOverride = null;
			this.pendingFreeSpinsData = null;
		});

		// Also hide free spin UI when bonus header is hidden (defensive in case setBonusMode is not emitted)
		this.scene.events.on('hideBonusHeader', () => {
			console.log('[SlotController] hideBonusHeader received - hiding free spin display');
			this.hideFreeSpinDisplay();
		});

		// Listen for scatter bonus events with scatter index and actual free spins
		this.scene.events.on('scatterBonusActivated', (data: { scatterIndex: number; actualFreeSpins: number; isRetrigger?: boolean }) => {
			console.log(`[SlotController] scatterBonusActivated event received with data:`, data);
			console.log(`[SlotController] Data validation: scatterIndex=${data.scatterIndex}, actualFreeSpins=${data.actualFreeSpins}`);
			
			// Stop normal autoplay when scatter is hit
			const spinsRemaining = this.getAutoplaySpinsRemaining();
			if (spinsRemaining > 0) {
				console.log(`[SlotController] Scatter hit during autoplay - stopping normal autoplay (${spinsRemaining} spins remaining)`);
				this.stopAutoplay();
			}
			
			// Keep controls disabled/greyed out while scatter/bonus sequence proceeds
			this.disableSpinButton();
			this.disableAutoplayButton();
			this.disableAmplifyButton();
			
			console.log(`[SlotController] Scatter bonus activated with index ${data.scatterIndex} and ${data.actualFreeSpins} free spins - hiding primary controller, free spin display will appear after dialog closes`);
			this.hidePrimaryControllerWithScatter(data.scatterIndex);
			// Store the free spins data for later display after dialog closes
			this.pendingFreeSpinsData = data;
			
			// If this is a retrigger, add +5 to remaining spins in the frontend and override display
			try {
				if (data?.isRetrigger) {
					// Determine current remaining free spins
					// Priority: Symbols tracker (authoritative) > API data > display text
					let currentRemaining = 0;
					
					// First, try Symbols' internal tracker (most accurate)
					try {
						const sym = (this.scene as any)?.symbols;
						if (sym && typeof sym.freeSpinAutoplaySpinsRemaining === 'number') {
							currentRemaining = sym.freeSpinAutoplaySpinsRemaining;
							console.log(`[SlotController] Retrigger: Using Symbols tracker for current remaining: ${currentRemaining}`);
						}
					} catch {}
					
					// Fallback to computing from API data
					if (currentRemaining <= 0) {
						try {
							const apiSpinData = this.gameAPI?.getCurrentSpinData();
							if (apiSpinData) {
								currentRemaining = this.computeDisplaySpinsLeft(apiSpinData);
								console.log(`[SlotController] Retrigger: Using API data for current remaining: ${currentRemaining}`);
							}
						} catch {}
					}
					
					// Last resort: use display text (may be stale, but better than 0)
					if (currentRemaining <= 0) {
						try {
							const txt = (this.freeSpinNumber?.text || '').toString().trim();
							const val = parseInt(txt, 10);
							if (!isNaN(val) && val >= 0) {
								currentRemaining = val;
								console.log(`[SlotController] Retrigger: Using display text for current remaining: ${currentRemaining}`);
							}
						} catch {}
					}
					
					// Ensure we don't use a value > 1 if we're on the last spin
					// If currentRemaining is 1, it means we just finished the last spin, so base should be 0
					if (currentRemaining === 1) {
						console.log('[SlotController] Retrigger: Last spin detected (currentRemaining=1), using 0 as base for retrigger calculation');
						currentRemaining = 0;
					}
					
					const newRemaining = Math.max(0, currentRemaining + 5);
					this.freeSpinDisplayOverride = newRemaining;
					
					// Sync Symbols' tracker
					try {
						const symbolsComponent = (this.scene as any)?.symbols;
						if (symbolsComponent && typeof symbolsComponent.setFreeSpinAutoplaySpinsRemaining === 'function') {
							symbolsComponent.setFreeSpinAutoplaySpinsRemaining(newRemaining);
						}
					} catch {}
					
					// Update UI immediately
					this.updateFreeSpinNumber(newRemaining);
					console.log(`[SlotController] Retrigger detected - increased remaining free spins by +5: ${currentRemaining} -> ${newRemaining}`);
				}
			} catch (e) {
				console.warn('[SlotController] Failed to apply +5 override on retrigger:', e);
			}
		});

		// Listen for dialog animations completion to show free spin display
		this.scene.events.on('dialogAnimationsComplete', () => {
			console.log('[SlotController] Dialog animations completed - checking if free spin display should be shown');
			console.log('[SlotController] Current pendingFreeSpinsData:', this.pendingFreeSpinsData);
			
			// If free spin autoplay is active, do NOT reinitialize the counter from API; keep Symbols' tracked value
			let skipInitialization = false;
			try {
				const symbolsComponent = (this.scene as any)?.symbols;
				if (symbolsComponent && typeof symbolsComponent.isFreeSpinAutoplayActive === 'function') {
					if (symbolsComponent.isFreeSpinAutoplayActive()) {
						skipInitialization = true;
						console.log('[SlotController] Free spin autoplay active - skipping free spin display reinitialization from API');
					}
				}
			} catch {}

			if (!skipInitialization) {
				// Prefer to initialize from the first freeSpin item's spinsLeft (supports freespin and freeSpin)
				let initializedFromFreeSpinData = false;
				try {
					// If we have an override (e.g., from retrigger), prefer to show that and skip server initialization
					if (this.freeSpinDisplayOverride !== null) {
						try {
							this.showFreeSpinDisplayWithActualValue(this.freeSpinDisplayOverride as number);
							console.log(`[SlotController] Showing free spin display from override: ${this.freeSpinDisplayOverride}`);
							initializedFromFreeSpinData = true;
						} catch {}
					}
					
					if (!initializedFromFreeSpinData) {
						const apiSpinData = this.gameAPI?.getCurrentSpinData();
						const fs = apiSpinData?.slot?.freespin || (apiSpinData as any)?.slot?.freeSpin;
						if (fs?.items && fs.items.length > 0) {
							const firstItem = fs.items[0];
							const initialSpinsLeft = typeof firstItem?.spinsLeft === 'number' ? firstItem.spinsLeft : 0;
							if (initialSpinsLeft > 0) {
								console.log(`[SlotController] Initializing free spin display from first freeSpin item: spinsLeft=${initialSpinsLeft}`);
								this.showFreeSpinDisplayWithActualValue(initialSpinsLeft);
								initializedFromFreeSpinData = true;
							}
						}
					}
				} catch (e) {
					console.warn('[SlotController] Failed to initialize from freeSpin data:', e);
				}
				
				// Fallback to any pending data if we couldn't initialize from freeSpin items
				if (!initializedFromFreeSpinData) {
					if (this.pendingFreeSpinsData) {
						console.log(`[SlotController] Fallback: showing free spin display with ${this.pendingFreeSpinsData.actualFreeSpins} spins after dialog closed`);
						this.showFreeSpinDisplayWithActualValue(this.pendingFreeSpinsData.actualFreeSpins);
						this.pendingFreeSpinsData = null;
					} else {
						console.log('[SlotController] No free spin data available to initialize display');
					}
				}
			}

			// If an autoplay spin was already triggered before the display appeared, apply the -1 now (deferred UI decrement)
			try {
				if (gameStateManager.isBonus && this.freeSpinNumber) {
					if (this.shouldSubtractOneFromServerFsDisplay && !this.uiFsDecrementApplied) {
						const currentText = (this.freeSpinNumber.text || '').toString().trim();
						const currentVal = parseInt(currentText, 10);
						if (!isNaN(currentVal) && currentVal > 0) {
							const decremented = Math.max(0, currentVal - 1);
							this.freeSpinNumber.setText(decremented.toString());
							this.uiFsDecrementApplied = true;
							console.log(`[SlotController] Applied deferred -1 on display after dialog: ${currentVal} -> ${decremented}`);
						}
					}
				}
			} catch (e) {
				console.warn('[SlotController] Failed to apply deferred -1 after dialog:', e);
			}
		});

		// Listen for free spin autoplay events
		gameEventManager.on(GameEventType.FREE_SPIN_AUTOPLAY, async () => {
			console.log('[SlotController] FREE_SPIN_AUTOPLAY event received - triggering free spin simulation');
			
			// Drop/clear previous symbols at the start of each free spin in bonus mode,
			// same as we do for normal spins and buy feature spins.
			try {
				const gameScene: any = this.scene as any;
				const symbolsComponent = gameScene?.symbols;
				if (symbolsComponent && typeof symbolsComponent.startPreSpinDrop === 'function') {
					console.log('[SlotController] Triggering pre-spin symbol drop for FREE_SPIN_AUTOPLAY');
					symbolsComponent.startPreSpinDrop();
				}
			} catch (e) {
				console.warn('[SlotController] Failed to start pre-spin symbol drop for FREE_SPIN_AUTOPLAY:', e);
			}
			
			// Apply turbo mode to game data and winlines (same as normal autoplay)
			this.forceApplyTurboToSceneGameData();
			this.applyTurboToWinlineAnimations();

			// Do not optimistically decrement UI; wait for actual REELS_START to sync
			this.shouldSubtractOneFromServerFsDisplay = false;
			this.uiFsDecrementApplied = false;
			
			if (gameStateManager.isBonus && this.gameAPI && this.symbols) {
				try {
					// Get free spin data from GameAPI directly (this should have the original scatter data)
					const gameAPISpinData = this.gameAPI.getCurrentSpinData();
					if (gameAPISpinData && (gameAPISpinData.slot?.freespin?.items || gameAPISpinData.slot?.freeSpin?.items)) {
						console.log('[SlotController] Found free spin data in GameAPI');
						const freespinData = gameAPISpinData.slot?.freespin || gameAPISpinData.slot?.freeSpin;
						console.log('[SlotController] GameAPI currentSpinData has freespin:', !!gameAPISpinData.slot?.freespin);
						console.log('[SlotController] GameAPI currentSpinData has freeSpin:', !!gameAPISpinData.slot?.freeSpin);
						console.log('[SlotController] GameAPI currentSpinData has items:', !!freespinData?.items);
						console.log('[SlotController] GameAPI currentSpinData items count:', freespinData?.items?.length);
					} else {
						console.error('[SlotController] No free spin data available in GameAPI');
						console.error('[SlotController] GameAPI currentSpinData:', gameAPISpinData);
						console.error('[SlotController] GameAPI currentSpinData.slot:', gameAPISpinData?.slot);
						console.error('[SlotController] GameAPI currentSpinData.slot.freespin:', gameAPISpinData?.slot?.freespin);
						console.error('[SlotController] GameAPI currentSpinData.slot.freeSpin:', gameAPISpinData?.slot?.freeSpin);
						console.error('[SlotController] GameAPI currentSpinData.slot.freespin.items:', gameAPISpinData?.slot?.freespin?.items);
						console.error('[SlotController] GameAPI currentSpinData.slot.freeSpin.items:', gameAPISpinData?.slot?.freeSpin?.items);
						return;
					}
					
					// Use our free spin simulation
					const spinData = await this.gameAPI.simulateFreeSpin();
					// DEBUG: Log the full spinData for troubleshooting
					console.log('[SPINDATA_DEBUG] Free spinData received:', JSON.stringify(spinData));
					
					// Compute raw server spinsLeft and sync internal Symbols counter (handles retriggers)
					const serverSpinsLeft = this.computeDisplaySpinsLeft(spinData);
					let displaySpins = serverSpinsLeft;
					let symbolsRemaining: number | null = null;
					let isAutoplayActive = false;
					try {
						const symbolsComponent = (this.scene as any)?.symbols;
						if (symbolsComponent) {
							if (typeof symbolsComponent.isFreeSpinAutoplayActive === 'function') {
								isAutoplayActive = symbolsComponent.isFreeSpinAutoplayActive();
							}
							if (typeof symbolsComponent.freeSpinAutoplaySpinsRemaining === 'number') {
								symbolsRemaining = symbolsComponent.freeSpinAutoplaySpinsRemaining;
								displaySpins = symbolsRemaining;
							} else if (this.freeSpinDisplayOverride !== null) {
								displaySpins = this.freeSpinDisplayOverride as number;
							}
							if (typeof symbolsComponent.setFreeSpinAutoplaySpinsRemaining === 'function') {
								if (!isAutoplayActive || symbolsRemaining === null) {
									symbolsComponent.setFreeSpinAutoplaySpinsRemaining(serverSpinsLeft);
								} else if (serverSpinsLeft > symbolsRemaining) {
									// Only resync when backend indicates more spins (retrigger).
									symbolsComponent.setFreeSpinAutoplaySpinsRemaining(serverSpinsLeft);
								}
							}
						}
					} catch (e) {
						console.warn('[SlotController] Failed to sync Symbols free spin counter during autoplay:', e);
					}
					this.updateFreeSpinNumber(displaySpins);
					console.log(`[SlotController] Updated free spin display to ${displaySpins} remaining (from spin data)`);
					
					// Check if there are any more free spins available
					let remainingAfterSpin = displaySpins;
					if (isAutoplayActive && typeof symbolsRemaining === 'number') {
						if (serverSpinsLeft >= symbolsRemaining && symbolsRemaining > 0) {
							remainingAfterSpin = symbolsRemaining - 1;
						} else {
							remainingAfterSpin = serverSpinsLeft;
						}
					}
					if (remainingAfterSpin <= 0) {
						// No more free spins - mark bonus finished and show total win dialog
						console.log('[SlotController] No more free spins available - marking bonus finished');
						gameStateManager.isBonusFinished = true;
						this.shouldSubtractOneFromServerFsDisplay = false;
						this.uiFsDecrementApplied = false;
					}

					// Process the spin data directly for free spin autoplay
					if (this.scene && (this.scene as any).symbols) {
						const symbolsComponent = (this.scene as any).symbols;
						if (symbolsComponent && typeof symbolsComponent.processSpinData === 'function') {
							console.log('[SlotController] Processing free spin data directly via symbols component');
							symbolsComponent.processSpinData(spinData);
						} else {
							console.log('[SlotController] Symbols component not available, falling back to SPIN_DATA_RESPONSE');
							gameEventManager.emit(GameEventType.SPIN_DATA_RESPONSE, {
								spinData: spinData
							});
						}
					} else {
						console.log('[SlotController] Scene or symbols not available, falling back to SPIN_DATA_RESPONSE');
						gameEventManager.emit(GameEventType.SPIN_DATA_RESPONSE, {
							spinData: spinData
						});
					}

				} catch (error) {
					console.error('[SlotController] Free spin simulation failed:', error);
				}
			} else {
				console.warn('[SlotController] Not in bonus mode or GameAPI not available for free spin autoplay');
			}
		});

		// Listen for scatter bonus activation to reset free spin index (but NOT on retriggers)
		this.scene.events.on('scatterBonusActivated', (data: { scatterIndex: number; actualFreeSpins: number; isRetrigger?: boolean }) => {
			const isRetrigger = !!(data && (data as any).isRetrigger);
			if (isRetrigger) {
				console.log('[SlotController] Scatter bonus retrigger detected - NOT resetting free spin index');
				return;
			}
			console.log('[SlotController] Scatter bonus initial activation - resetting free spin index');
			if (this.gameAPI) {
				this.gameAPI.resetFreeSpinIndex();
			}
		});

		console.log('[SlotController] Bonus mode event listener setup complete');
	}

	/**
	 * Setup spin state change listener
	 */
	private setupSpinStateListener(): void {
		if (!this.gameData) {
			console.warn('[SlotController] GameData not available for spin state listener');
			return;
		}

		// No more polling - we'll manage button state purely through events
		console.log('[SlotController] Spin state listener setup complete - no polling');
	}

	/**
	 * Refresh the GameData reference from the scene
	 */
	private refreshGameDataReference(): void {
		if (this.scene && this.scene.scene.key === 'Game') {
			const newGameData = (this.scene as any).gameData;
			if (newGameData && newGameData !== this.gameData) {
				console.log('[SlotController] Refreshing GameData reference');
				this.gameData = newGameData;
			}
		}
	}

	/**
	 * Get the current GameData instance, refreshing if needed
	 */
	private getGameData(): GameData | null {
		if (!this.gameData) {
			this.refreshGameDataReference();
		}
		return this.gameData;
	}

	/**
	 * Disable the spin button
	 */
	public disableSpinButton(): void {
		if (this.spinButtonController) {
			this.spinButtonController.disable();
		}
		// Always disable the actual spin button image as well
		const spinButton = this.buttons.get('spin');
		if (spinButton) {
			spinButton.setTint(0x666666); // Gray out the button (match thats_bait)
			spinButton.disableInteractive();
		}
		// Also handle SlotController's own spinIcon
		if (this.spinIcon) {
			this.spinIcon.setAlpha(0.5); // Dim the icon (match thats_bait)
		}
		if (this.spinIconTween) {
			this.spinIconTween.pause(); // Pause icon animation
		}
	}

	/**
	 * Enable the spin button
	 */
	public enableSpinButton(): void {
		if (this.isSpinLocked || gameStateManager.isReelSpinning) {
			console.log('[SlotController] enableSpinButton skipped - spin locked or reels still spinning');
			this.disableSpinButton();
			return;
		}
		if (this.spinButtonController) {
			this.spinButtonController.enable();
			console.log('[SlotController] Spin button enabled');
		}
		const spinButton = this.buttons.get('spin');
		if (spinButton) {
			spinButton.clearTint();
			spinButton.setAlpha(1.0); // Restore full alpha
			spinButton.setInteractive();
			console.log('[SlotController] Spin button enabled');
		}
		// Also handle SlotController's own spinIcon
		if (this.spinIcon) {
			this.spinIcon.setAlpha(1.0); // Restore full alpha
		}
		if (this.spinIconTween) {
			this.spinIconTween.resume(); // Resume icon animation
		}
	}

	/**
	 * Public method to manually update spin button state
	 */
	public updateSpinButtonState(): void {
		const gameData = this.getGameData();
		if (!gameData || !this.buttons.has('spin')) {
			return;
		}

		const spinButton = this.buttons.get('spin');
		if (!spinButton) return;

		if (this.isSpinLocked) {
			this.disableSpinButton();
			return;
		}

		if(gameData.isAutoPlaying){
			this.disableSpinButton();
			return;
		}


		// Simple logic: disable if spinning or autoplay active, enable otherwise
		if (gameData.isAutoPlaying || gameStateManager.isReelSpinning) {
			console.log(`[SlotController] Disabling spin button - isReelSpinning: ${gameStateManager.isReelSpinning}, isAutoPlaying: ${gameData.isAutoPlaying}`);
			this.disableSpinButton();
		} else {
			console.log(`[SlotController] Enabling spin button - no active game state`);
			this.enableSpinButton();
		}
	}

	/**
	 * Get the current state of the spin button
	 */
	public isSpinButtonEnabled(): boolean {
		const spinButton = this.buttons.get('spin');
		return spinButton ? spinButton.input?.enabled || false : false;
	}

	/**
	 * Force refresh the spin button state
	 */
	public refreshSpinButtonState(): void {
		this.updateSpinButtonState();
	}

	/**
	 * Re-enable the spin button (force enable regardless of state)
	 */
	public reEnableSpinButton(): void {
		console.log('[SlotController] Force re-enabling spin button');
		
		// Log current state for debugging
		const gameData = this.getGameData();
		if (gameData) {
			console.log(`[SlotController] Current state when re-enabling: isReelSpinning=${gameStateManager.isReelSpinning}, isAutoPlaying=${gameData.isAutoPlaying}`);
		}
		
		// Simply enable the button
		this.enableSpinButton();
		console.log('[SlotController] Spin button re-enabled');
	}

	/**
	 * Manually trigger spin button state update (useful for external components)
	 */
	public forceUpdateSpinButtonState(): void {
		console.log('[SlotController] Force updating spin button state');
		this.updateSpinButtonState();
	}

	/**
	 * Get current state information for debugging
	 */
	public getSpinButtonStateInfo(): string {
		const gameData = this.getGameData();
		if (!gameData) {
			return 'GameData not available';
		}
		
		const isEnabled = this.isSpinButtonEnabled();
		return `Spin Button: ${isEnabled ? 'ENABLED' : 'DISABLED'} | isReelSpinning: ${gameStateManager.isReelSpinning} | isAutoPlaying: ${gameData.isAutoPlaying}`;
	}

	/**
	 * Get current GameData animation timing values for debugging
	 */
	public getGameDataAnimationInfo(): string {
		const gameData = this.getGameData();
		if (!gameData) {
			return 'GameData not available';
		}
		
		return `GameData Animation Values: winUpDuration=${gameData.winUpDuration}, dropDuration=${gameData.dropDuration}, dropReelsDelay=${gameData.dropReelsDelay}, dropReelsDuration=${gameData.dropReelsDuration}, isTurbo=${gameData.isTurbo}`;
	}

	/**
	 * Force apply turbo speed to scene GameData (used by Symbols component)
	 */
	public forceApplyTurboToSceneGameData(): void {
		if (!this.scene || !(this.scene as any).gameData) {
			console.warn('[SlotController] Scene or scene GameData not available');
			return;
		}
		const sceneGameData = (this.scene as any).gameData;
		const gameData = this.getGameData();
		
		if (gameData) {
			if (gameData.isTurbo) {
				console.log('[SlotController] Force applying turbo to scene GameData');
				
				// Sync scene GameData from UI GameData, then apply turbo multipliers once
				sceneGameData.winUpDuration = gameData.winUpDuration * TurboConfig.TURBO_DURATION_MULTIPLIER;
				sceneGameData.dropDuration = gameData.dropDuration * TurboConfig.TURBO_DURATION_MULTIPLIER;
				sceneGameData.dropReelsDelay = gameData.dropReelsDelay * TurboConfig.TURBO_DELAY_MULTIPLIER;
				sceneGameData.dropReelsDuration = gameData.dropReelsDuration * TurboConfig.TURBO_DURATION_MULTIPLIER;
				(sceneGameData as any).compressionDelayMultiplier = TurboConfig.TURBO_DELAY_MULTIPLIER;
				
				console.log(`[SlotController] Scene GameData turbo applied:`);
				console.log(`  winUpDuration: ${sceneGameData.winUpDuration}`);
				console.log(`  dropDuration: ${sceneGameData.dropDuration}`);
				console.log(`  dropReelsDelay: ${sceneGameData.dropReelsDelay}`);
				console.log(`  dropReelsDuration: ${sceneGameData.dropReelsDuration}`);
			} else {
				console.log('[SlotController] Resetting scene GameData to normal speed');
				
				// Reset to normal speed by calling setSpeed with the original delay
				const originalDelay = 2500; // This should match Data.DELAY_BETWEEN_SPINS
				setSpeed(sceneGameData, originalDelay);
				(sceneGameData as any).compressionDelayMultiplier = 1;
				
				console.log(`[SlotController] Scene GameData reset to normal speed:`);
				console.log(`  winUpDuration: ${sceneGameData.winUpDuration}`);
				console.log(`  dropDuration: ${sceneGameData.dropDuration}`);
				console.log(`  dropReelsDelay: ${sceneGameData.dropReelsDelay}`);
				console.log(`  dropReelsDuration: ${sceneGameData.dropReelsDuration}`);
			}
		}
	}

	/**
	 * Apply turbo mode to winline animations via Symbols component
	 */
	public applyTurboToWinlineAnimations(): void {
		if (!this.scene) {
			console.warn('[SlotController] Scene not available for winline turbo');
			return;
		}

		// Try to access the Symbols component from the scene
		const symbolsComponent = (this.scene as any).symbols;
		if (symbolsComponent && typeof symbolsComponent.setTurboMode === 'function') {
			const gameData = this.getGameData();
			if (gameData) {
				symbolsComponent.setTurboMode(gameData.isTurbo);
				console.log(`[SlotController] Turbo mode ${gameData.isTurbo ? 'enabled' : 'disabled'} for winline animations via Symbols component`);
			}
		} else {
			console.warn('[SlotController] Symbols component or setTurboMode method not available');
		}
	}

	/**
	 * Reset winline animations to default timing via Symbols component
	 */
	public resetWinlineTiming(): void {
		if (!this.scene) {
			console.warn('[SlotController] Scene not available for winline timing reset');
			return;
		}

		// Try to access the Symbols component from the scene
		const symbolsComponent = (this.scene as any).symbols;
		if (symbolsComponent && typeof symbolsComponent.resetWinlineTiming === 'function') {
			symbolsComponent.resetWinlineTiming();
			console.log('[SlotController] Winline timing reset to default values via Symbols component');
		} else {
			console.warn('[SlotController] Symbols component or resetWinlineTiming method not available');
		}
	}

	/**
	 * Clear any pending balance updates
	 */
	public clearPendingBalanceUpdate(): void {
		if (this.pendingBalanceUpdate) {
			console.log('[SlotController] Clearing pending balance update:', this.pendingBalanceUpdate);
			this.pendingBalanceUpdate = null;
		}
	}

	/**
	 * Get current pending balance update for debugging
	 */
	public getPendingBalanceUpdate(): { balance: number; bet: number; winnings?: number } | null {
		return this.pendingBalanceUpdate;
	}

	/**
	 * Check if there are pending balance updates
	 */
	public hasPendingBalanceUpdate(): boolean {
		return this.pendingBalanceUpdate !== null;
	}

	/**
	 * Check if there are pending winnings to be added
	 */
	public hasPendingWinnings(): boolean {
		return this.pendingBalanceUpdate?.winnings !== undefined && this.pendingBalanceUpdate.winnings > 0;
	}

	/**
	 * Get the amount of pending winnings
	 */
	public getPendingWinnings(): number {
		return this.pendingBalanceUpdate?.winnings || 0;
	}

	/**
	 * Force apply pending balance update (useful for debugging or special cases)
	 */
	public forceApplyPendingBalanceUpdate(): void {
		if (this.pendingBalanceUpdate) {
			console.log('[SlotController] Force applying pending balance update:', this.pendingBalanceUpdate);
			
			// Update balance display
			if (this.pendingBalanceUpdate.balance !== undefined) {
				const oldBalance = this.getBalanceAmountText();
				this.updateBalanceAmount(this.pendingBalanceUpdate.balance);
				
				if (this.pendingBalanceUpdate.winnings && this.pendingBalanceUpdate.winnings > 0) {
					console.log(`[SlotController] Balance force updated: ${oldBalance} -> ${this.pendingBalanceUpdate.balance} (added winnings: ${this.pendingBalanceUpdate.winnings})`);
				} else {
					console.log(`[SlotController] Balance force updated: ${oldBalance} -> ${this.pendingBalanceUpdate.balance}`);
				}
			}
			
			// Update bet display
			if (this.pendingBalanceUpdate.bet !== undefined) {
				this.updateBetAmount(this.pendingBalanceUpdate.bet);
				console.log('[SlotController] Bet force updated:', this.pendingBalanceUpdate.bet);
			}
			
			// Clear the pending update
			this.pendingBalanceUpdate = null;
		} else {
			console.log('[SlotController] No pending balance update to force apply');
		}
	}

	/**
	 * Log current state for debugging
	 */
	public logCurrentState(): void {
		const gameData = this.getGameData();
		if (!gameData) {
			console.log('[SlotController] GameData not available');
			return;
		}
		
		console.log(`[SlotController] Current State:`, {
			spinButtonEnabled: this.isSpinButtonEnabled(),
			isSpinning: gameData.isReelSpinning,
			isAutoPlaying: gameData.isAutoPlaying,
			hasSpinButton: this.buttons.has('spin'),
			pendingBalanceUpdate: this.pendingBalanceUpdate
		});
	}

	/**
	 * Start the turbo button animation (looping)
	 */
	private startTurboAnimation(): void {
		// Ensure the animation exists
		this.ensureTurboAnimationExists();
		
		if (!this.turboButtonAnimation) {
			console.warn('[SlotController] Turbo button animation not available');
			return;
		}

		try {
			// Show the animation
			this.turboButtonAnimation.setVisible(true);
			
			// Start looping animation following the same pattern as kobi-ass
			// Use animationState.setAnimation with loop = true for continuous looping
			this.turboButtonAnimation.animationState.setAnimation(0, "animation", true);
			
			console.log('[SlotController] Turbo button spine animation started (looping)');
		} catch (error) {
			console.error('[SlotController] Error starting turbo button animation:', error);
		}
	}

	/**
	 * Stop the turbo button animation
	 */
	private stopTurboAnimation(): void {
		if (!this.turboButtonAnimation) {
			console.warn('[SlotController] Turbo button animation not available');
			return;
		}

		try {
			// Hide the animation
			this.turboButtonAnimation.setVisible(false);
			
			// Stop the animation
			this.turboButtonAnimation.animationState.clearTracks();
			
			console.log('[SlotController] Turbo button spine animation stopped');
		} catch (error) {
			console.error('[SlotController] Error stopping turbo button animation:', error);
		}
	}

	/**
	 * Ensure the turbo animation exists and recreate if needed
	 */
	private ensureTurboAnimationExists(): void {
		if (!this.turboButtonAnimation && this.scene) {
			console.log('[SlotController] Turbo animation not found, recreating...');
			const screenConfig = this.screenModeManager.getScreenConfig();
			const assetScale = this.networkManager.getAssetScale();
			this.createTurboButtonAnimation(this.scene, assetScale);
		}
	}

	/**
	 * Create a dummy SpinData with initial symbols (same as game start)
	 * Used when 422 error occurs to allow reels to drop naturally
	 */
	private createDummySpinDataWithInitialSymbols(bet: number): any {
		console.log('[SlotController] Creating dummy spin data with initial symbols');
		
		// Initial symbols from Symbols.ts createInitialSymbols() - row-major format
		const initialRowMajor = [
			[0, 1, 3, 1, 0, 2],
			[1, 5, 2, 5, 2, 4],
			[2, 5, 5, 1, 5, 3],
			[3, 4, 1, 2, 4, 1],
			[4, 2, 0, 3, 1, 5],
		];
		
		// Convert to column-major format [col][row] for SpinData
		const rowCount = initialRowMajor.length;      // 5
		const colCount = initialRowMajor[0].length;   // 6
		const columnMajor: number[][] = [];
		
		for (let col = 0; col < colCount; col++) {
			const column: number[] = [];
			for (let row = 0; row < rowCount; row++) {
				column.push(initialRowMajor[row][col]);
			}
			columnMajor.push(column);
		}
		
		// Create dummy SpinData with no wins
		const dummySpinData = {
			playerId: 'dummy',
			bet: bet.toString(),
			slot: {
				area: columnMajor,
				paylines: [],
				tumbles: [],
				freespin: {
					count: 0,
					totalWin: 0,
					items: []
				}
			}
		};
		
		console.log('[SlotController] Dummy spin data created with area:', columnMajor);
		return dummySpinData;
	}
}



