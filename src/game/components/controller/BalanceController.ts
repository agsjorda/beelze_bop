import type { Scene } from 'phaser';
import type { GameAPI } from '../../../backend/GameAPI';
import type { GameData } from '../GameData';

export interface BalanceControllerCallbacks {
  getScene: () => Scene | null;
  getGameAPI: () => GameAPI | null;
  getGameData: () => GameData | null;
  getBaseBetAmount: () => number;
  updateBetAmount: (bet: number) => void;
  showOutOfBalancePopup: () => void;
}

export class BalanceController {
  private controllerContainer: Phaser.GameObjects.Container;
  private callbacks: BalanceControllerCallbacks;
  private balanceAmountText!: Phaser.GameObjects.Text;
  private balanceDollarText!: Phaser.GameObjects.Text;
  private pendingBalanceUpdate: { balance: number; bet: number; winnings?: number } | null = null;

  constructor(
    controllerContainer: Phaser.GameObjects.Container,
    callbacks: BalanceControllerCallbacks
  ) {
    this.controllerContainer = controllerContainer;
    this.callbacks = callbacks;
  }

  public createBalanceDisplay(scene: Scene): void {
    const balanceX = scene.scale.width * 0.19;
    const balanceY = scene.scale.height * 0.724;
    const containerWidth = 125;
    const containerHeight = 55;
    const cornerRadius = 10;
    const isDemoBalance = this.callbacks.getGameAPI()?.getDemoState();
    const balanceValueOffset = isDemoBalance ? 0 : 5;

    const balanceBg = scene.add.graphics();
    balanceBg.fillStyle(0x000000, 0.65);
    balanceBg.fillRoundedRect(
      balanceX - containerWidth / 2,
      balanceY - containerHeight / 2,
      containerWidth,
      containerHeight,
      cornerRadius
    );
    balanceBg.setDepth(8);
    this.controllerContainer.add(balanceBg);

    const balanceLabel = scene.add.text(
      balanceX,
      balanceY - 8,
      'BALANCE',
      {
        fontSize: '12px',
        color: '#00ff00',
        fontFamily: 'poppins-bold'
      }
    ).setOrigin(0.5, 0.5).setDepth(9);
    this.controllerContainer.add(balanceLabel);

    this.balanceAmountText = scene.add.text(
      balanceX + balanceValueOffset,
      balanceY + 8,
      '0',
      {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'poppins-bold'
      }
    ).setOrigin(0.5, 0.5).setDepth(9);
    this.controllerContainer.add(this.balanceAmountText);

    this.balanceDollarText = scene.add.text(
      balanceX - (this.balanceAmountText.width / 2) - 3.5,
      balanceY + 8,
      isDemoBalance ? '' : '$',
      {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'poppins-regular'
      }
    ).setOrigin(0.5, 0.5).setDepth(9);
    this.balanceDollarText.setVisible(!isDemoBalance);
    this.controllerContainer.add(this.balanceDollarText);
  }

  public updateBalanceAmount(balanceAmount: number): void {
    if (this.balanceAmountText) {
      this.balanceAmountText.setText(
        balanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      );

      const isDemo = this.callbacks.getGameAPI()?.getDemoState();
      const scene = this.callbacks.getScene();
      if (scene) {
        const balanceX = scene.scale.width * 0.19;
        const balanceY = this.balanceAmountText.y;
        this.balanceAmountText.setPosition(balanceX + (isDemo ? 0 : 2.5), balanceY);

        if (this.balanceDollarText) {
          if (isDemo) {
            this.balanceDollarText.setVisible(false);
            this.balanceDollarText.setText('');
          } else {
            this.balanceDollarText.setVisible(true);
            this.balanceDollarText.setText('$');
            this.balanceDollarText.setPosition(balanceX - (this.balanceAmountText.width / 2) - 2.5, balanceY);
          }
        }
      }
    }
  }

  public decrementBalanceByBet(): void {
    try {
      const currentBalance = this.getBalanceAmount();
      const currentBet = this.callbacks.getBaseBetAmount();
      const gameData = this.callbacks.getGameData();

      const totalBetToCharge = (gameData && gameData.isEnhancedBet)
        ? currentBet * 1.25
        : currentBet;

      console.log(`[SlotController] Decrementing balance: $${currentBalance} - $${totalBetToCharge} ${gameData && gameData.isEnhancedBet ? '(enhanced bet +25%)' : ''}`);

      const newBalance = Math.max(0, currentBalance - totalBetToCharge);
      this.updateBalanceAmount(newBalance);

      const gameAPI = this.callbacks.getGameAPI();
      if (gameAPI?.getDemoState()) {
        gameAPI.updateDemoBalance(newBalance);
      }

      console.log(`[SlotController] Balance decremented: $${currentBalance} -> $${newBalance} (bet charged: $${totalBetToCharge})`);
    } catch (error) {
      console.error('[SlotController] Error decrementing balance:', error);
    }
  }

  public getBalanceAmountText(): string | null {
    return this.balanceAmountText ? this.balanceAmountText.text : null;
  }

  public getBalanceAmount(): number {
    if (this.balanceAmountText) {
      const balanceText = this.balanceAmountText.text.replace('$', '').replace(/,/g, '');
      return parseFloat(balanceText) || 0;
    }
    return 0;
  }

  public setPendingBalanceUpdate(update: { balance: number; bet: number; winnings?: number } | null): void {
    this.pendingBalanceUpdate = update;
  }

  public applyPendingBalanceUpdateIfAny(): void {
    if (this.pendingBalanceUpdate) {
      console.log('[SlotController] Applying pending balance update after reels stopped:', this.pendingBalanceUpdate);
      if (this.pendingBalanceUpdate.balance !== undefined) {
        const oldBalance = this.getBalanceAmountText();
        this.updateBalanceAmount(this.pendingBalanceUpdate.balance);
        try {
          const gameAPI = this.callbacks.getGameAPI();
          if (gameAPI?.getDemoState()) {
            gameAPI.updateDemoBalance(this.pendingBalanceUpdate.balance);
          }
        } catch { }
        if (this.pendingBalanceUpdate.winnings && this.pendingBalanceUpdate.winnings > 0) {
          console.log(`[SlotController] Balance updated after reels stopped: ${oldBalance} -> ${this.pendingBalanceUpdate.balance} (added winnings: ${this.pendingBalanceUpdate.winnings})`);
        } else {
          console.log(`[SlotController] Balance updated after reels stopped: ${oldBalance} -> ${this.pendingBalanceUpdate.balance}`);
        }
      }
      this.pendingBalanceUpdate = null;
      console.log('[SlotController] Pending balance update cleared');
    } else {
      console.log('[SlotController] No pending balance update to apply');
    }
  }

  public clearPendingBalanceUpdate(): void {
    if (this.pendingBalanceUpdate) {
      console.log('[SlotController] Clearing pending balance update:', this.pendingBalanceUpdate);
      this.pendingBalanceUpdate = null;
    }
  }

  public getPendingBalanceUpdate(): { balance: number; bet: number; winnings?: number } | null {
    return this.pendingBalanceUpdate;
  }

  public hasPendingBalanceUpdate(): boolean {
    return this.pendingBalanceUpdate !== null;
  }

  public hasPendingWinnings(): boolean {
    return this.pendingBalanceUpdate?.winnings !== undefined && this.pendingBalanceUpdate.winnings > 0;
  }

  public getPendingWinnings(): number {
    return this.pendingBalanceUpdate?.winnings || 0;
  }

  public forceApplyPendingBalanceUpdate(): void {
    if (this.pendingBalanceUpdate) {
      console.log('[SlotController] Force applying pending balance update:', this.pendingBalanceUpdate);

      if (this.pendingBalanceUpdate.balance !== undefined) {
        const oldBalance = this.getBalanceAmountText();
        this.updateBalanceAmount(this.pendingBalanceUpdate.balance);

        if (this.pendingBalanceUpdate.winnings && this.pendingBalanceUpdate.winnings > 0) {
          console.log(`[SlotController] Balance force updated: ${oldBalance} -> ${this.pendingBalanceUpdate.balance} (added winnings: ${this.pendingBalanceUpdate.winnings})`);
        } else {
          console.log(`[SlotController] Balance force updated: ${oldBalance} -> ${this.pendingBalanceUpdate.balance}`);
        }
      }

      if (this.pendingBalanceUpdate.bet !== undefined) {
        this.callbacks.updateBetAmount(this.pendingBalanceUpdate.bet);
        console.log('[SlotController] Bet force updated:', this.pendingBalanceUpdate.bet);
      }

      this.pendingBalanceUpdate = null;
    } else {
      console.log('[SlotController] No pending balance update to force apply');
    }
  }

  public async updateBalanceFromServer(): Promise<void> {
    if (this.callbacks.getGameAPI()?.getDemoState()) {
      console.log('[SlotController] Demo mode active - skipping balance update from server');
      return;
    }

    try {
      console.log('[SlotController] 💰 Updating balance from server after reels stopped...');

      const gameAPI = this.callbacks.getGameAPI();
      if (!gameAPI) {
        console.warn('[SlotController] GameAPI not available for balance update');
        return;
      }

      const balanceResponse = await gameAPI.getBalance();
      console.log('[SlotController] Balance response received:', balanceResponse);

      let newBalance = 0;
      if (balanceResponse && balanceResponse.data && balanceResponse.data.balance !== undefined) {
        newBalance = parseFloat(balanceResponse.data.balance);
      } else if (balanceResponse && balanceResponse.balance !== undefined) {
        newBalance = parseFloat(balanceResponse.balance);
      } else {
        console.warn('[SlotController] Unexpected balance response structure:', balanceResponse);
        return;
      }

      const oldBalance = this.getBalanceAmount();
      console.log(`[SlotController] 💰 Server balance update: $${oldBalance} -> $${newBalance}`);

      this.updateBalanceAmount(newBalance);
      if (newBalance <= 0) {
        this.callbacks.showOutOfBalancePopup();
      }

      console.log('[SlotController] ✅ Balance updated from server successfully');
    } catch (error) {
      console.error('[SlotController] ❌ Error updating balance from server:', error);
    }
  }
}
