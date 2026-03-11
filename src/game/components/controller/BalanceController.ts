import type { Scene } from 'phaser';
import type { GameAPI } from '../../../backend/GameAPI';
import type { GameData } from '../GameData';
import { CurrencyManager } from '../CurrencyManager';
import { formatCurrencyNumber } from '../../../utils/NumberPrecisionFormatter';
import { localizationManager } from '../../../managers/LocalizationManager';
import { COMMON_BALANCE, LOCALIZATION_DEFAULTS } from '../../../backend/LocalizationData';

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
  private balanceLabelContainer!: Phaser.GameObjects.Container;
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

    // Create container for balance label parts
    this.balanceLabelContainer = scene.add.container(balanceX, balanceY - 8);
    this.balanceLabelContainer.setDepth(9);

    const balanceText = (localizationManager.getTextByKey(COMMON_BALANCE) ?? LOCALIZATION_DEFAULTS[COMMON_BALANCE] ?? COMMON_BALANCE).toUpperCase();
    const currencyCode = isDemoBalance ? '' : CurrencyManager.getCurrencyCode();

    let currentX = 0;

    // "BALANCE" - green, poppins-bold
    const balanceWordText = scene.add.text(
      currentX, 0, balanceText,
      {
        fontSize: '12px',
        color: '#00ff00', // Green color
        fontFamily: 'poppins-bold'
      }
    ).setOrigin(0, 0.5);
    this.balanceLabelContainer.add(balanceWordText);
    currentX += balanceWordText.width;

    // Add currency code in parentheses if available
    if (currencyCode) {
      // " (" - green, poppins-regular
      const leftParenText = scene.add.text(
        currentX, 0, ' (',
        {
          fontSize: '12px',
          color: '#00ff00', // Green color
          fontFamily: 'poppins-regular'
        }
      ).setOrigin(0, 0.5);
      this.balanceLabelContainer.add(leftParenText);
      currentX += leftParenText.width;
      
      // Currency code - white, poppins-regular
      const currencyText = scene.add.text(
        currentX, 0, currencyCode,
        {
          fontSize: '12px',
          color: '#ffffff', // White color
          fontFamily: 'poppins-regular'
        }
      ).setOrigin(0, 0.5);
      this.balanceLabelContainer.add(currencyText);
      currentX += currencyText.width;
      
      // ")" - green, poppins-regular
      const rightParenText = scene.add.text(
        currentX, 0, ')',
        {
          fontSize: '12px',
          color: '#00ff00', // Green color
          fontFamily: 'poppins-regular'
        }
      ).setOrigin(0, 0.5);
      this.balanceLabelContainer.add(rightParenText);
    }

    // Center the container by adjusting its position
    const totalWidth = currentX;
    this.balanceLabelContainer.setX(balanceX - totalWidth / 2);
    this.controllerContainer.add(this.balanceLabelContainer);

    // Amount text (no currency prefix)
    this.balanceAmountText = scene.add.text(
      balanceX,
      balanceY + 8,
      '0',
      {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'poppins-bold'
      }
    ).setOrigin(0.5, 0.5).setDepth(9);
    this.controllerContainer.add(this.balanceAmountText);

    // Hide old currency text (kept for compatibility but not visible)
    this.balanceDollarText = scene.add.text(
      balanceX,
      balanceY + 8,
      CurrencyManager.getCurrencyGlyph(),
      {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'poppins-regular'
      }
    ).setOrigin(0.5, 0.5).setDepth(9);
    this.balanceDollarText.setVisible(false);
    this.controllerContainer.add(this.balanceDollarText);
  }

  public updateBalanceAmount(balanceAmount: number): void {
    if (this.balanceAmountText) {
      this.balanceAmountText.setText(formatCurrencyNumber(balanceAmount));
      // Amount text is already centered, no need to reposition
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
      const balanceText = CurrencyManager.stripCurrencyPrefix(this.balanceAmountText.text).replace(/,/g, '');
      return parseFloat(balanceText) || 0;
    }
    return 0;
  }

  public refreshCurrencySymbols(): void {
    const scene = this.callbacks.getScene();
    if (!scene || !this.balanceLabelContainer) return;
    const isDemo = this.callbacks.getGameAPI()?.getDemoState();
    const balanceX = scene.scale.width * 0.19;
    
    // Rebuild the label container with updated currency
    this.balanceLabelContainer.removeAll(true);
    
    const balanceText = (localizationManager.getTextByKey(COMMON_BALANCE) ?? LOCALIZATION_DEFAULTS[COMMON_BALANCE] ?? COMMON_BALANCE).toUpperCase();
    const currencyCode = isDemo ? '' : CurrencyManager.getCurrencyCode();

    let currentX = 0;

    // "BALANCE" - green, poppins-bold
    const balanceWordText = scene.add.text(
      currentX, 0, balanceText,
      {
        fontSize: '12px',
        color: '#00ff00',
        fontFamily: 'poppins-bold'
      }
    ).setOrigin(0, 0.5);
    this.balanceLabelContainer.add(balanceWordText);
    currentX += balanceWordText.width;

    // Add currency code in parentheses if available
    if (currencyCode) {
      // " (" - green, poppins-regular
      const leftParenText = scene.add.text(
        currentX, 0, ' (',
        {
          fontSize: '12px',
          color: '#00ff00',
          fontFamily: 'poppins-regular'
        }
      ).setOrigin(0, 0.5);
      this.balanceLabelContainer.add(leftParenText);
      currentX += leftParenText.width;
      
      // Currency code - white, poppins-regular
      const currencyText = scene.add.text(
        currentX, 0, currencyCode,
        {
          fontSize: '12px',
          color: '#ffffff',
          fontFamily: 'poppins-regular'
        }
      ).setOrigin(0, 0.5);
      this.balanceLabelContainer.add(currencyText);
      currentX += currencyText.width;
      
      // ")" - green, poppins-regular
      const rightParenText = scene.add.text(
        currentX, 0, ')',
        {
          fontSize: '12px',
          color: '#00ff00',
          fontFamily: 'poppins-regular'
        }
      ).setOrigin(0, 0.5);
      this.balanceLabelContainer.add(rightParenText);
    }

    // Center the container
    const totalWidth = currentX;
    this.balanceLabelContainer.setX(balanceX - totalWidth / 2);
  }

  private layoutCurrencyPair(
    centerX: number,
    y: number,
    currencyText: Phaser.GameObjects.Text,
    amountText: Phaser.GameObjects.Text,
    isDemo: boolean,
    spacing: number
  ): void {
    const glyph = CurrencyManager.getCurrencyGlyph();
    const showCurrency = !isDemo && glyph.length > 0;

    if (!showCurrency) {
      try { currencyText.setVisible(false); } catch {}
      amountText.setPosition(centerX, y);
      return;
    }

    currencyText.setVisible(true);
    currencyText.setText(glyph);

    const glyphWidth = currencyText.width || 0;
    const amountWidth = amountText.width || 0;
    const totalWidth = glyphWidth + spacing + amountWidth;
    const startX = centerX - (totalWidth / 2);

    currencyText.setPosition(startX + glyphWidth / 2, y);
    amountText.setPosition(startX + glyphWidth + spacing + (amountWidth / 2), y);
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
