import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { NetworkManager } from '../../managers/NetworkManager';
import { ScreenModeManager } from '../../managers/ScreenModeManager';
import { AssetConfig } from '../../config/AssetConfig';
import { AssetLoader } from '../../utils/AssetLoader';
import { ensureSpineLoader } from '../../utils/SpineGuard';

export class Boot extends Scene
{
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private assetConfig: AssetConfig;
	private assetLoader: AssetLoader;

	constructor ()
	{
		super('Boot');
		this.networkManager = new NetworkManager();
		this.screenModeManager = new ScreenModeManager();
		this.screenModeManager.forceOrientation('portrait');
		
		// Initialize asset configuration
		this.assetConfig = new AssetConfig(this.networkManager, this.screenModeManager);
		this.assetLoader = new AssetLoader(this.assetConfig);
	}

	init ()
	{
		console.log('Boot scene init');
		EventBus.emit('current-scene-ready', this);
	}

	preload ()
	{
		// Ensure Spine loader/plugin is registered before any asset loading
		try {
			ensureSpineLoader(this, 'Boot.preload');
		} catch (_e) {
			// no-op
		}
		
		// Show debug info
		this.assetConfig.getDebugInfo();
		
		console.log(`[Boot] Asset loading configuration:`);
		console.log(`[Boot] - Asset scale: ${this.networkManager.getAssetScale()}x`);
		console.log(`[Boot] - Asset prefix: ${this.assetConfig['getAssetPrefix']()}`);
		
		// Load loading assets using AssetLoader
		this.assetLoader.loadLoadingAssets(this);

		
		// Load the texture image first
		this.load.image('Character1_BZ', 'assets/characters/Character1_BZ.webp');
		this.load.image('Character2_BZ', 'assets/characters/Character2_BZ.webp');
		console.log('[Boot] Queued Character1_BZ.webp as image');
		console.log('[Boot] Queued Character2_BZ.webp as image');
		
		// Load atlas as text to debug
		this.load.text('Character1_atlas_text', 'assets/characters/Character1_BZ.atlas');
		this.load.text('Character2_atlas_text', 'assets/characters/Character2_BZ.atlas');
		console.log('[Boot] Queued atlas as text for debugging');
		

		// Retry loading spine loader up to 5 times if not available
		const tryLoadSpine = (scene: Scene, attempt = 1) => {
			if (typeof (scene.load as any).spine === 'function') {
 				(scene.load as any).spine('character1', 'assets/characters/Character1_BZ.json', 'assets/characters/Character1_BZ.atlas', true);
 				(scene.load as any).spine('SymbolBombs_SW', 'assets/symbols/high/sugar_symbols/SymbolBombs_SW.json', 'assets/symbols/high/sugar_symbols/SymbolBombs_SW.atlas', true);
 				console.log('[Boot] character1 and SymbolBombs_SW spine load queued');
			} else if (attempt < 5) {
				console.warn(`[Boot] spine loader not available, retrying (${attempt})...`);
				setTimeout(() => tryLoadSpine(scene, attempt + 1), 100 * attempt); // Exponential backoff
			} else {
				console.error('[Boot] spine loader not available after retries!');
			}
		};

		tryLoadSpine(this);

		// Add error handlers
		this.load.on('loaderror', (file: any) => {
			console.error('[Boot] Load error for file:', file.key, file.url);
		});

		this.load.on('filecomplete', (key: string) => {
			if (key === 'character1' || key.includes('Character1')) {
				console.log('[Boot] File complete:', key);
			}
		});

		// Preload font assets as early as possible so loading/studio screens can use Poppins
		this.assetLoader.loadFontAssets(this);
		
		console.log(`[Boot] Loading assets (loading + fonts + character1) for Boot scene`);

		// Debug: Log when loading completes
		this.load.once('complete', () => {
			console.log('[Boot] All assets loaded');
			
			// Check if atlas text was loaded
			if (this.cache.text.exists('Character1_atlas_text')) {
				const atlasText = this.cache.text.get('Character1_atlas_text');
				console.log('[Boot] Atlas text loaded, first 200 chars:', atlasText.substring(0, 200));
			}
			
			// Check if image was loaded
			if (this.textures.exists('Character1_BZ')) {
				console.log('[Boot] Character1_BZ.webp loaded as texture');
			}
			
			// Check if character1 is in cache
			const spineCache = (this.cache as any).custom?.spine;
			if (spineCache) {
				console.log('[Boot] Spine cache exists');
				const hasChar1 = spineCache.has('character1');
				console.log('[Boot] character1 in spine cache:', hasChar1);
				
				// Log all keys in spine cache
				try {
					const keys = spineCache.entries?.keys?.();
					if (keys) {
						const keyArray = Array.from(keys);
						console.log('[Boot] All spine cache keys:', keyArray);
					}
				} catch (e) {
					console.log('[Boot] Could not enumerate spine cache keys');
				}
			} else {
				console.log('[Boot] No spine cache found');
			}
		});
	}

	create ()
	{
		// Emit the screen mode manager so UI components can access it
		EventBus.emit('screen-mode-manager-ready', this.screenModeManager);

		// Prevent Phaser from auto-pausing/resuming audio on tab visibility changes.
		// This avoids "Cannot resume a closed AudioContext" when the game loads in a background tab.
		try {
			if (this.sound) {
				(this.sound as any).pauseOnBlur = false;
				(this.sound as any).pauseOnHide = false;

				// Guard against InvalidStateError by no-op'ing resume/suspend when AudioContext is closed
				const anySound: any = this.sound as any;
				const ctx: any = anySound.context;
				if (ctx && typeof ctx.resume === 'function' && typeof ctx.suspend === 'function') {
					const originalResume = ctx.resume.bind(ctx);
					const originalSuspend = ctx.suspend.bind(ctx);
					ctx.resume = async () => {
						if (ctx.state === 'closed') {
							return Promise.resolve();
						}
						try {
							return await originalResume();
						} catch (_e) {
							return Promise.resolve();
						}
					};
					ctx.suspend = async () => {
						if (ctx.state === 'closed') {
							return Promise.resolve();
						}
						try {
							return await originalSuspend();
						} catch (_e) {
							return Promise.resolve();
						}
					};
				}
			}
		} catch (_e) {
			// no-op
		}
		
		this.scene.start('Preloader', { 
			networkManager: this.networkManager, 
			screenModeManager: this.screenModeManager 
		});
	}
}
