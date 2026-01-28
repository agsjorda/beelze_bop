import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { NetworkManager } from '../../managers/NetworkManager';
import { ScreenModeManager } from '../../managers/ScreenModeManager';
import { AssetConfig } from '../../config/AssetConfig';
import { AssetLoader } from '../../utils/AssetLoader';
import { GameAPI } from '../../backend/GameAPI';
import { GameData } from '../components/GameData';
import { FullScreenManager } from '../../managers/FullScreenManager';
import { ensureSpineFactory } from '../../utils/SpineGuard';
import { StudioLoadingScreen } from '../components/StudioLoadingScreen';
import { ClockDisplay } from '../components/ClockDisplay';
import { Character } from '../components/Character';
import { playRadialDimmerTransition } from '../utils/playRadialDimmerTransition';

export class Preloader extends Scene
{
	private networkManager!: NetworkManager;
	private screenModeManager!: ScreenModeManager;
	private assetConfig!: AssetConfig;
	private assetLoader!: AssetLoader;
	private gameAPI!: GameAPI;
	private studio?: StudioLoadingScreen;
	private clockDisplay?: ClockDisplay;
	private character1?: Character;
	private character2?: Character;
	private preloaderVerticalOffsetModifier: number = 10;
	private bootProgressHandler?: (progress: number) => void;

	// Loading bar graphics
	private progressBarBg?: Phaser.GameObjects.Graphics;
	private progressBarFill?: Phaser.GameObjects.Graphics;
	private progressText?: Phaser.GameObjects.Text;
	private progressBarX?: number;
	private progressBarY?: number;
	private progressBarWidth?: number;
	private progressBarHeight?: number;
	private progressBarPadding: number = 3;

	// UI elements we need after load
	private buttonSpin?: Phaser.GameObjects.Image;
	private buttonBg?: Phaser.GameObjects.Image;
	private pressToPlayText?: Phaser.GameObjects.Text;
	private taglineText?: Phaser.GameObjects.Text;
	private websiteText?: Phaser.GameObjects.Text;
	private maxWinText?: Phaser.GameObjects.Text;
	private fullscreenBtn?: Phaser.GameObjects.Image;

	constructor ()
	{
		super('Preloader');
	}

	init (data: any)
	{
		// Check if add.spine is available - if not, reload the game
		const hasSpineFactory = ensureSpineFactory(this, '[Preloader] init');
		if (!hasSpineFactory) {
			console.error('[Preloader] add.spine is not recognized. Reloading the game...');
			setTimeout(() => {
				window.location.reload();
			}, 250);
			return;
		}

		// Receive managers from Boot scene
		this.networkManager = data.networkManager;
		this.screenModeManager = data.screenModeManager;
		
		// Initialize asset configuration
		this.assetConfig = new AssetConfig(this.networkManager, this.screenModeManager);
		this.assetLoader = new AssetLoader(this.assetConfig);
		
		// Initialize GameAPI
		const gameData = new GameData();
		this.gameAPI = new GameAPI(gameData);
		
		const screenConfig = this.screenModeManager.getScreenConfig();
		const assetScale = this.networkManager.getAssetScale();
		
		console.log(`[Preloader] Applying asset scale: ${assetScale}x`);
		
		// Background color for studio loading (#10161D to match studio screen)
		this.cameras.main.setBackgroundColor(0x10161D);

		// Always show loading background, scaled to cover the entire screen
		// The background image is loaded as 'loading_background' from public/assets/portrait/high/background/LoadingScreen_BZ.png
		// (see AssetConfig.ts getLoadingAssets)
		const background = this.add.image(
			this.scale.width * 0.5, 
			this.scale.height * 0.5, 
			"loading_background"
		).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(0);
		
		const scaleX = this.scale.width / background.width;
		const scaleY = this.scale.height / background.height;
		const scale = Math.max(scaleX, scaleY);
		background.setScale(scale);
		
		console.log(`[Preloader] Background original size: ${background.width}x${background.height}`);
		console.log(`[Preloader] Canvas size: ${this.scale.width}x${this.scale.height}`);
		console.log(`[Preloader] Calculated scale: ${scale} (scaleX: ${scaleX}, scaleY: ${scaleY})`);
		console.log(`[Preloader] Background dimensions: ${background.width}x${background.height}, canvas: ${this.scale.width}x${this.scale.height}`);
		console.log(`[Preloader] Background display size: ${this.scale.width}x${this.scale.height}`);
		console.log(`[Preloader] Background position: (${this.scale.width * 0.5}, ${this.scale.height * 0.5})`);

		// Persistent clock display in the top bar - clock on top-left, DiJoker on top-right
		this.clockDisplay = new ClockDisplay(this, {
			offsetX: 5,
			offsetY: 5,
			fontSize: 16,
			fontFamily: 'poppins-regular',
			color: '#FFFFFF',
			alpha: 0.5,
			depth: 30000,
			scale: 0.7,
			suffixText: ` | Beelze_Bop${this.gameAPI.getDemoState() ? ' | DEMO' : ''}`,
			additionalText: 'DiJoker',
			additionalTextOffsetX: 5,
			additionalTextOffsetY: 0,
			additionalTextScale: 0.7,
			additionalTextColor: '#FFFFFF',
			additionalTextFontSize: 16,
			additionalTextFontFamily: 'poppins-regular'
		});
		this.clockDisplay.create();

		// Loading frame + tagline + URL and max-win text (aligned to StudioLoadingScreen positions)
		// Use the same offsets as StudioLoadingScreen defaults so both layers line up visually
		const loadingFrameOffsetFromCenter = 345;
		const loadingFrame = this.add.image(
			this.scale.width * 0.5,
			this.scale.height * 0.5 + loadingFrameOffsetFromCenter,
			"loading_frame_2"
		).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(10);

		const frameScale = (Math.max(this.scale.width / loadingFrame.width, this.scale.height / loadingFrame.height)) * 0.04;
		loadingFrame.setScale(frameScale);

		// "PLAY LOUD. WIN WILD. DIJOKER STYLE"
		// Matches StudioLoadingScreen default textOffsetY
		const textOffsetFromCenter = 375;
		this.taglineText = this.add.text(
			this.scale.width * 0.5 - 5,
			this.scale.height * 0.5 + textOffsetFromCenter,
			'PLAY LOUD. WIN WILD. DIJOKER STYLE',
			{
				fontFamily: 'poppins-regular',
				fontSize: '14px',
				color: '#FFFFFF',
				fontStyle: 'normal',
				align: 'center',
			}
		)
		.setOrigin(0.5, 0.5)
		.setScrollFactor(0)
		.setAlpha(1)
		.setDepth(10);

		// "www.dijoker.com"
		// Matches StudioLoadingScreen default text2OffsetY
		const websiteOffsetFromCenter = 400;
		this.websiteText = this.add.text(
			this.scale.width * 0.5,
			this.scale.height * 0.5 + websiteOffsetFromCenter,
			'www.dijoker.com',
			{
				fontFamily: 'poppins-regular',
				fontSize: '14px',
				color: '#FFFFFF',
				fontStyle: 'normal',
				align: 'center',
			}
		)
		.setOrigin(0.5, 0.5)
		.setScrollFactor(0)
		.setAlpha(1)
		.setDepth(10);

		// "Win up to 21,000x" breathing text (reuses preloaded poppins fonts)
		const winTextY = 145 + this.preloaderVerticalOffsetModifier;
		this.maxWinText = this.add.text(
			this.scale.width * 0.5,
			this.scale.height * 0.5 + winTextY,
			'Win up to 21,000x',
			{
				fontFamily: 'poppins-bold',
				fontSize: '32px',
				color: '#FFFFFF',
				align: 'center',
			}
		)
		.setOrigin(0.5, 0.5)
		.setScrollFactor(0)
		.setAlpha(1)
		.setDepth(10);

		this.tweens.add({
			targets: this.maxWinText,
			scale: { from: 0.90, to: 0.95 },
			duration: 800,
			ease: 'Sine.easeInOut',
			yoyo: true,
			repeat: -1,
			hold: 0,
			delay: 0,
		});

		this.maxWinText
			.setStroke('#379557', 4)
			.setShadow(0, 2, '#000000', 4, true, true);

		if (screenConfig.isPortrait) {
			// Studio loading screen with the same frame/text positioning as Preloader
			this.studio = new StudioLoadingScreen(this, {
				loadingFrameOffsetX: 0,
				loadingFrameOffsetY: 345,
				loadingFrameScaleModifier: 0.04,
				text: 'PLAY LOUD. WIN WILD. DIJOKER STYLE',
				textOffsetX: -5,
				textOffsetY: 375,
				textScale: 1,
				textColor: '#FFFFFF',
				text2: 'www.dijoker.com',
				text2OffsetX: 0,
				text2OffsetY: 400,
				text2Scale: 1,
				text2Color: '#FFFFFF',
			});
			this.studio.show();

			// Hook for any post-fade actions if needed later
			this.events.once('studio-fade-complete', () => {
				// no-op for now
			});

			const buttonY = this.scale.height * 0.77;
			
			// Scale buttons based on quality (low quality assets need 2x scaling)
			this.buttonBg = this.add.image(
				this.scale.width * 0.5, 
				buttonY, 
				"button_bg"
			).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);

			this.buttonSpin = this.add.image(
				this.scale.width * 0.5, 
				buttonY, 
				"button_spin"
			).setOrigin(0.5, 0.5).setScale(assetScale).setDepth(10);

			// Grey out and disable the spin button and background until load completes
			this.buttonSpin.setTint(0x777777).setAlpha(0.9);
			this.buttonBg.setTint(0x777777).setAlpha(0.9);
			this.buttonSpin.disableInteractive();

			console.log(`[Preloader] Button scaling: ${assetScale}x`);

			// Sugar Wonderland logo removed - logo now displayed on loading background image

			this.tweens.add({
				targets: this.buttonSpin,
				rotation: Math.PI * 2,
				duration: 5000,
				repeat: -1,
			});

			// // "Press Play To Continue" text (initially hidden), positioned above the spin button
			// const ctaX = this.scale.width * 0.5;
			// const ctaY = buttonY - Math.max(40, 48 * assetScale);
			// this.pressToPlayText = this.add.text(ctaX, ctaY, 'Press Play To Continue', {
			// 	fontFamily: 'poppins-regular',
			// 	fontSize: `${Math.round(22 * assetScale)}px`,
			// 	color: '#FFFFFF',
			// 	align: 'center'
			// })
			// .setOrigin(0.5, 1)
			// .setAlpha(0)
			// .setShadow(0, 3, '#000000', 6, true, true);

		}

		// Notify host page loader (if present) that Phaser boot loader can hide
		try {
			(window as any).hideBootLoader?.();
		} catch {}

		// Set up progress event listener (forward only to external listeners; studio/studio React handle bars)
		this.bootProgressHandler = (progress: number) => {
			EventBus.emit('progress', progress);
			try {
				(window as any).setBootLoaderProgress?.(0.25 + progress * 0.75);
			} catch {}
		};
		this.load.on('progress', this.bootProgressHandler as any);

		this.load.once('complete', () => {
			try {
				(window as any).setBootLoaderProgress?.(1);
			} catch {}
			// Detach this handler so subsequent background loads (audio) don't drive the boot progress UI.
			try {
				if (this.bootProgressHandler) {
					this.load.off('progress', this.bootProgressHandler as any);
					this.bootProgressHandler = undefined;
				}
			} catch {}
		});
		
		EventBus.emit('current-scene-ready', this);	
	}

	preload ()
	{
		// Prefer more parallel requests on modern networks
		this.load.maxParallelDownloads = Math.max(this.load.maxParallelDownloads, 8);
		// Show debug info
		this.assetConfig.getDebugInfo();

		
		// Load background and header assets (will be used in Game scene)
		this.assetLoader.loadBackgroundAssets(this);
		this.assetLoader.loadHeaderAssets(this);
		this.assetLoader.loadBonusHeaderAssets(this);
		this.assetLoader.loadSymbolAssets(this);
		this.assetLoader.loadButtonAssets(this);
		this.assetLoader.loadFontAssets(this);
		this.assetLoader.loadDialogAssets(this);
		this.assetLoader.loadForegroundAssets(this);
		// Load Scatter Anticipation spine (portrait/high only asset paths)
		this.assetLoader.loadScatterAnticipationAssets(this);
		this.assetLoader.loadBonusBackgroundAssets(this);
		this.assetLoader.loadNumberAssets(this);
		this.assetLoader.loadCoinAssets(this);
		this.assetLoader.loadBuyFeatureAssets(this);
		this.assetLoader.loadMenuAssets(this);
		this.assetLoader.loadHelpScreenAssets(this);
		
		console.log(`[Preloader] Loading assets for Preloader and Game scenes`);
	}

	private startBackgroundAudioLoad(): void {
		try {
			const audioAssets = this.assetConfig.getAudioAssets();
			const audioMap = audioAssets.audio || {};
			const entries = Object.entries(audioMap);
			if (entries.length === 0) return;

			let queued = 0;
			for (const [key, path] of entries) {
				try {
					if ((this.cache.audio as any)?.exists?.(key)) continue;
				} catch {
					// If we can't check the cache, still attempt to queue.
				}
				try {
					this.load.audio(key, path);
					queued++;
				} catch {}
			}

			if (queued <= 0) return;

			console.log(`[Preloader] Background-loading ${queued} audio files (non-blocking for StudioLoading)`);

			this.load.once('complete', () => {
				console.log('[Preloader] Background audio load complete');
			});

			this.load.start();
		} catch (e) {
			console.warn('[Preloader] Failed to start background audio load:', e);
		}
	}

    async create ()
    {
		try {
			const demoState = this.gameAPI.getDemoState();
			console.log('[Preloader] Demo state:', demoState);
		} catch (error) {
			console.error('[Preloader] Failed to get demo state:', error);
		}

		// Initialize GameAPI, generate token, and call backend initialize endpoint (skip slot init in demo)
        try {
            console.log('[Preloader] Initializing GameAPI...');
            const gameToken = await this.gameAPI.initializeGame();
            console.log('[Preloader] Game URL Token:', gameToken);

			const isDemo = this.gameAPI.getDemoState();
			if (!isDemo) {
				console.log('[Preloader] Calling backend slot initialization...');
				const slotInitData = await this.gameAPI.initializeSlotSession();
				console.log('[Preloader] Slot initialization data:', slotInitData);
			} else {
				console.log('[Preloader] Demo mode active - skipping backend slot initialization');
			}

            console.log('[Preloader] GameAPI and slot session initialized successfully!');
        } catch (error) {
            console.error('[Preloader] Failed to initialize GameAPI or slot session:', error);
        }

		// ========================================
		// Add Character1 Spine Animation
		// ========================================
		// Character1 and Character2 are displayed in front of the loading background during the preload screen
		// Asset location: public/assets/characters/Character1_BZ.json, .atlas, .webp and Character2_BZ.json, .atlas, .webp
		// Loaded in: Boot scene via AssetConfig.getLoadingAssets()
		// The characters play their idle animations in a loop while assets load
		console.log('[Preloader] About to create character1 and character2...');
		console.log('[Preloader] add.spine available:', typeof (this.add as any).spine);
		console.log('[Preloader] spine plugin:', !!(this as any).spine);
        
		// Give a small delay to ensure assets are fully loaded from Boot scene
		this.time.delayedCall(100, () => {
			// Create Character1 on the left side of the screen (25% from left, 45% from top)
			this.character1 = new Character(this, {
				characterKey: 'character1',
				x: this.scale.width * 0.23,
				y: this.scale.height * 0.61,
				scale: 0.2,
				depth: 1, // In front of background, behind UI
				animation: 'character1_BZ_idle',
				loop: true
			});
			this.character1.create();

			// Create Character2 on the right side of the screen (75% from left, 45% from top)
			this.character2 = new Character(this, {
				characterKey: 'character2',
				x: this.scale.width * 0.75,
				y: this.scale.height * 0.52,
				scale: 0.3,
				depth: 1, // In front of background, behind UI
				animation: 'character2_BZ_idle',
				loop: true
			});
			this.character2.create();
		});

        // Create fullscreen toggle now that assets are loaded (using shared manager)
        const assetScale = this.networkManager.getAssetScale();
        this.fullscreenBtn = FullScreenManager.addToggle(this, {
            margin: 16 * assetScale,
            iconScale: 1.5 * assetScale,
            depth: 10000,
            maximizeKey: 'maximize',
            minimizeKey: 'minimize'
        });

        // Enable the spin button for user to continue
        if (this.buttonSpin) {
            this.buttonSpin.clearTint();
            this.buttonSpin.setAlpha(1);
            this.buttonSpin.setInteractive({ useHandCursor: true });
        }
        if (this.buttonBg) {
            this.buttonBg.clearTint();
            this.buttonBg.setAlpha(1);
        }

        // Show call-to-action text
        if (this.pressToPlayText) {
            this.pressToPlayText.setAlpha(1);
            this.tweens.add({
                targets: this.pressToPlayText,
                alpha: 0.3,
                duration: 800,
                yoyo: true,
                repeat: -1
            });
        }

		// Prepare fade overlay (no longer used, replaced by RadialDimmerTransition)
		// const fadeOverlay = this.add.rectangle(
		//     this.scale.width * 0.5,
		//     this.scale.height * 0.5,
		//     this.scale.width,
		//     this.scale.height,
		//     0x000000
		// ).setOrigin(0.5, 0.5).setScrollFactor(0).setAlpha(0);

        // Start game on click
        this.buttonSpin?.once('pointerdown', () => {
            playRadialDimmerTransition(this, () => {
                console.log('[Preloader] Starting Game scene after radial dimmer');
                this.scene.start('Game', { 
                    networkManager: this.networkManager, 
                    screenModeManager: this.screenModeManager,
                    // Pass the same GameAPI instance so initialization data is shared
                    gameAPI: this.gameAPI
                });
            });
        });

		// Start loading audio in the background now that the main visual load is complete.
		// If the user clicks early and this scene stops, Game scene will fall back to loading audio again.
		this.startBackgroundAudioLoad();

		// Ensure web fonts are applied after they are ready
		const fontsObj: any = (document as any).fonts;
		if (fontsObj && typeof fontsObj.ready?.then === 'function') {
			fontsObj.ready.then(() => {
				this.progressText?.setFontFamily('poppins-regular');
				this.pressToPlayText?.setFontFamily('poppins-regular');
				this.taglineText?.setFontFamily('poppins-regular');
				this.websiteText?.setFontFamily('poppins-regular');
				this.maxWinText?.setFontFamily('poppins-bold');
			}).catch(() => {
				// Fallback: set families anyway
				this.progressText?.setFontFamily('poppins-regular');
				this.pressToPlayText?.setFontFamily('poppins-regular');
				this.taglineText?.setFontFamily('poppins-regular');
				this.websiteText?.setFontFamily('poppins-regular');
				this.maxWinText?.setFontFamily('poppins-bold');
			});
		} else {
			// Browser without document.fonts support
			this.progressText?.setFontFamily('poppins-regular');
			this.pressToPlayText?.setFontFamily('poppins-regular');
			this.taglineText?.setFontFamily('poppins-regular');
			this.websiteText?.setFontFamily('poppins-regular');
			this.maxWinText?.setFontFamily('poppins-bold');
		}
    }
}
