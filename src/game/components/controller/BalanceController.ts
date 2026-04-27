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
}

export class BalanceController {
  private static readonly BALANCE_PENDING_TEXT = '-';
  private controllerContainer: Phaser.GameObjects.Container;
  private callbacks: BalanceControllerCallbacks;
  private balanceAmountText!: Phaser.GameObjects.Text;
  private balanceDollarText!: Phaser.GameObjects.Text;
  private balanceLabelContainer!: Phaser.GameObjects.Container;
  private pendingBalanceUpdate: { balance: number; bet: number; winnings?: number } | null = null;
  private isBalanceInitialized: boolean = false;
  private balanceTween: Phaser.Tweens.Tween | null = null;
  private balanceAnimationInProgress: boolean = false;
  private pendingServerBalanceForReconcile: number | null = null;

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
      BalanceController.BALANCE_PENDING_TEXT,
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
      if (!Number.isFinite(balanceAmount)) {
        this.balanceAmountText.setText(BalanceController.BALANCE_PENDING_TEXT);
        return;
      }
      this.isBalanceInitialized = true;
      this.balanceAmountText.setText(formatCurrencyNumber(balanceAmount));
      // Amount text is already centered, no need to reposition
    }
  }

  private setBalanceAmountNow(balanceAmount: number): void {
    this.updateBalanceAmount(balanceAmount);
  }

  private startBalanceTween(targetBalance: number, durationMs: number = 220): void {
    const scene = this.callbacks.getScene();
    if (!scene || !this.balanceAmountText || !Number.isFinite(targetBalance)) {
      this.setBalanceAmountNow(targetBalance);
      return;
    }

    const currentBalance = this.getBalanceAmount();
    const fromBalance = Number.isFinite(currentBalance) ? currentBalance : targetBalance;

    if (Math.abs(targetBalance - fromBalance) < 0.0001) {
      this.setBalanceAmountNow(targetBalance);
      return;
    }

    try {
      this.balanceTween?.stop();
    } catch {}

    const valueProxy = { value: fromBalance };
    this.balanceAnimationInProgress = true;
    this.balanceTween = scene.tweens.add({
      targets: valueProxy,
      value: targetBalance,
      duration: durationMs,
      ease: 'Cubic.Out',
      onUpdate: () => {
        this.setBalanceAmountNow(valueProxy.value);
      },
      onComplete: () => {
        this.balanceAnimationInProgress = false;
        this.balanceTween = null;
        this.setBalanceAmountNow(targetBalance);
        const deferred = this.pendingServerBalanceForReconcile;
        this.pendingServerBalanceForReconcile = null;
        if (Number.isFinite(deferred)) {
          this.startBalanceTween(Number(deferred), 200);
        }
      },
      onStop: () => {
        this.balanceAnimationInProgress = false;
        this.balanceTween = null;
      }
    });
  }

  public decrementBalanceByBet(): void {
    try {
      const currentBalance = this.getBalanceAmount();
      if (!Number.isFinite(currentBalance)) {
        console.warn('[SlotController] Balance not initialized yet; skip optimistic decrement.');
        return;
      }
      const currentBet = this.callbacks.getBaseBetAmount();
      const gameData = this.callbacks.getGameData();

      const totalBetToCharge = (gameData && gameData.isEnhancedBet)
        ? currentBet * 1.25
        : currentBet;

      console.log(`[SlotController] Decrementing balance: $${currentBalance} - $${totalBetToCharge} ${gameData && gameData.isEnhancedBet ? '(enhanced bet +25%)' : ''}`);

      const newBalance = Math.max(0, currentBalance - totalBetToCharge);
      this.startBalanceTween(newBalance, 200);

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
      const rawText = (this.balanceAmountText.text || '').trim();
      if (rawText === BalanceController.BALANCE_PENDING_TEXT || rawText === '\u2014') {
        return Number.NaN;
      }
      const balanceText = CurrencyManager.stripCurrencyPrefix(rawText).replace(/,/g, '');
      const parsed = parseFloat(balanceText);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    }
    return Number.NaN;
  }

  public hasInitializedBalance(): boolean {
    return this.isBalanceInitialized;
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
        this.startBalanceTween(this.pendingBalanceUpdate.balance, 320);
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
        this.startBalanceTween(this.pendingBalanceUpdate.balance, 320);

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

  public async updateBalanceFromServer(spinData?: any): Promise<void> {
    try {
      console.log('[SlotController] 💰 Reconciling balance from spin payload...');

      const gameAPI = this.callbacks.getGameAPI();
      if (!gameAPI) {
        console.warn('[SlotController] GameAPI not available for balance update');
        return;
      }

      let payload =
        spinData ?? gameAPI.getCurrentSpinData?.() ?? (() => {
          try {
            return (this.callbacks.getScene() as any)?.symbols?.currentSpinData;
          } catch {
            return undefined;
          }
        })();

      const rawBalance = payload?.balance ?? payload?.data?.balance;
      let newBalance = parseFloat(String(rawBalance ?? '').replace(/,/g, ''));

      if (!Number.isFinite(newBalance)) {
        console.log('[SlotController] No valid balance on spin payload; falling back to getBalance');
        const balanceResponse = await gameAPI.getBalance();
        console.log('[SlotController] Balance response received:', balanceResponse);
        if (balanceResponse && balanceResponse.data && balanceResponse.data.balance !== undefined) {
          newBalance = parseFloat(String(balanceResponse.data.balance).replace(/,/g, ''));
        } else if (balanceResponse && balanceResponse.balance !== undefined) {
          newBalance = parseFloat(String(balanceResponse.balance).replace(/,/g, ''));
        } else {
          console.warn('[SlotController] Unexpected balance response structure:', balanceResponse);
          return;
        }
        if (!Number.isFinite(newBalance)) {
          console.warn('[SlotController] Invalid balance received from server:', balanceResponse);
          return;
        }
      }

      const oldBalance = this.getBalanceAmount();
      console.log(`[SlotController] 💰 Server balance update: $${oldBalance} -> $${newBalance}`);
      if (this.balanceAnimationInProgress) {
        this.pendingServerBalanceForReconcile = newBalance;
        console.log('[SlotController] Balance animation in progress; deferring server reconcile.');
      } else {
        this.startBalanceTween(newBalance, 200);
      }

      if (gameAPI.getDemoState?.()) {
        try {
          gameAPI.updateDemoBalance?.(newBalance);
        } catch {}
      }

      console.log('[SlotController] ✅ Balance reconciled successfully');
    } catch (error) {
      console.error('[SlotController] ❌ Error updating balance from server:', error);
    }
  }
}
