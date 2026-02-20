import { Scene } from "phaser";
import { NetworkManager } from "../../managers/NetworkManager";
import { ScreenModeManager } from "../../managers/ScreenModeManager";
import { gameEventManager, GameEventType } from '../../event/EventManager';
import { gameStateManager } from '../../managers/GameStateManager';
import { CurrencyManager } from './CurrencyManager';

export class BonusHeader {
	private bonusHeaderContainer!: Phaser.GameObjects.Container;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private amountText!: Phaser.GameObjects.Text;
	private youWonText!: Phaser.GameObjects.Text;
	private currentWinnings: number = 0;
	// Tracks cumulative total during bonus mode by incrementing each spin's subtotal
	private cumulativeBonusWin: number = 0;
	private hasStartedBonusTracking: boolean = false;
		// Seed value from scatter trigger to start cumulative tracking in bonus
	private scatterBaseWin: number = 0;
	// If true, the next bonus spin's total should NOT be added (already seeded).
	private skipNextSpinAccumulation: boolean = false;
	// Track if we've already accumulated this spin's total (prevents double add with WIN_STOP)
	private accumulatedThisSpin: boolean = false;
	// Multiplier arrival progressive display
	private multiplierCumulative: number = 0;
	private multiplierSpinTotal: number = 0;
	private multipliersActive: boolean = false; // Track if multipliers are currently animating
	private hadMultipliersThisSpin: boolean = false; // Track if multipliers were triggered this spin (for WIN_STOP timing)
	private expectedMultiplierCount: number = 0; // Expected number of multipliers for this spin
	private receivedMultiplierCount: number = 0; // Number of multipliers that have arrived
	private allMultipliersComplete: boolean = false; // Flag to confirm all multipliers are fully displayed and animated
	private showingTotalWin: boolean = false; // Flag to prevent multipliers from overwriting TOTAL WIN
	private scene: Scene | null = null;
	// Track if we just seeded the win to prevent immediate text overrides
	private justSeededWin: boolean = false;
	// Suppress win bar text while TotalW_BZ dialog is showing
	private suppressWinbarDisplay: boolean = false;

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	preload(scene: Scene): void {
		// Assets are now loaded centrally through AssetConfig in Preloader
		console.log(`[BonusHeader] Assets loaded centrally through AssetConfig`);
	}

	create(scene: Scene): void {
		console.log("[BonusHeader] Creating bonus header elements");
		
		// Store scene reference for animations
		this.scene = scene;
		
		// Create main container for all bonus header elements
		this.bonusHeaderContainer = scene.add.container(0, 0);
		
		const screenConfig = this.screenModeManager.getScreenConfig();
		const assetScale = this.networkManager.getAssetScale();
		
		console.log(`[BonusHeader] Creating bonus header with scale: ${assetScale}x`);

		// Add bonus header elements
		this.createBonusHeaderElements(scene, assetScale);
		
		// Set up event listeners for winnings updates (like regular header)
		this.setupWinningsEventListener();

		// Hide win bar text while TotalW_BZ dialog is visible
		this.setupWinbarSuppressionListeners(scene);
		
		// Initialize winnings display - start hidden
		this.initializeWinnings();
	}

	private setupWinbarSuppressionListeners(scene: Scene): void {
		scene.events.on('dialogShown', (dialogType: string) => {
			if (dialogType === 'TotalW_BZ') {
				this.suppressWinbarDisplay = true;
				this.forceHideWinningsDisplay();
				console.log('[BonusHeader] TotalW_BZ shown - suppressing winbar display');
			}
		});
		scene.events.on('hideBonusHeader', () => {
			this.suppressWinbarDisplay = false;
		});
		scene.events.on('setBonusMode', (isBonus: boolean) => {
			if (!isBonus) {
				this.suppressWinbarDisplay = false;
			}
		});
	}

	private createBonusHeaderElements(scene: Scene, assetScale: number): void {
		const screenConfig = this.screenModeManager.getScreenConfig();
		
		if (screenConfig.isPortrait) {
			this.createPortraitBonusHeader(scene, assetScale);
		} else {
			this.createLandscapeBonusHeader(scene, assetScale);
		}
	}

	private createPortraitBonusHeader(scene: Scene, assetScale: number): void {
		console.log("[BonusHeader] Creating portrait bonus header layout");


		// Create winnings text at a stable position (was inside win bar)
		this.createWinBarText(scene, scene.scale.width * 0.5, scene.scale.height * 0.1);
	}

	private createLandscapeBonusHeader(scene: Scene, assetScale: number): void {
		console.log("[BonusHeader] Creating landscape bonus header layout");


		// Create winnings text at a stable position
		this.createWinBarText(scene, scene.scale.width * 0.5, scene.scale.height * 0.18);
	}

	// Depth above RadialLightTransition overlay (20000) so Total win stays visible during candy/radial light
	private static readonly WIN_BAR_DEPTH = 20001;

	private createWinBarText(scene: Scene, x: number, y: number): void {
		// Line 1: "YOU WON"
		this.youWonText = scene.add.text(x, y - 7, 'YOU WON', {
			fontSize: '18px',
			color: '#ffffff',
			fontFamily: 'Poppins-Bold',
			stroke: '#004D00',
			strokeThickness: 3
		}).setOrigin(0.5, 0.5).setDepth(BonusHeader.WIN_BAR_DEPTH); // Above radial light overlay (20000)
		// Don't add to container - add directly to scene so depth works correctly

		// Line 2: amount value
		// Check if demo mode is active - if so, use blank currency symbol
		const isDemoInitial = (this.scene as any)?.gameAPI?.getDemoState();
		const prefixInitial = isDemoInitial ? '' : CurrencyManager.getCurrencyCode();
		this.amountText = scene.add.text(x, y + 18, `${prefixInitial}0.00`, {
			fontSize: '24px',
			color: '#00ff00',
			fontFamily: 'Poppins-Bold',
			stroke: '#004D00',
			strokeThickness: 3
		}).setOrigin(0.5, 0.5).setDepth(BonusHeader.WIN_BAR_DEPTH); // Above radial light overlay (20000)
		// Don't add to container - add directly to scene so depth works correctly
		
		// Store winbar center for multiplier flight target
		(this as any).multiplierTargetY = y + 18;
		(this as any).multiplierTargetX = x;
		
		// Hide by default - only show when bonus is triggered
		this.youWonText.setVisible(false);
		this.amountText.setVisible(false);
	}

	/**
	 * Update the winnings display in the bonus header with scale in animation
	 */
	public updateWinningsDisplay(winnings: number): void {
		if (this.suppressWinbarDisplay) {
			return;
		}
		if (this.amountText && this.youWonText) {
			this.currentWinnings = winnings;
			const formattedWinnings = this.formatCurrency(winnings);
			this.amountText.setText(formattedWinnings);
			
			// Stop any existing tweens on these objects
			if (this.scene) {
				this.scene.tweens.killTweensOf(this.youWonText);
				this.scene.tweens.killTweensOf(this.amountText);
			}
			
			// Show both texts first
			this.youWonText.setVisible(true);
			this.amountText.setVisible(true);
			
			// Check if already visible and scaled
			const isAlreadyVisible = this.youWonText.visible && this.amountText.visible;
			const currentScale = this.youWonText.scaleX;
			const isAlreadyScaled = currentScale > 0.9;
			
			if (isAlreadyVisible && isAlreadyScaled) {
				// Already visible and scaled - do a pulse animation (enlarge then revert)
				if (this.scene) {
					this.scene.tweens.add({
						targets: [this.youWonText, this.amountText],
						scaleX: 1.2,
						scaleY: 1.2,
						duration: 150,
						ease: 'Power2',
						yoyo: true,
						repeat: 0,
						onComplete: () => {
							// Ensure scale is exactly 1 after animation
							this.youWonText.setScale(1);
							this.amountText.setScale(1);
						}
					});
				}
				console.log(`[BonusHeader] Winnings updated with pulse animation: ${formattedWinnings} (raw: ${winnings})`);
			} else {
				// Not visible or not scaled - do full scale-in animation
				// Set initial scale to 0 for scale-in effect
				this.youWonText.setScale(0);
				this.amountText.setScale(0);
				
				// Animate scale in with bounce effect
				if (this.scene) {
					this.scene.tweens.add({
						targets: [this.youWonText, this.amountText],
						scaleX: 1,
						scaleY: 1,
						duration: 300,
						ease: 'Back.easeOut',
						onComplete: () => {
							// Ensure scale is exactly 1 after animation
							this.youWonText.setScale(1);
							this.amountText.setScale(1);
						}
					});
				}
				
				console.log(`[BonusHeader] Winnings updated with scale-in animation: ${formattedWinnings} (raw: ${winnings})`);
			}
		}
	}

	/**
	 * Seed the cumulative bonus total with a base amount (e.g., scatter payout)
	 * Only shows the display if bonus mode is already active to avoid race conditions
	 */
	public seedCumulativeWin(baseAmount: number): void {
		this.scatterBaseWin = Math.max(0, Number(baseAmount) || 0);
		this.cumulativeBonusWin = this.scatterBaseWin;
		this.hasStartedBonusTracking = true;
		this.justSeededWin = true; // Flag that we just seeded to prevent immediate text overrides
		this.skipNextSpinAccumulation = false;
		
		// For bonus mode, we only show per-tumble "YOU WON" values.
		// Seed the cumulative tracker silently; UI will be driven by tumble events.
		console.log(`[BonusHeader] Seeded cumulative bonus win with scatter base (tracking only): $${this.scatterBaseWin}`);
	}

	/**
	 * Seed cumulative total from the first free spin item total (buy feature flow).
	 * This shows the first spin's total at the start of free spins and avoids double-adding it later.
	 */
	public seedFromFirstFreeSpinItem(spinData: any): void {
		try {
			const triggerWin = this.calculateTriggerSpinWin(spinData);
			if (triggerWin > 0) {
				this.scatterBaseWin = triggerWin;
				this.cumulativeBonusWin = triggerWin;
				this.hasStartedBonusTracking = true;
				this.justSeededWin = true;
				this.skipNextSpinAccumulation = false;
				console.log(`[BonusHeader] Seeded cumulative from trigger spin win: $${triggerWin}`);
				return;
			}
		} catch { }
	}

	private calculateTriggerSpinWin(spinData: any): number {
		try {
			const slot: any = spinData?.slot;
			if (!slot) return 0;
			let total = 0;
			if (Array.isArray(slot.paylines)) {
				for (const payline of slot.paylines) {
					const win = Number(payline?.win ?? 0);
					total += isNaN(win) ? 0 : win;
				}
			}
			if (Array.isArray(slot.tumbles)) {
				for (const tumble of slot.tumbles) {
					const win = Number(tumble?.win ?? 0);
					total += isNaN(win) ? 0 : win;
				}
			}
			return total;
		} catch {
			return 0;
		}
	}

	private getCurrentFreeSpinItem(spinData: any): any | null {
		try {
			const fs = spinData?.slot?.freespin || spinData?.slot?.freeSpin;
			const items = Array.isArray(fs?.items) ? fs.items : [];
			if (!items.length) return null;

			// Prefer matching area when available (most reliable)
			const slotArea = spinData?.slot?.area;
			if (Array.isArray(slotArea)) {
				const areaJson = JSON.stringify(slotArea);
				const match = items.find((item: any) =>
					Array.isArray(item?.area) && JSON.stringify(item.area) === areaJson
				);
				if (match) return match;
			}

			if (items.length === 1) return items[0];

			// Try to align with Symbols' remaining counter when available
			try {
				const symbolsComponent = (this.bonusHeaderContainer.scene as any)?.symbols;
				const rem = symbolsComponent?.freeSpinAutoplaySpinsRemaining;
				if (typeof rem === 'number') {
					const targetB = items.find((item: any) => Number(item?.spinsLeft) === rem + 1);
					if (targetB) return targetB;
					const targetA = items.find((item: any) => Number(item?.spinsLeft) === rem);
					if (targetA) return targetA;
				}
			} catch { }

			// Fallbacks: highest spinsLeft (earliest spin) or first item
			const withSpinsLeft = items
				.filter((item: any) => typeof item?.spinsLeft === 'number' && item.spinsLeft > 0)
				.sort((a: any, b: any) => b.spinsLeft - a.spinsLeft);
			if (withSpinsLeft.length) return withSpinsLeft[0];

			return items[0];
		} catch {
			return null;
		}
	}

	private calculateBackendTotalWin(spinData: any): number {
		try {
			const slot: any = spinData?.slot;
			if (!slot) return 0;

			const freespinData = slot.freespin || slot.freeSpin;
			const fsTotalWin = Number((freespinData as any)?.totalWin ?? 0);
			if (Number.isFinite(fsTotalWin) && fsTotalWin > 0) {
				return fsTotalWin;
			}

			const slotTotalWin = Number(slot.totalWin ?? 0);
			if (Number.isFinite(slotTotalWin) && slotTotalWin > 0) {
				return slotTotalWin;
			}

			let totalWin = 0;
			let itemsSum = 0;
			let hasItems = false;

			// Sum wins from freespin items
			if (freespinData?.items && Array.isArray(freespinData.items)) {
				hasItems = true;
				itemsSum = freespinData.items.reduce((sum: number, item: any) => {
					const perSpinTotal =
						(typeof item?.totalWin === 'number' && item.totalWin > 0)
							? item.totalWin
							: (item?.subTotalWin || 0);
					return sum + perSpinTotal;
				}, 0);
				totalWin += itemsSum;
			}

			// As a last resort, include paylines/tumbles if we have no item totals.
			// Avoid double-counting per-spin tumbles that are already included in item totals.
			if (!hasItems || itemsSum <= 0) {
				if (Array.isArray(slot.paylines) && slot.paylines.length > 0) {
					totalWin += this.calculateTotalWinFromPaylines(slot.paylines);
				}
				if (Array.isArray(slot.tumbles) && slot.tumbles.length > 0) {
					totalWin += this.calculateTotalWinFromTumbles(slot.tumbles);
				}
			}

			return totalWin;
		} catch {
			return 0;
		}
	}

	/**
	 * Compute a stable "TOTAL WIN" display value from free-spin items:
	 * scatter base + previous item totals (+ current item when requested).
	 * This mirrors felice_in_space behavior and avoids relying on ambiguous slot.totalWin.
	 */
	private getTotalWinForDisplay(spinData: any, includeCurrentSpin: boolean): number {
		const basePlusScatter = Math.max(0, Number(this.scatterBaseWin) || 0);
		try {
			const slotAny: any = spinData?.slot || {};
			const fs = slotAny.freespin || slotAny.freeSpin;
			const items = Array.isArray(fs?.items) ? fs.items : [];
			const area = slotAny.area;
			if (items.length === 0 || !Array.isArray(area)) {
				return this.cumulativeBonusWin;
			}

			const areaJson = JSON.stringify(area);
			const currentIndex = items.findIndex((item: any) =>
				Array.isArray(item?.area) && JSON.stringify(item.area) === areaJson
			);
			if (currentIndex < 0) {
				return this.cumulativeBonusWin;
			}

			let previousTotalWin = 0;
			for (let i = 0; i < currentIndex; i++) {
				const item = items[i];
				const w = Number((item as any)?.totalWin ?? (item as any)?.subTotalWin ?? 0);
				if (!isNaN(w) && w > 0) previousTotalWin += w;
			}

			let currentSpinWin = 0;
			if (includeCurrentSpin && currentIndex >= 0 && currentIndex < items.length) {
				const currentItem = items[currentIndex];
				const w = Number((currentItem as any)?.totalWin ?? (currentItem as any)?.subTotalWin ?? 0);
				if (!isNaN(w) && w > 0) currentSpinWin = w;
			}

			return basePlusScatter + previousTotalWin + currentSpinWin;
		} catch {
			return this.cumulativeBonusWin;
		}
	}

	/**
	 * Add to the cumulative bonus total (e.g., for scatter retriggers)
	 * This preserves the existing cumulative total and adds the new amount
	 */
	public addToCumulativeWin(amount: number): void {
		const amountToAdd = Math.max(0, Number(amount) || 0);
		if (amountToAdd > 0) {
			this.cumulativeBonusWin += amountToAdd;
			this.hasStartedBonusTracking = true;
			console.log(`[BonusHeader] Added to cumulative bonus win: +$${amountToAdd}, new total: $${this.cumulativeBonusWin}`);
		}
	}

	/**
	 * Get the accumulated bonus win total.
	 */
	public getCumulativeBonusWin(): number {
		return this.cumulativeBonusWin;
	}

	/**
	 * Ensure header shows accumulated TOTAL WIN immediately before TotalW_BZ dialog.
	 * Symbols calls this right before showing the dialog.
	 */
	public showTotalWinBeforeCongrats(totalWin: number): void {
		try {
			const symbolsComponent = (this.bonusHeaderContainer?.scene as any)?.symbols;
			const spinData = symbolsComponent?.currentSpinData;
			const fromFormula = spinData ? this.getTotalWinForDisplay(spinData, true) : 0;
			const displayTotal = Math.max(Number(totalWin) || 0, fromFormula, this.cumulativeBonusWin);
			if (!(displayTotal > 0)) return;

			this.cumulativeBonusWin = Math.max(this.cumulativeBonusWin, displayTotal);
			this.hasStartedBonusTracking = true;
			this.showingTotalWin = true;

			if (this.youWonText) this.youWonText.setText('TOTAL WIN');
			this.showWinningsDisplay(displayTotal);
			console.log(`[BonusHeader] showTotalWinBeforeCongrats: TOTAL WIN $${displayTotal}`);
		} catch (e) {
			console.warn('[BonusHeader] Failed to show TOTAL WIN before congrats:', e);
		}
	}

	/**
	 * Show the cumulative total immediately (e.g. when bonus header becomes visible).
	 * Used so the first spin's win (buy feature scatter) is not hidden - seamless transition from main header.
	 */
	public showCumulativeTotalIfReady(): void {
		if (this.cumulativeBonusWin > 0 && this.youWonText && this.amountText) {
			this.youWonText.setText('TOTAL WIN');
			this.showWinningsDisplay(this.cumulativeBonusWin);
			this.showingTotalWin = true;
			console.log(`[BonusHeader] Showing cumulative total immediately: $${this.cumulativeBonusWin}`);
		}
	}

	/**
	 * Hide the winnings display (both "YOU WON" text and amount) with shrink animation.
	 * During bonus mode with a cumulative total, never hide – keep the total win visible in the win bar.
	 */
	public hideWinningsDisplay(): void {
		// Never hide Total win during bonus – keep it visible when bonus game starts and throughout
		if (gameStateManager.isBonus || gameStateManager.isBonusFinished) {
			console.log('[BonusHeader] Skipping hide – keeping total win visible during bonus');
			return;
		}
		if (this.amountText && this.youWonText) {
			// Stop any existing tweens on these objects
			if (this.scene) {
				this.scene.tweens.killTweensOf(this.youWonText);
				this.scene.tweens.killTweensOf(this.amountText);
			}
			
			// Animate scale down to 0 before hiding
			if (this.scene) {
				this.scene.tweens.add({
					targets: [this.youWonText, this.amountText],
					scaleX: 0,
					scaleY: 0,
					duration: 200,
					ease: 'Back.easeIn',
					onComplete: () => {
						// Hide both texts after animation
						this.youWonText.setVisible(false);
						this.amountText.setVisible(false);
						// Reset scale for next show
						this.youWonText.setScale(1);
						this.amountText.setScale(1);
					}
				});
			} else {
				// Fallback if scene not available
				this.youWonText.setVisible(false);
				this.amountText.setVisible(false);
			}
			
			console.log('[BonusHeader] Winnings display hidden with shrink animation');
		} else {
			console.warn('[BonusHeader] Cannot hide winnings display - text objects not available', {
				amountText: !!this.amountText,
				youWonText: !!this.youWonText
			});
		}
	}

	/**
	 * Force-hide the win bar text (used when TotalW_BZ dialog is shown).
	 */
	public forceHideWinningsDisplay(): void {
		if (this.amountText && this.youWonText) {
			try {
				if (this.scene) {
					this.scene.tweens.killTweensOf(this.youWonText);
					this.scene.tweens.killTweensOf(this.amountText);
				}
			} catch { }
			this.youWonText.setVisible(false);
			this.amountText.setVisible(false);
			this.youWonText.setScale(1);
			this.amountText.setScale(1);
			console.log('[BonusHeader] Winbar display force-hidden');
		}
	}

	/**
	 * Show the winnings display with both "YOU WON" text and amount with scale in animation
	 */
	public showWinningsDisplay(winnings: number): void {
		if (this.suppressWinbarDisplay) {
			return;
		}
		if (this.amountText && this.youWonText) {
			const formattedWinnings = this.formatCurrency(winnings);
			
			// Check if the value has actually changed before animating
			const valueChanged = Math.abs(this.currentWinnings - winnings) > 0.01; // Use small epsilon for float comparison
			
			// Stop any existing tweens on these objects
			if (this.scene) {
				this.scene.tweens.killTweensOf(this.youWonText);
				this.scene.tweens.killTweensOf(this.amountText);
			}
			
			// Update amount text with winnings before showing
			this.amountText.setText(formattedWinnings);
			
			// Check if already visible and scaled
			const isAlreadyVisible = this.youWonText.visible && this.amountText.visible;
			const currentScale = this.youWonText.scaleX;
			const isAlreadyScaled = currentScale > 0.9;
			
			// Show both texts first
			this.youWonText.setVisible(true);
			this.amountText.setVisible(true);
			
			// Update current winnings after checks
			this.currentWinnings = winnings;
			
			// Only animate if value changed or not already visible/scaled
			if (isAlreadyVisible && isAlreadyScaled) {
				if (valueChanged) {
					// Value changed - do a pulse animation (enlarge then revert)
					if (this.scene) {
						this.scene.tweens.add({
							targets: [this.youWonText, this.amountText],
							scaleX: 1.2,
							scaleY: 1.2,
							duration: 150,
							ease: 'Power2',
							yoyo: true,
							repeat: 0,
							onComplete: () => {
								// Ensure scale is exactly 1 after animation
								this.youWonText.setScale(1);
								this.amountText.setScale(1);
							}
						});
					}
					console.log(`[BonusHeader] Winnings display updated with pulse animation: ${formattedWinnings} (raw: ${winnings})`);
				} else {
					// Value hasn't changed - just ensure scale is correct without animation
					this.youWonText.setScale(1);
					this.amountText.setScale(1);
					console.log(`[BonusHeader] Winnings display value unchanged, skipping animation: ${formattedWinnings} (raw: ${winnings})`);
				}
			} else {
				// Not visible or not scaled - do full scale-in animation
				// Set initial scale to 0 for scale-in effect
				this.youWonText.setScale(0);
				this.amountText.setScale(0);
				
				// Animate scale in with bounce effect
				if (this.scene) {
					this.scene.tweens.add({
						targets: [this.youWonText, this.amountText],
						scaleX: 1,
						scaleY: 1,
						duration: 300,
						ease: 'Back.easeOut',
						onComplete: () => {
							// Ensure scale is exactly 1 after animation
							this.youWonText.setScale(1);
							this.amountText.setScale(1);
						}
					});
				}
				console.log(`[BonusHeader] Winnings display shown with scale-in animation: ${formattedWinnings} (raw: ${winnings})`);
			}
		} else {
			console.warn('[BonusHeader] Cannot show winnings display - text objects not available', {
				amountText: !!this.amountText,
				youWonText: !!this.youWonText
			});
		}
	}

	/**
	 * Format currency value for display
	 */
	private formatCurrency(amount: number): string {
		const isDemo = (this.scene as any)?.gameAPI?.getDemoState();

		// Format with commas for thousands and 2 decimal places
		const formatted = new Intl.NumberFormat('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);

		if (isDemo) {
			return formatted;
		}

		// Get currency code with proper spacing (match sugar_wonderland)
		const currencyCode = CurrencyManager.getCurrencyCode();
		const space = currencyCode ? ' ' : '';
		return currencyCode ? `${currencyCode}${space}${formatted}` : formatted;
	}

	/**
	 * Format base spin total for multiplier display (no currency).
	 */
	private formatMultiplierAmount(amount: number): string {
		if (Number.isFinite(amount) && Math.abs(amount - Math.round(amount)) < 1e-6) {
			return Math.round(amount).toString();
		}
		const formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		return formatted;
	}

	/**
	 * Format multiplied total without currency.
	 * Drop decimals if the value is a whole number.
	 */
	private formatMultiplierTotal(amount: number): string {
		if (Number.isFinite(amount) && Math.abs(amount - Math.round(amount)) < 1e-6) {
			return Math.round(amount).toString();
		}
		return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	/**
	 * Get current winnings amount
	 */
	public getCurrentWinnings(): number {
		return this.currentWinnings;
	}

	/**
	 * Reset winnings display to zero
	 */
	public resetWinnings(): void {
		this.updateWinningsDisplay(0);
	}

	/**
	 * Initialize winnings display when bonus header starts
	 */
	public initializeWinnings(): void {
		console.log('[BonusHeader] Initializing winnings display - starting hidden');
		this.currentWinnings = 0;
		this.hideWinningsDisplay();
	}

	/**
	 * Hide winnings display at the start of a new spin (like regular header)
	 */
	public hideWinningsForNewSpin(): void {
		console.log('[BonusHeader] Hiding winnings display for new spin');
		this.hideWinningsDisplay();
	}

	/**
	 * Set up event listener for winnings updates from backend (like regular header)
	 */
	private setupWinningsEventListener(): void {
		// Listen for tumble win progress (during bonus mode: per-spin cumulative)
		gameEventManager.on(GameEventType.TUMBLE_WIN_PROGRESS, (data: any) => {
			try {
				if (!gameStateManager.isBonus) return;
				const amount = Number((data as any)?.cumulativeWin ?? 0);
				if (amount > 0) {
					// As soon as tumble wins start, we are in the "YOU WON" phase for this spin.
					// Never show "TOTAL WIN" on tumble updates; that label is reserved for the
					// end-of-spin cumulative summary (handled on WIN_STOP).
					if (this.youWonText) {
						this.youWonText.setText('YOU WON');
					}
					// Clear any scatter seeding guard once real tumble wins begin
					if (this.justSeededWin) {
						this.justSeededWin = false;
					}
					this.showWinningsDisplay(amount);
				}
			} catch {}
		});

		// Listen for tumble sequence completion (during bonus mode: accumulate spin total only)
		gameEventManager.on(GameEventType.TUMBLE_SEQUENCE_DONE, (data: any) => {
			try {
				if (!gameStateManager.isBonus) return;
				const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
				const spinData = symbolsComponent?.currentSpinData;
				
				// Prefer totalWin from the current freespin item (backend per-spin total).
				// Fall back to subTotalWin, then to a manual tumble+payline sum.
				let spinWin = 0;
				try {
					const slotAny: any = spinData?.slot || {};
					const currentItem = this.getCurrentFreeSpinItem(spinData);
					if (currentItem) {
						const rawItemTotal =
							(currentItem as any).totalWin ??
							(currentItem as any).subTotalWin ??
							0;
						const itemTotal = Number(rawItemTotal);
						if (!isNaN(itemTotal) && itemTotal > 0) {
							spinWin = itemTotal;
							console.log(`[BonusHeader] TUMBLE_SEQUENCE_DONE: using freespin item totalWin=$${itemTotal}`);
						}
					}

					// Fallback: if freespin item total not available, use the totalWin from event data (tumbles only)
					if (spinWin === 0) {
						const spinTumbleWin = Number((data as any)?.totalWin ?? 0);
						if (spinTumbleWin > 0) {
							// Still need to add paylines if tumbles don't include them
							let spinPaylineWin = 0;
							if (slotAny?.paylines && Array.isArray(slotAny.paylines) && slotAny.paylines.length > 0) {
								spinPaylineWin = this.calculateTotalWinFromPaylines(slotAny.paylines);
							}
							spinWin = spinTumbleWin + spinPaylineWin;
							console.log(`[BonusHeader] TUMBLE_SEQUENCE_DONE: fallback calculation (tumbles=$${spinTumbleWin} + paylines=$${spinPaylineWin}) = $${spinWin}`);
						}
					}
				} catch {}

				// Initialize bonus tracking if needed
				if (!this.hasStartedBonusTracking) {
					this.cumulativeBonusWin = this.scatterBaseWin || 0;
					this.hasStartedBonusTracking = true;
				}

				// Accumulate the spin's total into the bonus cumulative.
				// The visible TOTAL WIN display is handled on WIN_STOP so that it only
				// appears after *all* win mechanics for the spin (tumbles + multipliers)
				// have finished, avoiding any label flicker during tumble updates.
				if (spinWin > 0) {
					if (this.skipNextSpinAccumulation) {
						this.accumulatedThisSpin = true;
						this.skipNextSpinAccumulation = false;
						console.log('[BonusHeader] TUMBLE_SEQUENCE_DONE: skipping accumulation (first spin already seeded)');
					} else {
						this.cumulativeBonusWin += spinWin;
						this.accumulatedThisSpin = true;
					}
					console.log(`[BonusHeader] TUMBLE_SEQUENCE_DONE: added spinWin=$${spinWin}, cumulativeBonusWin=$${this.cumulativeBonusWin}, multipliersActive=${this.multipliersActive}`);
				}
			} catch {}
		});

		// When multipliers trigger during bonus, prepare progressive display and set text to "YOU WON"
		gameEventManager.on(GameEventType.MULTIPLIERS_TRIGGERED, (data: any) => {
			try {
				if (!gameStateManager.isBonus) return;
				const spinTotal = Number((data as any)?.spinTotal ?? 0);
				this.multiplierSpinTotal = Math.max(0, spinTotal);
				this.multiplierCumulative = 0;
				this.multipliersActive = true; // Mark that multipliers are now active
				this.hadMultipliersThisSpin = true; // Track that this spin had multipliers

				// Count expected multipliers from spin data NOW, before any arrive
				const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
				const spinData = symbolsComponent?.currentSpinData;

				// LOG SPIN DATA STRUCTURE for debugging
				console.log('[BonusHeader] ========== SPIN DATA ==========');
				console.log('[BonusHeader] Full spinData:', JSON.stringify(spinData, null, 2));
				console.log('[BonusHeader] Area:', spinData?.slot?.area);
				console.log('[BonusHeader] Freespin items:', spinData?.slot?.freespin?.items || spinData?.slot?.freeSpin?.items);

				// Log multipliers array locations
				console.log('[BonusHeader] Multipliers (slot):', spinData?.slot?.multipliers);
				console.log('[BonusHeader] Multipliers (freespin):', spinData?.slot?.freespin?.multipliers || spinData?.slot?.freeSpin?.multipliers);
				console.log('[BonusHeader] =====================================');

				this.expectedMultiplierCount = this.countMultipliersFromSpinData(spinData);
				this.receivedMultiplierCount = 0; // Reset counter before multipliers start arriving
				console.log(`[BonusHeader] MULTIPLIERS_TRIGGERED: expecting ${this.expectedMultiplierCount} multipliers`);

				// Immediately set text to "YOU WON" to prevent it from changing to "TOTAL WIN"
				if (this.youWonText) this.youWonText.setText('YOU WON');
				// Show the current spin total (not cumulative) when multipliers start
				if (spinTotal > 0) {
					this.showWinningsDisplay(spinTotal);
				}
				console.log(`[BonusHeader] MULTIPLIERS_TRIGGERED: primed progressive display with spinTotal=$${this.multiplierSpinTotal}, set text to "YOU WON", showing spin total`);
			} catch {}
		});

		// Each time a multiplier PNG reaches the center, add to cumulative and show "YOU WON $total x cum"
		gameEventManager.on(GameEventType.MULTIPLIER_ARRIVED, (data: any) => {
			try {
				if (!gameStateManager.isBonus) return;
				const weight = Number((data as any)?.weight ?? 0);
				let spinTotal = Number((data as any)?.spinTotal ?? 0);
				if (!(spinTotal > 0)) {
					// Fallback to primed value from MULTIPLIERS_TRIGGERED
					spinTotal = this.multiplierSpinTotal || 0;
				}
				// Final fallback: derive from current spin data if still missing
				if (!(spinTotal > 0)) {
					try {
						const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
						const spinData = symbolsComponent?.currentSpinData;
						const slotAny: any = spinData?.slot || {};
						const fs = slotAny.freespin || slotAny.freeSpin;
						const items = Array.isArray(fs?.items) ? fs.items : [];
						const area = slotAny.area;
						let derived = 0;
						if (items.length > 0 && Array.isArray(area)) {
							const areaJson = JSON.stringify(area);
							const currentFreeSpinItem = items.find((item: any) =>
								Array.isArray(item?.area) && JSON.stringify(item.area) === areaJson
							);
							if (currentFreeSpinItem) {
								const rawItemTotal =
									(currentFreeSpinItem as any).totalWin ??
									(currentFreeSpinItem as any).subTotalWin ??
									0;
								const itemTotal = Number(rawItemTotal);
								if (!isNaN(itemTotal) && itemTotal > 0) {
									derived = itemTotal;
								}
							}
						}
						if (derived === 0) {
							if (slotAny?.paylines && Array.isArray(slotAny.paylines)) {
								derived += this.calculateTotalWinFromPaylines(slotAny.paylines);
							}
							if (Array.isArray(slotAny?.tumbles)) {
								derived += this.calculateTotalWinFromTumbles(slotAny.tumbles);
							}
						}
						if (derived > 0) {
							spinTotal = derived;
						}
					} catch { }
				} else {
					// Keep a consistent spin total if not primed yet
					if (this.multiplierSpinTotal === 0) this.multiplierSpinTotal = spinTotal;
				}
				if (weight > 0 && spinTotal > 0) {
					this.multiplierCumulative += weight;
					this.receivedMultiplierCount++; // Track that a multiplier has arrived
					console.log(`[BonusHeader] MULTIPLIER_ARRIVED: ${this.receivedMultiplierCount}/${this.expectedMultiplierCount} multipliers received (weight: x${weight})`);

					// Check if this is the last multiplier and animations are already complete
					if (this.receivedMultiplierCount >= this.expectedMultiplierCount && !this.multipliersActive) {
						this.allMultipliersComplete = true;
						console.log(`[BonusHeader] MULTIPLIER_ARRIVED: ✅ Last multiplier arrived and animations already complete (${this.receivedMultiplierCount}/${this.expectedMultiplierCount})`);
					}

					// Don't update display if we're already showing TOTAL WIN
					if (this.showingTotalWin) {
						console.log('[BonusHeader] MULTIPLIER_ARRIVED: skipping display update, already showing TOTAL WIN');
						return;
					}

					if (this.youWonText) this.youWonText.setText('YOU WON');
					const formatted = this.formatCurrency(spinTotal);
					const total = spinTotal * this.multiplierCumulative;
					const formattedTotal = this.formatCurrency(total);
					if (this.amountText && this.youWonText) {
						// Stop any existing tweens
						if (this.scene) {
							this.scene.tweens.killTweensOf(this.youWonText);
							this.scene.tweens.killTweensOf(this.amountText);
						}

						this.youWonText.setVisible(true);
						this.amountText.setVisible(true);
						this.amountText.setText(`${formatted} x ${this.multiplierCumulative} = ${formattedTotal}`);

						// Pulse animation when updating multiplier display
						if (this.scene) {
							this.scene.tweens.add({
								targets: [this.youWonText, this.amountText],
								scaleX: 1.2,
								scaleY: 1.2,
								duration: 150,
								ease: 'Power2',
								yoyo: true,
								repeat: 0,
								onComplete: () => {
									// Ensure scale is exactly 1 after animation
									this.youWonText.setScale(1);
									this.amountText.setScale(1);
								}
							});
						}
					} else {
						this.showWinningsDisplay(spinTotal);
					}
					console.log(`[BonusHeader] MULTIPLIER_ARRIVED: updated "${formatted} x ${this.multiplierCumulative} = ${formattedTotal}" (added ${weight})`);
				}
			} catch {}
		});

		// Reset multiplier active flag when all multiplier animations complete
		gameEventManager.on(GameEventType.MULTIPLIER_ANIMATIONS_COMPLETE, () => {
			if (gameStateManager.isBonus) {
				this.multipliersActive = false;
				// Mark multipliers as complete ONLY when this event fires AND we've received all expected multipliers
				// This ensures all multipliers have arrived and finished animating before showing TOTAL WIN
				if (this.expectedMultiplierCount > 0) {
					if (this.receivedMultiplierCount >= this.expectedMultiplierCount) {
						this.allMultipliersComplete = true;
						console.log(`[BonusHeader] MULTIPLIER_ANIMATIONS_COMPLETE: ✅ All ${this.expectedMultiplierCount} multipliers complete (received ${this.receivedMultiplierCount})`);
					} else {
						console.log(`[BonusHeader] MULTIPLIER_ANIMATIONS_COMPLETE: fired but not all multipliers received yet (${this.receivedMultiplierCount}/${this.expectedMultiplierCount}) - waiting for more`);
					}
				} else {
					console.log('[BonusHeader] MULTIPLIER_ANIMATIONS_COMPLETE: fired but expectedMultiplierCount is 0');
				}
				console.log('[BonusHeader] MULTIPLIER_ANIMATIONS_COMPLETE: reset multipliersActive flag');
			}
		});

		// Listen for spin events - do NOT hide winnings during bonus; keep cumulative total visible
		gameEventManager.on(GameEventType.SPIN, () => {
			if (gameStateManager.isBonus && this.cumulativeBonusWin > 0) {
				console.log('[BonusHeader] SPIN during bonus - keeping total win visible for cumulative tracking');
				return;
			}
			console.log('[BonusHeader] Manual spin started - hiding winnings display');
			this.hideWinningsDisplay();
		});

		// Listen for autoplay start - do NOT hide winnings during bonus; keep cumulative total visible
		gameEventManager.on(GameEventType.AUTO_START, () => {
			if (gameStateManager.isBonus && this.cumulativeBonusWin > 0) {
				console.log('[BonusHeader] AUTO_START during bonus - keeping total win visible for cumulative tracking');
				return;
			}
			console.log('[BonusHeader] Auto play started - hiding winnings display');
			this.hideWinningsDisplay();
		});

		// After radial light transition (dialogAnimationsComplete), re-show cumulative total
		// so it stays visible when transitioning from Free Spin dialog to first bonus spin
		if (this.scene) {
			this.scene.events.on('dialogAnimationsComplete', () => {
				if (gameStateManager.isBonus && this.cumulativeBonusWin > 0 && this.bonusHeaderContainer?.visible) {
					this.showCumulativeTotalIfReady();
					console.log('[BonusHeader] dialogAnimationsComplete: re-showing cumulative total after radial light transition');
				}
			});
		}

		// Listen for reels start to reset per-spin bonus state
		gameEventManager.on(GameEventType.REELS_START, () => {
			console.log('[BonusHeader] Reels started');
			if (gameStateManager.isBonus) {
				// Reset per-spin accumulation flag
				this.accumulatedThisSpin = false;
				// Reset multiplier progressive display
				this.multiplierCumulative = 0;
				this.multiplierSpinTotal = 0;
				this.multipliersActive = false; // Reset multiplier active flag at start of new spin
				this.hadMultipliersThisSpin = false; // Reset multiplier tracking for new spin
				this.expectedMultiplierCount = 0; // Reset expected multiplier count
				this.receivedMultiplierCount = 0; // Reset received multiplier count
				this.allMultipliersComplete = false; // Reset completion flag
				this.showingTotalWin = false; // Reset total win display flag
				// Initialize tracking on first spin in bonus mode
				if (!this.hasStartedBonusTracking) {
					this.cumulativeBonusWin = this.scatterBaseWin || 0;
					this.hasStartedBonusTracking = true;
				}
				const totalWinSoFar = this.cumulativeBonusWin;
				console.log(`[BonusHeader] REELS_START (bonus): cumulative bonus win so far = $${totalWinSoFar}`);

				// Clear the justSeededWin flag when first spin starts (scatter activation complete)
				if (this.justSeededWin) {
					this.justSeededWin = false;
					console.log('[BonusHeader] Cleared justSeededWin flag - first bonus spin starting');
				}

				// At the start of each bonus spin, show the cumulative TOTAL WIN so far.
				// During the spin, per-tumble updates will switch the label to "YOU WON".
				if (totalWinSoFar > 0) {
					if (this.youWonText) {
						this.youWonText.setText('TOTAL WIN');
					}
					this.showWinningsDisplay(totalWinSoFar);
				} else {
					this.hideWinningsDisplay();
					if (this.youWonText) {
						this.youWonText.setText('YOU WON');
					}
				}
			} else {
				// Normal mode behavior: hide winnings at the start of the spin
				this.hasStartedBonusTracking = false;
				this.cumulativeBonusWin = 0;
				this.scatterBaseWin = 0;
				this.justSeededWin = false;
				this.hideWinningsDisplay();
			}
		});

		// Listen for reel done events to show winnings display (like regular header)
		gameEventManager.on(GameEventType.REELS_STOP, (_data: any) => {
			console.log(`[BonusHeader] REELS_STOP received - checking for wins`);

			// BonusHeader should never render base-game wins.
			if (!gameStateManager.isBonus) {
				this.forceHideWinningsDisplay();
				console.log('[BonusHeader] Not in bonus mode - force-hiding bonus winbar');
				return;
			}

			// In bonus mode, per-spin display is handled on WIN_STOP; skip here to avoid label mismatch.
			if (gameStateManager.isBonus) {
				console.log('[BonusHeader] In bonus mode - skipping REELS_STOP winnings update (handled on WIN_STOP)');
				return;
			}
		});

		// On WIN_START during bonus, only handle non-tumble wins.
		// For tumble-based wins, the winnings display is driven exclusively by
		// TUMBLE_WIN_PROGRESS so that "YOU WON" appears tied to each tumble.
		gameEventManager.on(GameEventType.WIN_START, () => {
			if (!gameStateManager.isBonus) {
				return;
			}
			const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
			const spinData = symbolsComponent?.currentSpinData;

			// If this spin has tumbles, let TUMBLE_WIN_PROGRESS handle the "YOU WON"
			// label and values so the header updates are synchronized with tumbles.
			if (Array.isArray(spinData?.slot?.tumbles) && spinData.slot.tumbles.length > 0) {
				console.log('[BonusHeader] WIN_START (bonus): tumbles present - winnings display handled by TUMBLE_WIN_PROGRESS');
				return;
			}

			let spinWin = 0;
			
			// Check for paylines wins
			if (spinData?.slot?.paylines && spinData.slot.paylines.length > 0) {
				spinWin = this.calculateTotalWinFromPaylines(spinData.slot.paylines);
			}
			
			// Also check for tumbles (cluster wins) - they might not have paylines
			if (spinWin === 0 && Array.isArray(spinData?.slot?.tumbles) && spinData.slot.tumbles.length > 0) {
				spinWin = this.calculateTotalWinFromTumbles(spinData.slot.tumbles);
			}
			
			// Always change to "YOU WIN" or "YOU WON" when wins start (unless in initial scatter phase)
			if (!this.justSeededWin && this.youWonText) {
				this.youWonText.setText('YOU WIN');
			}
			
			if (spinWin > 0) {
				this.showWinningsDisplay(spinWin);
			} else {
				// Don't hide if we're showing cumulative total - only hide if truly no wins
				// The TUMBLE_WIN_PROGRESS will handle showing wins during tumbles
			}
		});

		// On WIN_STOP during bonus, finalize cumulative tracking and show "TOTAL WIN" for this spin
		gameEventManager.on(GameEventType.WIN_STOP, () => {
			if (!gameStateManager.isBonus) {
				return;
			}

			const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
			const spinData = symbolsComponent?.currentSpinData;

			// Calculate the total win for this spin (includes paylines + tumbles + multipliers)
			let spinWin = 0;
			try {
				const currentItem = this.getCurrentFreeSpinItem(spinData);
				if (currentItem) {
					// Use totalWin if available (includes multipliers), otherwise use subTotalWin
					const rawWin = (currentItem as any).totalWin ?? (currentItem as any).subTotalWin;
					if (typeof rawWin === 'number' && rawWin > 0) {
						spinWin = rawWin;
						console.log(`[BonusHeader] WIN_STOP (bonus): using item win=$${spinWin} from freespin item`);
					}
				}
				// Fallback: if freespin item total not available, manually sum paylines + tumbles
				if (spinWin === 0) {
					// Include paylines (if any)
					if (spinData?.slot?.paylines && spinData.slot.paylines.length > 0) {
						spinWin += this.calculateTotalWinFromPaylines(spinData.slot.paylines);
					}
					// Include tumble wins (cluster wins) if present
					if (Array.isArray(spinData?.slot?.tumbles) && spinData.slot.tumbles.length > 0) {
						const tumbleWin = this.calculateTotalWinFromTumbles(spinData.slot.tumbles);
						spinWin += tumbleWin;
					}
					if (spinWin > 0) {
						console.log(`[BonusHeader] WIN_STOP (bonus): fallback calculation = $${spinWin}`);
					}
				}
			} catch {}

			// Initialize cumulative tracking if needed
			if (!this.hasStartedBonusTracking) {
				this.cumulativeBonusWin = this.scatterBaseWin || 0;
				this.hasStartedBonusTracking = true;
			}

			// If this spin's win has not yet been accumulated (no TUMBLE_SEQUENCE_DONE or it had 0),
			// add it now. Otherwise, keep the already-accumulated total.
			if (!this.accumulatedThisSpin) {
				if (this.skipNextSpinAccumulation) {
					this.accumulatedThisSpin = true;
					this.skipNextSpinAccumulation = false;
					console.log('[BonusHeader] WIN_STOP (bonus): skipping accumulation (first spin already seeded)');
				} else {
					this.cumulativeBonusWin += (spinWin || 0);
					this.accumulatedThisSpin = true;
				}
			}

			console.log(`[BonusHeader] WIN_STOP (bonus): finalized cumulativeBonusWin=$${this.cumulativeBonusWin} (spinWin=$${spinWin})`);
			console.log(`[BonusHeader] WIN_STOP (bonus): multiplier status - expected=${this.expectedMultiplierCount}, received=${this.receivedMultiplierCount}, complete=${this.allMultipliersComplete}`);

			// If this was the last free spin, align the cumulative total to backend totalWin
			try {
				let isFinalSpin = false;
				if (gameStateManager.isBonusFinished) {
					isFinalSpin = true;
				} else {
					const currentItem = this.getCurrentFreeSpinItem(spinData);
					if (typeof currentItem?.spinsLeft === 'number' && currentItem.spinsLeft <= 1) {
						isFinalSpin = true;
					}
					try {
						const symbolsComponent = (this.bonusHeaderContainer.scene as any)?.symbols;
						const rem = symbolsComponent?.freeSpinAutoplaySpinsRemaining;
						if (typeof rem === 'number' && rem <= 0) {
							isFinalSpin = true;
						}
					} catch { }
				}

				if (isFinalSpin) {
					const formulaTotal = this.getTotalWinForDisplay(spinData, true);
					const backendTotal = this.calculateBackendTotalWin(spinData);
					const finalTotal = Math.max(this.cumulativeBonusWin, formulaTotal, backendTotal);
					if (finalTotal > 0) {
						this.cumulativeBonusWin = finalTotal;
						this.hasStartedBonusTracking = true;
						console.log(`[BonusHeader] WIN_STOP (bonus): aligned cumulative total for last spin=$${finalTotal} (formula=${formulaTotal}, backend=${backendTotal})`);
					}
				}
			} catch { }

			// Show "TOTAL WIN" with the cumulative total (all spins including scatter trigger) after multipliers complete
			const showTotalWinForSpin = () => {
				console.log(`[BonusHeader] showTotalWinForSpin called: spinWin=${spinWin}, cumulativeBonusWin=$${this.cumulativeBonusWin}, expectedMultipliers=${this.expectedMultiplierCount}, received=${this.receivedMultiplierCount}, complete=${this.allMultipliersComplete}`);

				// SAFETY: Only show TOTAL WIN if all multipliers are truly complete
				if (this.expectedMultiplierCount > 0 && !this.allMultipliersComplete) {
					console.warn('[BonusHeader] BLOCKED: Attempted to show TOTAL WIN before multipliers complete!');
					return;
				}

				// Mark that we're showing TOTAL WIN to prevent multipliers from overwriting
				this.showingTotalWin = true;

				// Add a short delay after last multiplier before showing TOTAL WIN
				// This gives players a moment to see the final multiplier calculation
				const displayDelay = this.expectedMultiplierCount > 0 ? 300 : 0;

				this.scene?.time.delayedCall(displayDelay, () => {
					// Always show cumulative total (includes scatter trigger win + all bonus spins)
					if (this.cumulativeBonusWin > 0) {
						// Stop any existing tweens to prevent conflicts
						if (this.scene) {
							this.scene.tweens.killTweensOf(this.youWonText);
							this.scene.tweens.killTweensOf(this.amountText);
						}

						// Set text to TOTAL WIN
						if (this.youWonText) {
							this.youWonText.setText('TOTAL WIN');
							this.youWonText.setVisible(true);
							console.log('[BonusHeader] Set youWonText to "TOTAL WIN" and visible');
						}

						// Show the cumulative total (scatter + all spins so far)
						this.showWinningsDisplay(this.cumulativeBonusWin);
						console.log(`[BonusHeader] WIN_STOP (bonus): ✅ SHOWING "TOTAL WIN" with cumulative total=$${this.cumulativeBonusWin}`);
					} else {
						// No cumulative win yet – leave the existing display unchanged
						console.log('[BonusHeader] WIN_STOP (bonus): cumulativeBonusWin is 0, leaving existing winnings display unchanged');
					}

					// Always emit event to signal that spin display phase is complete
					// This allows FreeSpinController to proceed to next spin
					gameEventManager.emit(GameEventType.BONUS_TOTAL_WIN_SHOWN);
				});
			};

			// If there are multipliers, wait for the completion flag before showing TOTAL WIN
			if (this.expectedMultiplierCount > 0) {
				console.log(`[BonusHeader] WIN_STOP (bonus): waiting for ${this.expectedMultiplierCount} multipliers to fully complete`);

				// Check if all multipliers are already complete
				if (this.allMultipliersComplete) {
					console.log('[BonusHeader] WIN_STOP (bonus): ✅ all multipliers already complete, showing TOTAL WIN NOW');
					showTotalWinForSpin();
				} else {
					// Set up a recurring check to see when all multipliers are complete
					console.log('[BonusHeader] WIN_STOP (bonus): setting up check for multiplier completion');
					let checkCompleted = false;
					const checkInterval = this.scene?.time.addEvent({
						delay: 50, // Check every 50ms
						repeat: -1, // Repeat indefinitely
						callback: () => {
							if (!checkCompleted && this.allMultipliersComplete) {
								checkCompleted = true;
								if (checkInterval) checkInterval.destroy();
								console.log(`[BonusHeader] WIN_STOP (bonus): ✅ all ${this.expectedMultiplierCount} multipliers complete, showing TOTAL WIN`);
								showTotalWinForSpin();
							}
						}
					});

					// Add a timeout in case completion flag is never set
					this.scene?.time.delayedCall(5000, () => {
						if (!checkCompleted) {
							checkCompleted = true;
							if (checkInterval) checkInterval.destroy();
							console.warn(`[BonusHeader] WIN_STOP (bonus): TIMEOUT waiting for completion flag (received ${this.receivedMultiplierCount}/${this.expectedMultiplierCount}), showing TOTAL WIN anyway`);
							showTotalWinForSpin();
						}
					});
				}
			} else {
				// No multipliers - show TOTAL WIN immediately
				console.log('[BonusHeader] WIN_STOP (bonus): no multipliers this spin, showing TOTAL WIN immediately');
				showTotalWinForSpin();
			}
		});
	}

	/**
	 * Count multipliers from the multipliers array in spin data
	 */
	private countMultipliersFromSpinData(spinData: any): number {
		try {
			// First, try to find the multipliers array in various locations
			let multipliersArray: any[] | undefined;

			// Check slot.multipliers
			if (Array.isArray(spinData?.slot?.multipliers)) {
				multipliersArray = spinData.slot.multipliers;
				console.log('[BonusHeader] Found multipliers array in slot.multipliers:', multipliersArray);
			}
			// Check slot.freespin.multipliers or slot.freeSpin.multipliers
			else if (Array.isArray(spinData?.slot?.freespin?.multipliers)) {
				multipliersArray = spinData.slot.freespin.multipliers;
				console.log('[BonusHeader] Found multipliers array in slot.freespin.multipliers:', multipliersArray);
			}
			else if (Array.isArray(spinData?.slot?.freeSpin?.multipliers)) {
				multipliersArray = spinData.slot.freeSpin.multipliers;
				console.log('[BonusHeader] Found multipliers array in slot.freeSpin.multipliers:', multipliersArray);
			}
			// Check current freespin item
			else {
				const fs = spinData?.slot?.freespin || spinData?.slot?.freeSpin;
				if (fs?.items && Array.isArray(fs.items)) {
					const slotAny: any = spinData?.slot || {};
					const area = slotAny.area;
					if (Array.isArray(area)) {
						const areaJson = JSON.stringify(area);
						const currentFreeSpinItem = fs.items.find((item: any) =>
							Array.isArray(item?.area) && JSON.stringify(item.area) === areaJson
						);
						if (currentFreeSpinItem && Array.isArray(currentFreeSpinItem.multipliers)) {
							multipliersArray = currentFreeSpinItem.multipliers;
							console.log('[BonusHeader] Found multipliers array in current freespin item:', multipliersArray);
						}
					}
				}
			}

			// If we found the multipliers array, return its length
			if (multipliersArray && Array.isArray(multipliersArray)) {
				const count = multipliersArray.length;
				console.log(`[BonusHeader] Counted ${count} multipliers from multipliers array:`, multipliersArray);
				return count;
			}

			// Fallback: count multiplier symbols in area by symbol ID
			console.warn('[BonusHeader] Multipliers array not found, falling back to counting symbol IDs in area');
			const area = spinData?.slot?.area;
			if (!Array.isArray(area)) return 0;

			let count = 0;
			// Multiplier symbol IDs: 20, 21, 22, 23, 24, 25, 26, 27, 28, 29 (x2 through x100)
			const multiplierIds = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29];

			for (const row of area) {
				if (Array.isArray(row)) {
					for (const symbolId of row) {
						if (multiplierIds.includes(Number(symbolId))) {
							count++;
						}
					}
				}
			}

			console.log(`[BonusHeader] Counted ${count} multipliers from area symbol IDs`);
			return count;
		} catch (e) {
			console.warn('[BonusHeader] Failed to count multipliers from spin data:', e);
			return 0;
		}
	}

	/**
	 * Update winnings display with subTotalWin from current spin data
	 * Hides display when no subTotalWin (similar to regular header behavior)
	 */
	public updateWinningsFromSpinData(spinData: any): void {
		if (!spinData) {
			console.warn('[BonusHeader] No spin data provided for winnings update');
			this.hideWinningsDisplay();
			return;
		}

		// Check if this is a free spin with subTotalWin (support freespin and freeSpin)
		const fs = spinData.slot?.freespin || spinData.slot?.freeSpin;
		if (fs?.items && fs.items.length > 0) {
			// Find the current free spin item (usually the first one with spinsLeft > 0)
			const currentFreeSpinItem = fs.items.find((item: any) => item.spinsLeft > 0);
			
			if (currentFreeSpinItem && currentFreeSpinItem.subTotalWin !== undefined) {
				const subTotalWin = currentFreeSpinItem.subTotalWin;
				console.log(`[BonusHeader] Found subTotalWin: $${subTotalWin}`);
				
				// Only show display if subTotalWin > 0, otherwise hide it
				if (subTotalWin > 0) {
					console.log(`[BonusHeader] Showing winnings display with subTotalWin: $${subTotalWin}`);
					this.updateWinningsDisplay(subTotalWin);
				} else {
					console.log(`[BonusHeader] subTotalWin is 0, hiding winnings display`);
					this.hideWinningsDisplay();
				}
				return;
			}
		}

		// Fallback: calculate from paylines if no subTotalWin available
		if (spinData.slot?.paylines && spinData.slot.paylines.length > 0) {
			const totalWin = this.calculateTotalWinFromPaylines(spinData.slot.paylines);
			console.log(`[BonusHeader] Calculated from paylines: $${totalWin}`);
			
			// Only show display if totalWin > 0, otherwise hide it
			if (totalWin > 0) {
				console.log(`[BonusHeader] Showing winnings display with payline calculation: $${totalWin}`);
				this.updateWinningsDisplay(totalWin);
			} else {
				console.log(`[BonusHeader] No wins from paylines, hiding winnings display`);
				this.hideWinningsDisplay();
			}
		} else {
			console.log('[BonusHeader] No win data available in spin data, hiding display');
			this.hideWinningsDisplay();
		}
	}

	/**
	 * Calculate total win from paylines (fallback method)
	 */
	private calculateTotalWinFromPaylines(paylines: any[]): number {
		let totalWin = 0;
		for (const payline of paylines) {
			if (payline.win && payline.win > 0) {
				totalWin += payline.win;
			}
		}
		return totalWin;
	}

	/**
	 * Calculate total win amount from tumbles array
	 */
	private calculateTotalWinFromTumbles(tumbles: any[]): number {
		if (!Array.isArray(tumbles) || tumbles.length === 0) {
			return 0;
		}
		let totalWin = 0;
		for (const tumble of tumbles) {
			const w = Number(tumble?.win || 0);
			totalWin += isNaN(w) ? 0 : w;
		}
		return totalWin;
	}

	resize(scene: Scene): void {
		if (this.bonusHeaderContainer) {
			this.bonusHeaderContainer.setSize(scene.scale.width, scene.scale.height);
		}
	}

	getContainer(): Phaser.GameObjects.Container {
		return this.bonusHeaderContainer;
	}

	destroy(): void {
		if (this.bonusHeaderContainer) {
			this.bonusHeaderContainer.destroy();
		}
	}
}
