import type { Scene } from 'phaser';
import { gameEventManager, GameEventType } from '../../../event/EventManager';
import { gameStateManager } from '../../../managers/GameStateManager';
import { SpinDataUtils } from '../../../backend/SpinData';
import { BuyFeature } from '../BuyFeature';
import type { GameAPI } from '../../../backend/GameAPI';
import type { SlotController } from './SlotController';
import type { GameData } from '../GameData';

export interface BuyFeatureCallbacks {
  getGameData: () => GameData | null;
  getScene: () => Scene | null;
  getGameAPI: () => GameAPI | null;
  getBalanceAmount: () => number;
  updateBalanceAmount: (balance: number) => void;
  updateBetAmount: (bet: number) => void;
  enableSpinButton: () => void;
  enableAutoplayButton: () => void;
  enableFeatureButton: () => void;
  enableBetButtons: () => void;
  enableAmplifyButton: () => void;
  disableSpinButton: () => void;
  disableAutoplayButton: () => void;
  disableFeatureButton: () => void;
  disableBetButtons: () => void;
  disableAmplifyButton: () => void;
  enableBetBackgroundInteraction: (reason: string) => void;
  disableBetBackgroundInteraction: (reason: string) => void;
  showOutOfBalancePopup: () => void;
  updateSpinButtonState: () => void;
}

export class BuyFeatureController {
  private buyFeature: BuyFeature | null = null;
  private buyFeatureSpinLock: boolean = false;
  private callbacks: BuyFeatureCallbacks;

  constructor(callbacks: BuyFeatureCallbacks) {
    this.callbacks = callbacks;
    this.buyFeature = new BuyFeature();
  }

  public setSlotController(slotController: SlotController): void {
    if (!this.buyFeature) return;
    this.buyFeature.setSlotController(slotController);
  }

  public create(scene: Scene): void {
    if (!this.buyFeature) return;
    this.buyFeature.create(scene);
  }

  public isSpinLocked(): boolean {
    return this.buyFeatureSpinLock;
  }

  public setSpinLock(locked: boolean): void {
    this.buyFeatureSpinLock = locked;
  }

  public showDrawer(): void {
    if (!this.buyFeature) {
      console.warn('[SlotController] Buy feature component not initialized');
      return;
    }

    this.buyFeature.show({
      featurePrice: 24000.0,
      onClose: () => {
        console.log('[SlotController] Buy feature drawer closed');
      },
      onConfirm: () => {
        console.log('[SlotController] Buy feature confirmed');
        this.buyFeatureSpinLock = true;
        this.callbacks.disableSpinButton();
        this.callbacks.disableAutoplayButton();
        this.callbacks.disableFeatureButton();
        this.callbacks.disableBetButtons();
        this.callbacks.disableAmplifyButton();
        this.callbacks.disableBetBackgroundInteraction('buy feature confirmed');
        this.handleBuyFeature();
      }
    });
  }

  private async handleBuyFeature(): Promise<void> {
    console.log('[SlotController] Processing buy feature purchase');

    const gameAPI = this.callbacks.getGameAPI();
    if (!this.buyFeature || !gameAPI) {
      console.error('[SlotController] Buy feature or GameAPI not available');
      return;
    }

    try {
      let shouldKeepBuyFeatureFlag = false;
      const buyFeatureBet = this.buyFeature.getCurrentBetAmount();
      const calculatedPrice = buyFeatureBet * 100;

      this.callbacks.updateBetAmount(buyFeatureBet);

      console.log(`[SlotController] Buy feature bet: $${buyFeatureBet.toFixed(2)}, calculated price: $${calculatedPrice.toFixed(2)}`);

      const currentBalance = this.callbacks.getBalanceAmount();
      if (currentBalance < calculatedPrice) {
        console.error(`[SlotController] Insufficient balance: $${currentBalance.toFixed(2)} < $${calculatedPrice.toFixed(2)}`);
        this.callbacks.enableSpinButton();
        this.callbacks.enableAutoplayButton();
        this.callbacks.enableFeatureButton();
        this.callbacks.enableBetButtons();
        this.callbacks.enableAmplifyButton();
        this.callbacks.enableBetBackgroundInteraction('buy feature insufficient balance');
        this.callbacks.showOutOfBalancePopup();
        return;
      }

      const newBalance = currentBalance - calculatedPrice;
      if (gameAPI?.getDemoState()) {
        gameAPI.updateDemoBalance(newBalance);
      }
      this.callbacks.updateBalanceAmount(newBalance);
      console.log(`[SlotController] Balance deducted: $${currentBalance.toFixed(2)} -> $${newBalance.toFixed(2)}`);

      try {
        const scene = this.callbacks.getScene();
        const gameScene: any = scene as any;
        const symbolsComponent = gameScene?.symbols;
        if (symbolsComponent && typeof symbolsComponent.startPreSpinDrop === 'function') {
          console.log('[SlotController] Triggering pre-spin symbol drop for buy feature spin');
          symbolsComponent.startPreSpinDrop();
        }
      } catch (e) {
        console.warn('[SlotController] Failed to start pre-spin symbol drop for buy feature spin:', e);
      }

      console.log('[SlotController] Calling doSpin for buy feature...');
      gameStateManager.isBuyFeatureSpin = true;
      const spinData = await gameAPI.doSpin(buyFeatureBet, true, false);
      console.log('[BUY_FEATURE_SPIN_DATA]', spinData);

      console.log('[SlotController] Buy feature spin completed:', spinData);
      const hasFreeSpinItems = !!(spinData?.slot?.freespin?.items || spinData?.slot?.freeSpin?.items);
      shouldKeepBuyFeatureFlag = hasFreeSpinItems || SpinDataUtils.hasFreeSpins(spinData);
      if (!shouldKeepBuyFeatureFlag) {
        gameStateManager.isBuyFeatureSpin = false;
      }

      try {
        if (hasFreeSpinItems) {
          const gd = this.callbacks.getGameData();
          if (gd) {
            const wasTurboGD = !!gd.isTurbo;
            const wasTurboGSM = !!gameStateManager.isTurbo;
            if (wasTurboGD || wasTurboGSM) {
              console.log('[SlotController] Buy feature with scatter during turbo - temporarily disabling turbo for scatter sequence');
              gd.isTurbo = false;
              gameStateManager.isTurbo = false;
              const scene = this.callbacks.getScene();
              if (scene) {
                scene.events.once('dialogAnimationsComplete', () => {
                  try {
                    if (wasTurboGD) {
                      gd.isTurbo = true;
                    }
                    if (wasTurboGSM) {
                      gameStateManager.isTurbo = true;
                    }
                    console.log('[SlotController] Restored turbo after scatter sequence dialogs completed');
                  } catch (e) {
                    console.warn('[SlotController] Failed to restore turbo after dialogs:', e);
                  }
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn('[SlotController] Turbo normalization for buy feature scatter failed:', e);
      }

      if (spinData) {
        gameEventManager.emit(GameEventType.SPIN_DATA_RESPONSE, { spinData });
      }
    } catch (error) {
      console.error('[SlotController] Error processing buy feature purchase:', error);
      gameStateManager.isBuyFeatureSpin = false;
      this.callbacks.enableSpinButton();
      this.callbacks.enableAutoplayButton();
      this.callbacks.enableFeatureButton();
      this.callbacks.enableBetButtons();
      this.callbacks.enableAmplifyButton();
      this.callbacks.enableBetBackgroundInteraction('buy feature error');
    }
  }
}
