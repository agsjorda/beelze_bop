# CLAUDE.MD - Beelze Bop Game Documentation

> Auto-generated context file for AI assistants working on the beelze_bop slot game

## Table of Contents
1. [Quick Overview](#quick-overview)
2. [Project Structure](#project-structure)
3. [Game Flow & Scenes](#game-flow--scenes)
4. [Core Managers](#core-managers)
5. [Game Mechanics](#game-mechanics)
6. [Configuration Files](#configuration-files)
7. [Asset System](#asset-system)
8. [Backend Integration](#backend-integration)
9. [Event System](#event-system)
10. [Common Patterns](#common-patterns)
11. [Important Gotchas](#important-gotchas)

---

## Quick Overview

**What is beelze_bop?**
A Phaser 3-based slot game with:
- 6×5 grid (cluster pays system)
- Tumble/cascade mechanics
- Free spins with multipliers
- Autoplay, turbo mode, buy feature
- Spine animations throughout

**Tech Stack:**
- Phaser 3.90.0 (WEBGL)
- TypeScript 5.7.2
- Spine plugin for animations
- Vite 6.3.6 for build
- React 19 (minimal wrapper only)

**Key Stats:**
- 3 Phaser scenes (Boot → Preloader → Game)
- 50+ UI components
- 7 singleton managers
- 40+ event types
- 1445 lines in main Game scene

---

## Project Structure

```
beelze_bop/
├── src/
│   ├── backend/              # API integration & data models
│   │   ├── GameAPI.ts        # Main API client (token, spin, balance)
│   │   ├── SpinData.ts       # Spin response type definitions
│   │   └── tmp_backend/      # Legacy demo mode mocks
│   │
│   ├── config/               # Configuration files
│   │   ├── GameConfig.ts     # Grid, symbols, timing, win thresholds
│   │   ├── AssetConfig.ts    # Dynamic asset path resolution
│   │   └── TurboConfig.ts    # Turbo speed multipliers
│   │
│   ├── event/                # Event management system
│   │   ├── EventManager.ts   # Singleton event bus
│   │   └── GameEventType.ts  # 40+ event type enums
│   │
│   ├── game/                 # Core game code
│   │   ├── components/       # UI & game components (50+ files)
│   │   │   ├── Background.ts
│   │   │   ├── controller/   # Bet, Spin, Autoplay controllers
│   │   │   ├── dialogs/      # Win dialogs, buy feature dialog
│   │   │   ├── symbols/      # Symbol grid system (6 modules)
│   │   │   └── ...
│   │   ├── scenes/           # Phaser scenes
│   │   │   ├── Boot.ts       # Initializes managers, loads minimal assets
│   │   │   ├── Preloader.ts  # Loads all assets, backend init
│   │   │   └── Game.ts       # Main game scene (1445 lines)
│   │   ├── utils/            # Game-specific utilities
│   │   └── main.ts           # Phaser game configuration
│   │
│   ├── managers/             # Singleton managers (7 files)
│   │   ├── AudioManager.ts   # Music, SFX, ducking, crossfade
│   │   ├── GameStateManager.ts  # 14 state flags, central truth
│   │   ├── NetworkManager.ts    # Network speed detection
│   │   ├── ScreenModeManager.ts # Portrait/landscape detection
│   │   ├── FullScreenManager.ts # Fullscreen toggle
│   │   ├── FreeRoundManager.ts  # Free round tracking
│   │   └── ResponseTracker.ts   # (Legacy, unused)
│   │
│   ├── types/                # TypeScript definitions
│   │   └── SpinData.ts       # Spin response interfaces
│   │
│   ├── utils/                # Global utilities
│   │   ├── AssetLoader.ts    # Asset loading helper
│   │   ├── AudioContextGuard.ts  # iOS audio fix
│   │   ├── SpineGuard.ts     # Spine plugin safety
│   │   └── ...
│   │
│   └── main.tsx              # React entry point
│
├── public/assets/            # Game assets
│   ├── portrait/high/        # High-quality portrait assets
│   ├── portrait/low/         # Low-quality portrait assets
│   ├── controller/portrait/  # UI controls
│   ├── symbols/high/         # Symbol spine animations
│   ├── sounds/               # Audio files
│   └── fonts/poppins/        # Font files
│
├── vite/                     # Build configuration
├── index.html                # Entry HTML
└── package.json              # Dependencies
```

**Key Directories to Know:**
- [src/game/scenes/Game.ts](src/game/scenes/Game.ts) - Main game logic (START HERE)
- [src/config/GameConfig.ts](src/config/GameConfig.ts) - All game constants
- [src/managers/](src/managers/) - Singleton managers (global state)
- [src/game/components/controller/](src/game/components/controller/) - UI controllers
- [src/game/components/symbols/](src/game/components/symbols/) - Symbol grid system

---

## Game Flow & Scenes

### Scene Progression

**1. Boot Scene** ([src/game/scenes/Boot.ts](src/game/scenes/Boot.ts))
- Initializes NetworkManager & ScreenModeManager
- Loads AssetConfig system
- Preloads loading screen assets + fonts + character sprites
- Sets up audio context guards (iOS fix)
- **Transitions to:** Preloader

**2. Preloader Scene** ([src/game/scenes/Preloader.ts](src/game/scenes/Preloader.ts))
- Calls `GameAPI.initializeGame()` to get/generate token
- Calls `GameAPI.initializeSlotSession()` for backend initialization
- Loads ALL game assets (symbols, backgrounds, dialogs, audio)
- Shows studio loading screen with DiJoker branding
- Displays Character1 & Character2 idle animations
- Shows "Press Play To Continue" button
- Uses RadialDimmerTransition to fade to Game scene
- **Transitions to:** Game

**3. Game Scene** ([src/game/scenes/Game.ts](src/game/scenes/Game.ts) - **MAIN SCENE**)
- Creates all game components (Background, Symbols, Controllers, Dialogs)
- Initializes balance from backend
- Sets up event listeners for game flow
- Manages bonus mode transitions
- Handles win dialogs and autoplay
- Runs game loop

### Game Lifecycle Events

```
START
  → SPIN
    → SPIN_DATA_RESPONSE (backend response)
      → REELS_START
        → [Tumbles/Cascades]
          → REELS_STOP
            → WIN_START (if wins)
              → WIN_STOP
                → WIN_DIALOG_CLOSED
                  → (Auto-spin or wait for user)
```

**Special Event Flows:**
- **Bonus Trigger:** `SCATTER_TRIGGER` → bonus mode → free spins loop
- **Autoplay:** `AUTO_START` → spin loop → `AUTO_STOP` (on condition met)
- **Turbo:** `TURBO_ON` / `TURBO_OFF` (affects all animation speeds)

---

## Core Managers

All managers are **singletons** - use `ManagerName.getInstance()` to access.

### 1. GameStateManager ([src/managers/GameStateManager.ts](src/managers/GameStateManager.ts))
**The central source of truth for game state.**

**14 State Flags:**
```typescript
isBonus: boolean           // In free spin mode
isScatter: boolean         // Scatter symbols present
isTurbo: boolean           // Turbo mode active
isAutoPlaying: boolean     // Autoplay running
isReelSpinning: boolean    // Reels currently spinning
isWinDialogActive: boolean // Win dialog showing
isSpinning: boolean        // Spin in progress
canSpin: boolean           // Can initiate spin
isInitialSetup: boolean    // First-time setup
hasError: boolean          // Error state
isGamePaused: boolean      // Game paused
isMultiplierAnimating: boolean  // Multiplier animations
isFreeRoundActive: boolean      // Free rounds active
isBuyFeatureActive: boolean     // Buy feature dialog open
```

**Usage:**
```typescript
const gameState = GameStateManager.getInstance();
gameState.setState('isBonus', true);
const isBonus = gameState.getState('isBonus');
```

### 2. AudioManager ([src/managers/AudioManager.ts](src/managers/AudioManager.ts))
**Manages all audio (music + SFX).**

**3 Music Types:**
- MAIN - Base game background music
- BONUS - Free spin mode music
- FREE_SPIN - Alternative bonus music

**Key Methods:**
```typescript
AudioManager.getInstance().playSound('spin');
AudioManager.getInstance().playMusic(MusicType.BONUS);
AudioManager.getInstance().crossfadeMusic(MusicType.MAIN, MusicType.BONUS);
AudioManager.getInstance().duckMusic(0.3, 500); // Lower volume
AudioManager.getInstance().restoreMusic(500);   // Restore volume
```

**35+ Sound Effects:**
- Spin sounds: spin, spin_stop
- Reel drops: reel_drop_1 through reel_drop_5
- Tumbles: tumble_1 through tumble_5
- Wins: win_start, win_loop, win_big, win_mega, etc.
- Dialogs: dialog_open, dialog_close
- Multipliers: multiplier_hit, multiplier_add

### 3. ScreenModeManager ([src/managers/ScreenModeManager.ts](src/managers/ScreenModeManager.ts))
**Detects and forces portrait orientation.**

```typescript
const screenMode = ScreenModeManager.getInstance();
const isPortrait = screenMode.isPortrait(); // true for this game
const config = screenMode.getScreenConfig();
// Returns: { width: 428, height: 926, isPortrait: true }
```

### 4. NetworkManager ([src/managers/NetworkManager.ts](src/managers/NetworkManager.ts))
**Detects network speed and determines asset quality.**

```typescript
const network = NetworkManager.getInstance();
const scale = network.getAssetScale(); // Returns 1 (high) or 2 (low)
```

### 5. FreeRoundManager ([src/managers/FreeRoundManager.ts](src/managers/FreeRoundManager.ts))
**Manages free rounds from backend.**

**Initialization:**
```typescript
// In Game.ts create():
FreeRoundManager.getInstance().initialize(
  this,
  GameAPI.getInstance(),
  initData
);
```

**Key Features:**
- Reads `hasFreeSpinRound` and `remainingFreeSpin` from backend
- Shows free round button UI (replaces spin button)
- Locks bet/autoplay/amplify controls during free rounds
- Decrements count after each spin
- Shows completion panel when done
- Accumulates total win across free rounds

### 6. FullScreenManager ([src/managers/FullScreenManager.ts](src/managers/FullScreenManager.ts))
**Provides fullscreen toggle button.**

```typescript
FullScreenManager.getInstance().addFullScreenButton(scene);
```

### 7. ResponseTracker (LEGACY - Not Used)
Do not use this manager - it's legacy code.

---

## Game Mechanics

### Grid & Symbols

**Grid Dimensions:**
```typescript
SLOT_COLUMNS = 6  // Number of columns (vertical reels)
SLOT_ROWS = 5     // Number of rows (horizontal)
// Grid structure: area[column][row]
// Actual grid: 6 columns × 5 rows
```

**Symbol Types:**
1. **Scatter (Symbol 0):** Triggers free spins
   - 4+ scatters = bonus mode
   - 3+ scatters during bonus = retrigger

2. **Normal Symbols (1-9):** Candy/food themed symbols

3. **Multiplier Symbols (10-22):** Bonus mode only
   ```
   Symbol 10 = 2x     Symbol 17 = 15x
   Symbol 11 = 3x     Symbol 18 = 20x
   Symbol 12 = 4x     Symbol 19 = 25x
   Symbol 13 = 5x     Symbol 20 = 50x
   Symbol 14 = 6x     Symbol 21 = 100x
   Symbol 15 = 8x
   Symbol 16 = 10x
   Symbol 22 = 12x
   ```

### Win System

**Cluster Pays:** 8+ matching symbols anywhere trigger a win

**Win Thresholds:**
```typescript
BIG_WIN: 20x   // >= 20× bet
MEGA_WIN: 30x  // >= 30× bet
EPIC_WIN: 45x  // >= 45× bet
SUPER_WIN: 60x // >= 60× bet
```

**Tumble/Cascade System:**
1. Check for wins (8+ clusters)
2. Animate winning symbols
3. Explode winning symbols
4. Drop new symbols from top
5. Repeat until no more wins

### Free Spins / Bonus Mode

**Trigger:** 4+ scatter symbols in base game
**Retrigger:** 3+ scatter symbols during bonus

**Features:**
- All free spin outcomes pre-determined from server
- Multiplier symbols (10-22) only appear in bonus
- Multipliers trigger visual animations (fly to center, add to total)
- Background, header, and music change during bonus
- Total win accumulated across all free spins

**Implementation:**
```typescript
// Free spins data in spin response
freeSpin: {
  items: SpinData[]  // Pre-determined spin results
}
```

### Autoplay

**Features:**
- User selects spin count (10, 25, 50, 100)
- Optional limits:
  - Loss limit
  - Single win limit
  - Balance decrease limit
- Pauses for win dialogs (user can skip)
- Stops automatically when conditions met

**Controller:** [src/game/components/controller/AutoplayController.ts](src/game/components/controller/AutoplayController.ts)

### Turbo Mode

**Configuration:** [src/config/TurboConfig.ts](src/config/TurboConfig.ts)
```typescript
TURBO_SPEED_MULTIPLIER = 0.7     // 30% faster
TURBO_DELAY_MULTIPLIER = 0.7
TURBO_DURATION_MULTIPLIER = 0.7
WINLINE_ANIMATION_SPEED_MULTIPLIER = 4.0
```

**Toggle:** Click turbo button in UI
**Effect:** Speeds up all animations (spin, tumble, winlines)

### Amplify Bet (Enhanced Bet)

**Multiplier:** 1.25× base bet
**Purpose:** Provides better odds (backend implementation)
**UI:** Shows enhanced bet amount vs base bet

**Controller:** [src/game/components/controller/BetController.ts](src/game/components/controller/BetController.ts)

### Buy Feature

**What it does:** Player purchases free spins directly
**Cost:** Base bet × multiplier (typically 80-100×)
**Validation:** Checks balance before allowing purchase
**Flow:** Purchase → Bonus mode activated immediately

**Dialog:** [src/game/components/dialogs/BuyFeatureDialog.ts](src/game/components/dialogs/BuyFeatureDialog.ts)

---

## Configuration Files

### GameConfig.ts ([src/config/GameConfig.ts](src/config/GameConfig.ts))

**Grid Config:**
```typescript
SLOT_COLUMNS: 5  // Actually 5 rows (naming is confusing)
SLOT_ROWS: 6     // Actually 6 columns
SLOT_SYMBOL_WIDTH: 62
SLOT_SYMBOL_HEIGHT: 62
SLOT_SYMBOL_SPACING: 4
```

**Symbol IDs:**
```typescript
SCATTER_SYMBOL_ID: 0
NORMAL_SYMBOL_IDS: [1, 2, 3, 4, 5, 6, 7, 8, 9]
MULTIPLIER_SYMBOL_IDS: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
```

**Timing Config:**
```typescript
TUMBLE_DELAY: 500
TUMBLE_STAGGER: 100
SYMBOL_DROP_DURATION: 300
WIN_ANIMATION_DURATION: 2000
SCATTER_ANIMATION_DELAY: 500
```

**Win Thresholds:**
```typescript
BIG_WIN_THRESHOLD: 20
MEGA_WIN_THRESHOLD: 30
EPIC_WIN_THRESHOLD: 45
SUPER_WIN_THRESHOLD: 60
```

**Depth Layers:**
```typescript
BACKGROUND_DEPTH: 0
SYMBOLS_DEPTH: 10
CONTROLLER_DEPTH: 100
OVERLAYS_DEPTH: 500
DIALOGS_DEPTH: 1000
FULLSCREEN_BUTTON_DEPTH: 2000
```

### AssetConfig.ts ([src/config/AssetConfig.ts](src/config/AssetConfig.ts))

**Dynamic Asset Resolution:**
```typescript
const assetConfig = AssetConfig.getInstance(networkManager, screenModeManager);

// Returns paths based on:
// - orientation (portrait/landscape)
// - network speed (high/low quality)
```

**Asset Groups:**
- Background
- BonusBackground
- Header
- Symbols (spine animations)
- Buttons (spine animations)
- Dialogs (spine animations)
- Audio (45+ files)
- Fonts (Poppins Regular, Bold, Thin)

### TurboConfig.ts ([src/config/TurboConfig.ts](src/config/TurboConfig.ts))

**Helper Methods:**
```typescript
TurboConfig.applyTurboSpeed(normalValue, isTurboActive)
// Returns: isTurboActive ? normalValue * 0.7 : normalValue
```

---

## Asset System

### Directory Structure
```
public/assets/
├── portrait/
│   ├── high/               # High-quality assets
│   │   ├── background/
│   │   ├── bonus_background/
│   │   ├── dialogs/
│   │   ├── symbols/
│   │   └── header/
│   └── low/                # Low-quality assets
├── controller/portrait/    # UI buttons
├── symbols/high/           # Symbol spine animations
│   ├── Symbol0BZ.atlas     # Scatter
│   ├── Symbol0BZ.json
│   ├── Symbol1BZ.atlas
│   └── ...
├── sounds/
│   ├── BG/                 # Background music
│   ├── SFX/                # Sound effects
│   └── Wins/               # Win sounds
└── fonts/poppins/
```

### Loading Strategy

**Boot Scene:** Minimal assets only
- Loading screen
- Fonts
- Character animations

**Preloader Scene:** ALL game assets
```typescript
loadBackgroundAssets()
loadBonusBackgroundAssets()
loadSymbolAssets()        // 50+ spine animations
loadButtonAssets()
loadDialogAssets()
loadAudioAssets()         // 45+ audio files
loadFontAssets()
```

**Parallel Loading:**
```typescript
maxParallelDownloads: 8
```

### Spine Animations

**Format:** Each spine animation has 2 files:
- `*.atlas` - Texture atlas
- `*.json` - Animation data

**Usage:**
```typescript
const spine = scene.add.spine(x, y, 'Symbol1BZ', 'idle');
spine.play('win', true); // Play 'win' animation, loop
```

**Important Spine Animations:**
- Symbol0BZ through Symbol22BZ - Symbol animations
- Background - Main background animation
- BonusBackground - Bonus mode background
- WinDialog_BIG, WinDialog_MEGA, etc. - Win dialogs
- Buttons (Spin, Auto, Turbo, etc.)

---

## Backend Integration

### GameAPI ([src/backend/GameAPI.ts](src/backend/GameAPI.ts))

**Singleton Usage:**
```typescript
const api = GameAPI.getInstance();
```

**Key Methods:**

**1. Initialize Game (Get Token)**
```typescript
await api.initializeGame();
// Returns: token (JWT string)
// Endpoint: POST /api/v1/generate_url
```

**2. Initialize Slot Session**
```typescript
const initData = await api.initializeSlotSession();
// Returns: { balance, betDenominations, hasFreeSpinRound, freeSpinRound, etc. }
// Endpoint: POST /api/v1/slots/initialize
```

**3. Place Bet (Spin)**
```typescript
const spinData = await api.placeBet(betAmount, isAmplify);
// Returns: SpinData (reels, wins, balance, freeSpin, etc.)
// Endpoint: POST /api/v1/slots/bet
```

**4. Get Balance**
```typescript
const balance = await api.getBalance();
// Endpoint: POST /api/v1/slots/balance
```

### Demo Mode

**URL Parameter:** `?demo=true`

**Behavior:**
- No backend calls for game actions
- Uses mock data from `tmp_backend/demo-data/`
- Analytics still sent to backend
- Token generation still happens

**Detection:**
```typescript
const isDemoMode = new URLSearchParams(window.location.search).get('demo') === 'true';
```

### SpinData Interface ([src/types/SpinData.ts](src/types/SpinData.ts))

**Key Fields:**
```typescript
interface SpinData {
  reels: number[][];        // Symbol grid after spin
  totalWin: number;         // Total win amount
  balance: number;          // Updated balance
  wins: WinData[];          // Win details
  freeSpin?: {              // Free spin data (if triggered)
    items: SpinData[];      // Pre-determined free spins
  };
  scatter?: {               // Scatter positions (if present)
    positions: number[][];
    count: number;
  };
  // ... more fields
}
```

---

## Event System

### EventManager ([src/event/EventManager.ts](src/event/EventManager.ts))

**Singleton Usage:**
```typescript
const eventManager = EventManager.getInstance();
```

**Subscribe to Events:**
```typescript
eventManager.on(GameEventType.SPIN_DATA_RESPONSE, (data) => {
  console.log('Spin data received:', data);
});
```

**Emit Events:**
```typescript
eventManager.emit(GameEventType.REELS_START);
```

### Common Events ([src/event/GameEventType.ts](src/event/GameEventType.ts))

**Game Flow:**
```typescript
START                  // Game initialized
SPIN                   // Spin button clicked
SPIN_DATA_RESPONSE     // Backend response received
REELS_START            // Reels start spinning
REELS_STOP             // Reels stop spinning
```

**Win Events:**
```typescript
WIN_START              // Win animations start
WIN_STOP               // Win animations complete
WIN_DIALOG_OPEN        // Win dialog opens
WIN_DIALOG_CLOSED      // Win dialog closes
```

**Autoplay Events:**
```typescript
AUTO_START             // Autoplay started
AUTO_STOP              // Autoplay stopped
AUTO_SPIN_COUNT_UPDATE // Remaining spins updated
```

**Bonus Events:**
```typescript
SCATTER_TRIGGER        // Scatters trigger bonus
BONUS_START            // Bonus mode starts
BONUS_END              // Bonus mode ends
MULTIPLIER_HIT         // Multiplier symbol hit
MULTIPLIER_ANIMATIONS_COMPLETE  // All multiplier anims done
```

**State Events:**
```typescript
TURBO_ON               // Turbo mode activated
TURBO_OFF              // Turbo mode deactivated
BET_CHANGED            // Bet amount changed
BALANCE_UPDATED        // Balance changed
```

---

## Common Patterns

### Creating a UI Component

**Template:**
```typescript
export class MyComponent extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);
    this.setDepth(GameConfig.DEPTH.SOME_LAYER);

    this.createUI();
    this.setupEventListeners();
  }

  private createUI(): void {
    const bg = this.scene.add.rectangle(0, 0, 200, 100, 0x000000);
    this.add(bg);
    // Add more UI elements
  }

  private setupEventListeners(): void {
    EventManager.getInstance().on(GameEventType.SOME_EVENT, this.handleEvent, this);
  }

  private handleEvent(): void {
    // Handle event
  }

  public destroy(): void {
    EventManager.getInstance().off(GameEventType.SOME_EVENT, this.handleEvent, this);
    super.destroy();
  }
}
```

### Adding a Button

```typescript
const button = this.scene.add.sprite(x, y, 'button-key');
button.setInteractive({ useHandCursor: true });

button.on('pointerdown', () => {
  button.setScale(0.95); // Press effect
});

button.on('pointerup', () => {
  button.setScale(1.0);
  this.handleClick();
});

button.on('pointerover', () => {
  button.setTint(0xcccccc); // Hover effect
});

button.on('pointerout', () => {
  button.clearTint();
});
```

### Using Spine Animations

```typescript
// Create spine object
const spine = this.scene.add.spine(x, y, 'SpineKey', 'idle');

// Play animation
spine.play('win', true); // loop
spine.play('celebrate', false); // play once

// Listen for animation complete
spine.on('complete', (entry) => {
  if (entry.animation.name === 'celebrate') {
    spine.play('idle', true);
  }
});

// Always use SpineGuard when accessing spine
import { SpineGuard } from '@/utils/SpineGuard';

if (SpineGuard.isSpineLoaded(this.scene)) {
  const spine = this.scene.add.spine(x, y, key, animation);
}
```

### Tween Animations

```typescript
// Simple tween
this.scene.tweens.add({
  targets: sprite,
  y: newY,
  duration: 500,
  ease: 'Power2',
  onComplete: () => {
    console.log('Tween complete');
  }
});

// Respecting turbo mode
const duration = TurboConfig.applyTurboSpeed(
  500,
  GameStateManager.getInstance().getState('isTurbo')
);
```

### Accessing Managers

```typescript
// All managers are singletons
const gameState = GameStateManager.getInstance();
const audio = AudioManager.getInstance();
const screenMode = ScreenModeManager.getInstance();
const network = NetworkManager.getInstance();
const freeRound = FreeRoundManager.getInstance();
const fullscreen = FullScreenManager.getInstance();

// EventManager
const events = EventManager.getInstance();
```

---

## Important Gotchas

### 1. Grid Array Structure is [column][row]
```typescript
// In GameConfig.ts:
SLOT_COLUMNS = 6  // Number of columns (vertical reels)
SLOT_ROWS = 5     // Number of rows (horizontal)

// Grid structure: area[column][row]
// Actual grid: 6 columns × 5 rows
```
**Important:** The 2D array is indexed as `[column][row]`, not `[row][column]`.

### 2. Spine Plugin Must Be Checked
```typescript
// ALWAYS use SpineGuard before creating spine objects
import { SpineGuard } from '@/utils/SpineGuard';

if (SpineGuard.isSpineLoaded(scene)) {
  const spine = scene.add.spine(x, y, key);
} else {
  console.error('Spine plugin not loaded!');
}
```

### 3. Audio Context iOS Fix
```typescript
// AudioContextGuard is automatically installed in main.ts
// But be aware: Audio won't play until user interaction on iOS
```

### 4. Free Spin Data Key Inconsistency
```typescript
// Backend sometimes returns both:
freespin: { ... }  // lowercase 's'
freeSpin: { ... }  // camelCase

// Always check both when parsing backend data
```

### 5. Event Cleanup is CRITICAL
```typescript
// ALWAYS remove event listeners in destroy()
public destroy(): void {
  EventManager.getInstance().off(GameEventType.SOME_EVENT, this.handler, this);
  super.destroy();
}

// Forgetting this causes memory leaks!
```

### 6. Currency Manager NOT Implemented
```typescript
// beelze_bop does NOT use the shared CurrencyManager yet
// It uses SlotController.BalanceController instead
// See commit: "Implemented currency support to all games except beelze-bop"
```

### 7. Demo Mode Detection
```typescript
// Demo mode is detected via URL parameter
const isDemoMode = new URLSearchParams(window.location.search).get('demo') === 'true';

// In demo mode:
// - Backend calls for spin/balance are mocked
// - Token generation still happens
// - Analytics still sent
```

### 8. GameStateManager is NOT Passed Between Scenes
```typescript
// GameStateManager is a singleton - NOT passed via scene.start()
// Always access via getInstance()

// Boot/Preloader pass: networkManager, screenModeManager, assetConfig, gameAPI
// Game scene creates its own GameStateManager instance
```

### 9. Multiplier Symbols Only in Bonus Mode
```typescript
// Symbols 10-22 are multipliers
// They ONLY appear during free spins
// Don't expect them in base game
```

### 10. Win Dialog Auto-Close Behavior
```typescript
// Win dialogs (BigW_BZ, MegaW_BZ, EpicW_BZ, SuperW_BZ) auto-close after 2.5 seconds
// FreeSpinRetri_BZ (retrigger) auto-closes after 2.5 seconds
// FreeSpin_BZ (first trigger) requires user click "press anywhere to continue"
// TotalW_BZ requires user click "press anywhere to continue"
// Congrats_BZ requires user click "press anywhere to continue"
// During autoplay, win dialogs pause the auto-spin until closed/auto-closed
// See AutoplayController.ts line 358 and Dialogs.ts line 625 for logic
```

---

## Quick Reference

### File Locations for Common Tasks

**Changing bet amounts:**
- [src/game/components/controller/BetController.ts](src/game/components/controller/BetController.ts)

**Modifying symbol animations:**
- [src/game/components/symbols/SymbolsController.ts](src/game/components/symbols/SymbolsController.ts)
- [src/game/components/symbols/SymbolAnimationController.ts](src/game/components/symbols/SymbolAnimationController.ts)

**Adjusting win thresholds:**
- [src/config/GameConfig.ts](src/config/GameConfig.ts) (BIG_WIN_THRESHOLD, etc.)

**Changing autoplay behavior:**
- [src/game/components/controller/AutoplayController.ts](src/game/components/controller/AutoplayController.ts)
- [src/game/components/dialogs/AutoplayDialog.ts](src/game/components/dialogs/AutoplayDialog.ts)

**Modifying audio:**
- [src/managers/AudioManager.ts](src/managers/AudioManager.ts)

**Adding new events:**
- [src/event/GameEventType.ts](src/event/GameEventType.ts) (add enum)
- Emit via `EventManager.getInstance().emit()`

**Backend API changes:**
- [src/backend/GameAPI.ts](src/backend/GameAPI.ts)
- [src/types/SpinData.ts](src/types/SpinData.ts)

**Asset path changes:**
- [src/config/AssetConfig.ts](src/config/AssetConfig.ts)

---

## Development Workflow

### Running the Game
```bash
npm install
npm run dev
```

### Building for Production
```bash
npm run build
```

### Running Tests
```bash
npm run test
```

### Linting
```bash
npm run lint
```

### Demo Mode
```
http://localhost:5173/?demo=true
```

---

## Integration Points

### Adding Currency Manager Support
1. Import shared CurrencyManager from parent repo
2. Replace BalanceController with CurrencyManager.getInstance()
3. Update balance display to use CurrencyManager.getBalance()
4. Test with different currencies

### Adding Free Round Support
Already implemented via FreeRoundManager. Backend must return:
```typescript
{
  hasFreeSpinRound: true,
  freeSpinRound: {
    remainingFreeSpin: number,
    totalFreeSpin: number,
    totalWin: number
  }
}
```

### Adding Game History
Use existing endpoint:
```typescript
GET /api/v1/games/me/histories
```
Create HistoryDialog component to display results.

---

## Architecture Philosophy

**Event-Driven:** All major actions trigger events via EventManager
**Singleton Managers:** Global state managed by singleton managers
**Component-Based:** UI built from reusable container components
**Asset Configuration:** Dynamic asset loading based on device/network
**Backend-First:** All game logic/RNG on backend, client is display layer
**TypeScript:** Full type safety with interfaces for all data structures

---

**Last Updated:** 2026-02-01
**Game Version:** Based on commit c706817 (merge DEV into GST-4006)
**Status:** Production-ready, missing currency manager integration

---

*This file is auto-generated for AI assistant context. Update as the codebase evolves.*
