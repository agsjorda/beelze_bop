import { Scene, GameObjects } from 'phaser';
import { Geom } from 'phaser';
import { GameData } from '../components/GameData';
import { AudioManager, SoundEffectType } from '../../managers/AudioManager';
import { GameAPI } from '../../backend/GameAPI';
import { HelpScreen } from './MenuTabs/HelpScreen';

interface ButtonBase {
    isButton: boolean;
}

type ButtonContainer = GameObjects.Container & ButtonBase;
type ButtonImage = GameObjects.Image & ButtonBase;
type ButtonText = GameObjects.Text & ButtonBase;

interface GameScene extends Scene {
    gameData: GameData;
    audioManager: AudioManager;
    gameAPI: GameAPI;
    getCurrentBetAmount?: () => number;
}

export class Menu {
    private menuContainer?: ButtonContainer;
    private contentArea: GameObjects.Container;
    private isMobile: boolean = true;
    private width: number = 0;
    private height: number = 0;
    private menuEventHandlers: Function[] = [];
    private isDraggingMusic: boolean = false;
    private isDraggingSFX: boolean = false;
    private scene: GameScene;
    public settingsOnly: boolean = false;

    private padding = 20;
    // Top padding for the whole menu panel so the in‑game clock remains visible
    private menuTopPadding: number = 20;
    private contentWidth = 1200;
    private viewWidth = 1329;
    private yPosition = 0;
    private scrollView: GameObjects.Container;
    private contentContainer: GameObjects.Container;
    private mask: Phaser.Display.Masks.GeometryMask;
    private isVisible: boolean = false;
    private panel: GameObjects.Container;
    private textHorizontalPadding?: number;
    
    // Tab content containers for proper tab switching
    private rulesContent: GameObjects.Container;
    private historyContent: GameObjects.Container;
    private settingsContent: GameObjects.Container;
    private activeTabIndex: number = 0;

    // Help screen
    private helpScreen?: HelpScreen;

    // History pagination state
    private historyCurrentPage: number = 1;
    private historyTotalPages: number = 1;
    private historyPageLimit: number = 11;
    private historyIsLoading: boolean = false;
    private historyHeaderContainer?: GameObjects.Container;
    private historyRowsContainer?: GameObjects.Container;
    private historyPaginationContainer?: GameObjects.Container;

    protected titleStyle = {
        fontSize: '24px',
        color: '#379557',
        fontFamily: 'Poppins-Regular',
        fontStyle: 'bold'
    };

    protected header1Style = {
        fontSize: '24px',
        color: '#379557',
        fontFamily: 'Poppins-Bold',
        fontStyle: 'bold'
    };

    protected content1Style = {
        fontSize: '20px',
        color: '#FFFFFF',
        fontFamily: 'Poppins-Regular',
        align: 'left' as const
    };

    protected contentHeader1Style = {
        fontSize: '24px',
        color: '#FFFFFF',
        fontFamily: 'Poppins-Bold',
        align: 'left' as const
    };

    protected header2Style = {
        fontSize: '24px',
        color: '#379557',
        fontFamily: 'Poppins-Regular',
        fontStyle: 'bold'
    };

    protected textStyle = {
        fontSize: '20px',
        color: '#FFFFFF',
        fontFamily: 'Poppins-Regular',
        align: 'left',
        wordWrap: { width: this.contentWidth }
    };


    constructor(settingsOnly: boolean = false) {
        this.settingsOnly = settingsOnly;
    }

    preload(scene: Scene){
        // No-op: menu assets are loaded via AssetLoader in Preloader
    }

    create(scene: GameScene){
        // No need to store scene reference
        this.contentContainer = scene.add.container(0, 0);
    }

    

    public createMenu(scene: GameScene): ButtonContainer {
        this.scene = scene; // Store scene reference
        this.width = scene.scale.width;
        this.height = scene.scale.height;

        // Create main menu container
        const menuContainer = scene.add.container(0, 0) as ButtonContainer;
        menuContainer.setDepth(2000);
        menuContainer.setVisible(false);
        menuContainer.setAlpha(0);

        // Create background overlay
        const bg = scene.add.graphics();
        bg.fillStyle(0x000000, 0.8);
        bg.fillRect(0, 0, this.width, this.height);
        // Make overlay interactive to block pointer events from reaching the game underneath
        bg.setInteractive(new Geom.Rectangle(0, 0, this.width, this.height), Geom.Rectangle.Contains);
        bg.on('pointerdown', () => {});
        bg.on('pointerup', () => {});
        menuContainer.add(bg);

        // Create menu panel - full screen background; top padding only affects tabs/content
        const panelWidth = this.width;
        const panelHeight = this.height;
        const panelX = 0;
        const panelY = 0;

        this.panel = scene.add.container(panelX, panelY) as ButtonContainer;
        menuContainer.add(this.panel);

        // Panel background - no border
        const panelBg = scene.add.graphics();
        panelBg.fillStyle(0x181818, 0.95);
        panelBg.fillRect(0, 0, panelWidth, panelHeight);
        // Make panel capture input too
        panelBg.setInteractive(new Geom.Rectangle(0, 0, panelWidth, panelHeight), Geom.Rectangle.Contains);
        panelBg.on('pointerdown', () => {});
        panelBg.on('pointerup', () => {});
        this.panel.add(panelBg);

        // Create tabs with different widths
        const tabHeight = 61;
        const smallTabScale = 0.5; // X tab will be half the width of normal tabs

        // Determine which tabs to show
        const baseIcons: string[] = this.settingsOnly
            ? ['settings']
            : ['info', 'history', 'settings'];

        const getLabel = (icon: string) => {
            switch (icon) {
                case 'info': return 'Rules';
                case 'history': return 'History';
                case 'settings': return 'Settings';
                case 'close': return 'X';
                default: return '';
            }
        };

        const normalTabCount = baseIcons.length;
        const totalTabUnits = normalTabCount + smallTabScale;
        const normalTabWidth = panelWidth / totalTabUnits;
        // Calculate close width to cover any rounding remainder to the panel edge
        const closeWidth = panelWidth - normalTabWidth * normalTabCount;

        // Original spacing: no inter-tab gaps; close tab is smaller on the right
        const tabConfigs: { text: string; width: number; x: number; icon: string }[] = [
            ...baseIcons.map((icon, i) => ({ text: getLabel(icon), width: normalTabWidth, x: normalTabWidth * i, icon })),
            { text: getLabel('close'), width: closeWidth, x: normalTabWidth * normalTabCount, icon: 'close' }
        ];

        const tabContainers: ButtonContainer[] = [];

        tabConfigs.forEach((tabConfig, index) => {
            // Position tabs lower on screen to leave room for the clock at the top
            const tabContainer = scene.add.container(tabConfig.x, this.menuTopPadding) as ButtonContainer;
            
            // Tab background
            const tabBg = scene.add.graphics();
            const isClose = tabConfig.icon === 'close';

            tabBg.fillStyle(isClose ? 0x1F1F1F : 0x000000, 1); // Close has dark gray bg
            tabBg.fillRect(0, 0, tabConfig.width, tabHeight);
            tabContainer.add(tabBg);

            // Active tab indicator (green underline) - only for first tab initially
            const activeIndicator = scene.add.graphics();
            activeIndicator.fillStyle(0x00FF00, 1); // Bright green
            activeIndicator.fillRect(0, tabHeight - 3, tabConfig.width, 3);
            activeIndicator.setVisible(index === 0);
            tabContainer.add(activeIndicator);

            // Tab icon for all (including close)
            let iconKey = '';
            switch (tabConfig.icon) {
                case 'info':
                    iconKey = 'menu_info';
                    break;
                case 'history':
                    iconKey = 'menu_history';
                    break;
                case 'settings':
                    iconKey = 'menu_settings';
                    break;
                case 'close':
                    iconKey = 'menu_close';
                    break;
            }

            if (iconKey) {
                const icon = scene.add.image(0, tabHeight / 2, iconKey) as ButtonImage;
                icon.setOrigin(-0.5, 0.5);
                // Scale to a consistent height (mobile-only)
                const targetHeight = 18;
                const scale = targetHeight / icon.height;
                icon.setScale(scale);
                if (tabConfig.icon === 'close') {
                    // Center the close icon on its dark background
                    icon.setOrigin(0, 0.5);
                    icon.setPosition(tabConfig.width / 3, tabHeight / 2);
                    icon.clearTint();
                } else {
                    // Left align icon with padding and tint green
                    icon.setPosition(12, tabHeight / 2);
                    icon.setTint(0x379557);
                }
                tabContainer.add(icon);
            }

            // Tab text
            const textX = index < normalTabCount ? 45 : tabConfig.width / 2; // Offset for icon on normal tabs
            const textAlign = index < normalTabCount ? 'left' : 'center';
            
            const text = scene.add.text(textX, tabHeight / 2, tabConfig.text, {
                fontSize: '16px',
                color: '#FFFFFF',
                fontFamily: 'Poppins-Regular',
                align: textAlign
            }) as ButtonText;
            if(tabConfig.icon === 'close'){
                text.setVisible(false);
            }
            text.setOrigin(index < normalTabCount ? 0 : 0.5, 0.5);
            tabContainer.add(text);

            // Make tab interactive
            tabContainer.setInteractive(
                new Geom.Rectangle(0, 0, tabConfig.width, tabHeight),
                Geom.Rectangle.Contains
            ).isButton = true;

            // Tab click handler - disable history tab in demo mode
            const isDemo = scene.gameAPI?.getDemoState();
            const isHistoryTab = tabConfig.icon === 'history';
            if (isHistoryTab && isDemo) {
                // Disable interaction for history tab in demo mode
                tabContainer.disableInteractive();
                // Make it visually appear disabled (reduce opacity)
                tabContainer.setAlpha(0.5);
            } else {
                tabContainer.on('pointerup', () => {
                    scene.audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
                    this.switchTab(scene, tabContainers, index, tabConfigs);
                });
            }

            tabContainers.push(tabContainer);
            this.panel.add(tabContainer);
        });

        // Set initial active tab highlight
        this.switchTab(scene, tabContainers, 0, tabConfigs);

        // Create content area with mask to prevent overlap with tabs
        // Position is offset by menuTopPadding so tab content sits below the clock area
        const contentArea = scene.add.container(20, this.menuTopPadding + tabHeight + 20);
        contentArea.setSize(
            panelWidth - 40,
       panelHeight - this.menuTopPadding - tabHeight - 40
        );
        
        // Create mask for content area to prevent overlap with tabs
        const contentMask = scene.add.graphics();
        contentMask.fillStyle(0xffffff);
        // Mask starts just under the tabs, including the top menu padding
        const maskTop = this.menuTopPadding + (tabHeight - 1);
        const maskHeight = panelHeight - maskTop;
        contentMask.fillRect(0, maskTop, panelWidth, maskHeight);
        const geometryMask = contentMask.createGeometryMask();
        contentArea.setMask(geometryMask);
        contentMask.setVisible(false); // Hide the mask graphics
        
        this.panel.add(contentArea);

        // Store content area reference
        this.contentArea = contentArea;

        // Initialize tab content containers
        this.initializeTabContentContainers(scene);

        // Show initial content based on first tab
        this.showTabContent(scene, tabConfigs[0].icon);

        // Store menu container reference
        this.menuContainer = menuContainer;

        return menuContainer;
    }

    private initializeTabContentContainers(scene: GameScene): void {
        // Create separate containers for each tab's content
        this.rulesContent = scene.add.container(0, 0);
        this.historyContent = scene.add.container(0, 0);
        this.settingsContent = scene.add.container(0, 0);
        
        // Add all containers to the content area
        this.contentArea.add(this.rulesContent);
        this.contentArea.add(this.historyContent);
        this.contentArea.add(this.settingsContent);
        
        // Initialize content for each tab
        // Help / Rules content is delegated to HelpScreen
        const resolveBetAmount = scene.getCurrentBetAmount?.bind(scene) ?? (() => 1);
        this.helpScreen = new HelpScreen(
            scene,
            this.contentArea,
            this.rulesContent,
            {
                titleStyle: this.titleStyle,
                header1Style: this.header1Style,
                header2Style: this.header2Style,
                content1Style: this.content1Style,
                contentHeader1Style: this.contentHeader1Style,
                textStyle: this.textStyle,
            },
            () => this.isVisible,
            resolveBetAmount
        );
        this.helpScreen.build();
        this.historyCurrentPage = 1;
        this.historyPageLimit = 11;
        this.showHistoryContent(scene, this.historyCurrentPage, this.historyPageLimit);
        this.createVolumeSettingsContent(scene, this.settingsContent);
        
        // Initially hide all except rules
        this.hideAllTabContent();
        this.rulesContent.setVisible(true);
    }

    private hideAllTabContent(): void {
        this.rulesContent.setVisible(false);
        this.historyContent.setVisible(false);
        this.settingsContent.setVisible(false);
    }

    private switchTab(scene: GameScene, tabContainers: ButtonContainer[], activeIndex: number, tabConfigs: any[]): void {
        // Check if demo mode is active and prevent switching to history tab
        const isDemo = scene.gameAPI?.getDemoState();
        const tabKey: string = tabConfigs[activeIndex].icon;

        if (isDemo && tabKey === 'history') {
            // Don't switch to history tab in demo mode - stay on current tab or switch to first available tab
            const firstNonHistoryIndex = tabConfigs.findIndex((config, idx) => config.icon !== 'history' && config.icon !== 'close');
            if (firstNonHistoryIndex !== -1) {
                activeIndex = firstNonHistoryIndex;
            }
        }

        // Update tab highlighting
        tabContainers.forEach((tabContainer, index) => {
            const tabBg = tabContainer.getAt(0) as GameObjects.Graphics;
            const activeIndicator = tabContainer.getAt(1) as GameObjects.Graphics;
            const tabConfig = tabConfigs[index];
            
            if (index === activeIndex) {
                // Active tab: dark green background with bright green underline
                tabBg.fillStyle(0x2D5A3D, 1); // Dark green background
                tabBg.fillRect(0, 0, tabConfig.width, 61);
                activeIndicator.setVisible(true);
            } else {
                // Inactive tab: black background, no underline
                tabBg.fillStyle(tabConfig.icon === 'close' ? 0x1F1F1F : 0x000000);
                tabBg.fillRect(0, 0, tabConfig.width, 61);
                activeIndicator.setVisible(false);
            }
        });

        // Show content for active tab
        const finalTabKey: string = tabConfigs[activeIndex].icon;
        this.showTabContent(scene, finalTabKey);
    }

    private showTabContent(scene: GameScene, tabKey: string): void {
        if (!this.contentArea) return;
        
        this.hideAllTabContent();

        switch (tabKey) {
            case 'info':
                this.rulesContent.setVisible(true);
                break;
            case 'history':
                this.historyContent.setVisible(true);
                break;
            case 'settings':
                this.settingsContent.setVisible(true);
                break;
            case 'close':
                this.hideMenu(scene);
                break;
        }
    }



    private async showHistoryContent(scene: GameScene, page: number, limit: number): Promise<void> {
        const contentArea = this.historyContent;
        // Keep old rows until new data is ready; build containers on first run
        const historyHeaders : string[] = ['Spin', 'Currency', 'Bet', 'Win'];
        // Check if demo mode is active
        const isDemo = scene.gameAPI?.getDemoState();
        // Recreate or reparent containers if needed (handles menu reopen)
        if (!this.historyHeaderContainer || !this.historyHeaderContainer.scene) {
            this.historyHeaderContainer = scene.add.container(0, 0);
            const historyText = scene.add.text(15, 15,'History', this.titleStyle) as ButtonText;
            historyText.setOrigin(0, 0);
            this.historyHeaderContainer.add(historyText);
        }
        // Recreate rows and pagination containers fresh to avoid recursive destroy issues
        if (this.historyRowsContainer && this.historyRowsContainer.scene) {
            this.historyRowsContainer.destroy(true);
        }
        this.historyRowsContainer = scene.add.container(0, 0);
        if ((this.historyRowsContainer as any).parentContainer !== contentArea) {
            contentArea.add(this.historyRowsContainer);
        }

        if (this.historyPaginationContainer && this.historyPaginationContainer.scene) {
            this.historyPaginationContainer.destroy(true);
        }
        this.historyPaginationContainer = scene.add.container(0, 0);
        if ((this.historyPaginationContainer as any).parentContainer !== contentArea) {
            contentArea.add(this.historyPaginationContainer);
        }
        if ((this.historyHeaderContainer as any).parentContainer !== contentArea) {
            contentArea.add(this.historyHeaderContainer);
        }

        // In demo mode, show empty history without making API call
        if (isDemo) {
            // Display headers centered per column (only once)
            const columnCenters = this.getHistoryColumnCenters(scene);
            const headerContainer = this.historyHeaderContainer as GameObjects.Container;
            if (headerContainer.length <= 1) { // only title exists
                const headerY = 60;
                historyHeaders.forEach((header, idx) => {
                    const headerText = scene.add.text(columnCenters[idx], headerY, header, {
                        fontSize: '14px',
                        color: '#FFFFFF',
                        fontFamily: 'Poppins-Regular',
                        fontStyle: 'bold',
                    }) as ButtonText;
                    headerText.setOrigin(0.5, 0);
                    headerContainer.add(headerText);
                });
            }

            // Show empty state message
            const emptyMessage = scene.add.text(
                scene.scale.width / 2,
                scene.scale.height * 0.3,
                'History is not available in demo mode',
                {
                    fontSize: '16px',
                    color: '#888888',
                    fontFamily: 'Poppins-Regular',
                }
            ) as ButtonText;
            emptyMessage.setOrigin(0.5, 0.5);
            this.historyRowsContainer.add(emptyMessage);

            // No pagination in demo mode
            return;
        }

        // Prevent stacking requests
        if (this.historyIsLoading) {
            return;
        }
        this.historyIsLoading = true;

        // Show loading icon while fetching history (centered on screen)
        const loaderX = scene.scale.width * 0.45;
        const loaderY = scene.scale.height * 0.3;
        const loader = scene.add.image(loaderX, loaderY, 'loading_icon') as ButtonImage;
        loader.setOrigin(0.5, 0.5);
        loader.setScale(0.25);
        contentArea.add(loader);
        const spinTween = scene.tweens.add({
            targets: loader,
            angle: 360,
            duration: 800,
            repeat: -1,
            ease: 'Linear'
        });

        let result: any;
        try{
            result = await scene.gameAPI.getHistory(page, limit);
        } finally {
            spinTween.stop();
            loader.destroy();
            this.historyIsLoading = false;
        }
        
        console.log('History API Response:', result);

        // Update pagination state - check multiple possible metadata formats
        this.historyCurrentPage = result?.meta?.page ?? result?.page ?? result?.meta?.currentPage ?? page;
        this.historyTotalPages = result?.meta?.pageCount ?? result?.totalPages ?? result?.meta?.totalPages ?? result?.meta?.total ?? 1;
        this.historyPageLimit = limit;
        
        console.log('Pagination State:', {
            currentPage: this.historyCurrentPage,
            totalPages: this.historyTotalPages,
            limit: this.historyPageLimit
        });
        
        // Display headers centered per column (only once)
        const columnCenters = this.getHistoryColumnCenters(scene);
        const headerContainer = this.historyHeaderContainer as GameObjects.Container;
        // When reopening, header could have been destroyed; rebuild if empty or missing headers
        if (headerContainer.length <= 1) { // only title exists
            const headerY = 60;
            historyHeaders.forEach((header, idx) => {
                const headerText = scene.add.text(columnCenters[idx], headerY, header, {
                    fontSize: '14px',
                    color: '#FFFFFF',
                    fontFamily: 'Poppins-Regular',
                    fontStyle: 'bold',
                }) as ButtonText;
                headerText.setOrigin(0.5, 0);
                headerContainer.add(headerText);
            });
        }

        let spinDate = '26/7/2025, 16:00';
        let currency = 'usd';
        let bet = '250.00';
        let win = 250000000;

        let contentY = 100;
        const rowsContainer = this.historyRowsContainer as GameObjects.Container;
        result.data?.forEach((v?:any)=>{
            spinDate = this.formatISOToDMYHM(v.createdAt);
            currency = v.currency == ''?'usd':v.currency;
            bet = v.bet;
            win = v.win;

            contentY += 30;
            // Create row centered per column
            this.createHistoryEntry(contentY, scene, rowsContainer, spinDate, currency, bet, win.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), columnCenters);
            this.addDividerHistory(scene, rowsContainer, contentY);
            contentY += 20;
        });
        
        // Add pagination buttons at bottom-center
        const paginationContainer = this.historyPaginationContainer as GameObjects.Container;
        this.addHistoryPagination(scene, paginationContainer, this.historyCurrentPage, this.historyTotalPages, this.historyPageLimit);
    }

    private formatISOToDMYHM(iso: string, timeZone = 'Asia/Manila'): string {
        const d = new Date(iso);
        const parts = new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',        // no leading zero
          month: 'numeric',      // no leading zero
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone,
        }).formatToParts(d);
      
        const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
        return `${map.day}/${map.month}/${map.year}, ${map.hour}:${map.minute}`;
      }
      

    private createHistoryEntry(y: number, scene: GameScene, contentArea: GameObjects.Container, spinDate: string, currency: string, bet: string, win: string, columnCenters: number[]): void {
        // Create separate text fields and center them per column
        const values: string[] = [spinDate, currency, bet, win];
        values.forEach((value, idx) => {
            const text = scene.add.text(columnCenters[idx], y, value, {
                fontSize: '14px',
                color: '#FFFFFF',
                fontFamily: 'Poppins-Regular',
            }) as ButtonText;
            text.setOrigin(0.5, 0);
            contentArea.add(text);
        });
    }

    // Compute four column centers within the content area bounds
    private getHistoryColumnCenters(scene: GameScene): number[] {
        const worldLeft = 20;
        const worldRight = scene.scale.width - 20;
        const parentOffsetX = this.contentArea ? this.contentArea.x : 0;
        const localLeft = worldLeft - parentOffsetX;
        const localRight = worldRight - parentOffsetX;
        const totalWidth = localRight - localLeft;

        // Define column center ratios across the available width (tuned for headers)
        const ratios = [0.15, 0.40, 0.65, 0.88];
        return ratios.map(r => localLeft + totalWidth * r);
    }

    private addDividerHistory(scene: GameScene, contentArea: GameObjects.Container, y: number): void {
        const dividerY = y + 30;
        const worldLeft = 20;
        const worldRight = scene.scale.width - 20;
        const parentOffsetX = this.contentArea ? this.contentArea.x : 0;
        const localLeft = worldLeft - parentOffsetX;
        const localWidth = worldRight - worldLeft;
        const divider = scene.add.graphics();
        divider.fillStyle(0xFFFFFF, 0.1);
        divider.fillRect(localLeft, dividerY, localWidth, 1);
        contentArea.add(divider);
    }

    private addHistoryPagination(scene: GameScene, contentArea: GameObjects.Container, page: number, totalPages: number, limit: number): void {
        const buttonSpacing = 18;
        const icons = ['icon_most_left', 'icon_left', 'icon_right', 'icon_most_right'];

        // Use the actual content area dimensions (parent container) for placement
        const areaWidth = this.contentArea ? this.contentArea.width : scene.scale.width;
        const areaHeight = this.contentArea ? this.contentArea.height : scene.scale.height;

        // Bottom within the visible content area
        const bottomPadding = 80;
        const y = areaHeight - bottomPadding;

        // Measure total width for centering within the content area
        const tempImages: Phaser.GameObjects.Image[] = icons.map(key => scene.add.image(0, 0, key) as ButtonImage);
        const totalWidth = tempImages.reduce((sum, img, i) => sum + img.width + (i > 0 ? buttonSpacing : 0), 0);
        tempImages.forEach(img => img.destroy());

        // Start X so the row is centered inside the content area's local coordinates
        let currentX = (areaWidth - totalWidth) / 2;

        // Place interactive buttons into the history content container
        icons.forEach((key) => {
            const btn = scene.add.image(currentX, y, key) as ButtonImage;
            btn.setOrigin(0, 1);

            let targetPage = page;
            let enabled = true;
            switch (key) {
                case 'icon_most_left':
                    targetPage = 1;
                    enabled = page > 1;
                    break;
                case 'icon_left':
                    targetPage = Math.max(1, page - 1);
                    enabled = page > 1;
                    break;
                case 'icon_right':
                    targetPage = Math.min(totalPages, page + 1);
                    enabled = page < totalPages;
                    break;
                case 'icon_most_right':
                    targetPage = Math.max(1, totalPages);
                    enabled = page < totalPages;
                    break;
            }

            if (enabled) {
                btn.setInteractive({ useHandCursor: true });
                btn.on('pointerup', () => {
                    if (this.historyIsLoading) { return; }
                    scene.audioManager.playSoundEffect(SoundEffectType.MENU_CLICK);
                    // Disable all pagination buttons during load
                    contentArea.iterate((child: Phaser.GameObjects.GameObject) => {
                        const img = child as Phaser.GameObjects.Image;
                        if (img && (img as any).texture && icons.includes((img as any).texture.key)) {
                            img.disableInteractive();
                            img.setAlpha(0.5);
                        }
                    });
                    this.showHistoryContent(scene, targetPage, limit);
                });
            } else {
                btn.setAlpha(0.5);
                btn.disableInteractive();
            }

            contentArea.add(btn);
            currentX += btn.width + buttonSpacing;
        });

        // Page number display: "Page 1 of 10"
        const pageNumberText = scene.add.text(
            areaWidth / 2,
            y + 40, // place below the pagination buttons
            `Page ${page} of ${totalPages}`,
            {
                fontSize: '20px',
                color: '#FFFFFF',
                fontFamily: 'Poppins-Regular',
                align: 'center'
            }
        ) as ButtonText;
        pageNumberText.setOrigin(0.5, 0); // center horizontally
        contentArea.add(pageNumberText);
    }



    private createVolumeSettingsContent(scene: GameScene, contentArea: GameObjects.Container): void {
        const scaleFactor = 1;
        const widthSlider = 340;

        // Title - Settings in green color #379557
        const title = scene.add.text(15, 15, 'Settings', this.titleStyle) as ButtonText;
        title.setOrigin(0, 0);
        contentArea.add(title);

        // Calculate proper positions
        const startX = 15;
        const startY = 15;
        const sliderStartX = startX;
        const musicSliderY = startY + 115;
        const sfxSliderY = startY + 230;

        // Music section (no icon)
        const musicLabel = scene.add.text(startX + 0, startY + 70, 'Background Music', {
            fontSize: '18px',
            color: '#FFFFFF',
            fontFamily: 'Poppins-Regular'
        }) as ButtonText;
        contentArea.add(musicLabel);

        // SFX section (no icon)
        const sfxLabel = scene.add.text(startX + 0, startY + 170, 'Sound FX', {
            fontSize: '18px',
            color: '#FFFFFF',
            fontFamily: 'Poppins-Regular'
        }) as ButtonText;
        contentArea.add(sfxLabel);

        // Skip Intro section (UI only)
        const skipLabelY = startY + 270;
        const skipLabel = scene.add.text(startX + 0, skipLabelY, 'Skip Intro', {
            fontSize: '18px',
            color: '#FFFFFF',
            fontFamily: 'Poppins-Regular'
        }) as ButtonText;
        contentArea.add(skipLabel);

        // Toggle switches (right side)
        const toggleWidth = 64;
        const toggleHeight = 36;
        const toggleRadius = 18;
        // Place toggles within the visible content area width (panel width - 40 padding)
        const contentAreaWidth = scene.scale.width - 40;
        const toggleX = Math.max(sliderStartX + 200, contentAreaWidth - toggleWidth - 20);

        const drawToggle = (bg: Phaser.GameObjects.Graphics, circle: Phaser.GameObjects.Graphics, x: number, yCenter: number, on: boolean) => {
            const y = yCenter - toggleHeight / 2;
            bg.clear();
            circle.clear();
            if (on) {
                // ON: green track; white knob on RIGHT
                bg.fillStyle(0x379557, 1);
                bg.lineStyle(3, 0x2F6D49, 1);
                bg.strokeRoundedRect(x, y, toggleWidth, toggleHeight, toggleRadius);
                bg.fillRoundedRect(x, y, toggleWidth, toggleHeight, toggleRadius);
                circle.fillStyle(0xFFFFFF, 1);
                circle.fillCircle(x + toggleWidth - toggleRadius, y + toggleHeight / 2, toggleRadius - 4);
            } else {
                // OFF: dark gray track; white knob on LEFT
                bg.fillStyle(0x1F2937, 1);
                bg.lineStyle(3, 0x9CA3AF, 1);
                bg.strokeRoundedRect(x, y, toggleWidth, toggleHeight, toggleRadius);
                bg.fillRoundedRect(x, y, toggleWidth, toggleHeight, toggleRadius);
                circle.fillStyle(0xFFFFFF, 1);
                circle.fillCircle(x + toggleRadius, y + toggleHeight / 2, toggleRadius - 4);
            }
        };

        // Music toggle
        const musicToggleBg = scene.add.graphics();
        const musicToggleCircle = scene.add.graphics();
        contentArea.add(musicToggleBg);
        contentArea.add(musicToggleCircle);
        musicToggleBg.setDepth(10);
        musicToggleCircle.setDepth(11);
        let musicOn = scene.audioManager.getVolume() > 0;
        if (!musicOn) {
            // Default should be ON
            musicOn = true;
            scene.audioManager.setVolume(1);
        }
        drawToggle(musicToggleBg, musicToggleCircle, toggleX, startY + 70, musicOn);
        const musicToggleArea = scene.add.zone(toggleX, startY + 70 - toggleHeight / 2, toggleWidth, toggleHeight).setOrigin(0, 0);
        musicToggleArea.setInteractive();
        musicToggleArea.on('pointerdown', () => {
            musicOn = !musicOn;
            scene.audioManager.setVolume(musicOn ? 1 : 0);
            drawToggle(musicToggleBg, musicToggleCircle, toggleX, startY + 70, musicOn);
            updateSliders();
        });
        contentArea.add(musicToggleArea);
        musicToggleArea.setDepth(12);

        // SFX toggle
        const sfxToggleBg = scene.add.graphics();
        const sfxToggleCircle = scene.add.graphics();
        contentArea.add(sfxToggleBg);
        contentArea.add(sfxToggleCircle);
        sfxToggleBg.setDepth(10);
        sfxToggleCircle.setDepth(11);
        let sfxOn = scene.audioManager.getSfxVolume() > 0;
        if (!sfxOn) {
            // Default should be ON
            sfxOn = true;
            scene.audioManager.setSfxVolume(1);
        }
        drawToggle(sfxToggleBg, sfxToggleCircle, toggleX, startY + 170, sfxOn);
        const sfxToggleArea = scene.add.zone(toggleX, startY + 170 - toggleHeight / 2, toggleWidth, toggleHeight).setOrigin(0, 0);
        sfxToggleArea.setInteractive();
        sfxToggleArea.on('pointerdown', () => {
            sfxOn = !sfxOn;
            scene.audioManager.setSfxVolume(sfxOn ? 1 : 0);
            drawToggle(sfxToggleBg, sfxToggleCircle, toggleX, startY + 170, sfxOn);
            updateSliders();
        });
        contentArea.add(sfxToggleArea);
        sfxToggleArea.setDepth(12);

        // Skip Intro toggle (no functionality yet)
        const skipToggleBg = scene.add.graphics();
        const skipToggleCircle = scene.add.graphics();
        contentArea.add(skipToggleBg);
        contentArea.add(skipToggleCircle);
        skipToggleBg.setDepth(10);
        skipToggleCircle.setDepth(11);
        let skipOn = false; // UI-only state
        drawToggle(skipToggleBg, skipToggleCircle, toggleX, skipLabelY + 2, skipOn);
        const skipToggleArea = scene.add.zone(toggleX, skipLabelY + 2 - toggleHeight / 2, toggleWidth, toggleHeight).setOrigin(0, 0);
        skipToggleArea.setInteractive();
        skipToggleArea.on('pointerdown', () => {
            skipOn = !skipOn;
            drawToggle(skipToggleBg, skipToggleCircle, toggleX, skipLabelY + 2, skipOn);
        });
        contentArea.add(skipToggleArea);
        skipToggleArea.setDepth(12);

                // Music slider background
        const musicSliderBg = scene.add.graphics();
        musicSliderBg.fillStyle(0x379557, 1);
        musicSliderBg.fillRoundedRect(sliderStartX, musicSliderY, widthSlider * scaleFactor, 8 * scaleFactor, 4 * scaleFactor);
        
        const musicSliderBg2 = scene.add.graphics();
        musicSliderBg2.fillStyle(0x333333, 1);
        musicSliderBg2.lineStyle(1, 0x666666);
        musicSliderBg2.fillRoundedRect(sliderStartX, musicSliderY, widthSlider * scaleFactor, 8 * scaleFactor, 4 * scaleFactor);
        musicSliderBg2.strokeRoundedRect(sliderStartX, musicSliderY, widthSlider * scaleFactor, 8 * scaleFactor, 4 * scaleFactor);
        
        contentArea.add(musicSliderBg2);
        contentArea.add(musicSliderBg);

        const musicSlider = scene.add.graphics();
        musicSlider.fillStyle(0xffffff, 1);
        // Draw knob at local origin and position the graphics instead of drawing at world coords
        musicSlider.fillCircle(0, 0, 12 * scaleFactor);
        musicSlider.setPosition(sliderStartX + 0.75 * widthSlider * scaleFactor, musicSliderY + 4);
        // Enlarge interactive hit area and keep it local to the graphics
        musicSlider.setInteractive(
            new Geom.Circle(0, 0, 22 * scaleFactor),
            Geom.Circle.Contains
        );
        contentArea.add(musicSlider);

        // Music value text
        const musicValue = scene.add.text(sliderStartX , musicSliderY + 25, '75%', {
            fontSize: '16px',
            color: '#FFFFFF',
            fontFamily: 'Poppins-Regular'
        }) as ButtonText;
        contentArea.add(musicValue);

        // SFX slider (hidden for now)
        const sfxSliderBg = scene.add.graphics();
        const sfxSliderBg2 = scene.add.graphics();
        const sfxSlider = scene.add.graphics();
        const sfxValue = scene.add.text(sliderStartX, sfxSliderY + 25, '75%', {
            fontSize: '16px',
            color: '#FFFFFF',
            fontFamily: 'Poppins-Regular'
        }) as ButtonText;
        sfxSliderBg.setVisible(false);
        sfxSliderBg2.setVisible(false);
        sfxSlider.setVisible(false);
        sfxValue.setVisible(false);

        // Helper to update slider positions and values
        const updateSliders = (musicX: number | null = null, sfxX: number | null = null) => {
            const sliderWidth = widthSlider * scaleFactor;

            const musicVol = musicX !== null ? 
                Math.max(0, Math.min(1, musicX / sliderWidth)) : 
                scene.audioManager.getVolume();
            
            const sfxVol = sfxX !== null ? 
                Math.max(0, Math.min(1, sfxX / sliderWidth)) : 
                scene.audioManager.getSfxVolume();
            
            // Update music slider
            musicSlider.clear();
            musicSlider.fillStyle(0xffffff, 1);
            const musicSliderX = sliderStartX + (musicVol * sliderWidth);
            // Keep drawing local and move the graphics to the new position
            musicSlider.fillCircle(0, 0, 12 * scaleFactor);
            musicSlider.setPosition(musicSliderX, musicSliderY + 4);
            musicSliderBg.clear();
            musicSliderBg.fillStyle(0x379557, 1);
            musicSliderBg.fillRoundedRect(sliderStartX, musicSliderY, sliderWidth * musicVol, 8 * scaleFactor, 4 * scaleFactor);
            musicValue.setText(Math.round(musicVol * 100) + '%');

            // Sync music toggle state with slider value
            // If slider reaches 0%, force toggle OFF; if >0%, ensure toggle ON
            if (musicVol === 0) {
                if (musicOn) {
                    musicOn = false;
                    drawToggle(musicToggleBg, musicToggleCircle, toggleX, startY + 70, musicOn);
                }
            } else {
                if (!musicOn) {
                    musicOn = true;
                    drawToggle(musicToggleBg, musicToggleCircle, toggleX, startY + 70, musicOn);
                }
            }
            
            // Update SFX slider (kept hidden)
            const sfxSliderX = sliderStartX + (sfxVol * sliderWidth);
            sfxSlider.clear();
            sfxSlider.fillStyle(0xffffff, 1);
            sfxSlider.fillCircle(0, 0, 12 * scaleFactor);
            sfxSlider.setPosition(sfxSliderX, sfxSliderY + 4);
            sfxSliderBg.clear();
            sfxSliderBg.fillStyle(0x379557, 1);
            sfxSliderBg.fillRoundedRect(sliderStartX, sfxSliderY, sliderWidth * sfxVol, 8 * scaleFactor, 4 * scaleFactor);
            sfxValue.setText(Math.round(sfxVol * 100) + '%');

            // Update volumes
            if (musicX !== null) scene.audioManager.setVolume(musicVol);
            if (sfxX !== null) scene.audioManager.setSfxVolume(sfxVol);

            // Update interactive areas for sliders (keep hit areas centered on the local origin)
            musicSlider.setInteractive(
                new Geom.Circle(0, 0, 22 * scaleFactor),  
                Geom.Circle.Contains
            );
            // Keep SFX interactions disabled while hidden
            sfxSlider.disableInteractive();
        };

        // Initial slider setup
        updateSliders();


        // Make sliders draggable
        this.isDraggingMusic = false;
        this.isDraggingSFX = false;

        // Global pointer move and up handlers
        const pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
            if (this.isDraggingMusic) {
                const sliderWidth = widthSlider * scaleFactor;
                const p = (musicSliderTrack as any).getLocalPoint(pointer.x, pointer.y);
                const localX = Math.max(0, Math.min(sliderWidth, p && typeof p.x === 'number' ? p.x : 0));
                updateSliders(localX, null);
            } else if (this.isDraggingSFX) {
                const sliderWidth = widthSlider * scaleFactor;
                const p = (sfxSliderTrack as any).getLocalPoint(pointer.x, pointer.y);
                const localX = Math.max(0, Math.min(sliderWidth, p && typeof p.x === 'number' ? p.x : 0));
                updateSliders(null, localX);
            }
        };

        const pointerUpHandler = () => {
            this.isDraggingMusic = false;
            this.isDraggingSFX = false;
        };

        // Store handlers for cleanup
        this.menuEventHandlers.push(pointerMoveHandler, pointerUpHandler);

        this.scene.input.on('pointermove', pointerMoveHandler);
        this.scene.input.on('pointerup', pointerUpHandler);

        // Create clickable areas for the entire slider tracks
        const musicSliderTrack = scene.add.graphics();
        musicSliderTrack.setPosition(sliderStartX, musicSliderY);
        musicSliderTrack.fillStyle(0x000000, 0); // Transparent
        // Draw and set hit area in local coords for reliable input inside a container
        musicSliderTrack.fillRect(0, -10, widthSlider * scaleFactor, 28);
        musicSliderTrack.setInteractive(
            new Geom.Rectangle(0, -10, widthSlider * scaleFactor, 28),
            Geom.Rectangle.Contains
        );
        contentArea.add(musicSliderTrack);

        const sfxSliderTrack = scene.add.graphics();
        sfxSliderTrack.setPosition(sliderStartX, sfxSliderY);
        sfxSliderTrack.fillStyle(0x000000, 0); // Transparent
        // Keep SFX track hidden and non-interactive for now
        sfxSliderTrack.setVisible(false);
        contentArea.add(sfxSliderTrack);

        // Music slider track click handler
        musicSliderTrack.on('pointerdown', (pointer: Phaser.Input.Pointer, localX: number) => {
            const sliderWidth = widthSlider * scaleFactor;
            localX = Math.max(0, Math.min(sliderWidth, localX));
            const newVolume = localX / sliderWidth;
            scene.audioManager.setVolume(newVolume);
            this.isDraggingMusic = true; // allow click-and-drag on the track
            updateSliders();
        });

        // SFX slider track click handler
        // SFX track interaction disabled while hidden

        // Music slider handle interaction
        musicSlider.on('pointerdown', () => {
            this.isDraggingMusic = true;
        });

        // SFX slider handle interaction
        sfxSlider.on('pointerdown', () => {
            this.isDraggingSFX = true;
        });
    }

    public showMenu(scene: GameScene): void {        
        this.settingsOnly = false;

        const container = this.createMenu(scene);

        container.setVisible(true);
        container.setAlpha(0);
        this.isVisible = true;
        
        scene.tweens.add({
            targets: container,
            alpha: 1,
            duration: 300,
            ease: 'Power2'
        });

    }

    public hideMenu(scene: GameScene): void {
        if (!this.menuContainer) return;
        
        // Ensure menu container and all its children are hidden
        this.menuContainer.setVisible(false);
        this.menuContainer.setActive(false);
        this.isVisible = false;
        
        // Reset any help screen related state if present (guarded)
        if ((scene.gameData as any).isHelpScreenVisible !== undefined) {
            (scene.gameData as any).isHelpScreenVisible = false;
        }
        
        // Clean up event handlers
        if (this.menuEventHandlers) {
            this.menuEventHandlers.forEach(handler => {
                scene.input.off('pointermove', handler);
                scene.input.off('pointerup', handler);
            });
            this.menuEventHandlers = [];
        }
        
        // Reset dragging states
        this.isDraggingMusic = false;
        this.isDraggingSFX = false;
    }

    private destroyMenu(scene: GameScene): void {
        // Hide and cleanup listeners first
        this.hideMenu(scene);
        // Destroy existing container to free resources
        if (this.menuContainer) {
            this.menuContainer.destroy(true);
            this.menuContainer = undefined;
        }
        this.panel = undefined as any;
    }



    private addContent(scene: GameScene, _text: string, _type: string, _wordWrap: boolean = false, _wordWrapWidth: number = 0): void {
        if (_type === 'title') {
            const content = scene.add.text((this.textHorizontalPadding ?? this.padding / 2), this.yPosition, _text, this.titleStyle as Phaser.Types.GameObjects.Text.TextStyle);
            this.contentContainer.add(content);
            if (_text === 'Bonus Trigger') {
                content.setPosition(0, content.y);
            }
            this.yPosition += content.height + this.padding;
        } else if (_type === 'text') {
            const style = { ...this.textStyle } as Phaser.Types.GameObjects.Text.TextStyle;
            if (_wordWrap) {
                // wordWrap should be an object, not undefined
                style.wordWrap = { width: _wordWrapWidth };
            }
            const content = scene.add.text((this.textHorizontalPadding ?? this.padding / 2), this.yPosition, _text, style);
            this.contentContainer.add(content);
            this.yPosition += content.height + this.padding;
        } else if (_type === 'contentHeader1') {
            const style = { ...this.contentHeader1Style } as Phaser.Types.GameObjects.Text.TextStyle;
            if (_wordWrap) {
                style.wordWrap = { width: _wordWrapWidth };
            }
            const content = scene.add.text((this.textHorizontalPadding ?? this.padding / 2), this.yPosition, _text, style);
            this.contentContainer.add(content);
            this.yPosition += content.height + this.padding;
        }
    }


    private createHelpScreenContent(scene: GameScene, contentArea: GameObjects.Container): void {
            this.padding = 10;
            this.textHorizontalPadding = -2;
            this.contentWidth = scene.scale.width - this.padding * 6;
            this.yPosition = this.padding + 10;
    
            this.addTextBlock(scene, 'header1', 'Game Rules', { spacingAfter: 15 });
    
            this.addTextBlock(scene, 'content1', 'All symbols pay left to right on adjacent reels, starting from the leftmost reel.', { wordWrapWidth: this.contentWidth, spacingAfter: 24 });
    
            this.addTextBlock(scene, 'header2', 'RTP');
            this.addContent(scene, '96.49% - 96.6%', 'text');
    
            this.yPosition += this.padding * 5;
    
            this.addTextBlock(scene, 'header2', 'Payout');
            
            this.yPosition += this.padding * 8;
    
            // Create 11 symbol grids with payouts (Symbols 1-11)
            const symbolSize = 153;
            const symbolScale = 0.5;
            const scaledSymbolSize = symbolSize * symbolScale;
            for (let symbolIndex = 1; symbolIndex <= 11; symbolIndex++) {
                const cellX = this.padding;
                const cellY = this.yPosition;
    
                // Create symbol container with white border
                const symbolContainer = scene.add.container(cellX, cellY);
    
                this.createBorder(scene, symbolContainer, 
                    -this.padding / 2, 
                    -scaledSymbolSize, 
                    this.contentWidth + this.padding * 3,
                    scaledSymbolSize * 1.5
                );
    
                // Add symbol
                const symbol = scene.add.image(0, 0, `symbol_${symbolIndex}`);
                symbol.setScale(symbolScale);
                symbol.setOrigin(-0.2, 0.7);
                symbolContainer.add(symbol);
    
                // Add payout table next to symbol
                this.createPayoutTable(scene,
                    scaledSymbolSize + symbolSize/5,
                    0,
                    symbolContainer,
                    symbolIndex
                );
    
                this.contentContainer.add(symbolContainer);
                symbolContainer.setPosition(0, symbolContainer.y);
                this.yPosition += scaledSymbolSize + this.padding * 5;  // Move to next row
            }
            this.yPosition -=  scaledSymbolSize;

            // Increase top spacing before Scatter label
            this.yPosition += this.padding * 1.5;

            // Temporarily increase left padding for Scatter label only
            const prevTextPad = this.textHorizontalPadding;
            this.textHorizontalPadding = (this.padding * 1.5);
            this.addContent(scene, 'Scatter', 'contentHeader1');
            this.textHorizontalPadding = prevTextPad;
    
            this.yPosition += this.padding * 3;
            { // scatter payouts
                const cellX = -this.padding / 2;
                const cellY = this.yPosition;
    
                // Create symbol container with white border
                const symbolContainer = scene.add.container(cellX, cellY );
                
                // Provide extra top padding inside the grey container for the Scatter header
                const extraScatterTopPad = this.padding / 1.5;
                // Increase vertical size for Scatter payout only
                const extraScatterBottomPad = this.padding * 16;
                const scatterContainerHeight = scaledSymbolSize * 5.5 + extraScatterTopPad + extraScatterBottomPad;
                this.createBorder(scene, symbolContainer, 
                    0, 
                    -scaledSymbolSize - extraScatterTopPad, 
                    this.contentWidth + this.padding * 3 ,
                    scatterContainerHeight
                );
    
                // Add symbol
                const symbol = scene.add.sprite(0, 0, 'ScatterLabel');
                symbol.setScale(1);
                symbol.setOrigin(0.3, 0.4);
                symbolContainer.add(symbol);
                symbol.setPosition(scene.scale.width * 0.4, this.padding *5);
    
                // Add payout table next to symbol
                this.createPayoutTable(scene, 
                    symbol.x / 3,  // Position table right of symbol
                    symbol.height * 3 / 10 + this.padding * 20,  // Move table further down
                    symbolContainer,
                    0       
                );
    
                this.contentContainer.add(symbolContainer);
                this.contentContainer.sendToBack(symbolContainer);
                this.yPosition += scatterContainerHeight - 15;  // Move to next row based on actual container height
            }

            // Thin green divider between Scatter info and Tumble Win
            this.addDivider(scene, 0x379557);

            this.yPosition += 50;

            // Enhanced Bet
            this.addTextBlock(scene, 'header2', 'Enhanced Bet');
            const enhancedContainer = scene.add.container(-this.padding * 1.5, this.yPosition);
            this.yPosition += this.createBorder(scene, enhancedContainer,
                this.padding,
                0,
                this.contentWidth + this.padding * 3,
                scaledSymbolSize * 3.1
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
            const enhanceDesc = scene.add.text(30, pillY + pillH + 40,
                "You’re wagering 25% more per spin, but you also have better\nchances at hitting big features.",
                {
                    ...this.textStyle,
                    wordWrap: { width: this.contentWidth - this.padding * 2 }
                }
            ) as ButtonText;
            enhanceDesc.setOrigin(0, 0);
            enhancedContainer.add(enhanceDesc);

            // Spacing before next section
            this.yPosition += this.padding * 4;

            // Buy Feature
            this.addTextBlock(scene, 'header2', 'Buy Feature');
            const buyFeatContainer = scene.add.container(-this.padding * 1.5, this.yPosition);
            this.yPosition += this.createBorder(scene, buyFeatContainer,
                this.padding,
                0,
                this.contentWidth + this.padding * 3,
                scaledSymbolSize * 2.8
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
                fontFamily: 'Poppins-Bold'
            }) as ButtonText;
            buyLabel.setOrigin(0.5, 0.5);
            buyFeatContainer.add(buyLabel);

            // Static price text centered on the button (hide currency in demo)
            const isDemoBuyPrice = scene.gameAPI?.getDemoState();
            const currencySymbolBuyPrice = isDemoBuyPrice ? '' : '$';
            const buyPrice = scene.add.text(btnCenterX, btnCenterY + 14, `${currencySymbolBuyPrice}10,000`, {
                fontSize: '18px',
                color: '#FFFFFF',
                fontFamily: 'Poppins-Bold'
            }) as ButtonText;
            buyPrice.setOrigin(0.5, 0.5);
            buyFeatContainer.add(buyPrice);

            // Description for Buy Feature
            const buyDesc = scene.add.text(30, btnY + (featureBg.displayHeight) / 2 + 5,
                'Lets you buy the free spins round for 100x your total bet.',
                {
                    ...this.textStyle,
                    wordWrap: { width: this.contentWidth - this.padding * 2 }
                }
            ) as ButtonText;
            buyDesc.setOrigin(0, 0);
            buyFeatContainer.add(buyDesc);

            // Removed Tumble Win section
            this.yPosition += this.padding * 7.5;
            this.addTextBlock(scene, 'header2', 'Free Spins Rules');
            this.yPosition += scaledSymbolSize * 0.25;
            //this.yPosition -= scaledSymbolSize * 4.5;
    
            const freeSpinContainer = scene.add.container(-this.padding * 1.5, this.yPosition-scaledSymbolSize * 0.2);
            this.yPosition += this.createBorder(scene, freeSpinContainer, 
                this.padding, 
                0, 
                this.contentWidth + this.padding * 3, 
                scaledSymbolSize * 43
                
            );
            this.contentContainer.add(freeSpinContainer);
            this.contentContainer.sendToBack(freeSpinContainer);

            this.yPosition -= scaledSymbolSize * 1.25;

            // Use a common template for Bonus Trigger and Free Spins Start
            const freeSpinsTitleOffset = this.padding * 15; // distance from image → title
            const freeSpinsDescOffset = this.padding * 5;  // distance from title → description
            const bonusDesc = 'Land 3             SCATTER \non reel 1, 3, and 5 on the screen to \ntrigger the FREE SPINS feature.';
            const bonusImageTop = this.padding * 31.5; // explicit image Y inside the bordered area
            // Compute center X of the bordered container for image placement
            // @ts-ignore
            const frameW0 = (freeSpinContainer.getData && freeSpinContainer.getData('frameW')) || (this.contentWidth + this.padding * 3);
            // @ts-ignore
            const frameX0 = (freeSpinContainer.getData && freeSpinContainer.getData('frameX')) || this.padding;
            const centerX0 = frameX0 + frameW0 / 2;
            const bonusBottomY = this.addSubSectionInstruction(
                scene,
                freeSpinContainer,
                {
                    title: 'Bonus Trigger',
                    imageKey: 'scatterGame',
                    imageX: centerX0,
                    imageY: bonusImageTop,
                    imageOrigin: { x: 0.5, y: 0.33 },
                    imageScale: 1.1,
                    titleOffsetY: freeSpinsTitleOffset,
                    titleX: (this.textHorizontalPadding ?? this.padding / 2) + this.padding * 3.1,
                    desc: bonusDesc,
                    descOffsetY: freeSpinsDescOffset,
                    descX: this.padding * 3,
                    wordWrapWidth: this.contentWidth + this.padding * 3
                }
            );

            // Horizontal divider under Bonus Trigger
            // @ts-ignore
            const frameW2 = (freeSpinContainer.getData && freeSpinContainer.getData('frameW')) || (this.contentWidth + this.padding * 3);
            // @ts-ignore
            const frameX2 = (freeSpinContainer.getData && freeSpinContainer.getData('frameX')) || this.padding;
            const dividerY = bonusBottomY + this.padding * 6;
            const inset = this.padding * 2;
            const lineWidth = Math.max(0, frameW2 - inset * 2);
            const lineLeft = frameX2 + inset;
            const dividerG = scene.add.graphics();
            dividerG.fillStyle(0x379557, 1);
            dividerG.fillRect(lineLeft, dividerY, lineWidth, 1);
            freeSpinContainer.add(dividerG);

            const fsDesc = 'Before the round begins, a random number of free spins is awarded.\nA Spin Wheel appears to reveal the number of free spins.\nOnce the wheel stops, the total number of spins is granted.';
            const fsImageTop = dividerY + this.padding * 30;
            const fsStartBottom = this.addSubSectionInstruction(
                scene,
                freeSpinContainer,
                {
                    title: 'Free Spins Start',
                    imageKey: 'wheelSpin_helper',
                    imageX: frameX2 + frameW2 / 2,
                    imageY: fsImageTop,
                    imageOrigin: { x: 0.5, y: 0.33 },
                    imageScale: 1.1,
                    titleOffsetY: freeSpinsTitleOffset,
                    titleX: (this.textHorizontalPadding ?? this.padding / 2) + this.padding * 3.1,
                    desc: fsDesc,
                    descOffsetY: freeSpinsDescOffset,
                    descX: this.padding * 3,
                    wordWrapWidth: this.contentWidth + this.padding * 3
                }
            );

            // Divider after Free Spins Start
            const dividerY2 = fsStartBottom + this.padding * 6;
            const inset2 = this.padding * 2;
            const lineWidth2 = Math.max(0, frameW2 - inset2 * 2);
            const lineLeft2 = frameX2 + inset2;
            const dividerG2 = scene.add.graphics();
            dividerG2.fillStyle(0x379557, 1);
            dividerG2.fillRect(lineLeft2, dividerY2, lineWidth2, 1);
            freeSpinContainer.add(dividerG2);

            // New section: Free Spins Round (mirror Free Spins Start spacing)
            const fsRoundDesc = 'During Free Spins, all WILDs that \nland on reels 2, 3, and 4 stay on \nthe screen for the entire round.\n\nThese Sticky WILDs come with a \nrandom multiplier revealed when \nthey appear, which remains fixed \nuntil the end of the feature.\n\nSpecial reels are active during \nFree Spins. \nBONUS symbols do not appear, \nand the feature cannot be \nretriggered.';
            const fsRoundImageTop = dividerY2 + this.padding * 42;
            this.addSubSectionInstruction(
                scene,
                freeSpinContainer,
                {
                    title: 'Free Spins Round',
                    imageKey: 'freeSpin_round',
                    imageX: frameX2 + frameW2 / 2,
                    imageY: fsRoundImageTop,
                    imageOrigin: { x: 0.5, y: 0.5 },
                    imageScale: 1.1,
                    titleOffsetY: freeSpinsTitleOffset - 111,
                    titleX: (this.textHorizontalPadding ?? this.padding / 2) + this.padding * 3.1,
                    desc: fsRoundDesc,
                    descOffsetY: freeSpinsDescOffset,
                    descX: this.padding * 3,
                    wordWrapWidth: this.contentWidth + this.padding * 3
                }
            );
    
            const scatterSymbolImage2 = scene.add.image(0, 0, 'ScatterLabel');
            scatterSymbolImage2.setScale(0.2);
            scatterSymbolImage2.setOrigin(0.5, 0.5);
            scatterSymbolImage2.setPosition(130, 870);
            freeSpinContainer.add(scatterSymbolImage2);
    
            const scatterSymbolImage = scene.add.image(0, 0, 'ScatterLabel');
            scatterSymbolImage.setScale(0.5);
            scatterSymbolImage.setOrigin(0.5, 0.5);
            scatterSymbolImage.setPosition(70, 75);
            freeSpinContainer.add(scatterSymbolImage);
            
            const scatterWinImage = scene.add.image(0, 0, 'scatterWin');
            scatterWinImage.setScale(1);
            scatterWinImage.setOrigin(0.5, 0.5);
            scatterWinImage.setPosition(scatterSymbolImage.x - scatterSymbolImage.displayWidth/2 + this.padding * 9.1, scatterSymbolImage.y * 3/4 - scatterWinImage.height/ 4 + 20);
            freeSpinContainer.add(scatterWinImage);
            
            this.yPosition -= scaledSymbolSize * 5.3;

            
            // this.addDivider(scene, 0x379557);
            const gameSettingsTitleOffset = this.padding * 15; // distance from image → title
            const gameSettingsDescOffset = this.padding * 5;  

            // Removed Multiplier section
            this.yPosition += this.padding * 55;
            this.addTextBlock(scene, 'header2', 'Game Settings');
    
            const gamesettingsContainer = scene.add.container(-this.padding * 1.5, this.yPosition);
            this.yPosition += this.createBorder(scene, gamesettingsContainer, 
                this.padding, 
                0, 
                this.contentWidth + this.padding * 3, 
                scaledSymbolSize * 10.8
            );
            this.contentContainer.add(gamesettingsContainer);
    
            //this.yPosition -= scaledSymbolSize * 9.75;
            this.yPosition -= scaledSymbolSize * 10.3;
            
    
            //this.yPosition += this.padding;
            this.addTextBlock(scene, 'header2', 'Paylines', {
                y: this.yPosition + this.padding * 0.1,
                x: (this.textHorizontalPadding ?? this.padding / 2) + this.padding * 1.8
            });

            
            
            this.createHowToPlayEntry(scene, 20, scaledSymbolSize * 1, gamesettingsContainer, '', 'Symbols can land anywhere on the screen.', true, this.contentWidth + this.padding * 3);

            // Add payline notes text (as shown in the reference)
            const paylineNotes = [
                'All symbols pay left to right on \nselected paylines.',
                'Free Spins wins are added to \npayline wins.',
                'All wins are multiplied by the bet \nper line.',
                'All values shown are actual wins \nin coins.',
                'Only the highest win is paid per \nline.',
                'Wins on multiple paylines are \nadded together.'
            ].join('\n');
            const notesX = this.padding * 3;
            const notesY = scaledSymbolSize * 1 + this.padding * 8;
            const notesText = scene.add.text(notesX, notesY, paylineNotes, {
                ...this.textStyle,
                wordWrap: { width: this.contentWidth + this.padding * 3 }
            }) as ButtonText;
            gamesettingsContainer.add(notesText);

            // Immediately continue with text after the notes block (examples removed)
            const textStartY = notesText.y + notesText.displayHeight + this.padding * 6;
            // Removed extra bullet texts per request

            // Compute actual bottom of Game Settings content and place How To Play after it
            const contentBottomLocal = Math.max(gridBottom, notesText.y + notesText.displayHeight);
            const gameSettingsBottom = gamesettingsContainer.y + contentBottomLocal + this.padding * 12;
            this.yPosition = gameSettingsBottom;

            this.commonRules(scene, this.contentWidth, 153);
    
            contentArea.add(this.contentContainer);
    }
    
    private commonRules(scene: GameScene, genericTableWidth: number, scaledSymbolSize: number): void {
        
        this.addContent(scene, 'How to Play', 'title');
        const commonPadding = 20;
        
        // Align How to Play container with other sections (same left offset and width)
        const howToPlayContainer = scene.add.container(-this.padding * 1.5, this.yPosition);

        const tableWidth = this.contentWidth + this.padding * 3;
        this.yPosition += this.createBorder(scene, howToPlayContainer, 
            this.padding, 
            0, 
            tableWidth, 
            scaledSymbolSize * 25
        );
        this.contentContainer.add(howToPlayContainer);

        // Align header and entries with the same left padding used in other sections
        const leftPad = this.padding * 3; // same as Paylines text left align
        this.addTextBlock(scene, 'header2', 'Bet Controls', { container: howToPlayContainer, x: leftPad, y: commonPadding / 2 });

        this.createHowToPlayEntry(scene, leftPad, commonPadding * 5 , howToPlayContainer, 'howToPlay1Mobile', '');

        this.addTextBlock(scene, 'header2', 'Game Actions', { container: howToPlayContainer, x: leftPad, y: commonPadding * 9.5 });
        
        this.createHowToPlayEntry(scene, leftPad, commonPadding * 15, howToPlayContainer, 'howToPlay2Mobile', '');
        this.createHowToPlayEntry(scene, leftPad, commonPadding * 25, howToPlayContainer, 'howToPlay11Mobile', '');
        this.createHowToPlayEntry(scene, leftPad, commonPadding * 38, howToPlayContainer, 'howToPlay12Mobile', '');
        this.createHowToPlayEntry(scene, leftPad, commonPadding * 50, howToPlayContainer, 'howToPlay3Mobile', '');
        this.createHowToPlayEntry(scene, leftPad, commonPadding * 60, howToPlayContainer, 'howToPlay4Mobile', '');

        this.addTextBlock(scene, 'header2', 'Display & Stats', { container: howToPlayContainer, x: leftPad, y: commonPadding * 66 });

        this.createHowToPlayEntry(scene, leftPad, this.isMobile ? commonPadding * 72 : commonPadding * 52, howToPlayContainer, 'howToPlay5', 'Shows your current available credits.', true, this.contentWidth - this.padding * 2);
        this.createHowToPlayEntry(scene, leftPad, this.isMobile ? commonPadding * 82 : commonPadding * 59, howToPlayContainer, 'howToPlay6', 'Display your total winnings from the current round.', true, this.contentWidth - this.padding * 2);
        this.createHowToPlayEntry(scene, leftPad, this.isMobile ? commonPadding * 93 : commonPadding * 66, howToPlayContainer, 'howToPlay7', 'Adjust your wager using the - and + buttons.', true, this.contentWidth - this.padding * 2);

        this.addTextBlock(scene, 'header2', 'General Controls', { container: howToPlayContainer, x: leftPad, y: commonPadding * 101 });

        this.createHowToPlayEntry(scene, leftPad, commonPadding * 107, howToPlayContainer, 'howToPlay8Mobile', '');  
        this.createHowToPlayEntry(scene, leftPad, commonPadding * 114.5, howToPlayContainer, 'howToPlay9Mobile', '');
        this.createHowToPlayEntry(scene, leftPad, commonPadding * 124, howToPlayContainer, 'howToPlay10Mobile', '');        

        this.yPosition -= scaledSymbolSize * 15;
    }

    private createHeader(scene: GameScene, x: number, y: number, container: GameObjects.Container, text: string, color: string): void {
        const genericTableWidth = this.contentWidth + this.padding * 3;
        
        const header = scene.add.text(0, 0,text,
            {
                ...this.textStyle,
                wordWrap: { width: genericTableWidth - this.padding * 6 },
                fontSize: '20px',
                color: color,
                fontFamily: 'Poppins-Regular',
                fontStyle: 'bold'
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

        // Make the scroll view interactive for the content area width and height
        this.scrollView.setInteractive(new Phaser.Geom.Rectangle(
            0, 0,
            this.contentArea.width,
            this.contentArea.height
        ), Phaser.Geom.Rectangle.Contains);

        this.scrollView.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            isDragging = true;
            startY = pointer.y;
            lastY = pointer.y;
            // Stop any ongoing momentum scrolling
            if (scene.tweens.isTweening(this.contentContainer)) {
                scene.tweens.killTweensOf(this.contentContainer);
            }
        });

        scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (!isDragging || !this.isVisible) return;

            // Calculate the distance moved since last frame
            const deltaY = pointer.y - lastY;
            lastY = pointer.y;
            
            // Update velocity
            dragVelocity = deltaY;

            // Update position
            currentY = this.contentContainer.y + deltaY;
            
            // Calculate bounds
            const maxY = 0;
            const contentHeight = this.yPosition;
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

            // Apply momentum scrolling
            if (Math.abs(dragVelocity) > minVelocity) {
                let targetY = this.contentContainer.y + (dragVelocity * 20);
                
                // Calculate bounds
                const maxY = 0;
                const contentHeight = this.yPosition;
                const viewHeight = this.contentArea.height;
                const minY = Math.min(0, viewHeight - contentHeight);
                
                // Clamp target position
                targetY = Phaser.Math.Clamp(targetY, minY, maxY);
                
                scene.tweens.add({
                    targets: this.contentContainer,
                    y: targetY,
                    duration: 500,
                    ease: 'Cubic.out'
                });
            } else {
                // If velocity is too low, just snap to bounds
                const maxY = 0;
                const minY = Math.min(0, scene.scale.height - this.yPosition);
                const targetY = Phaser.Math.Clamp(this.contentContainer.y, minY, maxY);
                
                if (targetY !== this.contentContainer.y) {
                    scene.tweens.add({
                        targets: this.contentContainer,
                        y: targetY,
                        duration: 200,
                        ease: 'Cubic.out'
                    });
                }
            }
        });

        // Enable mouse wheel scrolling
        scene.input.on('wheel', (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number) => {
            if (!this.isVisible) return;
            
            // Calculate new position
            currentY = this.contentContainer.y - deltaY;
            
            // Calculate bounds
            const maxY = 0;
            const contentHeight = this.yPosition;
            const viewHeight = this.contentArea.height;
            const minY = Math.min(0, viewHeight - contentHeight);
            
            // Clamp the position
            currentY = Phaser.Math.Clamp(currentY, minY, maxY);
            
            // Animate to new position
            scene.tweens.add({
                targets: this.contentContainer,
                y: currentY,
                duration: 100,
                ease: 'Cubic.out'
            });
        });
    }

    
    private createHowToPlayEntry(scene: GameScene, x: number, y: number, container: GameObjects.Container, image: string, text: string, wordWrap: boolean = false, wordWrapWidth: number = 0): void {
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
            // @ts-ignore
            const frameW = (container.getData && container.getData('frameW')) || (this.contentWidth + this.padding * 3);
            // @ts-ignore
            const frameX = (container.getData && container.getData('frameX')) || this.padding;
            const centerX = frameX + frameW / 2;
            imageElement.setPosition(centerX, y);
            container.add(imageElement);
        }

        const textElement = scene.add.text(
            0, 0,
            text,
            {
                ...this.textStyle,
                wordWrap: wordWrap ? { width: wordWrapWidth } : undefined,
            }
        );
        // Place text below the image (or at y if no image), left-aligned with container padding
        const textX = this.padding * 3;
        const textY = imageElement ? (imageElement.y + (imageElement.displayHeight / 2) + this.padding * 2) : y;
        textElement.setPosition(textX, textY);
        textElement.setOrigin(0, 0);

        if (image === 'BuyFeatMobile') {
            textElement.setPosition(textX, y + this.padding * 5);
        }
        if (image === 'scatterGame') {
            textElement.setPosition(textX, textElement.y + this.padding * 6);
        }
        container.add(textElement);
        this.yPosition += (imageElement ? imageElement.displayHeight * 2 : 0) + textElement.displayHeight + this.padding * 2;
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
        opts?: { imageY?: number; descY?: number; descX?: number; titleX?: number; titleToImageGap?: number; imageToDescGap?: number }
    ): number {
        // Title (use header2 style) with same horizontal inset as Bonus Trigger
        this.addTextBlock(scene, 'header2', title, {
            container,
            x: opts?.titleX ?? ((this.textHorizontalPadding ?? this.padding / 2) + this.padding * 1.5),
            y: titleY
        });

        // Frame metrics for centering
        // @ts-ignore
        const frameW = (container.getData && container.getData('frameW')) || (this.contentWidth + this.padding * 3);
        // @ts-ignore
        const frameX = (container.getData && container.getData('frameX')) || this.padding;
        const centerX = frameX + frameW / 2;

        // Image
        const imageY = opts?.imageY ?? (titleY + (opts?.titleToImageGap ?? this.padding * 7));
        const img = scene.add.image(centerX, imageY, imageKey);
        const useOffsetOrigin = imageKey === 'scatterGame' || imageKey === 'wheelSpin_helper';
        img.setOrigin(0.5, useOffsetOrigin ? 0.33 : 0.5);
        img.setScale(1.1);
        container.add(img);

        // Description
        const descX = opts?.descX ?? (this.padding * 3);
        const descY = opts?.descY ?? (img.y + (img.displayHeight / 2) + (opts?.imageToDescGap ?? this.padding * 3));
        const descText = scene.add.text(descX, descY, description, {
            ...this.textStyle,
            wordWrap: { width: this.contentWidth + this.padding * 3 }
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
        // @ts-ignore
        const frameW = (container.getData && container.getData('frameW')) || (this.contentWidth + this.padding * 3);
        // @ts-ignore
        const frameX = (container.getData && container.getData('frameX')) || this.padding;
        const centerX = frameX + frameW / 2;

        // Image centered at topY
        const img = scene.add.image(centerX, topY, imageKey);
        const useOffsetOrigin = imageKey === 'scatterGame' || imageKey === 'wheelSpin_helper';
        img.setOrigin(0.5, useOffsetOrigin ? 0.33 : 0.5);
        img.setScale(1.1);
        container.add(img);

        // Title below image
        const titleY = img.y + (img.displayHeight / 2) + (opts?.imageToTitleGap ?? this.padding * 3);
        this.addTextBlock(scene, 'header2', title, {
            container,
            x: opts?.titleX ?? ((this.textHorizontalPadding ?? this.padding / 2) + this.padding * 1.5),
            y: titleY,
        });

        // Description below title
        const descX = opts?.descX ?? (this.padding * 3);
        const descY = titleY + (opts?.titleToDescGap ?? this.padding * 3);
        const descText = scene.add.text(descX, descY, description, {
            ...this.textStyle,
            wordWrap: { width: this.contentWidth + this.padding * 3 }
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
        }
    ): number {
        const img = scene.add.image(params.imageX, params.imageY, params.imageKey);
        img.setOrigin(params.imageOrigin?.x ?? 0.5, params.imageOrigin?.y ?? 0.5);
        if (params.imageScale) {
            img.setScale(params.imageScale);
        }
        container.add(img);

        const titleY = img.y + (img.displayHeight / 2) + params.titleOffsetY;
        this.addTextBlock(scene, 'header2', params.title, {
            container,
            x: params.titleX ?? ((this.textHorizontalPadding ?? this.padding / 2) + this.padding * 1.5),
            y: titleY
        });

        const descY = titleY + params.descOffsetY;
        const descText = scene.add.text(params.descX ?? (this.padding * 3), descY, params.desc, {
            ...this.textStyle,
            wordWrap: params.wordWrapWidth ? { width: params.wordWrapWidth } : { width: this.contentWidth + this.padding * 3 }
        });
        descText.setOrigin(0, 0);
        container.add(descText);

        return descText.y + descText.displayHeight;
    }

    private createBorder(scene: GameScene, _container: GameObjects.Container, _x: number, _y: number, _width: number, _height: number): number {
        const border = scene.add.graphics();
        border.fillStyle(0x333333);
        border.fillRoundedRect(_x, _y, _width, _height, 8);
        border.lineStyle(2, 0x333333);
        border.strokeRoundedRect(_x, _y, _width, _height, 8);
        border.setAlpha(0.7);
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
        } catch { /* no-op */ }
        return _height;
    }

    private addDivider(scene: GameScene, _color: number = 0xFFFFFF): void {
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
        this.yPosition += this.padding;
    }

    private createPayoutTable(scene: GameScene, x: number, y: number, container: GameObjects.Container, symbolIndex: number): void {
        const cellWidth1 = 60; 
        const cellWidth2 = 100;
        const cellHeight = 22.5;
        const cellPadding = 5;

        const tableHeight = (cellHeight + cellPadding) * 4;
        const matchNumRange : string[] = ['5', '4', '3'];
        const scatterNumRange : string[] = ['6', '5', '4'];
        const scatterText: string[] = [
            'Appears only on reels 1, 3, and 5.', 
            'Landing 3 BONUS symbols',
            'triggers the Free Spins Round.', 
            '3x BONUS symbols award 5x your',
            'total bet.',
            'BONUS symbols pay in any',
            'position.'
        ];
        // Center the table vertically relative to the symbol
        const tableY = y - tableHeight / 2;

        // Create table background
        const graphics = scene.add.graphics();

        let payoutAdjustments : [number, number, number] = [200.00, 10.00, 6.00];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                let cellWidth = 0;
                if(col == 0) {
                    cellWidth = cellWidth1;
                } else if(col == 1) {
                    cellWidth = cellWidth2;
                } else {
                    cellWidth = cellWidth2 * 2;
                }
                const cellX = x + (col == 2 ? cellWidth1 + cellWidth2 + cellPadding * 2 : col * (cellWidth + cellPadding));
                const cellY = tableY + row * (cellHeight + cellPadding);

                // Draw cell border
                graphics.strokeRect(cellX, cellY, cellWidth, cellHeight);

                if(symbolIndex != 0) {
                    // For regular symbols
                    if(col < 2) {
                        // Payout values per symbol (1-11) for rows ['12+', '10', '8']
                        const payoutMap: { [key: number]: [number, number, number] } = {
                            1: [37.50, 7.50, 2.50],
                            2: [25.00, 5.00, 1.75],
                            3: [15.00, 3.00, 1.25],
                            4: [10.00, 2.00, 1.25],
                            5: [7.50, 1.25, 0.60],
                            6: [5.00, 1.00, 0.40],
                            7: [2.50, 0.50, 0.25],
                            8: [2.50, 0.50, 0.25],
                            9: [1.25, 0.25, 0.10],
                            10: [1.25, 0.25, 0.10],
                            11: [1.25, 0.25, 0.10]
                        };
                        const payoutValue = (payoutMap[symbolIndex] && payoutMap[symbolIndex][row] !== undefined) ? payoutMap[symbolIndex][row] : 0;
                        const text2 = payoutValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        payoutAdjustments[row] = text2.length;

                        let text : string;  
                        const repeatTimes = payoutAdjustments[0] - text2.length;

                        const isDemoPayout = scene.gameAPI?.getDemoState();
                        const currencySymbolPayout = isDemoPayout ? '' : '$';
                        const currencyPrefixPayout = currencySymbolPayout + (currencySymbolPayout ? ' ' : '');

                        if(repeatTimes > 0){
                            text = col == 0 ? matchNumRange[row] : 
                                ' '.repeat(repeatTimes) + currencyPrefixPayout + text2;
                        }
                        else{
                            text = col == 0 ? matchNumRange[row] : 
                                currencyPrefixPayout + text2;
                        }

                        let textElement : GameObjects.Text;
                        if(col == 0){
                            textElement = scene.add.text(cellX + cellWidth + 25, cellY + cellHeight/2, text, {
                                fontSize: '20px',
                                color: '#FFFFFF',
                                fontFamily: 'Poppins-Regular', 
                                align: 'left',
                                fontStyle: 'bold'
                            });
                            textElement.setOrigin(0, 0.5);
                        } else {
                            // Right-align payout values to the cell's right edge (with 2px inset)
                            textElement = scene.add.text(cellX + cellWidth + 50, cellY + cellHeight/2, text, {
                                fontSize: '20px',
                                color: '#FFFFFF',
                                fontFamily: 'Poppins-Regular', 
                                align: 'right'
                            });
                            textElement.setOrigin(1, 0.5);
                        }

                        container.add(textElement);
                    }
                } else {
                    // For scatter symbol
                    const text2 = (0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        payoutAdjustments[row] = text2.length;

                        let text : string;  
                        const repeatTimes = payoutAdjustments[0] - text2.length;

                        const isDemoPayout = scene.gameAPI?.getDemoState();
                        const currencySymbolPayout = isDemoPayout ? '' : '$';
                        const currencyPrefixPayout = currencySymbolPayout + (currencySymbolPayout ? ' ' : '');

                        if(repeatTimes > 0){
                            text = col == 0 ? scatterNumRange[row] : 
                                ' '.repeat(repeatTimes) + currencyPrefixPayout + text2;
                        }
                        else{
                            text = col == 0 ? scatterNumRange[row] : 
                                currencyPrefixPayout + text2;
                        }

                    if(col == 0) {
                        const textElement = scene.add.text(cellX + cellWidth + this.padding, cellY + cellHeight/2, text, {
                            fontSize: '20px',
                            color: '#FFFFFF',
                            fontFamily: 'Poppins-Regular',
                            fontStyle: 'bold'
                        });
                        textElement.setOrigin(col == 0 ? 0 : 0.5, 0.5);
                        container.add(textElement);
                    } else if(col == 1) {
                        
                        const textElement = scene.add.text(cellX + cellWidth , cellY + cellHeight/2, text, {
                            fontSize: '20px',
                            color: '#FFFFFF',
                            fontFamily: 'Poppins-Regular'
                        });
                        textElement.setOrigin(0.5, 0.5);
                        container.add(textElement);
                    
                    } else {
                        // Do not place scatter descriptive text within the third column cells; we'll place it below the table instead
                    }
                }
            }
        }
        // For Scatter symbol, place the descriptive text as a centered block BELOW the table
        if (symbolIndex === 0) {
            const tableWidth = cellWidth1 + cellPadding + cellWidth2 + cellPadding + (cellWidth2 * 2);
            const tableLeft = x;
            const tableCenterX = tableWidth / 2;
            const tableBottomY = tableY + (3 * (cellHeight + cellPadding));

            const infoText = scatterText.join('\n');
            const scatterTextCell = scene.add.text(
                tableCenterX,
                tableBottomY + this.padding * 3,
                infoText,
                {
                    fontSize: '20px',
                    color: '#FFFFFF',
                    fontFamily: 'Poppins-Regular',
                    align: 'left',
                    wordWrap: { width: tableWidth - this.padding}
                }
            );
            scatterTextCell.setOrigin(0.5, 0);
            container.add(scatterTextCell);
        }
        container.add(graphics);
    }


    public toggleMenu(scene: GameScene): void {
        
        this.showMenu(scene);
    }

    // addHeader1/addHeader2/addContent1 removed in favor of addTextBlock

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
            case 'header1': baseStyle = this.header1Style; break;
            case 'header2': baseStyle = this.header2Style; break;
            case 'content1': baseStyle = this.content1Style; break;
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