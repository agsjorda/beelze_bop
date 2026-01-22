/**
 * SpinButtonController - Manages spin button and related UI
 * 
 * Extracted from SlotController.ts for better code organization.
 * Handles spin button state, animations, and interactions.
 */

import type { Scene } from 'phaser';
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { gameStateManager } from '../../../managers/GameStateManager';
import { ensureSpineFactory } from '../../../utils/SpineGuard';
import { Logger } from '../../../utils/Logger';

const log = Logger.slot;

export interface SpinButtonCallbacks {
  onSpinRequested: () => Promise<void>;
  onSpinBlocked: (reason: string) => void;
  isAutoplayActive: () => boolean;
  stopAutoplay: () => void;
}

export class SpinButtonController {
  private scene: Scene;
  private container: Phaser.GameObjects.Container;
  private callbacks: SpinButtonCallbacks;
  
  // UI Elements
  private spinButton: Phaser.GameObjects.Image | null = null;
  private spinIcon: Phaser.GameObjects.Image | null = null;
  private spinIconTween: Phaser.Tweens.Tween | null = null;
  
  // Spine animations
  private spinButtonAnimation: any = null;
  private freeRoundSpinButtonAnimation: any = null;
  
  // State
  private isDisabled: boolean = false;

  constructor(
    scene: Scene,
    container: Phaser.GameObjects.Container,
    callbacks: SpinButtonCallbacks
  ) {
    this.scene = scene;
    this.container = container;
    this.callbacks = callbacks;
  }

  /**
   * Create spin button and related UI elements
   */
  public createSpinButton(
    x: number,
    y: number,
    assetScale: number,
    primaryControllers: Phaser.GameObjects.Container
  ): Phaser.GameObjects.Image {
    // Spin button (main button)
    this.spinButton = this.scene.add.image(x, y, 'spin')
      .setOrigin(0.5, 0.5)
      .setScale(assetScale)
      .setDepth(10)
      .setInteractive();
    
    this.spinButton.on('pointerdown', () => {
      this.handleSpinButtonClick();
    });
    
    primaryControllers.add(this.spinButton);
    
    // Spin icon overlay (rotating icon on top of button)
    this.spinIcon = this.scene.add.image(x, y, 'spin_icon')
      .setOrigin(0.5, 0.5)
      .setScale(assetScale)
      .setDepth(12);
    
    primaryControllers.add(this.spinIcon);
    
    // Start continuous rotation
    this.spinIconTween = this.scene.tweens.add({
      targets: this.spinIcon,
      angle: 360,
      duration: 4000,
      repeat: -1,
      ease: 'Linear'
    });
    
    // Create spine animations
    this.createSpinButtonAnimation(assetScale, primaryControllers);
    
    return this.spinButton;
  }

  /**
   * Enable spin button
   */
  public enable(): void {
    if (this.spinButton) {
      this.spinButton.setInteractive();
      this.spinButton.setAlpha(1.0);
      this.spinButton.clearTint();
    }
    if (this.spinIcon) {
      this.spinIcon.setAlpha(1.0);
    }
    this.isDisabled = false;
    log.debug('Spin button enabled');
  }

  /**
   * Disable spin button
   */
  public disable(): void {
    if (this.spinButton) {
      this.spinButton.disableInteractive();
      this.spinButton.setAlpha(0.5);
    }
    if (this.spinIcon) {
      this.spinIcon.setAlpha(0.5);
    }
    this.isDisabled = true;
    log.debug('Spin button disabled');
  }

  /**
   * Check if spin button is disabled
   */
  public isSpinButtonDisabled(): boolean {
    return this.isDisabled;
  }

  /**
   * Get the spin button image
   */
  public getButton(): Phaser.GameObjects.Image | null {
    return this.spinButton;
  }

  /**
   * Get the spin icon image
   */
  public getIcon(): Phaser.GameObjects.Image | null {
    return this.spinIcon;
  }

  /**
   * Play spin button animation
   */
  public playSpinAnimation(): void {
    // Hide icon during animation
    if (this.spinIcon) {
      this.spinIcon.setVisible(false);
    }
    
    // Play main animation
    if (this.spinButtonAnimation) {
      try {
        this.spinButtonAnimation.setVisible(true);
        this.spinButtonAnimation.animationState.setAnimation(0, 'animation', false);
        
        this.spinButtonAnimation.animationState.addListener({
          complete: (entry: any) => {
            if (entry.animation.name === 'animation') {
              this.spinButtonAnimation.setVisible(false);
              if (this.spinIcon) {
                this.spinIcon.setVisible(true);
              }
            }
          }
        });
        
        log.debug('Spin button animation played');
      } catch (error) {
        log.warn('Failed to play spin button animation:', error);
        this.spinButtonAnimation.setVisible(false);
        if (this.spinIcon) {
          this.spinIcon.setVisible(true);
        }
      }
    }
    
    // Rotate icon briefly
    this.rotateSpinButton();
  }

  /**
   * Play free round spin button animation
   */
  public playFreeRoundAnimation(): void {
    if (!this.freeRoundSpinButtonAnimation) return;
    
    try {
      this.freeRoundSpinButtonAnimation.setVisible(true);
      this.freeRoundSpinButtonAnimation.animationState.setAnimation(0, 'animation', false);
      
      this.freeRoundSpinButtonAnimation.animationState.addListener({
        complete: () => {
          this.freeRoundSpinButtonAnimation.setVisible(false);
        }
      });
    } catch (error) {
      log.warn('Failed to play free round animation:', error);
    }
  }

  /**
   * Hide spin icon (during autoplay stop icon display)
   */
  public hideIcon(): void {
    if (this.spinIcon) {
      this.spinIcon.setVisible(false);
    }
  }

  /**
   * Show spin icon
   */
  public showIcon(): void {
    if (this.spinIcon) {
      this.spinIcon.setVisible(true);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async handleSpinButtonClick(): Promise<void> {
    log.debug('Spin button clicked');
    
    // If autoplay is active, clicking spin stops it
    if (this.callbacks.isAutoplayActive()) {
      log.debug('Stopping autoplay via spin button');
      this.callbacks.stopAutoplay();
      return;
    }
    
    // Check if already spinning
    if (gameStateManager.isReelSpinning) {
      this.callbacks.onSpinBlocked('Already spinning');
      return;
    }
    
    // Disable button and play animation
    this.disable();
    this.playSpinAnimation();
    
    // Request spin
    try {
      await this.callbacks.onSpinRequested();
    } catch (error) {
      log.warn('Spin request failed:', error);
      this.enable();
    }
  }

  private rotateSpinButton(): void {
    if (!this.spinIcon) return;
    
    // Quick rotation effect
    this.scene.tweens.add({
      targets: this.spinIcon,
      angle: '+=360',
      duration: 300,
      ease: 'Power2'
    });
  }

  private createSpinButtonAnimation(
    assetScale: number,
    container: Phaser.GameObjects.Container
  ): void {
    try {
      if (!ensureSpineFactory(this.scene, '[SpinButtonController]')) {
        this.scene.time.delayedCall(250, () => {
          this.createSpinButtonAnimation(assetScale, container);
        });
        return;
      }

      if (!this.scene.cache.json.has('spin_button_animation')) {
        log.warn('Spin button animation spine assets not loaded');
        return;
      }

      if (!this.spinButton) return;

      // Create main spin button animation
      this.spinButtonAnimation = this.scene.add.spine(
        this.spinButton.x,
        this.spinButton.y,
        'spin_button_animation',
        'spin_button_animation-atlas'
      );
      
      this.spinButtonAnimation.setOrigin(0.5, 0.5);
      this.spinButtonAnimation.setScale(assetScale * 0.435);
      this.spinButtonAnimation.setDepth(9);
      this.spinButtonAnimation.animationState.timeScale = 1.3;
      this.spinButtonAnimation.setVisible(false);
      
      // Center animation on spin button
      this.centerSpineOnButton(this.spinButtonAnimation, this.spinButton);
      
      // Add to container behind spin button
      const spinIndex = container.getIndex(this.spinButton);
      container.addAt(this.spinButtonAnimation, spinIndex);
      
      log.debug('Spin button animation created');

      // Create free round animation if available
      this.createFreeRoundSpinButtonAnimation(assetScale, container);
      
    } catch (error) {
      log.warn('Failed to create spin button animation:', error);
    }
  }

  private createFreeRoundSpinButtonAnimation(
    assetScale: number,
    container: Phaser.GameObjects.Container
  ): void {
    if (!this.scene.cache.json.has('fr_spin_button_animation')) {
      return;
    }

    if (!this.spinButton) return;

    try {
      const spineScale = assetScale * 1.2;
      
      this.freeRoundSpinButtonAnimation = this.scene.add.spine(
        this.spinButton.x,
        this.spinButton.y,
        'fr_spin_button_animation',
        'fr_spin_button_animation-atlas'
      );
      
      this.freeRoundSpinButtonAnimation.setOrigin(0.5, 0.5);
      this.freeRoundSpinButtonAnimation.setScale(spineScale);
      this.freeRoundSpinButtonAnimation.setDepth(11);
      this.freeRoundSpinButtonAnimation.setVisible(false);
      
      this.centerSpineOnButton(this.freeRoundSpinButtonAnimation, this.spinButton);
      
      const spinIndex = container.getIndex(this.spinButton);
      container.addAt(this.freeRoundSpinButtonAnimation, spinIndex + 1);
      
      log.debug('Free round spin button animation created');
    } catch (error) {
      log.warn('Failed to create free round animation:', error);
    }
  }

  /**
   * Center a Spine animation on a button using visual bounds
   */
  private centerSpineOnButton(spineObj: any, button: Phaser.GameObjects.Image): void {
    if (!spineObj || !button) return;

    try {
      if (typeof spineObj.getBounds !== 'function') {
        spineObj.setPosition(button.x, button.y);
        return;
      }

      const bounds = spineObj.getBounds();
      if (!bounds?.offset || !bounds?.size) {
        spineObj.setPosition(button.x, button.y);
        return;
      }

      const centerX = bounds.offset.x + bounds.size.x * 0.5;
      const centerY = bounds.offset.y + bounds.size.y * 0.5;

      const scaleX = spineObj.scaleX ?? spineObj.scale ?? 1;
      const scaleY = spineObj.scaleY ?? spineObj.scale ?? 1;

      spineObj.x = button.x - centerX * scaleX;
      spineObj.y = button.y - centerY * scaleY;
    } catch (e) {
      log.warn('Failed to center spine on button:', e);
      spineObj.setPosition(button.x, button.y);
    }
  }
}
