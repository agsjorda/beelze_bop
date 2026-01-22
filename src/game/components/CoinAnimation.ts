import { Scene } from 'phaser';
import { AudioManager, SoundEffectType } from '../../managers/AudioManager';
import { NetworkManager } from '../../managers/NetworkManager';
import { ScreenModeManager } from '../../managers/ScreenModeManager';

export class CoinAnimation {
	private scene: Scene;
	private networkManager: NetworkManager;
	private screenModeManager: ScreenModeManager;
	private coinSprite: Phaser.GameObjects.Sprite | null = null;
	private container: Phaser.GameObjects.Container | null = null;
	private coins: Phaser.Physics.Arcade.Group | null = null;

	constructor(networkManager: NetworkManager, screenModeManager: ScreenModeManager) {
		this.networkManager = networkManager;
		this.screenModeManager = screenModeManager;
	}

	create(scene: Scene): void {
		this.scene = scene;
		
		// Create container for the coin animation
		this.container = scene.add.container(0, 0);
		
		// Create physics group for coins
		this.coins = scene.physics.add.group();
		
		// Set up the sprite sheet animation
		// Since we loaded it as a spritesheet, Phaser automatically creates frames 0-9
		scene.anims.create({
			key: 'coin-spin',
			frames: scene.anims.generateFrameNumbers('coin', {
				start: 0,
				end: 29
			}),
			frameRate: 30, // 10 FPS for smooth animation
			repeat: -1 // Loop indefinitely
		});
		
		// Initially hide the container
		this.container.setVisible(false);
		
		console.log('[CoinAnimation] Coin animation component created with physics');
	}

	/**
	 * Play the coin animation in the center of the screen
	 */
	playAnimation(): void {
		// Spawn multiple coins with physics
		this.spawnCoins(5); // Spawn 5 coins
	}

	/**
	 * Spawn coins in the middle of the screen with random upward velocity
	 */
	spawnCoins(count: number = 1): void {
		if (!this.coins) {
			console.error('[CoinAnimation] Physics group not initialized');
			return;
		}

		const centerX = this.scene.scale.width * 0.65;
		const centerY = this.scene.scale.height * 0.22;

		// Spawn coins one by one with delay
		for (let i = 0; i < count; i++) {
			this.scene.time.delayedCall(i * 200, () => { // 200ms delay between each coin
				this.spawnSingleCoin(centerX, centerY);
			});
		}
		
		console.log(`[CoinAnimation] Spawning ${count} coins one by one with 200ms delay`);
	}

	/**
	 * Spawn a single coin with custom parameters
	 */
	spawnSingleCoin(x?: number, y?: number, velocityX?: number, velocityY?: number): void {
		if (!this.coins) {
			console.error('[CoinAnimation] Physics group not initialized');
			return;
		}

		const centerX = x || this.scene.scale.width * 0.5;
		const centerY = y || this.scene.scale.height * 0.5;

		// Create coin sprite with physics
		const coin = this.scene.physics.add.sprite(centerX, centerY, 'coin');
		
		// Add to physics group
		this.coins.add(coin);
		
		// Set up physics properties
		coin.setBounce(0.6);
		coin.setCollideWorldBounds(true);
		coin.setScale(0.5);
		coin.setDepth(800); // Set depth below dialog overlay (1000) but above game elements
		
		// Start the spinning animation
		coin.play('coin-spin');
		
		// Apply velocity (use provided values or northwest direction)
		let velX, velY;
		if (velocityX !== undefined && velocityY !== undefined) {
			velX = velocityX;
			velY = velocityY;
		} else {
			const randomForce = Math.random() * 400 + 50; // Random force between 50-450
			velX = -randomForce * 0.7; // Northwest direction (negative X)
			velY = -randomForce * 0.9; // Northwest direction (negative Y)
		}
		
		coin.setVelocity(velX, velY);
		coin.setAngularVelocity((Math.random() - 0.5) * 1000);
		
		// Play a soft drop sound when the coin hits the ground (first collision with world bounds)
		try {
			coin.setCollideWorldBounds(true);
			coin.body.onWorldBounds = true as any;
			let dropPlayed = false;
			this.scene.physics.world.on('worldbounds', (body: any) => {
				if (!dropPlayed && body && body.gameObject === coin) {
					dropPlayed = true;
					try {
						const audio = (window as any).audioManager as AudioManager | undefined;
						if (audio && typeof audio.playSoundEffect === 'function') {
							audio.playSoundEffect(SoundEffectType.COIN_DROP);
						}
					} catch {}
				}
			});
		} catch {}

		// Remove coin after 5 seconds
		this.scene.time.delayedCall(5000, () => {
			if (coin && coin.active) {
				coin.destroy();
			}
		});
		
		console.log('[CoinAnimation] Spawned single coin with physics');
	}

	/**
	 * Clear all coins
	 */
	clearAllCoins(): void {
		if (this.coins) {
			this.coins.clear(true, true);
			console.log('[CoinAnimation] Cleared all coins');
		}
	}

	/**
	 * Get the number of active coins
	 */
	getCoinCount(): number {
		return this.coins ? this.coins.getLength() : 0;
	}

	/**
	 * Hide the coin animation
	 */
	hideAnimation(): void {
		if (this.container) {
			this.container.setVisible(false);
			console.log('[CoinAnimation] Coin animation hidden');
		}
	}

	/**
	 * Get the container for positioning
	 */
	getContainer(): Phaser.GameObjects.Container | null {
		return this.container;
	}

	/**
	 * Check if the animation is currently visible
	 */
	isVisible(): boolean {
		return this.container ? this.container.visible : false;
	}

	/**
	 * Destroy the coin animation
	 */
	destroy(): void {
		// Clear all coins
		this.clearAllCoins();
		
		if (this.coins) {
			this.coins.destroy();
			this.coins = null;
		}
		
		if (this.container) {
			this.container.destroy();
			this.container = null;
		}
		
		console.log('[CoinAnimation] Coin animation destroyed');
	}
}
