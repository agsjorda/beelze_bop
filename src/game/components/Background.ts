import { Scene } from "phaser";
import { NetworkManager } from "../../managers/NetworkManager";
import { ScreenModeManager } from "../../managers/ScreenModeManager";
import { AssetConfig } from "../../config/AssetConfig";
import { gameStateManager } from "../../managers/GameStateManager";
import { ensureSpineFactory } from "../../utils/SpineGuard";

export class Background {
	private bgContainer!: Phaser.GameObjects.Container;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private normalBgCover: Phaser.GameObjects.Image | null = null;
	private bgDefault: Phaser.GameObjects.Image | null = null;
	private scene: Scene | null = null;
	// ADJUST HERE (Spine background): manual scale multipliers.
	// These affect the Spine background ONLY (NormalGame_BZ).
	// The Spine now scales to fit WIDTH (no left/right cropping, same as BG-Default).
	// - `spineBaseScaleMultiplier` is applied once when the Spine is created.
	// - `spineContainFitMultiplier` is applied during layout/resize (after width-fit).
	// Notes:
	// - 1 = normal (fills width), 0.95 = 95%, 1.05 = 105%.
	// - Values < 1 zoom out, > 1 zoom in (may crop top/bottom).
	private spineBaseScaleMultiplier: number = 1;
	private spineContainFitMultiplier: number = 0.8;
	// ADJUST HERE (BG-Default): scale multiplier for the static background image.
	// The BG-Default will scale to fit the screen WIDTH (preserving aspect ratio, no cropping).
	// - 1 = normal (fills width), 0.9 = 90% of width, 1.1 = 110% of width.
	// - Values < 1 will show less of the image (zoom out), > 1 will zoom in (may crop top/bottom).
	// NOTE: BG-Default is hidden when the Spine background is enabled.
	// If you don't see any change when adjusting this, set `preferSpineBackground = false` below.
	private bgDefaultScaleMultiplier: number = 1;
	// ADJUST HERE: set false to use BG-Default instead of the Spine background.
	// When true, Spine is shown and BG-Default becomes a fallback (hidden).
	private preferSpineBackground: boolean = true;
	// ADJUST HERE: controls how tall the bottom overlay (normal-bg-cover) is.
	// Value is a ratio of the *scene height* (e.g. 0.9 = 90% of the screen height).
	// Width stays locked to the scene width; height is scaled independently (can distort).
	private coverHeightPercentOfScene: number = 0.5;
	// Adjust this to move the bottom overlay (normal-bg-cover) higher/lower.
	// Set to 0 to make the bottom edge of the image sit exactly on the bottom edge of the game scene.
	// Positive value moves it up; negative value moves it down.
	private coverBottomOffsetPx: number = 0;
	// Cloud background variables removed
	private shineInstances: Phaser.GameObjects.Image[] = [];
	private activeShineCount: number = 0;
	private readonly MAX_SHINES: number = 5;
	private shineTimer: Phaser.Time.TimerEvent | null = null;
	private normalGameSpine: any = null; // Spine animation for NormalGame_BZ
	private oldFilterOverlay: any = null; // Foreground overlay spine

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	preload(scene: Scene): void {
		// Assets are now loaded centrally through AssetConfig in Preloader
		console.log(`[Background] Assets loaded centrally through AssetConfig`);
	}

	create(scene: Scene): void {
		console.log("[Background] Creating background elements");

		// Store scene reference
		this.scene = scene;

		// Create main container for all background elements
		this.bgContainer = scene.add.container(0, 0);

		const assetScale = this.networkManager.getAssetScale();

		console.log(`[Background] Creating background with scale: ${assetScale}x`);

		// Add background layers
		this.createBackgroundLayers(scene, assetScale);
		this.layout(scene);

		// Add decorative elements
		//this.createDecorativeElements(scene, assetScale);

		// Add UI elements
		//this.createUIElements(scene, assetScale);

		// Setup bonus mode listener to toggle cover visibility
		this.setupBonusModeListener(scene);
	}

	private createBackgroundLayers(scene: Scene, assetScale: number): void {
		// BG-Default: full-scene background image
		this.bgDefault = scene.add.image(
			scene.scale.width * 0.5,
			scene.scale.height * 0.5,
			'BG-Default'
		).setOrigin(0.5, 0.5);
		this.bgContainer.add(this.bgDefault);

		// normal-bg-cover: foreground overlay (controller area). Keep it out of the container
		// so its depth can reliably sit above symbols/winlines if needed.
		this.normalBgCover = scene.add.image(
			scene.scale.width * 0.5,
			scene.scale.height * 0.776,
			'normal-bg-cover'
		).setOrigin(0.5, 0.5).setDepth(850);

		// Add shine effect (if needed)
		this.createShineEffect(scene, assetScale);

		// Create Spine animation background if needed (will be layered between the two if visible)
		this.createNormalGameSpine(scene, assetScale);
		// Foreground overlay (Old Filter) sits above playfield
		this.createForegroundOverlay(scene, assetScale);
	}

	private scaleImageToWidth(image: Phaser.GameObjects.Image, targetWidth: number): void {
		const sourceWidth = image.width;
		if (!sourceWidth) return;
		image.setScale(targetWidth / sourceWidth);
	}

	/**
	 * Create the NormalGame_BZ Spine animation background
	 */
	private createNormalGameSpine(scene: Scene, assetScale: number): void {
		try {
			if (!this.preferSpineBackground) {
				// Using BG-Default only.
				if (this.bgDefault) this.bgDefault.setVisible(true);
				if (this.normalGameSpine) {
					try { this.normalGameSpine.setVisible(false); } catch { }
				}
				return;
			}

			if (!ensureSpineFactory(scene, '[Background] createNormalGameSpine')) {
				console.warn('[Background] Spine factory not available yet; will retry shortly');
				scene.time.delayedCall(250, () => this.createNormalGameSpine(scene, assetScale));
				return;
			}

			// Check if the spine assets are loaded
			if (!scene.cache.json.has('NormalGame_BZ')) {
				console.warn('[Background] NormalGame_BZ spine assets not loaded yet, will retry later');
				scene.time.delayedCall(1000, () => {
					this.createNormalGameSpine(scene, assetScale);
				});
				return;
			}

			// Create spine animation at center of screen
			const centerX = scene.scale.width * 0.5;
			const centerY = scene.scale.height * 0.5;

			this.normalGameSpine = scene.add.spine(
				centerX,
				centerY,
				'NormalGame_BZ',
				'NormalGame_BZ-atlas'
			);

			// Set properties
			this.normalGameSpine.setOrigin(0.5, 0);
			// ADJUST HERE (Spine background): base scale multiplier.
			// This is the earliest place the Spine scale is set (but layout() will recalculate it).
			const initialScale = assetScale * Phaser.Math.Clamp(this.spineBaseScaleMultiplier, 0, 5);
			this.normalGameSpine.setScale(initialScale);
			console.log(`[Background] Spine initial scale set to: ${initialScale} (assetScale: ${assetScale})`);
			try {
				const state: any = this.normalGameSpine.animationState;
				if (state && typeof state.setAnimation === 'function') {
					state.setAnimation(0, 'NormalGame_BZ_idle', true);
					console.log('[Background] Playing NormalGame_BZ_idle animation');
				}
			} catch (e) {
				console.warn('[Background] Failed to start NormalGame_BZ_idle animation:', e);
			}

			// Add to container
			this.bgContainer.add(this.normalGameSpine);
			// BG-Default is a static fallback; when Spine is available, prefer Spine.
			if (this.bgDefault) this.bgDefault.setVisible(false);
			// Delay layout slightly to ensure Spine skeleton is fully initialized before getting bounds.
			scene.time.delayedCall(50, () => {
				this.layout(scene);
			});

			console.log('[Background] NormalGame_BZ Spine animation created successfully');
		} catch (error) {
			console.error('[Background] Error creating NormalGame_BZ Spine animation:', error);
		// If Spine fails, keep the BG-Default fallback visible.
		if (this.bgDefault) {
			this.bgDefault.setVisible(true);
		}
		this.normalGameSpine = null;
	}
}

private fitSpineContain(scene: Scene, spineObj: any, targetWidth: number, targetHeight: number): void {
	try {
		console.log(`[Background] fitSpineContain called, targetWidth=${targetWidth}, targetHeight=${targetHeight}`);
		
		if (!spineObj || typeof spineObj.getBounds !== 'function') {
			console.warn('[Background] fitSpineContain: Spine object invalid or no getBounds');
			return;
		}

		// RESET to scale 1 first to get true bounds, then calculate target scale.
		spineObj.setScale(1, 1);
		const baseBounds = spineObj.getBounds();
		const baseWidth = Number(baseBounds?.width ?? 0);
		const baseHeight = Number(baseBounds?.height ?? 0);
		console.log(`[Background] Spine base bounds at scale 1: width=${baseWidth.toFixed(1)}, height=${baseHeight.toFixed(1)}`);
		
		if (!Number.isFinite(baseWidth) || baseWidth <= 0) {
			console.warn('[Background] fitSpineContain: Invalid base width:', baseWidth);
			return;
		}
		if (!Number.isFinite(baseHeight) || baseHeight <= 0) {
			console.warn('[Background] fitSpineContain: Invalid base height:', baseHeight);
			return;
		}

		// FIT TO WIDTH: scale the Spine to match screen width (preserves aspect, no left/right crop).
		// ADJUST HERE (Spine background): change `spineContainFitMultiplier` at the top to zoom in/out.
		// Values < 1 zoom out (show more), > 1 zoom in (may crop top/bottom).
		const scaleFactor = targetWidth / baseWidth; // Fit to width only
		if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
			console.warn('[Background] fitSpineContain: Invalid scale factor:', scaleFactor);
			return;
		}
		const tweak = Phaser.Math.Clamp(this.spineContainFitMultiplier, 0.25, 2);
		const finalScale = scaleFactor * tweak;
		spineObj.setScale(finalScale, finalScale);

		// Recenter using bounds (more reliable than origin for Spine).
		const boundsAfterScale = spineObj.getBounds();
		const dx = (targetWidth * 0.5) - Number(boundsAfterScale?.centerX ?? targetWidth * 0.5);
		const dy = (targetHeight * 0.5) - Number(boundsAfterScale?.centerY ?? targetHeight * 0.5);
		if (Number.isFinite(dx)) spineObj.x += dx;
		if (Number.isFinite(dy)) spineObj.y += dy;

		console.log(`[Background] Spine final scale: ${finalScale.toFixed(3)} (width-fit: ${scaleFactor.toFixed(3)} * multiplier: ${tweak})`);
	} catch (e) {
		console.warn('[Background] fitSpineContain failed:', e);
	}
}

	//adjustments for the background layout
	private layout(scene: Scene): void {
		const width = scene.scale.width;
		const height = scene.scale.height;

		if (this.bgDefault) {
			this.bgDefault.setPosition(width * 0.5, height * 0.5);
			// ADJUST HERE (BG-Default): fit to width with aspect ratio preserved.
			// Change `bgDefaultScaleMultiplier` above to adjust the scale (0.95 = 95% of screen width).
			const sourceWidth = this.bgDefault.width;
			if (sourceWidth > 0) {
				const multiplier = Phaser.Math.Clamp(this.bgDefaultScaleMultiplier, 0.1, 5);
				const targetScale = (width / sourceWidth) * multiplier;
				this.bgDefault.setScale(targetScale);
			}
		}

		if (this.normalGameSpine) {
		this.normalGameSpine.setPosition(width * 0.5, 0);
		// ADJUST HERE (Spine background): Direct width-based scaling.
		// The Spine reference width is 428px (full canvas width at 1x asset scale).
		// Change `spineContainFitMultiplier` at the top to zoom in/out (0.8 = 80% of width).
		const referenceWidth = 428; // Known reference width for this Spine at scale 1
		const baseScale = width / referenceWidth; // Scale to fit current canvas width
		const finalScale = baseScale * Phaser.Math.Clamp(this.spineContainFitMultiplier, 0.1, 3);
		this.normalGameSpine.setScale(finalScale);
		console.log(`[Background] Spine scaled to ${finalScale.toFixed(3)} (base: ${baseScale.toFixed(3)} * multiplier: ${this.spineContainFitMultiplier})`);	}
		if (this.normalBgCover) {
			// Height adjuster (percentage): change `coverHeightPercentOfScene` above.
			// this.coverHeightPercentOfScene = 0.45; //adjust normal bg cover height
			const pct = Phaser.Math.Clamp(this.coverHeightPercentOfScene, 0, 1);
			const scaleX = this.normalBgCover.width ? (width / this.normalBgCover.width) : 1;
			const scaleY = this.normalBgCover.height ? ((height * pct) / this.normalBgCover.height) : 1;
			this.normalBgCover.setScale(scaleX, scaleY);

			const coverHalfHeight = this.normalBgCover.displayHeight * 0.5;
			// Bottom-edge aligned positioning:
			// With origin (0.5, 0.5), bottom edge is at (y + displayHeight/2).
			// So to align the bottom edge to the bottom of the scene: y = height - displayHeight/2.
			const y = height - coverHalfHeight - this.coverBottomOffsetPx;
			this.normalBgCover.setPosition(width * 0.5, y);
		}

		if (this.oldFilterOverlay) {
			this.fitSpineCover(scene, this.oldFilterOverlay, width, height);
			this.oldFilterOverlay.setDepth(9000);
		}
	}

	private createForegroundOverlay(scene: Scene, assetScale: number): void {
		try {
			if (!ensureSpineFactory(scene, '[Background] createForegroundOverlay')) {
				console.warn('[Background] Spine factory not available for foreground overlay; will retry shortly');
				scene.time.delayedCall(250, () => this.createForegroundOverlay(scene, assetScale));
				return;
			}

			if (!scene.cache.json.has('Old_Filter_Overlay')) {
				console.warn('[Background] Old_Filter_Overlay spine assets not loaded yet, will retry later');
				scene.time.delayedCall(1000, () => {
					this.createForegroundOverlay(scene, assetScale);
				});
				return;
			}

			const centerX = scene.scale.width * 0.5;
			const centerY = scene.scale.height * 0.5;

			this.oldFilterOverlay = scene.add.spine(
				centerX,
				centerY,
				'Old_Filter_Overlay',
				'Old_Filter_Overlay-atlas'
			);
			this.oldFilterOverlay.setOrigin(0.5, 0.5);
			this.oldFilterOverlay.setDepth(9000);
			try {
				const state: any = this.oldFilterOverlay.animationState;
				if (state && typeof state.setAnimation === 'function') {
					state.setAnimation(0, 'Overlay', true);
					state.timeScale = 0.2; // Adjust speed overlay animation speed
					console.log('[Background] Playing Old_Filter_Overlay animation');
				}
			} catch (e) {
				console.warn('[Background] Failed to start Old_Filter_Overlay animation:', e);
			}

			scene.time.delayedCall(50, () => {
				this.layout(scene);
			});
		} catch (error) {
			console.error('[Background] Error creating foreground overlay:', error);
		}
	}

	private fitSpineCover(scene: Scene, spineObj: any, targetWidth: number, targetHeight: number): void {
		try {
			if (!spineObj || typeof spineObj.getBounds !== 'function') return;
			spineObj.setScale(1, 1);
			const baseBounds = spineObj.getBounds();
			const baseWidth = Number(baseBounds?.width ?? 0);
			const baseHeight = Number(baseBounds?.height ?? 0);
			if (!Number.isFinite(baseWidth) || baseWidth <= 0) return;
			if (!Number.isFinite(baseHeight) || baseHeight <= 0) return;

			const scaleFactor = Math.max(targetWidth / baseWidth, targetHeight / baseHeight);
			if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return;
			spineObj.setScale(scaleFactor, scaleFactor);

			const boundsAfterScale = spineObj.getBounds();
			const dx = (targetWidth * 0.5) - Number(boundsAfterScale?.centerX ?? targetWidth * 0.5);
			const dy = (targetHeight * 0.5) - Number(boundsAfterScale?.centerY ?? targetHeight * 0.5);
			if (Number.isFinite(dx)) spineObj.x += dx;
			if (Number.isFinite(dy)) spineObj.y += dy;
		} catch (e) {
			console.warn('[Background] fitSpineCover failed:', e);
		}
	}

	// Shine effect creation
	private createShineEffect(scene: Scene, assetScale: number): void {
		// Create pool of shine images (max 5)
		for (let i = 0; i < this.MAX_SHINES; i++) {
			const shine = scene.add.image(0, 0, 'shine')
				.setOrigin(0.5, 0.5)
				.setScale(0)
				.setAlpha(1)
				.setDepth(3) // Above clouds but below UI elements
				.setVisible(false);
			this.shineInstances.push(shine);
		}

		// Start the random shine animation cycle
		this.scheduleNextShine(scene, assetScale);
	}

	private scheduleNextShine(scene: Scene, assetScale: number): void {
		// Random delay between 2-5 seconds before next shine appears
		const delay = Phaser.Math.Between(400, 700);

		this.shineTimer = scene.time.delayedCall(delay, () => {
			// Only create new shine if we haven't reached the max
			if (this.activeShineCount < this.MAX_SHINES) {
				this.playShineAnimation(scene, assetScale);
			}
			// Always schedule the next attempt
			this.scheduleNextShine(scene, assetScale);
		});
	}

	private playShineAnimation(scene: Scene, assetScale: number): void {
		// Find an available shine instance
		const shine = this.shineInstances.find(s => !s.visible);
		if (!shine) return; // All shines are active

		// Increment active count
		this.activeShineCount++;

		// Define the area where shine can appear (from top until 1/4 of the screen)
		// Adjust these values to control the range
		const minX = scene.scale.width * 0;
		const maxX = scene.scale.width * 1;
		const minY = scene.scale.height * 0;
		const maxY = scene.scale.height * 0.25;

		// Random position within the defined area
		const randomX = Phaser.Math.Between(minX, maxX);
		const randomY = Phaser.Math.Between(minY, maxY);

		// Set position and initial state
		shine.setPosition(randomX, randomY);
		shine.setScale(0);
		shine.setAlpha(1);
		shine.setVisible(true);

		// Scale up animation
		const scaleUpDuration = 400;
		const scaleDownDuration = 400;
		const holdDuration = 200;
		const maxScale = assetScale * Phaser.Math.FloatBetween(0.8, 1.2); // Random scale variation

		scene.tweens.add({
			targets: shine,
			scale: maxScale,
			duration: scaleUpDuration,
			ease: 'Sine.easeOut',
			onComplete: () => {
				// Hold at max scale briefly
				scene.time.delayedCall(holdDuration, () => {
					if (shine && shine.visible) {
						// Scale down animation
						scene.tweens.add({
							targets: shine,
							scale: 0,
							duration: scaleDownDuration,
							ease: 'Sine.easeIn',
							onComplete: () => {
								if (shine) {
									shine.setVisible(false);
								}
								// Decrement active count
								this.activeShineCount = Math.max(0, this.activeShineCount - 1);
							}
						});
					}
				});
			}
		});
	}


	resize(scene: Scene): void {
		if (this.bgContainer) {
			this.bgContainer.setSize(scene.scale.width, scene.scale.height);
		}
		this.layout(scene);
	}

	getContainer(): Phaser.GameObjects.Container {
		return this.bgContainer;
	}

	/**
	 * Clean up shine effect when component is destroyed
	 */
	destroy(): void {
		if (this.shineTimer) {
			this.shineTimer.destroy();
			this.shineTimer = null;
		}
		// Destroy all shine instances
		this.shineInstances.forEach(shine => {
			if (shine) {
				shine.destroy();
			}
		});
		this.shineInstances = [];
		this.activeShineCount = 0;

		// Destroy Spine animation
		if (this.normalGameSpine) {
			try {
				this.normalGameSpine.destroy();
			} catch (e) {
				console.warn('[Background] Error destroying Spine animation:', e);
			}
			this.normalGameSpine = null;
		}
		if (this.oldFilterOverlay) {
			try {
				this.oldFilterOverlay.destroy();
			} catch (e) {
				console.warn('[Background] Error destroying foreground overlay:', e);
			}
			this.oldFilterOverlay = null;
		}
	}

	/**
	 * Setup listener for bonus mode changes to toggle cover visibility
	 */
	private setupBonusModeListener(scene: Scene): void {
		// Listen for bonus mode events
		scene.events.on('setBonusMode', (isBonus: boolean) => {
			// Hide/show Spine animation based on bonus mode
			if (this.normalGameSpine) {
				this.normalGameSpine.setVisible(!isBonus);
				console.log(`[Background] NormalGame_BZ Spine visibility set to: ${!isBonus} (isBonus: ${isBonus})`);
			}

			if (this.normalBgCover) {
				// Show normal cover only when NOT in bonus mode (fallback if Spine not used)
				this.normalBgCover.setVisible(!isBonus);
				console.log(`[Background] Normal bg cover visibility set to: ${!isBonus} (isBonus: ${isBonus})`);
			}
			// Cloud middle visibility logic removed
		});

		// Set initial visibility based on current bonus state
		const isBonus = gameStateManager.isBonus;
		if (this.normalGameSpine) {
			this.normalGameSpine.setVisible(!isBonus);
			console.log(`[Background] Initial NormalGame_BZ Spine visibility: ${!isBonus} (isBonus: ${isBonus})`);
		}
		if (this.normalBgCover) {
			this.normalBgCover.setVisible(!isBonus);
			console.log(`[Background] Initial normal bg cover visibility: ${!isBonus} (isBonus: ${isBonus})`);
		}
		// Initial cloud middle visibility logic removed
	}
}
