import { Scene, GameObjects } from 'phaser';

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

const PAYOUT_RANGES = ['12+', '10', '8'] as const;

const SYMBOL_PAYOUTS: Record<number, [number, number, number]> = {
    1: [50.0, 25.0, 10.0],
    2: [25.0, 10.0, 2.5],
    3: [15.0, 5.0, 2.0],
    4: [12.0, 2.0, 1.5],
    5: [10.0, 1.5, 1.0],
    6: [8.0, 1.2, 0.8],
    7: [5.0, 1.0, 0.5],
    8: [4.0, 0.9, 0.4],
    9: [2.0, 0.75, 0.25],
};

const SCATTER_PAYOUTS: [number, number, number] = [100.0, 5.0, 3.0];
const SCATTER_COUNTS = ['6', '5', '4'] as const;
const SCATTER_DESCRIPTIONS = [
    'This is the SCATTER symbol.',
    'SCATTER symbol is present on all reels.',
    'SCATTER pays on any position.',
] as const;

type ButtonBase = {
    isButton?: boolean;
};

type ButtonContainer = GameObjects.Container & ButtonBase;
type ButtonImage = GameObjects.Image & ButtonBase;
type ButtonText = GameObjects.Text & ButtonBase;

type GameScene = Scene & {
    getCurrentBetAmount?: () => number;
};

interface HelpScreenStyles {
    titleStyle: TextStyle;
    header1Style: TextStyle;
    header2Style: TextStyle;
    content1Style: TextStyle;
    contentHeader1Style: TextStyle;
    textStyle: TextStyle;
}

export class HelpScreen {
    private readonly contentArea: GameObjects.Container;
    private readonly rulesContent: GameObjects.Container;

    private scrollView: GameObjects.Container;
    private contentContainer: GameObjects.Container;
    /**
     * Cached total scrollable content height. This allows us to clamp
     * scrolling precisely to the visible help content (ending at the
     * bottom of the How to Play section) instead of relying only on
     * the running yPosition cursor.
     */
    private contentHeight: number = 0;
    private mask: Phaser.Display.Masks.GeometryMask;

    private readonly xOffsetAdjustment: number = -20;
    private readonly padding: number = 10; // Global padding, this should be deprecated
    private readonly borderHorizontalPadding: number = 20; // Horizontal padding, this should be deprecated
    private readonly menuTopPadding: number = 20;
    private readonly sectionSpacing: number = 60;
    private readonly tabHeight: number = 61;
    private readonly contentWidth: number = 1200;
    private yPosition: number = 0;
    private textHorizontalPadding?: number;

    private readonly borderFillColor: number = 0xFFFFFF;
    private readonly borderStrokeColor: number = 0xffffff;
    private readonly borderFillAlpha: number = 0.1;
    private readonly borderStrokeAlpha: number = 0.2;

    private symbolSize: number = 153;
    private symbolScale: number = 0.7;
    private scaledSymbolSize: number = this.symbolSize * this.symbolScale;
    private dividerColor: number = 0x379557;

    // Text styles (mirrors Menu)
    private titleStyle: TextStyle;
    private header1Style: TextStyle;
    private header2Style: TextStyle;
    private content1Style: TextStyle;
    private contentHeader1Style: TextStyle;
    private textStyle: TextStyle;

    private readonly isMenuVisible: () => boolean;
    private readonly getBetAmount: () => number;
    private tabInteractionBlocker?: Phaser.GameObjects.Zone;
    private tabInteractionHitArea?: Phaser.Geom.Rectangle;
    private isTabInteractionBlocked: boolean = false;
    
    // Game Rules section
    // RTP section
    // Payout section
    private readonly payoutSymbolCount: number = 9;
    private readonly payoutSymbolKey: string = 'symbol';
    private readonly payoutTextRowSpacing: number = 30;
    private readonly payoutTextFontSize: number = 22;
    private readonly payoutRangeTextFontSize: number = 22;
    private readonly payoutInnerPadding: number = 20;

    // Scatter section
    private readonly scatterSymbolKey: string = 'symbol0';
    private readonly scatterHeaderLeftPadding: number = 30;
    private readonly scatterHeaderTopPadding: number = 20;
    private readonly scatterBottomPadding: number = 20;
    private readonly scatterElementSpacing: number = 50;
    private readonly scatterPayoutTextFontSize: number = 22;
    private readonly scatterPayoutTextColumnSpacing: number = 175;
    private readonly scatterPayoutTextRowSpacing: number = 30;

    // Free Spins section
    private readonly freeSpinHeaderSpacing: number = 20;

    // Game Settings section
    private readonly gameSettingsTextHorizontalPadding: number = 30;
    private readonly gameSettingsTextTopPadding: number = 20;
    private readonly gameSettingsTextBottomPadding: number = 30;
    private readonly gameSettingsElementSpacing: number = 30;

    // How to Play section
    private readonly howToPlayHorizontalPadding: number = 30;
    private readonly howToPlayElementSpacing: number = 20;

    constructor(
        private readonly scene: GameScene,
        contentArea: GameObjects.Container,
        rulesContent: GameObjects.Container,
        styles: HelpScreenStyles,
        isMenuVisible: () => boolean,
        getBetAmount?: () => number
    ) {
        this.contentArea = contentArea;
        this.rulesContent = rulesContent;

        this.titleStyle = styles.titleStyle;
        this.header1Style = styles.header1Style;
        this.header2Style = styles.header2Style;
        this.content1Style = styles.content1Style;
        this.contentHeader1Style = styles.contentHeader1Style;
        this.textStyle = styles.textStyle;

        this.isMenuVisible = isMenuVisible;
        this.getBetAmount = getBetAmount ?? (() => 1);

        this.contentWidth = scene.scale.width - 70;
    }

    public build(): void {
        this.setupScrollableRulesContent(this.scene);
    }

    private setupScrollableRulesContent(scene: GameScene): void {
        // Create scroll view container
        this.scrollView = scene.add.container(0, 0);
        this.contentContainer = scene.add.container(0, 0);
        this.scrollView.add(this.contentContainer);

        // Create mask for scrolling
        const maskGraphics = scene.add.graphics();
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillRect(0, 0, this.contentArea.width, this.contentArea.height);
        this.mask = maskGraphics.createGeometryMask();
        this.scrollView.setMask(this.mask);
        // Make the mask graphics invisible (it's only used for the mask, not for display)
        maskGraphics.setVisible(false);

        // Create the rules content
        this.createHelpScreenContent(scene, this.rulesContent);

        // Add scroll view to rules content
        this.rulesContent.add(this.scrollView);

        // Enable scrolling
        this.enableScrolling(scene);
    }

    private addTitleText(scene: GameScene, text: string, container?: GameObjects.Container): GameObjects.Text {
        const content = scene.add.text(
            this.textHorizontalPadding ?? this.padding / 2,
            this.yPosition,
            text,
            this.titleStyle as TextStyle
        );

        container?.add(content);

        if (container === undefined) {
            this.contentContainer.add(content);
        }

        if (text === 'Bonus Trigger') {
            content.setPosition(0, content.y);
        }
        return content;
    }

    private addBodyText(
        scene: GameScene,
        text: string,
        wordWrap: boolean = false,
        wordWrapWidth: number = 0,
        container?: GameObjects.Container
    ): GameObjects.Text {
        const style = { ...this.textStyle } as TextStyle;
        if (wordWrap) {
            style.wordWrap = { width: wordWrapWidth } as any;
        }
        const content = scene.add.text(
            this.textHorizontalPadding ?? this.padding / 2,
            this.yPosition,
            text,
            style
        );
        container?.add(content);
        if (container === undefined) {
            this.contentContainer.add(content);
        }
        return content;
    }

    private addHeaderText(
        scene: GameScene,
        text: string,
        wordWrap: boolean = false,
        wordWrapWidth: number = 0,
        container?: GameObjects.Container
    ): GameObjects.Text {
        const style = { ...this.contentHeader1Style } as TextStyle;
        if (wordWrap) {
            style.wordWrap = { width: wordWrapWidth } as any;
        }
        // If we're adding the header into a nested container, its local Y should
        // start at 0 (top of that container). Otherwise, use the running
        // screen-level yPosition like the rest of the help sections.
        const headerY = container ? 0 : this.yPosition;

        const content = scene.add.text(
            this.textHorizontalPadding ?? this.padding / 2,
            headerY,
            text,
            style
        );
        container?.add(content);
        if (container === undefined) {
            this.contentContainer.add(content);
        }
        return content;
    }

    private createHelpScreenContent(scene: GameScene, contentArea: GameObjects.Container): void {
        this.textHorizontalPadding = -2;
        this.yPosition = this.padding + 10;

        this.createGameRulesSection(scene, contentArea); // Create Game Rules section
        this.createRTPSection(scene, contentArea); // Create RTP section
        this.createMaxWinSection(scene, contentArea); // Create Max Win section

        this.yPosition += this.sectionSpacing;
        this.createPayoutContent(scene, contentArea); // Create Payout section
        this.createScatterPayoutSection(scene, contentArea); // Create Scatter payout section
        this.yPosition += this.sectionSpacing;

        this.loadHelpScreenImages(scene, contentArea);

        if(false)
        {
        // Divider between scatter payout and freespin rules section
        this.yPosition += this.sectionSpacing;
        this.addDivider(scene, this.dividerColor);
        this.yPosition += this.sectionSpacing;

        // Enhanced Bet
        //this.createEnhancedBetSection(scene, contentArea);

        // Buy Feature
        //this.createBuyFeatureSection(scene, contentArea)

        // Create Free Spin Rules section
        // Create Bonus Trigger section
        this.createFreeSpinRulesSection(scene, contentArea);

        this.yPosition += this.sectionSpacing;

        this.createGameSettingsSection(scene, contentArea);

        this.yPosition += this.sectionSpacing;

        this.createHowToPlaySection(scene, this.contentWidth, this.symbolSize);
        }

        contentArea.add(this.contentContainer);

        // Measure the final rendered height of all help content so that
        // scroll bounds line up with the actual content, stopping at the
        // end of the How to Play section (the last section created).
        // Add an extra sectionSpacing at the end so there is breathing
        // room when the player scrolls all the way to the bottom.
        const measuredHeight = this.measureContainerHeight(this.contentContainer) || this.yPosition;
        this.contentHeight = measuredHeight + this.sectionSpacing / 2;
    }

    private createGameRulesSection(scene: GameScene, contentArea: GameObjects.Container): void {
        this.addTextBlock(scene, 'header1', 'Game Rules', { spacingAfter: 15 });
        this.addTextBlock(scene, 'content1', 'Win by landing 8 or more matching symbols anywhere on the screen. The more matching symbols you get, the higher your payout.', { wordWrapWidth: this.contentWidth, spacingAfter: 24 });
    }

    private createRTPSection(scene: GameScene, contentArea: GameObjects.Container): void {
        const headerHeight = this.addTextBlock(scene, 'header2', 'RTP').height;
        const bodyHeight = this.addBodyText(scene, '96.49% - 96.6%', false, 0).height;
        
        this.yPosition += headerHeight + bodyHeight;
    }

    private createMaxWinSection(scene: GameScene, contentArea: GameObjects.Container): void {
        const headerHeight = this.addTextBlock(scene, 'header2', 'Max Win').height;
        const bodyHeight = this.addBodyText(scene, '21,000x', false, 0).height;
        this.yPosition += headerHeight + bodyHeight ;
    }

    private createPayoutContent(scene: GameScene, contentArea: GameObjects.Container): void {
        this.addTextBlock(scene, 'header2', 'Payout');
        this.yPosition += this.padding;

        for (let symbolIndex = 1; symbolIndex <= this.payoutSymbolCount; symbolIndex++) {
            const payoutData = SYMBOL_PAYOUTS[symbolIndex];

            if (!payoutData) continue;

            this.createSinglePayoutContent(scene, contentArea, symbolIndex, payoutData, PAYOUT_RANGES);
        }
    }

    private createSinglePayoutContent(
        scene: GameScene,
        container: GameObjects.Container,
        symbolIndex: number,
        payoutData: [number, number, number],
        payoutRange: readonly string[],
    ): void {
        void container;
        const symbolContainer = scene.add.container(0, this.yPosition);
        this.contentContainer.add(symbolContainer);

        // Display symbol
        const symbol = scene.add.image(0, 0, `${this.payoutSymbolKey}${symbolIndex}`);
        symbol.displayWidth = this.symbolSize * this.symbolScale;
        symbol.displayHeight = this.symbolSize * this.symbolScale;
        symbol.setOrigin(0, 0.5);
        symbolContainer.add(symbol);

        // Left column start (to the right of the symbol), right column anchor (near right edge)
        const rangeTextX = symbol.displayWidth + this.payoutInnerPadding;
        const payoutTexts: Array<{ text: GameObjects.Text; row: number }> = [];
        const rangeTexts: Array<{ text: GameObjects.Text; row: number }> = [];

        // Check if demo mode is active - if so, use blank currency symbol
        const isDemo = (scene as any)?.gameAPI?.getDemoState();
        const currencySymbol = isDemo ? '' : '$';

        for (let row = 0; row < 3; row++) {
            const y = 0;
            // Left column: range label (bold)
            const rangeText = scene.add.text(rangeTextX, y, payoutRange[row] ?? '', {
                fontSize: this.payoutRangeTextFontSize + 'px',
                color: '#FFFFFF',
                fontFamily: 'Poppins-Regular',
                fontStyle: 'bold',
                align: 'left',
            });
            rangeText.setOrigin(0, 0.5);
            symbolContainer.add(rangeText);
            rangeTexts.push({ text: rangeText, row });

            // Right column: payout value, right-aligned
            const value = payoutData[row] ?? 0;
            const adjustedValue = this.applyBetToPayout(value);
            const valueText = currencySymbol + (currencySymbol ? ' ' : '') + this.formatPayout(adjustedValue);
            const payoutText = scene.add.text(0, y, valueText, {
                fontSize: this.payoutTextFontSize + 'px',
                color: '#FFFFFF',
                fontFamily: 'Poppins-Regular',
                align: 'right',
            });
            payoutText.setOrigin(1, 0.5);
            symbolContainer.add(payoutText);
            payoutTexts.push({ text: payoutText, row });
        }

        const sectionHeight = this.createDynamicBorder(scene, symbolContainer, {
            paddingTop: this.payoutInnerPadding,
            paddingBottom: this.payoutInnerPadding,
            offsetX: 0,
        });

        // Align payout texts after border has been drawn so frame metrics reflect actual bounds
        const { frameW, frameX, frameY, frameH } = this.getFrameMetrics(symbolContainer);
        const borderCenter = {
            x: frameX + frameW / 2,
            y: frameY + frameH / 2,
        };
        const rightColAnchorX = frameX + frameW - this.payoutInnerPadding;
        const leftColAnchorX = frameX + this.payoutInnerPadding;

        symbol.setY(borderCenter.y);
        symbol.setX(leftColAnchorX);

        const rowCount = Math.max(1, payoutRange.length);
        const rowStartY = borderCenter.y - ((rowCount - 1) * this.payoutTextRowSpacing) / 2;

        payoutTexts.forEach(({ text, row }) => {
            text.setX(rightColAnchorX);
            text.setY(rowStartY + row * this.payoutTextRowSpacing);
        });

        rangeTexts.forEach(({ text, row }) => {
            text.setX(text.x + leftColAnchorX);
            text.setY(rowStartY + row * this.payoutTextRowSpacing);
        });

        this.yPosition += sectionHeight + this.padding;
    }

    private createScatterPayoutSection(scene: GameScene, contentArea: GameObjects.Container): void {
        // Create symbol container that will receive a dynamic border
        const symbolContainer = scene.add.container(0, this.yPosition);
        this.contentContainer.add(symbolContainer);
        this.contentContainer.sendToBack(symbolContainer);

        // Temporarily increase left padding for Scatter label only
        const scatterHeader = this.addHeaderText(scene, 'Scatter', false, 0, symbolContainer);
        scatterHeader.setY(scatterHeader.y + this.scatterHeaderTopPadding);
        scatterHeader.setX(scatterHeader.x + this.scatterHeaderLeftPadding);

        // Add symbol
        const symbol = scene.add.sprite(0, 0, this.scatterSymbolKey);
        symbol.setScale(1);
        symbol.setOrigin(0.5, 0.5);
        symbolContainer.add(symbol);

        // Center symbol horizontally inside the bordered area
        const { frameW } = this.getFrameMetrics(symbolContainer);

        symbol.setPosition(frameW / 2, scatterHeader.y + scatterHeader.displayHeight + this.scaledSymbolSize + scatterHeader.displayHeight);

        // Left column start (to the right of the symbol), right column anchor (near right edge)
        const baseTextX = symbol.x;
        const baseTextY = symbol.y + symbol.displayHeight / 2 + this.scatterElementSpacing;
        const payoutTexts: Array<{ text: GameObjects.Text; row: number }> = [];
        const rangeTexts: Array<{ text: GameObjects.Text; row: number }> = [];

        // Check if demo mode is active - if so, use blank currency symbol
        const isDemo = (scene as any)?.gameAPI?.getDemoState();
        const currencySymbol = isDemo ? '' : '$';

        for (let row = 0; row < 3; row++) {
            const adjustedTextY = baseTextY + row * this.scatterPayoutTextRowSpacing;
            
            // Left column: range label (bold)
            const rangeTextX = baseTextX - this.scatterPayoutTextColumnSpacing / 2;
            const rangeText = scene.add.text(rangeTextX, adjustedTextY, SCATTER_COUNTS[row] ?? '', {
                fontSize: this.scatterPayoutTextFontSize + 'px',
                color: '#FFFFFF',
                fontFamily: 'Poppins-Bold',
                fontStyle: 'bold',
                align: 'left',
            });
            rangeText.setOrigin(0, 0.5);
            symbolContainer.add(rangeText);
            rangeTexts.push({ text: rangeText, row });

            // Right column: payout value, right-aligned
            const value = SCATTER_PAYOUTS[row] ?? 0;
            const adjustedValue = this.applyBetToPayout(value);
            const valueText = currencySymbol + (currencySymbol ? ' ' : '') + this.formatPayout(adjustedValue);
            const payoutTextX = baseTextX + this.scatterPayoutTextColumnSpacing / 2;
            const payoutText = scene.add.text(payoutTextX, adjustedTextY, valueText, {
                fontSize: this.scatterPayoutTextFontSize + 'px',
                color: '#FFFFFF',
                fontFamily: 'Poppins-Regular',
                align: 'right',
            });
            payoutText.setOrigin(1, 0.5);
            symbolContainer.add(payoutText);
            payoutTexts.push({ text: payoutText, row });
        }

        const tableBottomLocalY = baseTextY;
        const descTopLocalY = tableBottomLocalY + this.scatterElementSpacing + this.scatterPayoutTextRowSpacing * 3;

        const scatterDescriptionText = SCATTER_DESCRIPTIONS.join('\n');
        // Center the scatter description text under the Scatter symbol/table
        const descText = scene.add.text(
            symbol.x,
            descTopLocalY,
            scatterDescriptionText,
            {
                ...this.textStyle,
                align: 'left',
                wordWrap: { width: this.contentWidth - this.padding * 2 } as any,
            }
        );
        descText.setOrigin(0.5, 0);
        symbolContainer.add(descText);

        // Dynamically size border to fit all content with custom padding,
        // while keeping a similar vertical offset as before
        const sectionHeight = this.createDynamicBorder(scene, symbolContainer, {
            paddingTop: this.scatterHeaderTopPadding,
            paddingBottom:  this.scatterBottomPadding,
        });

        this.yPosition += sectionHeight; // Move to next row based on actual container height
    }

    private loadHelpScreenImages(scene: GameScene, contentArea: GameObjects.Container): void {
        void contentArea;

        // Sequentially display help screen images named using an index.
        // The loop stops when no matching texture key can be found.
        let index = 0;
        const spacing = this.sectionSpacing;
        // const correctionOffset = 16;
        const correctionOffset = 0;

        while (true) {
            // Support multiple possible texture key conventions:
            // - "helpscreen_{index}" or "helpscreen_{index}.png"
            // - "help_screen_{index}" (matches AssetConfig help_screen_0/1/2)
            const candidateKeys = [
                `helpscreen_${index}`,
                `helpscreen_${index}.png`,
                `help_screen_${index}`,
            ];

            const textureKey = candidateKeys.find((key) => scene.textures.exists(key));
            if (!textureKey) {
                break;
            }

            // Create image at the current vertical cursor and scale it
            // so that it fits the full available width while preserving
            // its aspect ratio.
            const img = scene.add.image(0, this.yPosition, textureKey);
            img.setOrigin(0, 0);

            // Use the full content width with no horizontal padding.
            const availableWidth = this.contentArea ? this.contentArea.width + correctionOffset : this.contentWidth + correctionOffset;
            const nativeWidth = img.width || 1;
            const scale = availableWidth / nativeWidth;
            img.setScale(scale);

            this.contentContainer.add(img);

            // Advance global Y cursor so images appear one after another vertically.
            this.yPosition += img.displayHeight + spacing;
            index++;
        }
    }

    private createFreeSpinRulesSection(scene: GameScene, container: GameObjects.Container): void {
        this.addTextBlock(scene, 'header2', 'Free Spins Rules', { spacingAfter: this.freeSpinHeaderSpacing });

        const freeSpinContainer = scene.add.container(0, this.yPosition);

        this.contentContainer.add(freeSpinContainer);
        this.contentContainer.sendToBack(freeSpinContainer);

        // Use a common template for Bonus Trigger and Free Spins Start
        const freeSpinsTitleOffset = this.padding * 15; // distance from image → title
        const freeSpinsDescOffset = this.padding * 5; // distance from title → description
        const bonusDesc = 'Land 4 or more             SCATTER \n\nand win 15 spins';
        const bonusImageTop = this.padding * 31.5; // explicit image Y inside the bordered area
        // Compute center X of the bordered container for image placement
        const { frameW, frameX } = this.getFrameMetrics(freeSpinContainer);
        const centerX0 = frameX + frameW / 2;
        const bonusBottomY = this.addSubSectionInstruction(scene, freeSpinContainer, {
            title: 'Bonus Trigger',
            imageKey: 'scatterGame',
            imageX: centerX0 - 10,
            imageY: bonusImageTop,
            imageOrigin: { x: 0.5, y: 0.33 },
            imageScale: 1.1,
            titleOffsetY: freeSpinsTitleOffset,
            titleX: (this.textHorizontalPadding ?? this.padding / 2) + this.padding * 3.1,
            desc: bonusDesc,
            descOffsetY: freeSpinsDescOffset,
            descX: this.padding * 3,
            wordWrapWidth: this.contentWidth + this.padding * 3,
        });

        // Horizontal divider under Bonus Trigger
        const dividerY = bonusBottomY + this.padding * 6;

        const fsDesc = 'Land 3             SCATTER \n\nand win 5 more spins';
        const titleX2 = (this.textHorizontalPadding ?? this.padding / 2) + this.padding * 3.1;
        const descX2 = this.padding * 3;

        // Text-only section (header and body) similar to Bonus Trigger
        const headerY2 = dividerY + this.padding;
        const headerText2 = this.addTextBlock(scene, 'header2', 'In-Bonus Freespin Retrigger', {
            container: freeSpinContainer,
            x: titleX2,
            y: headerY2,
        });
        void headerText2;
        const bodyY2 = headerY2 + freeSpinsDescOffset;
        const bodyText2 = scene.add.text(descX2, bodyY2, fsDesc, {
            ...this.textStyle,
            wordWrap: { width: this.contentWidth + this.padding * 3 },
        });
        bodyText2.setOrigin(0, 0);
        freeSpinContainer.add(bodyText2);
        const fsStartBottom = bodyText2.y + bodyText2.displayHeight;

        // Tumble Win info card – placed before the internal divider, with its own border
        const tumbleTopY = fsStartBottom + this.padding * 4;
        const tumbleBottomY = this.createTumbleWinSection(scene, freeSpinContainer, tumbleTopY);

        // Divider after Tumble Win / Free Spins Start
        const dividerY2 = tumbleBottomY + this.padding * 4;
        const inset2 = this.padding * 2;
        const lineWidth2 = Math.max(0, frameW - inset2 * 2);
        const lineLeft2 = frameX + inset2;
        const dividerG2 = scene.add.graphics();
        dividerG2.fillStyle(this.dividerColor, 1);
        dividerG2.fillRect(lineLeft2 - 10, dividerY2, lineWidth2, 1);
        freeSpinContainer.add(dividerG2);

        // New section: Free Spins Round (mirror Free Spins Start spacing)
        const fsRoundDesc =
            'The Free Spins Feature activates with 4+ Scatters, starting with 15 spins. Multiplier symbols add to a total multiplier applied to all wins, and 3+ Scatters during the round award 5 extra spin, with special reels in play.';
        const fsRoundImageTop = dividerY2 + this.padding * 42;
        this.addSubSectionInstruction(scene, freeSpinContainer, {
            title: 'Free Spins Round',
            imageKey: 'scatterGame',
            imageX: frameX + frameW / 2 - 10,
            imageY: fsRoundImageTop,
            imageOrigin: { x: 0.5, y: 0.5 },
            imageScale: 1.1,
            titleOffsetY: freeSpinsTitleOffset - 111,
            titleX: (this.textHorizontalPadding ?? this.padding / 2) + this.padding * 3.1,
            desc: fsRoundDesc,
            descOffsetY: freeSpinsDescOffset,
            descX: this.padding * 3,
            wordWrapWidth: this.contentWidth - this.padding * 3,
            lineSpacing: 8,
        });

        // Border will be added after all children so its height fits content dynamically

        const scatterSymbolInText = scene.add.image(0, 0, 'ScatterLabel');
        scatterSymbolInText.setScale(0.3);
        scatterSymbolInText.setOrigin(0.5, 0.5);
        scatterSymbolInText.setPosition(215, 880);
        freeSpinContainer.add(scatterSymbolInText);

        const scatterSymbolInText2 = scene.add.image(0, 0, 'ScatterLabel');
        scatterSymbolInText2.setScale(0.3);
        scatterSymbolInText2.setOrigin(0.5, 0.5);
        scatterSymbolInText2.setPosition(bodyText2.x + bodyText2.width * 0.5 - 15, bodyText2.y + bodyText2.height * 0.5 - 25);
        freeSpinContainer.add(scatterSymbolInText2);

        const scatterSymbolTopLeft = scene.add.image(30, 20, 'ScatterLabel');
        scatterSymbolTopLeft.setScale(0.6);
        scatterSymbolTopLeft.setOrigin(0, 0);
        freeSpinContainer.add(scatterSymbolTopLeft);

        const scatterWinImage = scene.add.image(0, 0, 'scatterWin');
        scatterWinImage.setScale(0.5);
        scatterWinImage.setOrigin(0.5, 0.5);
        scatterWinImage.setPosition(
            scatterSymbolTopLeft.x + scatterSymbolTopLeft.width * scatterSymbolTopLeft.scaleX,
            scatterSymbolTopLeft.y + scatterSymbolTopLeft.height * scatterSymbolTopLeft.scaleY * 0.35
        );
        freeSpinContainer.add(scatterWinImage);

        // Dynamically size border to fit all content with optional top/bottom padding
        this.yPosition += this.createDynamicBorder(scene, freeSpinContainer, {
            paddingTop: 0,
            paddingBottom: 50, // This is an arbitrary padding to fill the container. FIX THIS ASAP
        });
    }

    private createEnhancedBetSection(scene: GameScene, container: GameObjects.Container): void {
        this.addTextBlock(scene, 'header2', 'Enhanced Bet');
        const enhancedContainer = scene.add.container(0, this.yPosition);
        this.yPosition += this.createBorder(
            scene,
            enhancedContainer,
            this.padding,
            0,
            this.contentWidth + this.padding * 3,
            this.scaledSymbolSize * 3.1
        );
        this.contentContainer.add(enhancedContainer);

        // Use SlotController's amplify icon and center it in the section
        const pillY = 40;
        const pillH = 56;
        const sectionAreaWidth1 = this.contentWidth + this.padding * 3;
        const sectionCenterX1 = this.padding + sectionAreaWidth1 / 2;
        const amplifyIcon = scene.add.image(sectionCenterX1, pillY + pillH / 2, 'amplify') as ButtonImage;
        amplifyIcon.setOrigin(0.5, 0.5);
        const amplifyScale = 1.5;
        amplifyIcon.setScale(amplifyScale);
        enhancedContainer.add(amplifyIcon);

        // Description
        const enhanceDesc = scene.add.text(
            30,
            pillY + pillH + 40,
            "You’re wagering 25% more per spin, but you also have better\nchances at hitting big features.",
            {
                ...this.textStyle,
                wordWrap: { width: this.contentWidth - this.padding * 2 },
            }
        ) as ButtonText;
        enhanceDesc.setOrigin(0, 0);
        enhancedContainer.add(enhanceDesc);
    }

    private createBuyFeatureSection(scene: GameScene, container: GameObjects.Container): void {
        this.addTextBlock(scene, 'header2', 'Buy Feature');
        const buyFeatContainer = scene.add.container(-this.padding * 1.5, this.yPosition);
        this.yPosition += this.createBorder(
            scene,
            buyFeatContainer,
            this.padding,
            0,
            this.contentWidth + this.padding * 3,
            this.scaledSymbolSize * 2.8
        );
        this.contentContainer.add(buyFeatContainer);

        // Use controller feature button BG as the main visual button (centered)
        const btnY = 70;
        const sectionAreaWidth2 = this.contentWidth + this.padding * 3;
        const btnCenterX = this.padding + sectionAreaWidth2 / 2;
        const featureBg = scene.add.image(btnCenterX, btnY, 'feature') as ButtonImage;
        featureBg.setOrigin(0.5, 0.5);
        featureBg.setScale(1.3);
        buyFeatContainer.add(featureBg);

        const btnCenterY = featureBg.y;

        const buyLabel = scene.add.text(btnCenterX, btnCenterY - 8, 'BUY FEATURE', {
            fontSize: '18px',
            color: '#FFFFFF',
            fontFamily: 'Poppins-Bold',
        }) as ButtonText;
        buyLabel.setOrigin(0.5, 0.5);
        buyFeatContainer.add(buyLabel);

        // Static price text centered on the button (hide currency in demo)
        const isDemoBuyPrice = (scene as any)?.gameAPI?.getDemoState();
        const currencySymbolBuyPrice = isDemoBuyPrice ? '' : '$';
        const buyPrice = scene.add.text(btnCenterX, btnCenterY + 14, `${currencySymbolBuyPrice}10,000`, {
            fontSize: '18px',
            color: '#FFFFFF',
            fontFamily: 'Poppins-Bold',
        }) as ButtonText;
        buyPrice.setOrigin(0.5, 0.5);
        buyFeatContainer.add(buyPrice);

        // Description for Buy Feature
        const buyDesc = scene.add.text(
            30,
            btnY + featureBg.displayHeight / 2 + 5,
            'Lets you buy the free spins round for 100x your total bet.',
            {
                ...this.textStyle,
                wordWrap: { width: this.contentWidth - this.padding * 2 },
            }
        ) as ButtonText;
        buyDesc.setOrigin(0, 0);
        buyFeatContainer.add(buyDesc);
    }

    private createGameSettingsSection(scene: GameScene, container: GameObjects.Container): void {
        this.addTextBlock(scene, 'header2', 'Game Settings');

        const gamesettingsContainer = scene.add.container(0, this.yPosition);
        this.contentContainer.add(gamesettingsContainer);
        const { frameW, frameX } = this.getFrameMetrics(gamesettingsContainer);
        const borderCenter = frameX + frameW / 2;
        const maxImageWidth = Math.max(0, frameW);

        // Local Y cursor inside the Game Settings container
        let currentY = this.gameSettingsTextTopPadding;

        // 1) Paylines header
        const paylinesText = this.addTextBlock(scene, 'header2', 'Paylines', {
            container: gamesettingsContainer,
            y: currentY,
            x: this.gameSettingsTextHorizontalPadding,
        });
        currentY = paylinesText.y + paylinesText.displayHeight + this.gameSettingsElementSpacing;

        // 2) Paylines description
        const descriptionText = this.createHowToPlayEntry(
            scene,
            this.gameSettingsTextHorizontalPadding,
            currentY,
            gamesettingsContainer,
            '',
            'Symbols can land anywhere on the screen.',
            true,
            this.contentWidth - this.gameSettingsTextHorizontalPadding,
            true // do not advance global yPosition; we manage spacing locally here
        );
        currentY = descriptionText.y + descriptionText.displayHeight + this.gameSettingsElementSpacing;

        // 3) Winning payline image
        const imgWin = scene.add.image(borderCenter - 10, currentY, 'paylineMobileWin') as ButtonImage;
        imgWin.setOrigin(0.5, 0);
        const scaleWin = Math.min(1, maxImageWidth / (imgWin.width || 1));
        imgWin.setScale(scaleWin);
        gamesettingsContainer.add(imgWin);
        currentY = imgWin.y + imgWin.displayHeight + this.gameSettingsElementSpacing;

        // 4) Non-winning payline image
        const imgNoWin = scene.add.image(borderCenter - 10, currentY, 'paylineMobileNoWin') as ButtonImage;
        imgNoWin.setOrigin(0.5, 0);
        const scaleNoWin = Math.min(1, maxImageWidth / (imgNoWin.width || 1));
        imgNoWin.setScale(scaleNoWin);
        gamesettingsContainer.add(imgNoWin);
        currentY = imgNoWin.y + imgNoWin.displayHeight + this.gameSettingsElementSpacing;

        // 5) Payline notes text
        const paylineNotes = [
            'All wins are multiplied by the base bed',
            'When multiple symbol wins occur, all values are combined into the total win.',
            'Free spins rewards are granted after the round ends.',
        ].join('\n\n');
        const notesX = this.gameSettingsTextHorizontalPadding;
        const notesY = currentY;
        const notesText = scene.add.text(notesX, notesY, paylineNotes, {
            ...this.textStyle,
            wordWrap: { width: this.contentWidth - this.gameSettingsTextHorizontalPadding },
        }) as ButtonText;
        gamesettingsContainer.add(notesText);

        this.yPosition += this.createDynamicBorder(scene, gamesettingsContainer, {
            paddingTop: this.gameSettingsTextTopPadding,
            paddingBottom: this.gameSettingsTextBottomPadding,
        });
    }

    private createHowToPlaySection(scene: GameScene, genericTableWidth: number, scaledSymbolSize: number): void {
        this.addTextBlock(scene, 'header2', 'How to Play');
        let currentPaddingMultiplier: number = 0;

        // Align How to Play container with other sections (same left offset and width)
        const howToPlayContainer = scene.add.container(0, this.yPosition);
        this.contentContainer.add(howToPlayContainer);

        // Align header and entries with the same left padding used in other sections
        this.addTextBlock(scene, 'header2', 'Bet Controls', { 
            container: howToPlayContainer, 
            x: this.howToPlayHorizontalPadding, 
            y: this.howToPlayElementSpacing });

        currentPaddingMultiplier += 6.25;
        this.createHowToPlayEntry(
            scene,
            this.howToPlayHorizontalPadding,
            this.howToPlayElementSpacing * currentPaddingMultiplier,
            howToPlayContainer,
            'howToPlay1Mobile',
            ''
        );

        currentPaddingMultiplier += 4.5;
        this.addTextBlock(scene, 'header2', 'Game Actions', {
            container: howToPlayContainer,
            x: this.howToPlayHorizontalPadding,
            y: this.howToPlayElementSpacing * currentPaddingMultiplier,
        });

        currentPaddingMultiplier += 6.25;
        this.createHowToPlayEntry(
            scene,
            this.howToPlayHorizontalPadding,
            this.howToPlayElementSpacing * currentPaddingMultiplier,
            howToPlayContainer,
            'howToPlay2Mobile',
            ''
        );
        currentPaddingMultiplier += 10;
        this.createHowToPlayEntry(
            scene,
            this.howToPlayHorizontalPadding,
            this.howToPlayElementSpacing * currentPaddingMultiplier,
            howToPlayContainer,
            'howToPlay11Mobile',
            ''
        );
        currentPaddingMultiplier += 12.5;
        this.createHowToPlayEntry(
            scene,
            this.howToPlayHorizontalPadding,
            this.howToPlayElementSpacing * currentPaddingMultiplier,
            howToPlayContainer,
            'howToPlay12Mobile',
            ''
        );
        currentPaddingMultiplier += 13;
        this.createHowToPlayEntry(
            scene,
            this.howToPlayHorizontalPadding,
            this.howToPlayElementSpacing * currentPaddingMultiplier,
            howToPlayContainer,
            'howToPlay3Mobile',
            ''
        );
        currentPaddingMultiplier += 10.75;
        this.createHowToPlayEntry(
            scene,
            this.howToPlayHorizontalPadding,
            this.howToPlayElementSpacing * currentPaddingMultiplier,
            howToPlayContainer,
            'howToPlay4Mobile',
            ''
        );
        currentPaddingMultiplier += 6;

        this.addTextBlock(scene, 'header2', 'Display & Stats', {
            container: howToPlayContainer,
            x: this.howToPlayHorizontalPadding,
            y: this.howToPlayElementSpacing * currentPaddingMultiplier,
        });
        currentPaddingMultiplier += 6;

        // Original image-based entry for the balance display.
        // Replaced with a bespoke bordered container that visually matches
        // the BALANCE panel from the main UI.
        //
        // this.createHowToPlayEntry(
        //     scene,
        //     this.howToPlayHorizontalPadding,
        //     this.howToPlayElementSpacing * currentPaddingMultiplier,
        //     howToPlayContainer,
        //     'howToPlay5',
        //     'Shows your current available credits.',
        //     true,
        //     this.contentWidth - this.padding * 2
        // );

        // Container that holds the BALANCE card.
        const balanceCardY = this.howToPlayElementSpacing * currentPaddingMultiplier;
        const balanceCardContainer = scene.add.container(0, balanceCardY);
        howToPlayContainer.add(balanceCardContainer);

        // Size the card relative to the framed content width so it aligns
        // with other bordered sections.
        const { frameW } = this.getFrameMetrics(howToPlayContainer);
        const cardInset = this.padding * 3;
        const cardWidth = Math.max(0, frameW - cardInset * 2);
        const cardLeft = cardInset;
        const cardHeight = 90;

        // Dark inner fill with a bright green outline to match the BALANCE
        // widget styling.
        this.createBorder(scene, balanceCardContainer, cardLeft, 0, cardWidth, cardHeight, {
            fillColor: 0x000000,
            strokeColor: 0x379557,
            fillAlpha: 0.1,
            strokeAlpha: 0.2,
        });

        // Top label: BALANCE
        const balanceTitle = scene.add.text(
            cardLeft + cardWidth / 2,
            this.padding * 1.8,
            'BALANCE',
            {
                ...this.header2Style,
                fontFamily: 'Poppins-Bold',
                color: '#3FFF0D',
            }
        );
        balanceTitle.setOrigin(0.5, 0.5);
        const gradient = balanceTitle.context.createLinearGradient(0, 0, 0, balanceTitle.height);
        gradient.addColorStop(0, '#3FFF0D');  // top color
        gradient.addColorStop(0.5, '#09FF5C');  // bottom color

        (balanceTitle as any).setFill(gradient);

        balanceCardContainer.add(balanceTitle);

        // Main value text layer below the title.
        const balanceValue = scene.add.text(
            cardLeft + cardWidth / 2,
            cardHeight / 2 + this.padding * 0.8,
            (() => {
                const isDemoBalance = (scene as any)?.gameAPI?.getDemoState();
                const currencySymbolBalance = isDemoBalance ? '' : '$';
                return `${currencySymbolBalance}${currencySymbolBalance ? ' ' : ''}200,000.00`;
            })(),
            {
                ...this.titleStyle,
                color: '#ffffff',
            }
        );
        balanceValue.setOrigin(0.5, 0.5);
        balanceCardContainer.add(balanceValue);

        currentPaddingMultiplier += 11;
        this.createHowToPlayEntry(
            scene,
            this.howToPlayHorizontalPadding,
            this.howToPlayElementSpacing * currentPaddingMultiplier,
            howToPlayContainer,
            'howToPlay6',
            'Display your total winnings from the current round.',
            true,
            this.contentWidth - this.padding * 2
        );
        currentPaddingMultiplier += 11.75;
        this.createHowToPlayEntry(
            scene,
            this.howToPlayHorizontalPadding,
            this.howToPlayElementSpacing * currentPaddingMultiplier,
            howToPlayContainer,
            'howToPlay7',
            'Adjust your wager using the - and + buttons.',
            true,
            this.contentWidth - this.padding * 2
        );
        currentPaddingMultiplier += 9;

        this.addTextBlock(scene, 'header2', 'General Controls', {
            container: howToPlayContainer,
            x: this.howToPlayHorizontalPadding,
            y: this.howToPlayElementSpacing * currentPaddingMultiplier,
        });
        currentPaddingMultiplier += 6;
        this.createHowToPlayEntry(
            scene,
            this.howToPlayHorizontalPadding,
            this.howToPlayElementSpacing * currentPaddingMultiplier,
            howToPlayContainer,
            'howToPlay8Mobile',
            ''
        );
        currentPaddingMultiplier += 8;
        this.createHowToPlayEntry(
            scene,
            this.howToPlayHorizontalPadding,
            this.howToPlayElementSpacing * currentPaddingMultiplier,
            howToPlayContainer,
            'howToPlay9Mobile',
            ''
        );
        currentPaddingMultiplier += 9.75;
        this.createHowToPlayEntry(
            scene,
            this.howToPlayHorizontalPadding,
            this.howToPlayElementSpacing * currentPaddingMultiplier,
            howToPlayContainer,
            'howToPlay10Mobile',
            ''
        );

        // Draw the border sized to the How to Play content. Since this is
        // the final section on the help screen, the scrollable area should
        // effectively end at the bottom of this bordered container.
        this.yPosition += this.createDynamicBorder(scene, howToPlayContainer, {
            paddingBottom: -this.padding * 2,
        });
    }


    private createHeader(scene: GameScene, x: number, y: number, container: GameObjects.Container, text: string, color: string): void {
        const genericTableWidth = this.contentWidth + this.padding * 3;

        const header = scene.add.text(
            0,
            0,
            text,
            {
                ...this.textStyle,
                wordWrap: { width: genericTableWidth - this.padding * 6 },
                fontSize: '20px',
                color: color,
                fontFamily: 'Poppins-Regular',
                fontStyle: 'bold',
            }
        );
        header.setPosition(x, y);
        container.add(header);
    }

    private enableScrolling(scene: Scene): void {
        let isDragging = false;
        let startY = 0;
        let currentY = 0;
        let lastY = 0;
        let dragVelocity = 0;
        const minVelocity = 0.1;
        const dragThreshold = 8;
        let hasExceededDragThreshold = false;

        // Make the scroll view interactive for the content area width and height
        this.scrollView.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, this.contentArea.width, this.contentArea.height),
            Phaser.Geom.Rectangle.Contains
        );

        this.ensureTabInteractionBlocker(scene);

        this.scrollView.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            isDragging = true;
            startY = pointer.y;
            lastY = pointer.y;
            hasExceededDragThreshold = false;
            this.setTabInteractionBlocked(scene, false);
            // Stop any ongoing momentum scrolling
            if (scene.tweens.isTweening(this.contentContainer)) {
                scene.tweens.killTweensOf(this.contentContainer);
            }
        });

        scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (!isDragging || !this.isMenuVisible()) return;

            if (!hasExceededDragThreshold && Math.abs(pointer.y - startY) >= dragThreshold) {
                hasExceededDragThreshold = true;
                this.setTabInteractionBlocked(scene, true);
            }

            // Calculate the distance moved since last frame
            const deltaY = pointer.y - lastY;
            lastY = pointer.y;

            // Update velocity
            dragVelocity = deltaY;

            // Update position
            currentY = this.contentContainer.y + deltaY;

            // Calculate bounds
            const maxY = 0;
            const contentHeight = this.contentHeight || this.yPosition;
            const viewHeight = this.contentArea.height;
            const minY = Math.min(0, viewHeight - contentHeight);

            // Apply bounds with elastic effect
            if (currentY > maxY) {
                currentY = maxY + (currentY - maxY) * 0.5;
            } else if (currentY < minY) {
                currentY = minY + (currentY - minY) * 0.5;
            }

            this.contentContainer.y = currentY;
        });

        scene.input.on('pointerup', () => {
            if (!isDragging) return;
            isDragging = false;
            if (hasExceededDragThreshold) {
                this.setTabInteractionBlocked(scene, false);
            }
            hasExceededDragThreshold = false;

            // Apply momentum scrolling
            if (Math.abs(dragVelocity) > minVelocity) {
                let targetY = this.contentContainer.y + dragVelocity * 20;

                // Calculate bounds
                const maxY = 0;
                const contentHeight = this.contentHeight || this.yPosition;
                const viewHeight = this.contentArea.height;
                const minY = Math.min(0, viewHeight - contentHeight);

                // Clamp target position
                targetY = Phaser.Math.Clamp(targetY, minY, maxY);

                scene.tweens.add({
                    targets: this.contentContainer,
                    y: targetY,
                    duration: 500,
                    ease: 'Cubic.out',
                });
            } else {
                // If velocity is too low, just snap to bounds
                const maxY = 0;
                const contentHeight = this.contentHeight || this.yPosition;
                const viewHeight = this.contentArea.height;
                const minY = Math.min(0, viewHeight - contentHeight);
                const targetY = Phaser.Math.Clamp(this.contentContainer.y, minY, maxY);

                if (targetY !== this.contentContainer.y) {
                    scene.tweens.add({
                        targets: this.contentContainer,
                        y: targetY,
                        duration: 200,
                        ease: 'Cubic.out',
                    });
                }
            }
        });

        // Enable mouse wheel scrolling
        scene.input.on('wheel', (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number) => {
            if (!this.isMenuVisible()) return;

            // Calculate new position
            currentY = this.contentContainer.y - deltaY;

            // Calculate bounds
            const maxY = 0;
            const contentHeight = this.contentHeight || this.yPosition;
            const viewHeight = this.contentArea.height;
            const minY = Math.min(0, viewHeight - contentHeight);

            // Clamp the position
            currentY = Phaser.Math.Clamp(currentY, minY, maxY);

            // Animate to new position
            scene.tweens.add({
                targets: this.contentContainer,
                y: currentY,
                duration: 100,
                ease: 'Cubic.out',
            });
        });
    }

    private ensureTabInteractionBlocker(scene: Scene): void {
        if (this.tabInteractionBlocker) {
            return;
        }

        const blockerWidth = scene.scale.width;
        const blockerHeight = this.tabHeight;
        const blocker = scene.add.zone(0, this.menuTopPadding, blockerWidth, blockerHeight);
        blocker.setOrigin(0, 0);
        blocker.setDepth(3000);
        blocker.setScrollFactor(0);

        this.tabInteractionHitArea = new Phaser.Geom.Rectangle(0, 0, blockerWidth, blockerHeight);
        blocker.setInteractive(this.tabInteractionHitArea, Phaser.Geom.Rectangle.Contains);
        if (blocker.input) {
            blocker.input.enabled = false;
        }

        this.tabInteractionBlocker = blocker;
    }

    private setTabInteractionBlocked(scene: Scene, shouldBlock: boolean): void {
        if (!this.tabInteractionBlocker) {
            this.ensureTabInteractionBlocker(scene);
        }

        if (!this.tabInteractionBlocker || this.isTabInteractionBlocked === shouldBlock) {
            return;
        }

        const blocker = this.tabInteractionBlocker;
        blocker.setPosition(0, this.menuTopPadding);
        blocker.setSize(scene.scale.width, this.tabHeight);

        if (this.tabInteractionHitArea) {
            this.tabInteractionHitArea.width = blocker.width;
            this.tabInteractionHitArea.height = blocker.height;
        }

        if (blocker.input) {
            blocker.input.enabled = shouldBlock;
        }

        this.isTabInteractionBlocked = shouldBlock;
    }

    private createHowToPlayEntry(
        scene: GameScene,
        x: number,
        y: number,
        container: GameObjects.Container,
        image: string,
        text: string,
        wordWrap: boolean = false,
        wordWrapWidth: number = 0,
        skipYPositionIncrement: boolean = false
    ): GameObjects.Text {
        let imageElement: Phaser.GameObjects.Image | null = null;
        if (image !== '') {
            imageElement = scene.add.image(0, 0, image);
        }
        if (imageElement != null) {
            if (image === 'wheelSpin_helper' || image === 'scatterGame' || image === 'multiplierGame') {
                imageElement.setScale(1.1);
            }
            imageElement.setOrigin(0.5, image === 'scatterGame' ? 0.33 : 0.5);

            // Center horizontally within the container's framed area if available
            const { frameW, frameX } = this.getFrameMetrics(container);
            const centerX = frameX + frameW / 2;
            imageElement.setPosition(centerX - 10, y);
            container.add(imageElement);
        }

        const textElement = scene.add.text(0, 0, text, {
            ...this.textStyle,
            wordWrap: wordWrap ? { width: wordWrapWidth } : undefined,
        });
        // Place text below the image (or at y if no image), left-aligned with container padding
        const textX = this.padding * 3;
        const textY = imageElement ? imageElement.y + imageElement.displayHeight / 2 + this.padding * 2 : y;
        textElement.setPosition(textX, textY);
        textElement.setOrigin(0, 0);

        if (image === 'BuyFeatMobile') {
            textElement.setPosition(textX, y + this.padding * 5);
        }
        if (image === 'scatterGame') {
            textElement.setPosition(textX, textElement.y + this.padding * 6);
        }
        container.add(textElement);

        if (!skipYPositionIncrement) {
            this.yPosition += (imageElement ? imageElement.displayHeight * 2 : 0) + textElement.displayHeight + this.padding * 2;
        }

        return textElement;
    }

    // Helper: render a help subsection with title, centered image, and description
    // Returns the bottom Y of the description to aid in subsequent spacing
    private addHelpSubSection(
        scene: GameScene,
        container: GameObjects.Container,
        title: string,
        imageKey: string,
        titleY: number,
        description: string,
        opts?: {
            imageY?: number;
            descY?: number;
            descX?: number;
            titleX?: number;
            titleToImageGap?: number;
            imageToDescGap?: number;
        }
    ): number {
        // Title (use header2 style) with same horizontal inset as Bonus Trigger
        this.addTextBlock(scene, 'header2', title, {
            container,
            x: opts?.titleX ?? (this.textHorizontalPadding ?? this.padding / 2) + this.padding * 1.5,
            y: titleY,
        });

        // Frame metrics for centering
        const { frameW, frameX } = this.getFrameMetrics(container);
        const centerX = frameX + frameW / 2;

        // Image
        const imageY = opts?.imageY ?? titleY + (opts?.titleToImageGap ?? this.padding * 7);
        const img = scene.add.image(centerX, imageY, imageKey);
        const useOffsetOrigin = imageKey === 'scatterGame' || imageKey === 'wheelSpin_helper';
        img.setOrigin(0.5, useOffsetOrigin ? 0.33 : 0.5);
        img.setScale(1.1);
        container.add(img);

        // Description
        const descX = opts?.descX ?? this.padding * 3;
        const descY = opts?.descY ?? img.y + img.displayHeight / 2 + (opts?.imageToDescGap ?? this.padding * 3);
        const descText = scene.add.text(descX, descY, description, {
            ...this.textStyle,
            wordWrap: { width: this.contentWidth + this.padding * 3 },
        });
        descText.setOrigin(0, 0);
        container.add(descText);

        return descText.y + descText.displayHeight;
    }

    // Helper: image → title → description layout; returns bottom Y
    private addHelpSubSectionImageFirst(
        scene: GameScene,
        container: GameObjects.Container,
        title: string,
        imageKey: string,
        topY: number,
        description: string,
        opts?: { descX?: number; titleX?: number; imageToTitleGap?: number; titleToDescGap?: number }
    ): number {
        // Frame metrics
        const { frameW, frameX } = this.getFrameMetrics(container);
        const centerX = frameX + frameW / 2;

        // Image centered at topY
        const img = scene.add.image(centerX, topY, imageKey);
        const useOffsetOrigin = imageKey === 'scatterGame' || imageKey === 'wheelSpin_helper';
        img.setOrigin(0.5, useOffsetOrigin ? 0.33 : 0.5);
        img.setScale(1.1);
        container.add(img);

        // Title below image
        const titleY = img.y + img.displayHeight / 2 + (opts?.imageToTitleGap ?? this.padding * 3);
        this.addTextBlock(scene, 'header2', title, {
            container,
            x: opts?.titleX ?? (this.textHorizontalPadding ?? this.padding / 2) + this.padding * 1.5,
            y: titleY,
        });

        // Description below title
        const descX = opts?.descX ?? this.padding * 3;
        const descY = titleY + (opts?.titleToDescGap ?? this.padding * 3);
        const descText = scene.add.text(descX, descY, description, {
            ...this.textStyle,
            wordWrap: { width: this.contentWidth + this.padding * 3 },
        });
        descText.setOrigin(0, 0);
        container.add(descText);

        return descText.y + descText.displayHeight;
    }

    // New helper as requested: explicit image position, relative offsets for title and description
    private addSubSectionInstruction(
        scene: GameScene,
        container: GameObjects.Container,
        params: {
            title: string;
            imageKey: string;
            imageX: number;
            imageY: number;
            imageOrigin?: { x: number; y: number };
            imageScale?: number;
            titleOffsetY: number; // distance below image
            titleX?: number;
            desc: string;
            descOffsetY: number; // distance below title
            descX?: number;
            wordWrapWidth?: number;
            lineSpacing?: number;
        }
    ): number {
        const img = scene.add.image(params.imageX, params.imageY, params.imageKey);
        img.setOrigin(params.imageOrigin?.x ?? 0.5, params.imageOrigin?.y ?? 0.5);
        if (params.imageScale) {
            img.setScale(params.imageScale);
        }
        container.add(img);

        const titleY = img.y + img.displayHeight / 2 + params.titleOffsetY;
        this.addTextBlock(scene, 'header2', params.title, {
            container,
            x: params.titleX ?? (this.textHorizontalPadding ?? this.padding / 2) + this.padding * 1.5,
            y: titleY,
        });

        const descY = titleY + params.descOffsetY;
        const descText = scene.add.text(params.descX ?? this.padding * 3, descY, params.desc, {
            ...this.textStyle,
            wordWrap: params.wordWrapWidth ? { width: params.wordWrapWidth } : { width: this.contentWidth + this.padding * 3 },
        });
        descText.setOrigin(0, 0);
        if (typeof params.lineSpacing === 'number') {
            descText.setLineSpacing(params.lineSpacing);
        }
        container.add(descText);

        return descText.y + descText.displayHeight;
    }

    /**
     * Creates the "Tumble Win" information card shown inside the Free Spins Rules section.
     * The card has its own rounded border nested inside the Free Spins border.
     *
     * @param scene Current game scene
     * @param parentContainer The Free Spins Rules container
     * @param startY Local Y position (inside parentContainer) where the card should start
     * @returns The Y coordinate of the bottom of the card (inside parentContainer)
     */
    private createTumbleWinSection(
        scene: GameScene,
        parentContainer: GameObjects.Container,
        startY: number
    ): number {
        const tumbleContainer = scene.add.container(0, startY);
        parentContainer.add(tumbleContainer);

        // Use the Free Spins frame metrics to size the inner card slightly inset from the outer border
        const { frameW } = this.getFrameMetrics(parentContainer);
        const inset = this.padding * 2;
        const cardWidth = Math.max(0, frameW - inset * 2);
        const cardLeft = inset;

        // Local Y cursor within the tumble card
        let localY = this.padding * 1.5;

        // Header: "Tumble Win"
        const title = this.addTextBlock(scene, 'header2', 'Tumble Win', {
            container: tumbleContainer,
            x: cardLeft + this.padding * 1.5,
            y: localY,
        });
        localY = title.y + title.displayHeight + this.padding * 1.5;

        // Screenshot image centered in the card
        const centerX = cardLeft + cardWidth / 2;
        const tumbleImage = scene.add.image(centerX, localY, 'tumbleWin') as GameObjects.Image;
        tumbleImage.setOrigin(0.5, 0);

        // Scale image to fit nicely within the card width
        const maxImageWidth = Math.max(1, cardWidth - this.padding * 2);
        const scale = Math.min(1, maxImageWidth / (tumbleImage.width || 1));
        tumbleImage.setScale(scale);
        tumbleContainer.add(tumbleImage);

        localY = tumbleImage.y + tumbleImage.displayHeight + this.padding * 1.5;

        // Body copy describing tumble behaviour
        const tumbleText =
            'After each spin, winning symbols are paid and then removed from the screen. Remaining symbols drop down, and new ones fall from above to fill the empty spaces.\n\n' +
            'Tumbles continue as long as new winning combinations appear — there is no limit to the number of tumbles per spin.\n\n' +
            "All wins are credited to the player's balance after all tumbles from a base spin are completed.";

        const body = scene.add.text(cardLeft + this.padding * 1.5, localY, tumbleText, {
            ...this.textStyle,
            wordWrap: { width: cardWidth - this.padding * 3 },
        });
        body.setOrigin(0, 0);
        tumbleContainer.add(body);

        const contentBottom = body.y + body.displayHeight;

        // Add the card's own rounded border, keeping it inset within the Free Spins frame.
        // This section intentionally keeps the original, lighter border styling.
        const sectionHeight = this.createDynamicBorder(scene, tumbleContainer, {
            paddingTop: this.padding,
            paddingBottom: this.padding * 1.5,
            offsetX: cardLeft,
            offsetY: 0,
            width: cardWidth,
            minHeight: contentBottom + this.padding * 2,
            fillColor: 0x333333,
            strokeColor: this.borderStrokeColor,
            alpha: this.borderStrokeAlpha,
        });

        return startY + sectionHeight;
    }

    private getFrameMetrics(container: GameObjects.Container): { frameX: number; frameY: number; frameW: number; frameH: number } {
        const defaultFrameX = this.padding;
        const defaultFrameY = 0;
        const defaultFrameW = this.contentWidth + this.padding * 3;
        const defaultFrameH = 0;

        const getData = typeof (container as any).getData === 'function' ? (container as any).getData.bind(container) : undefined;

        return {
            frameX: getData ? getData('frameX') ?? defaultFrameX : defaultFrameX,
            frameY: getData ? getData('frameY') ?? defaultFrameY : defaultFrameY,
            frameW: getData ? getData('frameW') ?? defaultFrameW : defaultFrameW,
            frameH: getData ? getData('frameH') ?? defaultFrameH : defaultFrameH,
        };
    }

    private measureContainerHeight(container: GameObjects.Container): number {
        let minTop = Number.POSITIVE_INFINITY;
        let maxBottom = Number.NEGATIVE_INFINITY;

        container.iterate((child: Phaser.GameObjects.GameObject) => {
            if (!child || typeof (child as any).getBounds !== 'function') {
                return;
            }
            const bounds = (child as any).getBounds();
            if (!bounds) {
                return;
            }
            if (bounds.top < minTop) {
                minTop = bounds.top;
            }
            if (bounds.bottom > maxBottom) {
                maxBottom = bounds.bottom;
            }
        });

        return isFinite(minTop) && isFinite(maxBottom) && maxBottom > minTop ? maxBottom - minTop : 0;
    }

    private createDynamicBorder(
        scene: GameScene,
        container: GameObjects.Container,
        options: {
            paddingTop?: number;
            paddingBottom?: number;
            offsetX?: number;
            offsetY?: number;
            width?: number;
            minHeight?: number;
            /**
             * Optional style overrides for this border.
             * If not provided, a darker default style is used.
             */
            fillColor?: number;
            strokeColor?: number;
            alpha?: number;
        } = {}
    ): number {
        const paddingTop = options.paddingTop ?? this.padding * 2;
        const paddingBottom = options.paddingBottom ?? this.padding * 2;
        const offsetX = options.offsetX ?? 0;
        const offsetY = options.offsetY ?? 0;
        const width = options.width ?? this.contentWidth + this.padding * 3;
        const minHeight = options.minHeight ?? 0;

        const contentHeight = this.measureContainerHeight(container);
        const dynamicHeight = Math.max(minHeight, Math.ceil(contentHeight + paddingTop + paddingBottom));

        return this.createBorder(scene, container, offsetX, offsetY, width, dynamicHeight, {
            fillColor: options.fillColor,
            strokeColor: options.strokeColor,
            fillAlpha: 0.1,
            strokeAlpha: 0.2,
        });
    }

    private createBorder(
        scene: GameScene,
        _container: GameObjects.Container,
        _x: number,
        _y: number,
        _width: number,
        _height: number,
        style?: {
            fillColor?: number;
            strokeColor?: number;
            fillAlpha?: number;
            strokeAlpha?: number;
        }
    ): number {
        const border = scene.add.graphics();
        // Default border style matched to the payout card frame
        // (slightly lighter stroke, darker inner fill).
        const fillColor = style?.fillColor ?? this.borderFillColor; // inner fill
        const strokeColor = style?.strokeColor ?? this.borderStrokeColor; // outer stroke
        const fillAlpha = style?.fillAlpha ?? this.borderFillAlpha;
        const strokeAlpha = style?.strokeAlpha ?? this.borderStrokeAlpha;

        border.fillStyle(fillColor, fillAlpha);
        border.fillRoundedRect(_x, _y, _width, _height, 8);
        border.lineStyle(1.5, strokeColor, strokeAlpha);
        border.strokeRoundedRect(_x, _y, _width, _height, 8);
        _container.add(border);
        _container.sendToBack(border);
        // Store frame metrics on the container for layout helpers
        try {
            // Using Data Manager only if available on container
            // @ts-ignore
            if (_container.setData) {
                // @ts-ignore
                _container.setData('frameX', _x);
                // @ts-ignore
                _container.setData('frameY', _y);
                // @ts-ignore
                _container.setData('frameW', _width);
                // @ts-ignore
                _container.setData('frameH', _height);
            }
        } catch {
            /* no-op */
        }
        return _height;
    }

    private addDivider(scene: GameScene, _color: number = 0xffffff): void {
        // Add centered divider across the visible content width
        const divider = scene.add.graphics();
        divider.lineStyle(1, _color);
        const worldLeft = 20; // content area left padding
        const worldRight = scene.scale.width - 20; // content area right padding
        const parentOffsetX = this.contentArea ? this.contentArea.x : 0;
        const localLeft = worldLeft - parentOffsetX;
        const localRight = worldRight - parentOffsetX;
        divider.lineBetween(localLeft, this.yPosition, localRight, this.yPosition);
        this.contentContainer.add(divider);
    }

    private formatPayout(value: number): string {
        return value.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    private applyBetToPayout(baseValue: number): number {
        const betAmount = this.getResolvedBetAmount();
        return baseValue * betAmount;
    }

    private getResolvedBetAmount(): number {
        try {
            const bet = this.getBetAmount();
            if (Number.isFinite(bet) && bet > 0) {
                return bet;
            }
        } catch (error) {
            console.warn('[HelpScreen] Failed to resolve bet amount, falling back to 1:', error);
        }
        return 1;
    }

    private createPayoutTable(scene: GameScene, x: number, y: number, container: GameObjects.Container, symbolIndex: number): void {
        const cellWidth1 = 60;
        const cellWidth2 = 100;
        const cellHeight = 22.5;
        const cellPadding = 5;

        const tableHeight = (cellHeight + cellPadding) * 4;
        // Center the table vertically relative to the symbol
        const tableY = y - tableHeight / 2;

        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                let cellWidth = 0;
                if (col === 0) {
                    cellWidth = cellWidth1;
                } else if (col === 1) {
                    cellWidth = cellWidth2;
                } else {
                    cellWidth = cellWidth2 * 2;
                }
                const cellX = x + (col === 2 ? cellWidth1 + cellWidth2 + cellPadding * 2 : col * (cellWidth + cellPadding));
                const cellY = tableY + row * (cellHeight + cellPadding);

                const isScatter = symbolIndex === 0;
                let textValue: string | undefined;
                let wrapWidth: number | undefined;

                if (isScatter) {
                    if (col === 0) {
                        textValue = SCATTER_COUNTS[row];
                    } else if (col === 1) {
                        textValue = this.formatPayout(this.applyBetToPayout(SCATTER_PAYOUTS[row]));
                    } else {
                        // Scatter descriptions are rendered below the table in the Scatter section
                        textValue = undefined;
                    }
                } else if (col < 2) {
                    if (col === 0) {
                        textValue = PAYOUT_RANGES[row] ?? '';
                    } else {
                        const payoutValue = SYMBOL_PAYOUTS[symbolIndex]?.[row] ?? 0;
                        textValue = this.formatPayout(this.applyBetToPayout(payoutValue));
                    }
                }

                if (!textValue) {
                    continue;
                }

                const valueText = scene.add.text(cellX + cellWidth / 2, cellY + cellHeight / 2, textValue, {
                    fontSize: '16px',
                    color: '#FFFFFF',
                    fontFamily: 'Poppins-Regular',
                    align: 'center',
                    wordWrap: wrapWidth ? { width: wrapWidth } : undefined,
                });
                valueText.setOrigin(0.5, 0.5);
                container.add(valueText);
            }
        }
    }

    private addTextBlock(
        scene: GameScene,
        kind: 'header1' | 'header2' | 'content1',
        text: string,
        opts?: {
            x?: number;
            y?: number;
            container?: GameObjects.Container;
            spacingAfter?: number;
            wordWrapWidth?: number;
        }
    ): GameObjects.Text {
        let baseStyle: any;
        switch (kind) {
            case 'header1':
                baseStyle = this.header1Style;
                break;
            case 'header2':
                baseStyle = this.header2Style;
                break;
            case 'content1':
                baseStyle = this.content1Style;
                break;
        }
        const style = { ...baseStyle } as Phaser.Types.GameObjects.Text.TextStyle;
        if (opts?.wordWrapWidth) {
            style.wordWrap = { width: opts.wordWrapWidth } as any;
        }
        const container = opts?.container ?? this.contentContainer;
        const x = opts?.x ?? (this.textHorizontalPadding ?? this.padding / 2);
        const y = opts?.y ?? this.yPosition;
        const txt = scene.add.text(x, y, text, style);
        container.add(txt);
        if (opts?.y === undefined) {
            const spacing = opts?.spacingAfter ?? this.padding;
            this.yPosition += txt.height + spacing;
        }
        return txt;
    }
}


