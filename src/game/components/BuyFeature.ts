import { Scene } from 'phaser';
import { SlotController } from './controller/SlotController';
import { CurrencyManager } from './CurrencyManager';
import { ensureSpineFactory } from '../../utils/SpineGuard';

export interface BuyFeatureConfig {
	position?: { x: number; y: number };
	scale?: number;
	onClose?: () => void;
	onConfirm?: () => void;
	featurePrice?: number;
}

export class BuyFeature {
	private container!: Phaser.GameObjects.Container;
	private background!: Phaser.GameObjects.Graphics;
	private confirmButtonMask!: Phaser.GameObjects.Graphics;
	private featurePrice: number = 24000.00;
	private currentBet: number = 0.2; // Start with first bet option
	private slotController: SlotController | null = null;
	private readonly BET_MULTIPLIER: number = 100; // Multiplier for price display
	private betOptions: number[] = [
		0.2, 0.4, 0.6, 0.8, 1,
		1.2, 1.6, 2, 2.4, 2.8,
		3.2, 3.6, 4, 5, 6,
		8, 10, 14, 18, 24,
		32, 40, 60, 80, 100,
		110, 120, 130, 140, 150
	];
	private currentBetIndex: number = 0; // Index in betOptions array
	private closeButton!: Phaser.GameObjects.Text;
	private confirmButton!: Phaser.GameObjects.Text;
	private betDisplay!: Phaser.GameObjects.Text;
	private minusButton!: Phaser.GameObjects.Text;
	private plusButton!: Phaser.GameObjects.Text;
	
	private priceDisplay!: Phaser.GameObjects.Text;
	private featureLogo!: Phaser.GameObjects.Image;
	private backgroundImage!: Phaser.GameObjects.Image;
	private onCloseCallback?: () => void;
	private onConfirmCallback?: () => void;
	private scatterSpine?: any;
	private scatterFallbackSprite?: Phaser.GameObjects.Image;
	private scatterRetryCount: number = 0;
	private scatterShouldLoopWin: boolean = false;
	private readonly SCATTER_MAX_RETRIES: number = 5;

	// ============================================
	// ADJUST HERE: Buy Feature Logo size and position
	// ============================================
	// Logo scale: 1.0 = original size, 0.9 = 90%, 1.1 = 110%
	private readonly LOGO_SCALE: number = 0.9;
	// Logo Y offset from background top: positive = move down, negative = move up
	private readonly LOGO_Y_OFFSET: number = 210;

	constructor() {
		// Constructor for BuyFeature component
	}

	/**
	 * Set the SlotController reference for accessing current bet
	 */
	public setSlotController(slotController: SlotController): void {
		this.slotController = slotController;
		console.log('[BuyFeature] SlotController reference set');
	}

	/**
	 * Get the current bet value multiplied by the multiplier (for price display)
	 */
	private getCurrentBetValue(): number {
		return this.currentBet * this.BET_MULTIPLIER;
	}

	/**
	 * Get the current bet value (for bet display)
	 */
	private getCurrentBet(): number {
		return this.currentBet;
	}

	/**
	 * Get the current bet value (public method for external access)
	 */
	public getCurrentBetAmount(): number {
		return this.currentBet;
	}

	/**
	 * Initialize bet index based on current bet from SlotController
	 */
	private initializeBetIndex(): void {
		if (this.slotController) {
			const currentBaseBet = this.slotController.getBaseBetAmount();
			
			// Find the closest bet option
			let closestIndex = 0;
			let closestDifference = Math.abs(this.betOptions[0] - currentBaseBet);
			
			for (let i = 1; i < this.betOptions.length; i++) {
				const difference = Math.abs(this.betOptions[i] - currentBaseBet);
				if (difference < closestDifference) {
					closestDifference = difference;
					closestIndex = i;
				}
			}
			
			this.currentBetIndex = closestIndex;
			this.currentBet = this.betOptions[closestIndex];
			console.log(`[BuyFeature] Initialized bet index ${closestIndex} with bet $${this.currentBet.toFixed(2)}`);
		}
	}

	create(scene: Scene): void {
		console.log("[BuyFeature] Creating buy feature component");
		
		// Create main container
		this.container = scene.add.container(0, 0);
		this.container.setDepth(2000); // Very high depth to appear above everything
		
		// Create background
		this.createBackground(scene);
		
		// Create feature logo (added after background to appear on top)
		this.createFeatureLogo(scene);
		// Create scatter symbol animation on top of the logo
		this.createScatterSymbolAnimation(scene);
		
		// Create title
		this.createTitle(scene);
		
		// Create feature name
		this.createFeatureName(scene);
		
		// Create price display
		this.createPriceDisplay(scene);
		
		// Create bet input
		this.createBetInput(scene);
		
		// Create buy button
		this.createBuyButton(scene);
		
		// Create close button
		this.createCloseButton(scene);
		
		// Initially hide the component immediately (no animation/flicker)
		if (this.container) {
			this.container.setVisible(false);
			this.container.setY(scene.scale.height);
		}
	}

	private createBackground(scene: Scene): void {
		const screenWidth = scene.cameras.main.width;
		const screenHeight = scene.cameras.main.height;
		
		// Create semi-transparent overlay with rounded top corners
		this.background = scene.add.graphics();
		this.background.fillStyle(0x000000, 0.80);
		this.background.fillRoundedRect(0, screenHeight - 736, screenWidth, 736, 20);
		
		// Make the background interactive to block clicks behind it
		this.background.setInteractive(new Phaser.Geom.Rectangle(0, screenHeight - 736, screenWidth, 736), Phaser.Geom.Rectangle.Contains);
		
		this.container.add(this.background);
		
		// Create background image to fill the background area
		const backgroundTop = screenHeight - 736;
		this.backgroundImage = scene.add.image(screenWidth / 2, backgroundTop + 368, 'buy_feature_bg');
		
		// Scale the image to fill the background area (736px height)
		const scaleY = 736 / this.backgroundImage.height;
		const scaleX = screenWidth / this.backgroundImage.width;
		const scale = Math.max(scaleX, scaleY); // Use the larger scale to ensure full coverage
		this.backgroundImage.setScale(scale);
		
		this.container.add(this.backgroundImage);
	}

	private createFeatureLogo(scene: Scene): void {
		const screenWidth = scene.cameras.main.width;
		const screenHeight = scene.cameras.main.height;
		const backgroundTop = screenHeight - 736;
		
		// Use adjustable parameters for scale and position (see LOGO_SCALE and LOGO_Y_OFFSET at top of class)
		this.featureLogo = scene.add.image(screenWidth / 2, backgroundTop + this.LOGO_Y_OFFSET, 'buy_feature_logo');
		this.featureLogo.setScale(this.LOGO_SCALE);
		this.container.add(this.featureLogo);
	}

	/**
	 * Create the animated scatter symbol on top of the buy feature logo.
	 * Uses the sugar scatter Spine (`symbol_0_sugar_spine`) with its Win loop if available,
	 * and falls back to the PNG sprite with a pulsing tween if Spine is not ready.
	 */
	private createScatterSymbolAnimation(scene: Scene): void {
		// Ensure we have a logo to anchor to
		if (!this.featureLogo) {
			return;
		}

		const createWithSpine = () => {
			try {
				// Ensure Spine data is available in cache; retry a few times if needed
				const cacheJson: any = scene.cache.json;
				if (!cacheJson.has('symbol_0_sugar_spine')) {
					if (this.scatterRetryCount < this.SCATTER_MAX_RETRIES) {
						this.scatterRetryCount++;
						console.warn(
							`[BuyFeature] Spine json 'symbol_0_sugar_spine' not ready. Retrying (${this.scatterRetryCount}/${this.SCATTER_MAX_RETRIES})...`
						);
						scene.time.delayedCall(200, () => this.createScatterSymbolAnimation(scene));
						return;
					}
					console.error('[BuyFeature] Spine assets for scatter still not ready after retries. Falling back to PNG.');
					this.createScatterFallbackSprite(scene);
					return;
				}

				const x = this.featureLogo.x;
				// Slightly above the logo center so it appears "on top" visually
				const y = this.featureLogo.y - this.featureLogo.displayHeight * 0;

				this.scatterSpine = (scene.add as any).spine(
					x,
					y,
					'symbol_0_sugar_spine',
					'symbol_0_sugar_spine-atlas'
				);

				if (!this.scatterSpine) {
					console.warn('[BuyFeature] Failed to create scatter Spine object, using PNG fallback.');
					this.createScatterFallbackSprite(scene);
					return;
				}

				this.scatterSpine.setOrigin(0.5, 0.5);

				// Scale relative to the logo width so it looks good on different resolutions
				try {
					const targetWidth = this.featureLogo.displayWidth * 0.32;
					const baseWidth = (this.scatterSpine.width || 1);
					// Increase scale by 40% over the base size
					const scale = (targetWidth / baseWidth) * 1.8;
					this.scatterSpine.setScale(scale);
				} catch {
					// Safe fallback scale
					this.scatterSpine.setScale(0.4 * 1.8);
				}

				// Bring on top of the logo
				if (this.container) {
					this.container.add(this.scatterSpine);
				}

				// Play continuous "idle" loop (or win loop if requested) for the scatter symbol (BZ assets)
				try {
					const symbolValue = 0;
					const preferredIdle = `Symbol${symbolValue}_BZ_idle`;
					const fallbackIdle = `Symbol${symbolValue}_SW_Idle`;
					const preferredWin = `Symbol${symbolValue}_BZ_win`;
					const fallbackWin = `Symbol${symbolValue}_SW_Win`;
					const state: any = this.scatterSpine.animationState;
					const skeleton: any = this.scatterSpine.skeleton;
					const hasAnimation = (name: string) =>
						!!(skeleton?.data && typeof skeleton.data.findAnimation === 'function' && skeleton.data.findAnimation(name));
					const idleAnimationName = hasAnimation(preferredIdle)
						? preferredIdle
						: (hasAnimation(fallbackIdle) ? fallbackIdle : preferredIdle);
					const winAnimationName = hasAnimation(preferredWin)
						? preferredWin
						: (hasAnimation(fallbackWin) ? fallbackWin : null);
					const animationName = this.scatterShouldLoopWin && winAnimationName
						? winAnimationName
						: idleAnimationName;
					if (state && typeof state.setAnimation === 'function') {
						try { if (typeof state.clearTracks === 'function') state.clearTracks(); } catch {}
						state.setAnimation(0, animationName, true);
						console.log(`[BuyFeature] Playing scatter Spine loop: ${animationName}`);
					}
				} catch (e) {
					console.warn('[BuyFeature] Failed to start scatter Spine idle animation:', e);
				}
			} catch (error) {
				console.error('[BuyFeature] Error creating scatter Spine animation:', error);
				this.createScatterFallbackSprite(scene);
			}
		};

		// Prefer Spine when available
		try {
			// Ensure Spine factory + plugin instance are attached/synced before calling add.spine.
			if (!ensureSpineFactory(scene, '[BuyFeature] createScatterSymbolAnimation')) {
				console.warn('[BuyFeature] Spine factory not available, using PNG scatter sprite.');
				this.createScatterFallbackSprite(scene);
				return;
			}
		} catch {
			this.createScatterFallbackSprite(scene);
			return;
		}

		createWithSpine();
	}

	/**
	 * Create a PNG-based scatter symbol with a pulsing tween as a visual fallback.
	 */
	private createScatterFallbackSprite(scene: Scene): void {
		if (this.scatterFallbackSprite || !this.featureLogo) {
			return;
		}

		try {
			const x = this.featureLogo.x;
			const y = this.featureLogo.y - this.featureLogo.displayHeight * 0.1;

			this.scatterFallbackSprite = scene.add.image(x, y, 'symbol_0');
			this.scatterFallbackSprite.setOrigin(0.5, 0.5);

			// Scale relative to logo width
			try {
				const targetWidth = this.featureLogo.displayWidth * 0.28;
				const baseWidth = this.scatterFallbackSprite.width || 1;
				// Increase scale by 40% over the base size
				const scale = (targetWidth / baseWidth) * 1.4;
				this.scatterFallbackSprite.setScale(scale);
			} catch {
				this.scatterFallbackSprite.setScale(0.4 * 1.4);
			}

			if (this.container) {
				this.container.add(this.scatterFallbackSprite);
			}

			// Simple looping "win" effect using a pulsing tween
			scene.tweens.add({
				targets: this.scatterFallbackSprite,
				scaleX: this.scatterFallbackSprite.scaleX * 1.08,
				scaleY: this.scatterFallbackSprite.scaleY * 1.08,
				duration: 600,
				yoyo: true,
				repeat: -1,
				ease: 'Sine.easeInOut'
			});

			console.log('[BuyFeature] Created PNG-based scatter symbol with pulsing tween.');
		} catch (error) {
			console.error('[BuyFeature] Error creating scatter PNG fallback animation:', error);
		}
	}

	private createTitle(scene: Scene): void {
		const screenWidth = scene.cameras.main.width;
		const screenHeight = scene.cameras.main.height;
		const backgroundTop = screenHeight - 736;
		
		const title = scene.add.text(screenWidth / 2 - 110, backgroundTop + 40, 'Buy Feature', {
			fontSize: '24px',
			fontFamily: 'Poppins-Regular',
			color: '#00ff00',
			fontStyle: 'bold'
		});
		title.setOrigin(0.5);
		this.container.add(title);
	}

	private createFeatureName(scene: Scene): void {
		const screenWidth = scene.cameras.main.width;
		const screenHeight = scene.cameras.main.height;
		const backgroundTop = screenHeight - 736;
		
		const featureName = scene.add.text(screenWidth / 2, backgroundTop + 100, "Beelze-Bop Bonus", {
			fontSize: '24px',
			fontFamily: 'Poppins-Regular',
			color: '#ffffff',
			fontStyle: 'bold'
		});
		featureName.setOrigin(0.5);
		this.container.add(featureName);
	}

	private createPriceDisplay(scene: Scene): void {
		const screenWidth = scene.cameras.main.width;
		const screenHeight = scene.cameras.main.height;
		const backgroundTop = screenHeight - 736;
		
		// Calculate price as 100 * current base bet
		const calculatedPrice = this.getCurrentBetValue();

		// Check if demo mode is active - if so, use blank currency symbol
		const isDemo = (scene as any).gameAPI?.getDemoState();
		const currencyPrefix = isDemo ? '' : CurrencyManager.getInlinePrefix();
		this.priceDisplay = scene.add.text(screenWidth / 2, backgroundTop + 340, `${currencyPrefix}${this.formatNumberWithCommas(calculatedPrice)}`, {
			fontSize: '42px',
			fontFamily: 'Poppins-Regular',
			color: '#ffffff',
			fontStyle: 'bold'
		});
		this.priceDisplay.setOrigin(0.5);
		this.container.add(this.priceDisplay);
	}


	private createBuyButton(scene: Scene): void {
		const screenWidth = scene.cameras.main.width;
		const screenHeight = scene.cameras.main.height;
		const backgroundTop = screenHeight - 736;
		const x = screenWidth / 2;
		const y = backgroundTop + 560;
		
		// Use long_button image to match other confirm buttons
		const buttonImage = scene.add.image(x, y, 'long_button');
		buttonImage.setOrigin(0.5, 0.5);
		const targetWidth = 364;
		const targetHeight = 62;
		const scale = Math.min(targetWidth / buttonImage.width, targetHeight / buttonImage.height);
		buttonImage.setScale(scale);
		buttonImage.setSize(buttonImage.displayWidth, buttonImage.displayHeight);
		this.container.add(buttonImage);
		
		// Button label
		this.confirmButton = scene.add.text(x, y, 'BUY FEATURE', {
			fontSize: '24px',
			fontFamily: 'Poppins-Bold',
			color: '#000000'
		});
		this.confirmButton.setOrigin(0.5);
		this.confirmButton.setColor('#000000');
		this.container.add(this.confirmButton);
		
		buttonImage.setInteractive();
		buttonImage.on('pointerdown', () => this.confirmPurchase());
	}

	private createCloseButton(scene: Scene): void {
		const screenWidth = scene.cameras.main.width;
		const screenHeight = scene.cameras.main.height;
		const backgroundTop = screenHeight - 736;
		
		this.closeButton = scene.add.text(screenWidth / 2 + 180, backgroundTop + 40, '×', {
			fontSize: '30px',
			fontFamily: 'Poppins-Regular',
			color: '#ffffff'
		});
		this.closeButton.setOrigin(0.5);
		this.closeButton.setInteractive();
		this.closeButton.on('pointerdown', () => this.close());
		this.container.add(this.closeButton);
	}


	private confirmPurchase(): void {
		console.log(`[BuyFeature] Confirming purchase`);
		
		if (this.onConfirmCallback) {
			this.onConfirmCallback();
		}
		
		this.close();
	}

	private updatePriceDisplay(): void {
		if (this.priceDisplay) {
			const calculatedPrice = this.getCurrentBetValue();
			const isDemo = (this.container?.scene as any)?.gameAPI?.getDemoState?.();
			const currencyPrefix = isDemo ? '' : CurrencyManager.getInlinePrefix();
			this.priceDisplay.setText(`${currencyPrefix}${this.formatNumberWithCommas(calculatedPrice)}`);
			this.priceDisplay.setColor('#ffffff');
			this.priceDisplay.setStyle({ color: '#ffffff' });
			console.log('[BuyFeature] priceDisplay update forced to white:', this.priceDisplay.style.color);
		}
	}

	private formatNumberWithCommas(num: number): string {
		return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}

	private animateIn(): void {
		if (!this.container || !this.container.scene) {
			return;
		}

		// Start positioned below the screen for slide-up effect
		this.container.setY(this.container.scene.scale.height);
		this.container.setVisible(true);
		
		// Create slide-up animation
		this.container.scene.tweens.add({
			targets: this.container,
			y: 0,
			duration: 300,
			ease: 'Power2.easeOut',
			onComplete: () => {
				console.log("[BuyFeature] Drawer animation completed");
			}
		});
	}

	private animateOut(): void {
		if (!this.container || !this.container.scene) {
			return;
		}

		// Create slide-down animation
		this.container.scene.tweens.add({
			targets: this.container,
			y: this.container.scene.scale.height,
			duration: 250,
			ease: 'Power2.easeIn',
			onComplete: () => {
				this.container.setVisible(false);
				console.log("[BuyFeature] Drawer hidden");
			}
		});
	}

	private createBetInput(scene: Scene): void {
		const screenWidth = scene.cameras.main.width;
		const screenHeight = scene.cameras.main.height;
		const backgroundTop = screenHeight - 736;
		const x = screenWidth * 0.5;
		const y = backgroundTop + 470;
		
		// "Bet" label
		const betLabel = scene.add.text(x - 182, y - 70, 'Bet', {
			fontSize: '24px',
			color: '#ffffff',
			fontFamily: 'Poppins-Regular'
		});
		betLabel.setOrigin(0, 0.5);
		this.container.add(betLabel);
		
		// Bet input background
		const inputBg = scene.add.graphics();
		inputBg.fillStyle(0x000000, 0.0); // Fully transparent for diagnostic
		inputBg.fillRoundedRect(-182, -37, 364, 74, 15);
		inputBg.lineStyle(0.5, 0xffffff, 1);
		inputBg.strokeRoundedRect(-182, -37, 364, 74, 15);
		inputBg.setPosition(x, y);
		this.container.add(inputBg);
		
		// Minus button (single click only - same as BetOptions, no continuous press)
		this.minusButton = scene.add.text(x - 150, y, '-', {
			fontSize: '30px',
			color: '#ffffff',
			fontFamily: 'Poppins-Regular'
		});
		this.minusButton.setOrigin(0.5, 0.5);
		this.minusButton.setInteractive();
		this.minusButton.on('pointerdown', () => {
			this.selectPreviousBet();
		});
		this.container.add(this.minusButton);
		
		// Bet display - show current bet value
		// Check if demo mode is active - if so, use blank currency symbol
		const isDemoBet = (scene as any).gameAPI?.getDemoState();
		const currencyPrefixBet = isDemoBet ? '' : CurrencyManager.getInlinePrefix();
		this.betDisplay = scene.add.text(x, y, `${currencyPrefixBet}${this.getCurrentBet().toFixed(2)}`, {
			fontSize: '24px',
			color: '#00ff00', // GREEN for diagnostic
			fontFamily: 'Arial'
		});
		this.betDisplay.setOrigin(0.5, 0.5);
		this.betDisplay.setColor('#00ff00');
		this.betDisplay.setStyle({ color: '#00ff00', fontFamily: 'Arial' });
		this.betDisplay.setBlendMode(Phaser.BlendModes.NORMAL);
		this.betDisplay.setAlpha(1);
		this.betDisplay.setTint(0x00ff00);
		this.container.add(this.betDisplay);
		this.container.bringToTop(this.betDisplay);
		console.log('[BuyFeature] betDisplay created with color GREEN, Arial:', this.betDisplay.style.color, 'tint:', this.betDisplay.tintTopLeft, 'blendMode:', this.betDisplay.blendMode, 'alpha:', this.betDisplay.alpha);
		
		// Plus button (single click only - same as BetOptions, no continuous press)
		this.plusButton = scene.add.text(x + 150, y, '+', {
			fontSize: '30px',
			color: '#ffffff',
			fontFamily: 'Poppins-Regular'
		});
		this.plusButton.setOrigin(0.5, 0.5);
		this.plusButton.setInteractive();
		this.plusButton.on('pointerdown', () => {
			this.selectNextBet();
		});
		this.container.add(this.plusButton);
	}

	private selectPreviousBet(): void {
		if (this.currentBetIndex > 0) {
			this.currentBetIndex--;
			this.currentBet = this.betOptions[this.currentBetIndex];
			this.updateBetDisplay();
			this.updatePriceDisplay();
			this.updateBetLimitButtons();
			console.log(`[BuyFeature] Previous bet selected: $${this.currentBet.toFixed(2)}`);
		}
	}

	private selectNextBet(): void {
		if (this.currentBetIndex < this.betOptions.length - 1) {
			this.currentBetIndex++;
			this.currentBet = this.betOptions[this.currentBetIndex];
			this.updateBetDisplay();
			this.updatePriceDisplay();
			this.updateBetLimitButtons();
			console.log(`[BuyFeature] Next bet selected: $${this.currentBet.toFixed(2)}`);
		}
	}

	/**
	 * Update - / + button states: disable - at minimum bet, disable + at maximum bet
	 * (same behavior as AutoplayOptions).
	 */
	private updateBetLimitButtons(): void {
		const isAtMin = this.currentBetIndex <= 0;
		const isAtMax = this.currentBetIndex >= this.betOptions.length - 1;

		if (this.minusButton) {
			if (isAtMin) {
				this.minusButton.setAlpha(0.5);
				this.minusButton.setTint(0x555555);
				this.minusButton.disableInteractive();
			} else {
				this.minusButton.setAlpha(1.0);
				this.minusButton.clearTint();
				this.minusButton.setInteractive();
			}
		}

		if (this.plusButton) {
			if (isAtMax) {
				this.plusButton.setAlpha(0.5);
				this.plusButton.setTint(0x555555);
				this.plusButton.disableInteractive();
			} else {
				this.plusButton.setAlpha(1.0);
				this.plusButton.clearTint();
				this.plusButton.setInteractive();
			}
		}
	}

	private updateBetDisplay(): void {
		if (this.betDisplay) {
			const isDemo = (this.container?.scene as any)?.gameAPI?.getDemoState?.();
			const currencyPrefix = isDemo ? '' : CurrencyManager.getInlinePrefix();
			this.betDisplay.setText(`${currencyPrefix}${this.getCurrentBet().toFixed(2)}`);
			this.betDisplay.setColor('#00ff00');
			this.betDisplay.setStyle({ color: '#00ff00', fontFamily: 'Arial' });
			this.betDisplay.setBlendMode(Phaser.BlendModes.NORMAL);
			this.betDisplay.setAlpha(1);
			this.betDisplay.setTint(0x00ff00);
			this.container.bringToTop(this.betDisplay);
			console.log('[BuyFeature] betDisplay update forced to GREEN, Arial:', this.betDisplay.style.color, 'tint:', this.betDisplay.tintTopLeft, 'blendMode:', this.betDisplay.blendMode, 'alpha:', this.betDisplay.alpha);
		}
	}

	public show(config?: BuyFeatureConfig): void {
		console.log("[BuyFeature] Showing buy feature drawer");
		
		if (config) {
			if (config.featurePrice !== undefined) {
				this.featurePrice = config.featurePrice;
			}
			if (config.onClose) {
				this.onCloseCallback = config.onClose;
			}
			if (config.onConfirm) {
				this.onConfirmCallback = config.onConfirm;
			}
		}
		
		// Initialize bet index based on current bet from SlotController
		this.initializeBetIndex();
		
		this.updatePriceDisplay();
		this.updateBetDisplay();
		this.updateBetLimitButtons();
		this.animateIn();
		this.scatterShouldLoopWin = true;
		this.playLogoWinAnimation();
		
		// Show the mask when the panel is shown (same as BetOptions)
		if (this.confirmButtonMask) {
			this.confirmButtonMask.setVisible(true);
			this.confirmButtonMask.setAlpha(1);
		}
	}

	private playLogoWinAnimation(): void {
		const scatter = this.scatterSpine;
		if (!scatter) {
			this.scatterShouldLoopWin = true;
			return;
		}

		const state: any = scatter.animationState;
		const skeleton: any = scatter.skeleton;
		if (!state || typeof state.setAnimation !== 'function') {
			return;
		}

		const hasAnimation = (name: string) =>
			!!(skeleton?.data && typeof skeleton.data.findAnimation === 'function' && skeleton.data.findAnimation(name));

		const symbolValue = 0;
		const preferredWin = `Symbol${symbolValue}_BZ_win`;
		const fallbackWin = `Symbol${symbolValue}_SW_Win`;
		const preferredIdle = `Symbol${symbolValue}_BZ_idle`;
		const fallbackIdle = `Symbol${symbolValue}_SW_Idle`;
		const winName = hasAnimation(preferredWin)
			? preferredWin
			: (hasAnimation(fallbackWin) ? fallbackWin : null);
		const idleName = hasAnimation(preferredIdle)
			? preferredIdle
			: (hasAnimation(fallbackIdle) ? fallbackIdle : preferredIdle);

		if (!winName) {
			try { state.setAnimation(0, idleName, true); } catch {}
			return;
		}

		try { if (typeof state.clearTracks === 'function') state.clearTracks(); } catch {}

		// Loop the win animation instead of returning to idle.
		try { state.setAnimation(0, winName, true); } catch {}
	}

	public hide(): void {
		console.log("[BuyFeature] Hiding buy feature drawer");
		
		this.animateOut();
		
		// Hide the mask when the panel is hidden (same as BetOptions)
		if (this.confirmButtonMask) {
			this.confirmButtonMask.setVisible(false);
			this.confirmButtonMask.setAlpha(0);
		}
	}

	public close(): void {
		console.log("[BuyFeature] Closing buy feature drawer");
		this.hide();
		
		if (this.onCloseCallback) {
			this.onCloseCallback();
		}
	}

	public destroy(): void {
		if (this.scatterSpine) {
			try { this.scatterSpine.destroy(); } catch {}
			this.scatterSpine = undefined;
		}

		if (this.scatterFallbackSprite) {
			try { this.scatterFallbackSprite.destroy(); } catch {}
			this.scatterFallbackSprite = undefined;
		}

		if (this.container) {
			this.container.destroy();
		}
	}
}
