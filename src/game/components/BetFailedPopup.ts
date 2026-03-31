import { Scene, GameObjects } from 'phaser';
import { localizationManager } from '../../managers/LocalizationManager';
import { POPUP_BET_FAILED, COMMON_OK, LOCALIZATION_DEFAULTS } from '../../backend/LocalizationData';

export class BetFailedPopup extends GameObjects.Container {
	private background: GameObjects.Graphics;
	private messageText: GameObjects.Text;
	private buttonImage: GameObjects.Image;
	private buttonText: GameObjects.Text;
	private backgroundColor: number = 0x000000;
	private backgroundAlpha: number = 0.8;
	private cornerRadius: number = 20;
	private buttonOffsetY: number = 130;
	private buttonScale: number = 0.8;
	private buttonWidth: number = 364;
	private buttonHeight: number = 62;
	private animationDuration: number = 300;
	private overlay: Phaser.GameObjects.Graphics;

	private onCloseCallback?: () => void;

	constructor(
		scene: Scene,
		x: number = 0,
		y: number = 0,
		options: {
			opacity?: number;
			cornerRadius?: number;
			buttonOffsetY?: number;
			buttonScale?: number;
			overlayColor?: number;
			overlayAlpha?: number;
			onClose?: () => void;
		} = {}
	) {
		super(scene, x, y);
		this.scene = scene;

		this.overlay = new GameObjects.Graphics(scene);
		this.overlay.fillStyle(options.overlayColor || 0x000000, options.overlayAlpha !== undefined
			? Phaser.Math.Clamp(options.overlayAlpha, 0, 1)
			: 0.35);
		this.overlay.fillRect(0, 0, scene.scale.width, scene.scale.height);
		this.overlay.setScrollFactor(0);
		this.overlay.setInteractive(
			new Phaser.Geom.Rectangle(0, 0, scene.scale.width, scene.scale.height),
			Phaser.Geom.Rectangle.Contains
		);
		this.overlay.visible = false;
		scene.add.existing(this.overlay);

		if (options.opacity !== undefined) {
			this.backgroundAlpha = Phaser.Math.Clamp(options.opacity, 0, 1);
		}
		if (options.cornerRadius !== undefined) {
			this.cornerRadius = Math.max(0, options.cornerRadius);
		}
		if (options.buttonOffsetY !== undefined) {
			this.buttonOffsetY = options.buttonOffsetY;
		}
		if (options.buttonScale !== undefined) {
			this.buttonScale = Phaser.Math.Clamp(options.buttonScale, 0.1, 2);
		}
		if (options.onClose !== undefined) {
			this.onCloseCallback = options.onClose;
		}

		this.background = new Phaser.GameObjects.Graphics(scene);
		this.drawBackground();

		const messageStr =
			localizationManager.getTextByKey(POPUP_BET_FAILED) ??
			LOCALIZATION_DEFAULTS[POPUP_BET_FAILED] ??
			POPUP_BET_FAILED;

		this.messageText = new GameObjects.Text(scene, 0, -40, messageStr, {
			fontFamily: 'Poppins-Regular',
			fontSize: '21px',
			color: '#ffffff',
			align: 'center',
			wordWrap: { width: scene.scale.width * 0.7, useAdvancedWrap: true },
		});
		this.messageText.setOrigin(0.5);

		const buttonX = 0;
		const buttonY = this.buttonOffsetY;
		const scaledWidth = this.buttonWidth * this.buttonScale;
		const scaledHeight = this.buttonHeight * this.buttonScale;

		this.buttonImage = new GameObjects.Image(scene, buttonX, buttonY, 'long_button');
		this.buttonImage.setOrigin(0.5, 0.5);
		this.buttonImage.setDisplaySize(scaledWidth, scaledHeight);
		this.buttonImage.setScale(this.buttonScale);

		const okStr = localizationManager.getTextByKey(COMMON_OK) ?? LOCALIZATION_DEFAULTS[COMMON_OK] ?? 'OK';
		this.buttonText = new GameObjects.Text(scene, buttonX, buttonY, okStr, {
			fontFamily: 'Poppins-Bold',
			fontSize: '24px',
			color: '#000000',
			align: 'center',
		});
		this.buttonText.setOrigin(0.5);

		this.buttonImage.setInteractive({ useHandCursor: true });
		this.buttonImage.on('pointerdown', () => {
			try { (window as any).audioManager?.playSoundEffect?.('button_fx'); } catch {}
			this.hide(() => this.onCloseCallback?.());
		});
		this.buttonImage.on('pointerover', () => this.buttonImage.setTint(0xcccccc));
		this.buttonImage.on('pointerout', () => this.buttonImage.clearTint());

		this.add([this.background, this.messageText, this.buttonImage, this.buttonText]);
		this.setPosition(scene.scale.width / 2, scene.scale.height / 2);
		this.setVisible(false);
		scene.add.existing(this);
	}

	public show(): void {
		this.overlay.setVisible(true);
		this.overlay.setDepth(9999);
		this.setVisible(true);
		this.setDepth(10000);
		this.setScale(0.5);
		this.setAlpha(0);
		this.scene.tweens.add({
			targets: this,
			scaleX: 1,
			scaleY: 1,
			alpha: 1,
			duration: this.animationDuration,
			ease: 'Back.Out',
			onStart: () => {
				try { (window as any).audioManager?.playSoundEffect?.('popup_open'); } catch {}
			},
		});
	}

	public hide(callback?: () => void): void {
		this.scene.tweens.add({
			targets: this,
			scaleX: 0.5,
			scaleY: 0.5,
			alpha: 0,
			duration: this.animationDuration * 0.8,
			ease: 'Back.In',
			onComplete: () => {
				this.setVisible(false);
				this.overlay.setVisible(false);
				if (callback) callback();
			},
		});
	}

	public updateMessage(message: string): void {
		this.messageText.setText(message);
	}

	private drawBackground(): void {
		const width = this.scene.scale.width * 0.8;
		const height = this.scene.scale.height * 0.4;
		this.background.clear();
		this.background.fillStyle(this.backgroundColor, this.backgroundAlpha);
		this.background.fillRoundedRect(-width / 2, -height / 2, width, height, this.cornerRadius);
	}

	public destroy(fromScene?: boolean): void {
		try { this.overlay?.destroy(); } catch {}
		super.destroy(fromScene);
	}
}

