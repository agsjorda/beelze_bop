import { Scene } from 'phaser';
import { SpinData } from '../../backend/SpinData';
import { ensureSpineFactory } from '../../utils/SpineGuard';
import { MIN_CLUSTER_SIZE, UI_CONFIG } from '../../config/GameConfig';
import { Logger } from '../../utils/Logger';
import { getMultiplierValue, isMultiplierSymbol } from '../../types/SymbolTypes';
import { CurrencyManager } from './CurrencyManager';
import { gameStateManager } from '../../managers/GameStateManager';
import { formatCurrencyNumber } from '../../utils/NumberPrecisionFormatter';

interface WinTrackerLayoutOptions {
  offsetX?: number;
  offsetY?: number;
  spacing?: number;
  iconScale?: number;
  innerGap?: number;
  multiplierIconScale?: number;
  multiplierIconGap?: number;
}

interface SymbolSummary {
  lines: number;
  totalWin: number;
  multiplier: number;
  baseValue: number;
  multiplierIcons?: Array<{ symbol: number; count: number }>;
  multiplierCount?: number;
}

export class WinTracker {
  private container!: Phaser.GameObjects.Container;
  private scene!: Scene;
  private lastSpinData: SpinData | null = null;

  private baseX: number = 0;
  private baseY: number = 0;
  private offsetX: number = 0;
  private offsetY: number = -45;
  private itemSpacing: number = 80;
  private iconScale: number = 0.01;
  private innerGap: number = 13;
  private horizontalGap: number = 20;
  private multiplierIconScale: number = 2;
  private multiplierIconGap: number = 0.5;
  private autoHideTimer: Phaser.Time.TimerEvent | null = null;
  private pageTimer: Phaser.Time.TimerEvent | null = null;
  private pagedItems: Array<[number, SymbolSummary]> | null = null;
  private pagedIndex: number = 0;
  private pageSize: number = 2;
  private pageDurationMs: number = 1200;
  private pageFadeMs: number = 200;

  private readonly depth: number = 905;
  private readonly shadowOffsetX: number = 4;
  private readonly shadowOffsetY: number = 4;
  private readonly shadowAlpha: number = 0.45;
  private readonly labelFontSize: number = 14;
  private readonly labelFontFamily: string = 'Poppins-Bold';

  create(scene: Scene): void {
    this.scene = scene;
    this.baseX = scene.scale.width * 0.5;
    // ADJUST HERE: WinTracker vertical base position (0.5 = center, 0.76 = bottom area)
    this.baseY = scene.scale.height * 0.5;

    this.container = scene.add.container(
      this.baseX + this.offsetX,
      this.baseY + this.offsetY
    );
    this.container.setDepth(this.depth);
    this.container.setVisible(false);
    this.container.setAlpha(1);
  }

  clear(): void {
    if (!this.container) {
      return;
    }
    if (this.autoHideTimer) {
      try { this.autoHideTimer.remove(false); } catch {}
      this.autoHideTimer = null;
    }
    this.stopPaging();
    this.container.removeAll(true);
    this.container.setVisible(false);
    this.container.setAlpha(1);
    this.lastSpinData = null;
  }

  updateFromSpinData(spinData: SpinData | null): void {
    this.lastSpinData = spinData;
  }

  showLatest(): void {
    if (!this.container) {
      return;
    }
    this.renderFromSpinData(this.lastSpinData);
  }

  /**
   * Show tracker for ONLY the current tumble using its outs array
   */
  public showForTumble(outs: Array<{ symbol?: number; count?: number; win?: number }> | null, spinData: SpinData | null): void {
    if (!this.container) return;
    this.stopPaging();
    const summary = this.buildSummaryFromTumbleOuts(outs, spinData);
    this.renderFromSummary(summary);
  }

  public showPagedForTumble(
    outs: Array<{ symbol?: number; count?: number; win?: number }> | null,
    spinData: SpinData | null,
    pageSize: number = 2,
    pageDurationMs: number = 1200,
    pageFadeMs: number = 200
  ): void {
    if (!this.container) return;
    this.stopPaging();
    const summary = this.buildSummaryFromTumbleOuts(outs, spinData);
    if (!summary || summary.size <= pageSize) {
      this.renderFromSummary(summary);
      return;
    }
    this.pagedItems = Array.from(summary.entries()).sort(
      (a, b) => b[1].totalWin - a[1].totalWin
    );
    this.pagedIndex = 0;
    this.pageSize = Math.max(1, pageSize);
    this.pageDurationMs = Math.max(300, pageDurationMs);
    this.pageFadeMs = Math.max(0, pageFadeMs);
    this.renderPagedSlice();
  }

  private renderFromSpinData(spinData: SpinData | null): void {
    const summary = this.buildSummary(spinData);
    this.renderFromSummary(summary);
  }

  private renderFromSummary(summary: Map<number, SymbolSummary> | null): void {
    this.container.removeAll(true);
    if (!summary) {
      this.container.setVisible(false);
      return;
    }

    this.container.setVisible(true);
    this.container.setAlpha(1);

    const items = Array.from(summary.entries()).sort(
      (a, b) => b[1].totalWin - a[1].totalWin
    );

    const isVertical = false;
    const lineSpacing = Math.max(this.labelFontSize + 12, 28);
    if (isVertical) {
      const spacing = this.itemSpacing;
      const startY = -((items.length - 1) * lineSpacing) / 2;
      let index = 0;
      for (const [symbolId, data] of items) {
        const y = startY + index * lineSpacing;
        const item = this.createSymbolItem(symbolId, data);
        item.container.setPosition(0, y);
        this.container.add(item.container);
        index += 1;
      }
      return;
    }

    const itemContainers: Array<{ container: Phaser.GameObjects.Container; width: number }> = [];
    for (const [symbolId, data] of items) {
      const item = this.createSymbolItem(symbolId, data);
      itemContainers.push(item);
    }
    const gap = Math.max(10, this.horizontalGap);
    const totalWidth = itemContainers.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, itemContainers.length - 1);
    let cursor = -totalWidth / 2;
    for (const item of itemContainers) {
      item.container.setPosition(cursor + item.width / 2, 0);
      this.container.add(item.container);
      cursor += item.width + gap;
    }
  }

  private renderPagedSlice(): void {
    if (!this.container || !this.scene || !this.pagedItems) {
      return;
    }
    const start = this.pagedIndex * this.pageSize;
    const slice = this.pagedItems.slice(start, start + this.pageSize);
    const summary = new Map<number, SymbolSummary>(slice);
    this.renderFromSummary(summary);
    this.container.setVisible(true);
    this.container.setAlpha(1);

    const hasNext = (start + this.pageSize) < this.pagedItems.length;
    if (!hasNext) {
      return;
    }

    if (this.pageTimer) {
      try { this.pageTimer.remove(false); } catch {}
      this.pageTimer = null;
    }
    this.pageTimer = this.scene.time.delayedCall(this.pageDurationMs, () => {
      this.advancePagedSlice();
    });
  }

  private advancePagedSlice(): void {
    if (!this.container || !this.scene || !this.pagedItems) {
      return;
    }
    this.pagedIndex += 1;
    const start = this.pagedIndex * this.pageSize;
    if (start >= this.pagedItems.length) {
      this.stopPaging();
      return;
    }

    const doRenderNext = () => {
      this.renderPagedSlice();
      if (this.pageFadeMs > 0) {
        this.container.setAlpha(0);
        this.scene.tweens.add({
          targets: this.container,
          alpha: 1,
          duration: this.pageFadeMs,
          ease: 'Sine.easeOut'
        });
      }
    };

    if (this.pageFadeMs > 0) {
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: this.pageFadeMs,
        ease: 'Sine.easeIn',
        onComplete: doRenderNext
      });
    } else {
      doRenderNext();
    }
  }

  private stopPaging(): void {
    if (this.pageTimer) {
      try { this.pageTimer.remove(false); } catch {}
      this.pageTimer = null;
    }
    this.pagedItems = null;
    this.pagedIndex = 0;
  }

  private buildSummary(spinData: SpinData | null): Map<number, SymbolSummary> | null {
    // Ignore paylines entirely; build summary only from tumble (cluster) wins
    if (!spinData || !spinData.slot) {
      return null;
    }
    const tumbles: any[] = Array.isArray((spinData.slot as any)?.tumbles) ? (spinData.slot as any).tumbles : [];
    if (tumbles.length === 0) {
      return null;
    }

    const summary = new Map<number, SymbolSummary>();
    for (const tumble of tumbles) {
      const outs = Array.isArray((tumble as any)?.symbols?.out) ? (tumble as any).symbols.out as Array<{ symbol?: number; count?: number; win?: number }> : [];
      for (const out of outs) {
        const symbolId = Number(out?.symbol);
        const count = Number(out?.count) || 0;
        const win = Number(out?.win) || 0;
        // Only include clusters meeting minimum size as winning symbols
        if (!isFinite(symbolId) || count <= 0 || count < MIN_CLUSTER_SIZE) continue;
        const existing = summary.get(symbolId) || { lines: 0, totalWin: 0, multiplier: 1, baseValue: 0, multiplierIcons: [], multiplierCount: 1 };
        existing.lines += count;
        existing.totalWin += win;
        summary.set(symbolId, existing);
      }
    }

    // Derive multipliers from the current grid (slot.area)
    const multiplierIconMap = new Map<number, number>();
    let multiplierSum = 0;
    try {
      const area: number[][] = Array.isArray((spinData.slot as any)?.area) ? (spinData.slot as any).area : [];
      for (let col = 0; col < area.length; col++) {
        const column = area[col] || [];
        for (let row = 0; row < column.length; row++) {
          const value = Number(column[row]);
          if (!isFinite(value)) continue;
          if (value >= 10 && value <= 22) {
            multiplierIconMap.set(value, (multiplierIconMap.get(value) || 0) + 1);
            multiplierSum += this.getMultiplierNumeric(value);
          }
        }
      }
    } catch {}
    // Show multiplier numeric total in WinTracker (hidden during bonus game)
    const multiplierIcons: Array<{ symbol: number; count: number }> = [];
    const multiplierCount = gameStateManager.isBonus ? 0 : multiplierSum;

    for (const [symbolId, data] of Array.from(summary.entries())) {
      if (data.totalWin > 0 && data.lines > 0) {
        data.baseValue = data.totalWin / data.lines;
      } else {
        data.baseValue = 0;
      }
      // Attach multiplier count to the row (numeric total)
      data.multiplierIcons = multiplierIcons;
      data.multiplierCount = multiplierCount > 0 ? multiplierCount : 0;
      summary.set(symbolId, data);
    }

    return summary.size > 0 ? summary : null;
  }

  private createSymbolItem(symbolId: number, data: SymbolSummary): { container: Phaser.GameObjects.Container; width: number } {
    const itemContainer = this.scene.add.container(0, 0);
    // Prefer spine-based symbol from the game; fallback to PNG
    const { icon, isSpine } = this.createSymbolIcon(symbolId);
    let shadow: Phaser.GameObjects.Image | null = null;
    if (!isSpine) {
      const key = `symbol_${symbolId}`;
      shadow = this.scene.add.image(0, 0, key);
      shadow.setOrigin(0.5, 0.5);
      shadow.setScale(this.iconScale);
      shadow.setTint(0x000000);
      shadow.setAlpha(this.shadowAlpha);
    }
    const iconDW = (icon as any).displayWidth ?? (icon as any).width ?? 40;

    const countLabel = this.scene.add.text(
      0,
      0,
      `${data.lines}`,
      {
        fontSize: `${this.labelFontSize}px`,
        color: '#ffffff',
        fontFamily: this.labelFontFamily,
        stroke: '#004D00',
        strokeThickness: 4,
        align: 'center'
      }
    );
    countLabel.setOrigin(0.5, 0.5);
    //countLabel.setShadow(1, .5, '#E7441E', 1, true, true);

    // Display multiplier numeric total when present
    const hasMultiplierText = Number.isFinite(data.multiplierCount) && (data.multiplierCount as number) > 0;
    const multiplierLabel = hasMultiplierText
      ? this.scene.add.text(
          0,
          0,
          `x${data.multiplierCount}`,
          {
            fontSize: `${this.labelFontSize}px`,
            color: '#ffffff',
            fontFamily: this.labelFontFamily,
            stroke: '#004D00',
            strokeThickness: 4,
            align: 'center'
          }
        )
      : null;
    if (multiplierLabel) {
      multiplierLabel.setOrigin(0.5, 0.5);
    }

    const eqLabel = this.scene.add.text(
      0,
      0,
      '=',
      {
        fontSize: `${this.labelFontSize}px`,
        color: '#ffffff',
        fontFamily: this.labelFontFamily,
        stroke: '#004D00',
        strokeThickness: 4,
        align: 'center'
      }
    );
    eqLabel.setOrigin(0.5, 0.5);
    //eqLabel.setShadow(1, .5, '#E7441E', 1, true, true);

    const valueLabel = this.scene.add.text(
      0,
      0,
      (() => {
        const isDemo = (this.scene as any).gameAPI?.getDemoState();
        const currencyPrefix = isDemo ? '' : CurrencyManager.getInlinePrefix();
        return `${currencyPrefix}${formatCurrencyNumber(data.totalWin)}`;
      })(),
      {
        fontSize: `${this.labelFontSize}px`,
        color: '#ffffff',
        fontFamily: this.labelFontFamily,
        stroke: '#004D00',
        strokeThickness: 4,
        align: 'center'
      }
    );
    valueLabel.setOrigin(0.5, 0.5);
    //valueLabel.setShadow(1, .5, '#E7441E', 1, true, true);

    const baseGap = this.innerGap;
    const gap = Math.max(6, Math.floor(baseGap * 0.6));
    const iconGapBase = Math.max(2, Math.floor(gap * 0.5));
    const iconGap = Math.max(1, Math.floor(iconGapBase * (this.multiplierIconGap || 1)));

    const mulIcons: Phaser.GameObjects.Image[] = [];
    let mulIconsWidth = 0;
    const iconsArr: any[] = Array.isArray(data.multiplierIcons) ? (data.multiplierIcons as any[]) : [];
    const hasMulIcons = iconsArr.length > 0;
    if (hasMulIcons) {
      const mulIconTargetH = Math.max(16, this.labelFontSize + 2);
      for (const it of iconsArr) {
        for (let i = 0; i < Math.max(0, Math.floor(it.count || 0)); i++) {
          const mk = `symbol_${it.symbol}`;
          const img = this.scene.add.image(0, 0, mk);
          img.setOrigin(0.5, 0.5);
          const srcH = (img as any).height || 0;
          if (srcH > 0) {
            const baseScale = mulIconTargetH / srcH;
            img.setScale(baseScale * (this.multiplierIconScale || 1));
          } else {
            img.setScale(this.iconScale * 0.25 * (this.multiplierIconScale || 1));
          }
          mulIcons.push(img);
        }
      }
      mulIconsWidth = mulIcons.reduce((acc, img) => acc + img.displayWidth, 0) + iconGap * Math.max(0, mulIcons.length - 1);
    }
    const totalWidth =
      countLabel.displayWidth +
      gap +
      iconDW +
      (hasMulIcons && mulIconsWidth > 0 ? (gap + mulIconsWidth) : 0) +
      (multiplierLabel ? (gap + multiplierLabel.displayWidth) : 0) +
      gap +
      eqLabel.displayWidth +
      gap +
      valueLabel.displayWidth;

    let cursor = -totalWidth * 0.5;

    countLabel.setPosition(cursor + countLabel.displayWidth * 0.5, 0);
    cursor += countLabel.displayWidth + gap;

    icon.setPosition(cursor + iconDW * 0.5, 0);
    if (shadow) {
      shadow.setPosition(icon.x + this.shadowOffsetX, icon.y + this.shadowOffsetY);
    }
    cursor += iconDW;

    if (mulIcons.length > 0) {
      cursor += gap;
      for (let i = 0; i < mulIcons.length; i++) {
        const img = mulIcons[i];
        img.setPosition(cursor + img.displayWidth * 0.5, 0);
        cursor += img.displayWidth + (i < mulIcons.length - 1 ? iconGap : 0);
      }
    }

    if (multiplierLabel) {
      cursor += gap;
      multiplierLabel.setPosition(cursor + multiplierLabel.displayWidth * 0.5, 0);
      cursor += multiplierLabel.displayWidth;
    }

    cursor += gap;

    eqLabel.setPosition(cursor + eqLabel.displayWidth * 0.5, 0);
    cursor += eqLabel.displayWidth + gap;

    valueLabel.setPosition(cursor + valueLabel.displayWidth * 0.5, 0);

    if (shadow) {
      itemContainer.add(shadow);
    }
    itemContainer.add(icon);
    itemContainer.add(countLabel);
    for (const img of mulIcons) { itemContainer.add(img); }
    if (multiplierLabel) { itemContainer.add(multiplierLabel); }
    itemContainer.add(eqLabel);
    itemContainer.add(valueLabel);

    let width = totalWidth;
    try {
      const b = itemContainer.getBounds();
      if (b && b.width > 0) {
        width = b.width;
      }
    } catch { }

    return { container: itemContainer, width };
  }

  private buildSummaryFromTumbleOuts(
    outs: Array<{ symbol?: number; count?: number; win?: number }> | null,
    spinData: SpinData | null
  ): Map<number, SymbolSummary> | null {
    if (!outs || outs.length === 0) return null;
    const summary = new Map<number, SymbolSummary>();
    for (const out of outs) {
      const symbolId = Number(out?.symbol);
      const count = Number(out?.count) || 0;
      const win = Number(out?.win) || 0;
      if (!isFinite(symbolId) || count < 8 || win <= 0) continue;
      const existing = summary.get(symbolId) || {
        lines: 0,
        totalWin: 0,
        multiplier: 1,
        baseValue: 0,
        multiplierIcons: [],
        multiplierCount: 1
      };
      existing.lines += count;
      existing.totalWin += win;
      summary.set(symbolId, existing);
    }
    if (summary.size === 0) return null;

    // Attach multipliers from current grid state
    const multiplierIconMap = new Map<number, number>();
    let multiplierSum = 0;
    try {
      const area: number[][] = Array.isArray((spinData as any)?.slot?.area) ? (spinData as any).slot.area : [];
      for (let c = 0; c < area.length; c++) {
        const col = area[c] || [];
        for (let r = 0; r < col.length; r++) {
          const v = Number(col[r]);
          if (!isFinite(v)) continue;
          if (v >= 10 && v <= 22) {
            multiplierIconMap.set(v, (multiplierIconMap.get(v) || 0) + 1);
            multiplierSum += this.getMultiplierNumeric(v);
          }
        }
      }
    } catch {}
    // Show multiplier numeric total in WinTracker (hidden during bonus game)
    const multiplierIcons: Array<{ symbol: number; count: number }> = [];
    const multiplierCount = gameStateManager.isBonus ? 0 : multiplierSum;

    for (const [symbolId, data] of Array.from(summary.entries())) {
      data.baseValue = data.totalWin > 0 && data.lines > 0 ? (data.totalWin / data.lines) : 0;
      data.multiplierIcons = multiplierIcons;
      data.multiplierCount = multiplierCount > 0 ? multiplierCount : 0;
      summary.set(symbolId, data);
    }
    return summary;
  }

  private createSymbolIcon(symbolId: number): { icon: any; isSpine: boolean } {
    // Try to create a spine-based icon for standard symbols (0–9)
    try {
      if (symbolId >= 0 && symbolId <= 9) {
        if (ensureSpineFactory(this.scene, 'WinTracker')) {
          const sugarKey = `symbol_${symbolId}_sugar_spine`;
          const sugarAtlasKey = `${sugarKey}-atlas`;
          const go: any = (this.scene.add as any).spine?.(0, 0, sugarKey, sugarAtlasKey);
          if (go) {
            try { go.setOrigin?.(0.5, 0.5); } catch {}
            // Small icon scale
            try { go.setScale?.(this.iconScale); } catch {}
            // Play idle if present
            try {
              const idle = `Symbol${symbolId}_SW_Idle`;
              if (go.animationState?.setAnimation) {
                const entry = go.animationState.setAnimation(0, idle, true);
                try {
                  const duration = (go as any)?.skeleton?.data?.findAnimation?.(idle)?.duration;
                  if (typeof duration === 'number' && duration > 0 && entry) {
                    (entry as any).trackTime = Math.random() * duration;
                  }
                } catch {}
                try {
                  const speedJitter = 0.95 + Math.random() * 0.1;
                  (go.animationState as any).timeScale = speedJitter;
                } catch {}
              }
            } catch {}
            return { icon: go, isSpine: true };
          }
        }
      }
    } catch {}

    // Try multipliers (10–22) using Symbol10_BZ spine
    try {
      if (symbolId >= 10 && symbolId <= 22) {
        if (ensureSpineFactory(this.scene, 'WinTracker')) {
          const multiKey = `symbol_10_sugar_spine`;
          const multiAtlasKey = `${multiKey}-atlas`;
          const go: any = (this.scene.add as any).spine?.(0, 0, multiKey, multiAtlasKey);
          if (go) {
            try { go.setOrigin?.(0.5, 0.5); } catch {}
            try { go.setScale?.(this.iconScale); } catch {}
            try {
              const base = this.getMultiplierAnimationBase(symbolId);
              const idle = base ? `${base}_idle` : null;
              if (idle && go.animationState?.setAnimation) {
                const entry = go.animationState.setAnimation(0, idle, true);
                try {
                  const duration = (go as any)?.skeleton?.data?.findAnimation?.(idle)?.duration;
                  if (typeof duration === 'number' && duration > 0 && entry) {
                    (entry as any).trackTime = Math.random() * duration;
                  }
                } catch {}
                try {
                  const speedJitter = 0.95 + Math.random() * 0.1;
                  (go.animationState as any).timeScale = speedJitter;
                } catch {}
              }
            } catch {}
            return { icon: go, isSpine: true };
          }
        }
      }
    } catch {}

    // Fallback to PNG sprite
    const key = `symbol_${symbolId}`;
    const img = this.scene.add.image(0, 0, key);
    img.setOrigin(0.5, 0.5);
    img.setScale(this.iconScale);
    return { icon: img, isSpine: false };
  }

  private getMultiplierAnimationBase(value: number): string | null {
    return (value >= 10 && value <= 22) ? 'Symbol10_BZ' : null;
  }

  private getPaylineMultiplier(payline: any): number {
    try {
      const arr = (payline && Array.isArray(payline.multipliers)) ? payline.multipliers : [];
      let factor = 1;
      for (const m of arr) {
        const base = this.getMultiplierValueForSymbol(m?.symbol);
        const count = Math.max(0, Math.floor(m?.count || 0));
        if (base > 1 && count > 0) {
          factor *= Math.pow(base, count);
        }
      }
      return Math.max(1, Math.floor(factor));
    } catch {
      return 1;
    }
  }

  private getPaylineMultiplierStats(payline: any): { product: number; sum: number; icons: Array<{ symbol: number; count: number }> } {
    try {
      const arr = (payline && Array.isArray(payline.multipliers)) ? payline.multipliers : [];
      let product = 1;
      let sum = 0;
      const iconMap = new Map<number, number>();
      for (const m of arr) {
        const base = this.getMultiplierValueForSymbol(m?.symbol);
        const count = Math.max(0, Math.floor(m?.count || 0));
        if (base > 1 && count > 0) {
          product *= Math.pow(base, count);
          sum += base * count;
          iconMap.set(m.symbol, (iconMap.get(m.symbol) || 0) + count);
        }
      }
      if (sum === 0) sum = 1;
      const icons = Array.from(iconMap.entries()).map(([symbol, count]) => ({ symbol, count }));
      return { product: Math.max(1, Math.floor(product)), sum, icons };
    } catch {
      return { product: 1, sum: 1, icons: [] };
    }
  }

  private getMultiplierValueForSymbol(symbolId: number | undefined): number {
    // Use centralized multiplier value function from SymbolTypes
    return getMultiplierValue(Number(symbolId));
  }

  // Map multiplier symbol value (10–22) to numeric multiplier
  // Delegates to centralized SymbolTypes utility
  private getMultiplierNumeric(value: number): number {
    return getMultiplierValue(value);
  }

  public setLayout(options: WinTrackerLayoutOptions): void {
    if (typeof options.offsetX === 'number') {
      this.offsetX = options.offsetX;
    }
    if (typeof options.offsetY === 'number') {
      this.offsetY = options.offsetY;
    }
    if (typeof options.spacing === 'number' && options.spacing > 0) {
      this.itemSpacing = options.spacing;
    }
    if (typeof options.iconScale === 'number' && options.iconScale > 0) {
      this.iconScale = options.iconScale;
    }
    if (typeof options.innerGap === 'number' && options.innerGap >= 0) {
      this.innerGap = options.innerGap;
    }
    if (typeof options.multiplierIconScale === 'number' && options.multiplierIconScale > 0) {
      this.multiplierIconScale = options.multiplierIconScale;
    }
    if (typeof options.multiplierIconGap === 'number' && options.multiplierIconGap > 0) {
      this.multiplierIconGap = options.multiplierIconGap;
    }

    if (this.container) {
      this.container.setPosition(
        this.baseX + this.offsetX,
        this.baseY + this.offsetY
      );
    }
  }

  public autoHideAfter(delayMs: number): void {
    if (!this.scene || !this.container) {
      return;
    }
    if (this.autoHideTimer) {
      try { this.autoHideTimer.remove(false); } catch {}
      this.autoHideTimer = null;
    }
    this.autoHideTimer = this.scene.time.delayedCall(delayMs, () => {
      this.autoHideTimer = null;
      this.fadeOut(250);
    });
  }

  /**
   * Fade the tracker out before clearing it.
   * Used by callers instead of instantly hiding to give a smoother UX.
   */
  public hideWithFade(durationMs: number = 250): void {
    this.stopPaging();
    this.fadeOut(durationMs);
  }

  private fadeOut(durationMs: number): void {
    if (!this.scene || !this.container) {
      return;
    }
    if (!this.container.visible) {
      return;
    }
    try {
      this.scene.tweens.killTweensOf(this.container);
    } catch {}
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: durationMs,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.clear();
      }
    });
  }
}

export default WinTracker;
