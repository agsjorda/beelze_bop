import { Scene } from "phaser";
import { NetworkManager } from "../../managers/NetworkManager";
import { ScreenModeManager } from "../../managers/ScreenModeManager";
import { gameStateManager } from "../../managers/GameStateManager";
import { gameEventManager, GameEventType } from "../../event/EventManager";

export class BonusBackground {
	private bonusContainer!: Phaser.GameObjects.Container;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private bonusBg: any = null; // Spine animation object
	private bonusBgCover: Phaser.GameObjects.Image | null = null;
    private bonusSpine: any = null; // Spine animation object
	private scene: Scene | null = null;
	
	// ============================================
	// ADJUST HERE: Vertical offset for bonus background image
	// ============================================
	// Controls the vertical position of the bonus background spine animation
	// 0 = centered vertically on screen
	// Positive values = move DOWN (e.g., 50 moves image 50px down)
	// Negative values = move UP (e.g., -50 moves image 50px up)
	private bonusBackgroundYOffset: number = -200;
	
	// ============================================
	// ADJUST HERE: Vertical offset for bonus-bg-cover overlay
	// ============================================
	// Controls the vertical position of the bonus-bg-cover overlay
	// 0 = default position (height * 0.776)
	// Positive values = move DOWN from default (e.g., 50 moves cover 50px down)
	// Negative values = move UP from default (e.g., -50 moves cover 50px up)
	private bonusBgCoverYOffset: number = 20;

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	preload(scene: Scene): void {
		// Assets are loaded centrally through AssetConfig in Preloader
		console.log(`[BonusBackground] Assets loaded centrally through AssetConfig`);
	}

	create(scene: Scene): void {
		console.log("[BonusBackground] Creating bonus background elements");
		
		// Store scene reference
		this.scene = scene;
		
		// Create main container for all bonus background elements
	// Set depth to -1 so it's behind symbols (0-600) and all other game elements
	this.bonusContainer = scene.add.container(0, 0);
	this.bonusContainer.setDepth(-1);
		const assetScale = this.networkManager.getAssetScale();
		
		console.log(`[BonusBackground] Creating bonus background with scale: ${assetScale}x`);

		// Add bonus background elements
		this.createBonusElements(scene, assetScale);
		this.layout(scene);
		
		// Setup bonus mode listener to toggle cover visibility
		this.setupBonusModeListener(scene);
	}

	private createBonusElements(scene: Scene, assetScale: number): void {
		const screenConfig = this.screenModeManager.getScreenConfig();
		
		if (screenConfig.isPortrait) {
			this.createPortraitBonusBackground(scene, assetScale);
		} else {
			this.createLandscapeBonusBackground(scene, assetScale);
		}

		// Add spine animation for bonus mode
		// Assumes 'bonus_character' spine asset is loaded in AssetConfig
		this.bonusSpine = (scene.add as any).spine(
			scene.scale.width * 0.5,
			scene.scale.height * 0.5,
			'character2', // key for bonus character
			'character2-atlas'
		);
		if (this.bonusSpine) {
			this.bonusSpine.setScale(0.18);
			this.bonusSpine.setDepth(10);
			this.bonusSpine.setVisible(false); // Only show in bonus mode
			this.bonusContainer.add(this.bonusSpine);
		}
	}

	private createPortraitBonusBackground(scene: Scene, assetScale: number): void {
		console.log("[BonusBackground] Creating portrait bonus background layout");
		
		// Main bonus background spine animation - depth relative to container (container is at depth 1)
		this.bonusBg = (scene.add as any).spine(
			scene.scale.width * 0.5,
			scene.scale.height * 0.5,
			'BonusGame_BZ',
			'BonusGame_BZ-atlas'
		);
		if (this.bonusBg) {
			this.bonusBg.setOrigin(0.5, 0.5);
			this.bonusBg.setDepth(0);
			// Scale to cover screen
			const scaleX = scene.scale.width / (this.bonusBg.width || 1);
			const scaleY = scene.scale.height / (this.bonusBg.height || 1);
			const scale = Math.max(scaleX, scaleY);
			this.bonusBg.setScale(scale);
			// Play idle animation
			try {
				const animState = this.bonusBg.animationState;
				if (animState && typeof animState.setAnimation === 'function') {
					animState.setAnimation(0, 'BonusGame_BZ_idle', true);
					console.log('[BonusBackground] Playing BonusGame_BZ_idle animation');
				}
			} catch (e) {
				console.warn('[BonusBackground] Failed to play bonus bg animation:', e);
			}
			this.bonusContainer.add(this.bonusBg);
		}

		// Bonus cover overlay (centered)
		// Add directly to scene with depth 850 (above symbols 0-600, winlines 800, but below controller 900)
		this.bonusBgCover = scene.add.image(
			scene.scale.width * 0.5,
			scene.scale.height * 0.776,
			'bonus-bg-cover'
		).setOrigin(0.5, 0.5).setDepth(850);
		// Initially hidden, will be shown when bonus mode is active
		this.bonusBgCover.setVisible(false);
		// Don't add to container - add directly to scene so depth works correctly
		// Visibility will be controlled by bonus mode listener
		console.log('[BonusBackground] Created bonus-bg-cover at depth 850, initially hidden');


	}

	private createLandscapeBonusBackground(scene: Scene, assetScale: number): void {
		console.log("[BonusBackground] Creating landscape bonus background layout");
		
		// Main bonus background spine animation - depth relative to container (container is at depth 1)
		this.bonusBg = (scene.add as any).spine(
			scene.scale.width * 0.5,
			scene.scale.height * 0.5,
			'BonusGame_BZ',
			'BonusGame_BZ-atlas'
		);
		if (this.bonusBg) {
			this.bonusBg.setOrigin(0.5, 0.5);
			this.bonusBg.setDepth(0);
			// Scale to cover screen
			const scaleX = scene.scale.width / (this.bonusBg.width || 1);
			const scaleY = scene.scale.height / (this.bonusBg.height || 1);
			const scale = Math.max(scaleX, scaleY);
			this.bonusBg.setScale(scale);
			// Play idle animation
			try {
				const animState = this.bonusBg.animationState;
				if (animState && typeof animState.setAnimation === 'function') {
					animState.setAnimation(0, 'BonusGame_BZ_idle', true);
					console.log('[BonusBackground] Playing BonusGame_BZ_idle animation');
				}
			} catch (e) {
				console.warn('[BonusBackground] Failed to play bonus bg animation:', e);
			}
			this.bonusContainer.add(this.bonusBg);
		}

		// Bonus cover overlay
		// Add directly to scene with depth 850 (above symbols 0-600, winlines 800, but below controller 900)
		this.bonusBgCover = scene.add.image(
			scene.scale.width * 0.5,
			scene.scale.height * 0.5,
			'bonus-bg-cover'
		).setOrigin(0.5, 0.5).setDepth(850);
		// Initially hidden, will be shown when bonus mode is active
		this.bonusBgCover.setVisible(false);
		// Don't add to container - add directly to scene so depth works correctly
		// Visibility will be controlled by bonus mode listener
		console.log('[BonusBackground] Created bonus-bg-cover at depth 850, initially hidden');


	}

	private scaleImageToCover(image: Phaser.GameObjects.Image, targetWidth: number, targetHeight: number): void {
		const sourceWidth = image.width;
		const sourceHeight = image.height;
		if (!sourceWidth || !sourceHeight) return;
		const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
		image.setScale(scale);
	}

	private scaleImageToWidth(image: Phaser.GameObjects.Image, targetWidth: number): void {
		const sourceWidth = image.width;
		if (!sourceWidth) return;
		image.setScale(targetWidth / sourceWidth);
	}

	private layout(scene: Scene): void {
		const width = scene.scale.width;
		const height = scene.scale.height;

		if (this.bonusBg) {
			// Apply vertical offset adjustment (see bonusBackgroundYOffset property at top of class)
			const yPosition = (height * 0.5) + this.bonusBackgroundYOffset;
			this.bonusBg.setPosition(width * 0.5, yPosition);
			// Scale spine animation to cover screen
			try {
				const scaleX = width / (this.bonusBg.width || 1);
				const scaleY = height / (this.bonusBg.height || 1);
				const scale = Math.max(scaleX, scaleY);
				this.bonusBg.setScale(scale);
			} catch (e) {
				console.warn('[BonusBackground] Failed to scale bonus bg:', e);
			}
		}

		if (this.bonusBgCover) {
			// Match normal background cover behavior: anchor around the reel/controller separation.
			// Apply Y offset adjustment (see bonusBgCoverYOffset property at top of class)
			const yPosition = (height * 0.776) + this.bonusBgCoverYOffset;
			this.bonusBgCover.setPosition(width * 0.5, yPosition);
			this.scaleImageToWidth(this.bonusBgCover, width);
		}

	}

	resize(scene: Scene): void {
		if (this.bonusContainer) {
			this.bonusContainer.setSize(scene.scale.width, scene.scale.height);
		}
		this.layout(scene);
	}

	getContainer(): Phaser.GameObjects.Container {
		return this.bonusContainer;
	}

	destroy(): void {
		if (this.bonusContainer) {
			this.bonusContainer.destroy();
		}
	}

	/**
	 * Setup listener for bonus mode changes to toggle cover and cloud visibility
	 */
	private setupBonusModeListener(scene: Scene): void {
		// Check if bonus-bg-cover asset loaded successfully
		if (!scene.textures.exists('bonus-bg-cover')) {
			console.error('[BonusBackground] bonus-bg-cover texture not found! Check AssetConfig and file path.');
			console.log('[BonusBackground] Available textures:', scene.textures.getTextureKeys());
		}
		
		// Listen for bonus mode events using scene.events (same as Background.ts)
		scene.events.on('setBonusMode', (isBonus: boolean) => {
			console.log(`[BonusBackground] Bonus mode changed to: ${isBonus}`);
			
			if (this.bonusBgCover) {
				this.bonusBgCover.setVisible(isBonus);
				console.log(`[BonusBackground] Bonus bg cover visibility: ${isBonus}`);
			}
			
			// if (this.bonusSpine) {
			// 	this.bonusSpine.setVisible(isBonus);
			// 	if (isBonus) {
			// 		// Play idle animation when bonus starts
			// 		try {
			// 			const animState = this.bonusSpine.animationState;
			// 			if (animState && typeof animState.setAnimation === 'function') {
			// 				animState.setAnimation(0, 'Character2_BZ_idle', true);
			// 				console.log('[BonusBackground] Playing Character2_BZ_idle animation');
			// 			}
			// 		} catch (e) {
			// 			console.warn('[BonusBackground] Failed to play bonus spine animation:', e);
			// 		}
			// 	}
			// }
		});

		// Set initial visibility based on current bonus state
		const isBonus = gameStateManager.isBonus;
		
		if (this.bonusBgCover) {
			this.bonusBgCover.setVisible(isBonus);
			console.log(`[BonusBackground] Initial bonus bg cover visibility: ${isBonus} (isBonus: ${isBonus})`);
		}
		
		if (this.bonusSpine) {
			this.bonusSpine.setVisible(isBonus);
		}
	}
}
