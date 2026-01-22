import { Scene } from "phaser";
import { NetworkManager } from "../../managers/NetworkManager";
import { ScreenModeManager } from "../../managers/ScreenModeManager";
import { gameEventManager, GameEventType } from '../../event/EventManager';
import { gameStateManager } from '../../managers/GameStateManager';

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
	// Track if we've already accumulated this spin's total (prevents double add with WIN_STOP)
	private accumulatedThisSpin: boolean = false;
	// Multiplier arrival progressive display
	private multiplierCumulative: number = 0;
	private multiplierSpinTotal: number = 0;
	private multipliersActive: boolean = false; // Track if multipliers are currently animating
	private scene: Scene | null = null;
	// Track if we just seeded the win to prevent immediate text overrides
	private justSeededWin: boolean = false;

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
		
		// Initialize winnings display - start hidden
		this.initializeWinnings();
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
		this.createWinBarText(scene, scene.scale.width * 0.5, scene.scale.height * 0.215);
	}

	private createLandscapeBonusHeader(scene: Scene, assetScale: number): void {
		console.log("[BonusHeader] Creating landscape bonus header layout");


		// Create winnings text at a stable position
		this.createWinBarText(scene, scene.scale.width * 0.5, scene.scale.height * 0.215);
	}

	private createWinBarText(scene: Scene, x: number, y: number): void {
		// Line 1: "YOU WON"
		this.youWonText = scene.add.text(x, y - 7, 'YOU WON', {
			fontSize: '18px',
			color: '#ffffff',
			fontFamily: 'Poppins-Bold',
			stroke: '#99030A',
			strokeThickness: 3
		}).setOrigin(0.5, 0.5).setDepth(602); // Above cloud middle (601) and symbols (600)
		// Don't add to container - add directly to scene so depth works correctly

		// Line 2: amount value
		// Check if demo mode is active - if so, use blank currency symbol
		const isDemoInitial = (this.scene as any)?.gameAPI?.getDemoState();
		const currencySymbolInitial = isDemoInitial ? '' : '$';
		this.amountText = scene.add.text(x, y + 18, `${currencySymbolInitial}${currencySymbolInitial ? ' ' : ''}0.00`, {
			fontSize: '24px',
			color: '#FFB837',
			fontFamily: 'Poppins-Bold',
			stroke: '#99030A',
			strokeThickness: 3
		}).setOrigin(0.5, 0.5).setDepth(602); // Above cloud middle (601) and symbols (600)
		// Don't add to container - add directly to scene so depth works correctly
		
		// Hide by default - only show when bonus is triggered
		this.youWonText.setVisible(false);
		this.amountText.setVisible(false);
	}

	/**
	 * Update the winnings display in the bonus header with scale in animation
	 */
	public updateWinningsDisplay(winnings: number): void {
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
		
		// For bonus mode, we only show per-tumble "YOU WON" values.
		// Seed the cumulative tracker silently; UI will be driven by tumble events.
		console.log(`[BonusHeader] Seeded cumulative bonus win with scatter base (tracking only): $${this.scatterBaseWin}`);
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
	 * Hide the winnings display (both "YOU WON" text and amount) with shrink animation
	 */
	public hideWinningsDisplay(): void {
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
	 * Show the winnings display with both "YOU WON" text and amount with scale in animation
	 */
	public showWinningsDisplay(winnings: number): void {
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
		// Check if demo mode is active - if so, use blank currency symbol
		const isDemo = (this.scene as any)?.gameAPI?.getDemoState();
		const currencySymbol = isDemo ? '' : '$';
		const formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		return `${currencySymbol}${currencySymbol ? ' ' : ''}${formatted}`;
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
				
				// Prefer totalWin from the matching freespin item (backend per-spin total),
				// matched by area so we always use the correct item for this spin.
				// Fall back to subTotalWin, then to a manual tumble+payline sum.
				let spinWin = 0;
				try {
					const slotAny: any = spinData?.slot || {};
					const fs = slotAny.freespin || slotAny.freeSpin;
					const items = Array.isArray(fs?.items) ? fs.items : [];
					const area = slotAny.area;

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
								spinWin = itemTotal;
								console.log(`[BonusHeader] TUMBLE_SEQUENCE_DONE: using freespin item totalWin=$${itemTotal}`);
							}
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
					this.cumulativeBonusWin += spinWin;
					this.accumulatedThisSpin = true;
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
				} else {
					// Keep a consistent spin total if not primed yet
					if (this.multiplierSpinTotal === 0) this.multiplierSpinTotal = spinTotal;
				}
				if (weight > 0 && spinTotal > 0) {
					this.multiplierCumulative += weight;
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

		// Listen for spin events to hide winnings display at start of manual spin
		gameEventManager.on(GameEventType.SPIN, () => {
			console.log('[BonusHeader] Manual spin started - hiding winnings display');
			this.hideWinningsDisplay();
		});

		// Listen for autoplay start to hide winnings display
		gameEventManager.on(GameEventType.AUTO_START, () => {
			console.log('[BonusHeader] Auto play started - hiding winnings display');
			this.hideWinningsDisplay();
		});

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
		gameEventManager.on(GameEventType.REELS_STOP, (data: any) => {
			console.log(`[BonusHeader] REELS_STOP received - checking for wins`);

			// In bonus mode, per-spin display is handled on WIN_STOP; skip here to avoid label mismatch
			if (gameStateManager.isBonus) {
				console.log('[BonusHeader] In bonus mode - skipping REELS_STOP winnings update (handled on WIN_STOP)');
				return;
			}
			
			// Get the current spin data from the Symbols component
			const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
			if (symbolsComponent && symbolsComponent.currentSpinData) {
				const spinData = symbolsComponent.currentSpinData;
				console.log(`[BonusHeader] Found current spin data:`, spinData);
				
				// Use the same logic as regular header - calculate from paylines
				if (spinData.slot && spinData.slot.paylines && spinData.slot.paylines.length > 0) {
					const totalWin = this.calculateTotalWinFromPaylines(spinData.slot.paylines);
					console.log(`[BonusHeader] Total winnings calculated from paylines: ${totalWin}`);
					
					if (totalWin > 0) {
						this.showWinningsDisplay(totalWin);
					} else {
						this.hideWinningsDisplay();
					}
				} else {
					console.log('[BonusHeader] No paylines in current spin data - hiding winnings display');
					this.hideWinningsDisplay();
				}
			} else {
				console.log('[BonusHeader] No current spin data available - hiding winnings display');
				this.hideWinningsDisplay();
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

		// On WIN_STOP during bonus, finalize cumulative tracking (UI stays per-tumble "YOU WON")
		gameEventManager.on(GameEventType.WIN_STOP, () => {
			if (!gameStateManager.isBonus) {
				return;
			}

			const symbolsComponent = (this.bonusHeaderContainer.scene as any).symbols;
			const spinData = symbolsComponent?.currentSpinData;
			
			// Use subTotalWin from the current freespin item (includes paylines + tumbles)
			let spinWin = 0;
			try {
				const fs = spinData?.slot?.freespin || spinData?.slot?.freeSpin;
				if (fs?.items && Array.isArray(fs.items)) {
					const currentFreeSpinItem = fs.items.find((item: any) => item.spinsLeft > 0);
					if (currentFreeSpinItem && typeof currentFreeSpinItem.subTotalWin === 'number') {
						spinWin = currentFreeSpinItem.subTotalWin;
						console.log(`[BonusHeader] WIN_STOP (bonus): using subTotalWin=$${spinWin} from freespin item`);
					}
				}
				// Fallback: if subTotalWin not available, manually sum paylines + tumbles
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
				this.cumulativeBonusWin += (spinWin || 0);
				this.accumulatedThisSpin = true;
			}

			console.log(`[BonusHeader] WIN_STOP (bonus): finalized cumulativeBonusWin=$${this.cumulativeBonusWin} (spinWin=$${spinWin})`);
			// Do not change label or display here; per bonus-mode UX we only show "YOU WON"
			// per tumble via TUMBLE_WIN_PROGRESS. The cumulative total is tracked internally
			// for potential end-of-bonus dialogs or other UI, not for the bonus header label.
		});
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
