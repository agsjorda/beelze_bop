import { SpinData } from "./SpinData";
import { GameData } from "../game/components/GameData";
import { gameStateManager } from "../managers/GameStateManager";
import { SoundEffectType } from "../managers/AudioManager";
import { SLOT_COLUMNS, SLOT_ROWS } from "../config/GameConfig";

/**
 * Function to parse URL query parameters
 * @param name - The name of the parameter to retrieve
 * @returns The value of the parameter or null if not found
 */
function getUrlParameter(name: string): string {
    const urlParams = new URLSearchParams(window.location.search);
    let str : string = '';
    if(urlParams.get('start_game')){
        str = 'start_game';
    }
    else{
        str = urlParams.get(name) || '';
    }
    return str;
}

/**
 * Function to log all URL parameters for debugging
 * Only logs if there are any parameters present
 */
function logUrlParameters(): void {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.toString()) {
        console.log('🔍 URL Parameters:', Object.fromEntries(urlParams.entries()));
    }
}


const getApiBaseUrl = (): string => {
    const configuredUrl = (window as any)?.APP_CONFIG?.['game-url'];
    if (typeof configuredUrl === 'string' && configuredUrl.length > 0) {
        return configuredUrl.replace(/\/$/, "");
    }
    return 'https://stg-game-launcher.dijoker.com'; // 192.168.0.17:3000/

};

/**
 * Structure of a single free spin round entry in the initialization payload.
 */
export interface InitFreeSpinRound {
    bet: string;
    totalFreeSpin: number;
    usedFreeSpin: number;
    remainingFreeSpin: number;
}

/**
 * Response payload for the /api/v1/slots/initialize endpoint
 */
export interface SlotInitializeData {
    gameId: string;
    playerId?: string;
    sessionId: string;
    lang: string;
    currency: string;
    currencySymbol?: string;
    hasFreeSpinRound: boolean;
    // New backend format: array of free spin round entries.
    // Kept as `any` union-friendly type for backwards compatibility,
    // but we always treat it as InitFreeSpinRound[] in our helper.
    freeSpinRound: InitFreeSpinRound[] | number | Record<string, unknown> | null;
    hasUnresolvedSpin: boolean;
    unresolvedSpinIndex: number;
    // The backend can return arbitrary structure here; keep it flexible
    unresolvedSpin: any;
}

export interface SlotInitializeResponse {
    data: SlotInitializeData;
}

/**
 * History item interface representing a single game history entry
 */
export interface HistoryItem {
    id: number;
    roundId: string;
    type: 'free_spin' | 'normal';
    gameId: string;
    gameName: string;
    currency: string;
    bet: string;
    win: string;
    jackpotWin: string;
    createdAt: string;
}

export class GameAPI {  
    private static readonly GAME_ID: string = '00120925';
    private static DEMO_BALANCE: number = 15000;

    gameData: GameData;
    exitURL: string = '';
    private currentSpinData: SpinData | null = null;
    private currentFreeSpinIndex: number = 0; // Track current free spin item index
    private initializationData: SlotInitializeData | null = null; // Cached initialization response
    private remainingInitFreeSpins: number = 0; // Free spin rounds from initialization still available
    private initFreeSpinBet: number | null = null; // Bet size associated with initialization free spins

    // One-shot debug helper: force the first MANUAL spin to contain 3 scatters (symbol id 0)
    // in the first 3 columns. Enable via:
    // - URL: ?mockFirstManualScatterSpin=true
    // - localStorage: localStorage.setItem('mockFirstManualScatterSpin','true')
    private static readonly MOCK_FIRST_MANUAL_SCATTER_SPIN_ENABLED: boolean =
        new URLSearchParams(window.location.search).get('mockFirstManualScatterSpin') === 'true' ||
        localStorage.getItem('mockFirstManualScatterSpin') === 'true';
    private mockedFirstManualScatterSpin: boolean = false;
    
    // Test mode: Set to true to force test data on every spin
    // Can be enabled via URL parameter ?testMode=true or localStorage.setItem('testMode', 'true')
    private static readonly TEST_MODE_ENABLED: boolean = 
        new URLSearchParams(window.location.search).get('testMode') === 'true' ||
        localStorage.getItem('testMode') === 'true';
    
    // Test data to be used when test mode is enabled
    private static readonly TEST_SPIN_DATA: any = {
        "bet": "1",
        "slot": {
            "area": [
                [3, 1, 0, 4, 2],
                [8, 7, 5, 0, 6],
                [3, 2, 9, 1, 9],
                [9, 3, 2, 4, 1],
                [6, 8, 0, 5, 7],
                [3, 9, 1, 0, 2]
            ],
            "totalWin": 44.3,
            "tumbles": [],
            "freeSpin": {
                "multiplierValue": 3,
                "items": [
                    {
                        "spinsLeft": 10,
                        "area": [[8,8,9,9,1], [5,5,8,8,10], [5,8,8,7,7], [6,9,9,5,5], [4,8,8,3,3], [5,8,8,9,9]],
                        "totalWin": 2.3,
                        "multipliers": [10],
                        "tumbles": [
                            {"symbols": {"in": [[9,6], [8,2], [9,9], [], [6,7], [1,8]], "out": [{"symbol": 8, "count": 10, "win": 0.9}]}, "win": 0.9},
                            {"symbols": {"in": [[7,7,1], [], [4,9], [8,8], [], [7,7]], "out": [{"symbol": 9, "count": 9, "win": 0.25}]}, "win": 0.25}
                        ]
                    },
                    {"spinsLeft": 9, "area": [[8,7,7,4,4], [6,6,7,7,2], [9,6,6,8,8], [8,4,4,0,7], [8,7,7,3,3], [9,5,5,8,8]], "totalWin": 0, "multipliers": [], "tumbles": []},
                    {
                        "spinsLeft": 8,
                        "area": [[8,8,9,9,1], [9,0,3,3,7], [8,8,9,9,11], [2,2,9,9,8], [8,8,9,9,7], [8,5,5,9,9]],
                        "totalWin": 3.4499999999999997,
                        "multipliers": [11],
                        "tumbles": [{"symbols": {"in": [[9,8,8,6], [6], [4,0,9,9], [5,5,8], [8,4,4,6], [6,6,7]], "out": [{"symbol": 8, "count": 8, "win": 0.4}, {"symbol": 9, "count": 11, "win": 0.75}]}, "win": 1.15}]
                    },
                    {
                        "spinsLeft": 7,
                        "area": [[5,10,3,3,6], [4,4,9,9,6], [5,9,9,4,4], [6,6,9,9,1], [9,9,7,7,5], [6,7,7,3,3]],
                        "totalWin": 0.5,
                        "multipliers": [10],
                        "tumbles": [{"symbols": {"in": [[], [1,1], [8,4], [9,9], [9,9], []], "out": [{"symbol": 9, "count": 8, "win": 0.25}]}, "win": 0.25}]
                    },
                    {"spinsLeft": 6, "area": [[1,7,7,4,4], [8,8,15,3,3], [9,9,5,5,8], [4,4,0,7,7], [3,9,9,7,7], [3,8,8,5,5]], "totalWin": 0, "multipliers": [15], "tumbles": []},
                    {"spinsLeft": 5, "area": [[5,5,11,3,3], [9,9,6,6,1], [9,6,6,8,8], [3,8,8,5,5], [4,4,8,8,3], [7,4,4,9,9]], "totalWin": 0, "multipliers": [11], "tumbles": []},
                    {"spinsLeft": 4, "area": [[13,3,3,6,6], [8,12,3,3,7], [9,7,7,5,5], [8,8,9,9,4], [9,9,8,8,5], [7,7,5,5,9]], "totalWin": 0, "multipliers": [13,12], "tumbles": []},
                    {
                        "spinsLeft": 3,
                        "area": [[6,8,8,9,9], [5,4,4,6,6], [3,9,9,7,7], [4,4,7,7,8], [9,9,0,8,8], [9,9,5,5,8]],
                        "totalWin": 7.15,
                        "multipliers": [11,15],
                        "tumbles": [
                            {"symbols": {"in": [[8,8], [], [9,9], [], [6,6], [9,9]], "out": [{"symbol": 9, "count": 8, "win": 0.25}]}, "win": 0.25},
                            {"symbols": {"in": [[4,8,8,11], [], [], [9], [6,15], [4]], "out": [{"symbol": 8, "count": 8, "win": 0.4}]}, "win": 0.4}
                        ]
                    },
                    {
                        "spinsLeft": 2,
                        "area": [[7,6,6,11,8], [6,6,10,9,9], [9,9,5,5,8], [6,9,9,5,5], [8,3,3,9,9], [9,9,7,7,4]],
                        "totalWin": 5.25,
                        "multipliers": [11,10,10],
                        "tumbles": [{"symbols": {"in": [[], [8,9], [8,8], [4,9], [7,10], [5,7]], "out": [{"symbol": 9, "count": 10, "win": 0.75}]}, "win": 0.75}]
                    },
                    {
                        "spinsLeft": 1,
                        "area": [[8,8,0,9,9], [7,7,5,5,4], [9,9,5,5,8], [8,8,6,6,9], [9,0,8,8,7], [12,8,8,2,2]],
                        "totalWin": 20.4,
                        "multipliers": [10,12],
                        "tumbles": [
                            {"symbols": {"in": [[9,9], [], [5], [9,9], [9,9], [7,6]], "out": [{"symbol": 8, "count": 9, "win": 0.4}]}, "win": 0.4},
                            {"symbols": {"in": [[3,10,5,5], [], [4,4], [5,8,8], [8,0,9], []], "out": [{"symbol": 9, "count": 12, "win": 2}]}, "win": 2},
                            {"symbols": {"in": [[8,6], [2,7], [5,1,1], [8], [], []], "out": [{"symbol": 5, "count": 8, "win": 1}]}, "win": 1}
                        ]
                    },
                    {"spinsLeft": 5, "area": [[7,5,5,11,3], [7,2,2,8,8], [1,1,5,5,9], [3,3,0,11,8], [2,9,9,7,7], [8,8,6,6,7]], "totalWin": 0, "multipliers": [11,11], "tumbles": []},
                    {"spinsLeft": 4, "area": [[1,1,5,5,8], [4,4,6,6,11], [4,4,7,7,9], [2,2,9,9,8], [7,7,6,6,9], [8,6,6,7,7]], "totalWin": 0, "multipliers": [11], "tumbles": []},
                    {
                        "spinsLeft": 3,
                        "area": [[6,6,8,8,9], [7,2,2,8,8], [9,4,4,2,2], [6,9,9,1,1], [7,7,6,6,9], [9,9,7,7,9]],
                        "totalWin": 0.25,
                        "multipliers": [],
                        "tumbles": [{"symbols": {"in": [[5], [], [2], [2,2], [6], [7,7,9]], "out": [{"symbol": 9, "count": 8, "win": 0.25}]}, "win": 0.25}]
                    },
                    {"spinsLeft": 2, "area": [[1,1,7,7,4], [4,4,9,9,6], [8,6,6,3,3], [3,8,8,5,5], [2,9,9,7,7], [5,5,9,9,8]], "totalWin": 0, "multipliers": [], "tumbles": []},
                    {
                        "spinsLeft": 1,
                        "area": [[7,7,4,4,8], [7,9,9,5,5], [0,9,9,6,6], [9,9,6,6,15], [4,8,8,3,3], [8,1,1,9,9]],
                        "totalWin": 2,
                        "multipliers": [15],
                        "tumbles": [{"symbols": {"in": [[], [6,8], [1,0], [9,9], [], [5,5]], "out": [{"symbol": 9, "count": 8, "win": 0.25}]}, "win": 0.25}]
                    }
                ]
            }
        }
    };
    
    constructor(gameData: GameData) {
        this.gameData = gameData;
        
        // Log test mode status on initialization
        if (GameAPI.TEST_MODE_ENABLED) {
            console.log('[GameAPI] 🧪 TEST MODE IS ENABLED - All spins will use test data from lastspin_retrigger.txt');
            console.log('[GameAPI] To disable test mode, remove ?testMode=true from URL or set localStorage.setItem("testMode", "false")');
        }
    }   

    private createMockFirstManualScatterSpinData(bet: number): SpinData {
        // NOTE: In this project, slot.area is [column][row] and the grid is 6 columns x 5 rows.
        // GameConfig naming is a bit confusing:
        // - SLOT_ROWS = number of columns
        // - SLOT_COLUMNS = number of rows
        const cols = Number(SLOT_ROWS || 6);
        const rows = Number(SLOT_COLUMNS || 5);

        const area: number[][] = Array.from({ length: cols }, (_, col) =>
            Array.from({ length: rows }, (_, row) => ((col * 3 + row) % 9) + 1)
        );

        // Place scatters (symbol id 0) on columns 0,1,2 at the middle row
        const scatterRow = Math.max(0, Math.min(rows - 1, Math.floor(rows / 2)));
        for (const col of [0, 1, 2]) {
            if (col >= 0 && col < cols) {
                area[col][scatterRow] = 0;
            }
        }

        const spinData: any = {
            playerId: this.currentSpinData?.playerId || 'mock_player',
            bet: bet.toString(),
            slot: {
                area,
                paylines: [],
                tumbles: [],
                // Keep both shapes around for compatibility with callers checking either key.
                freespin: { count: 0, totalWin: 0, items: [] },
                freeSpin: { count: 0, totalWin: 0, items: [] },
                totalWin: 0,
            },
        };

        return spinData as SpinData;
    }

    /**
     * 1. Generate game URL token upon game initialization
     * This method generates a game token that can be used for subsequent API calls
     */
    public async generateGameUrlToken(): Promise<{url: string, token: string}> {
        const apiUrl = `${getApiBaseUrl()}/api/v1/generate_url`;
        
        const requestBody = {
            "operator_id": "18b03717-33a7-46d6-9c70-acee80c54d03",
            "bank_id": "1",
            "player_id": 2,
            "game_id": GameAPI.GAME_ID,
            "device": "mobile",
            "lang": "en",
            "currency": "USD",
            "quit_link": "www.quit.com",
            "is_demo": 0,
            "free_spin": "1",
            "session": "623a9cd6-0d55-46ce-9016-36f7ea2de678",
            "player_name": "test",
            "modify_uid": "111"
          };

        const headers = {
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'Connection': 'keep-alive',
            'Accept-Encoding': 'gzip, deflate, br',
            'x-access-token': 'taVHVt4xD8NLwvlo3TgExmiSaGOiuiKAeGB9Qwla6XKpmSRMUwy2pZuuYJYNqFLr',
            'x-brand': '6194bf3a-b863-4302-b691-9cc8fe9b56c8'
        };

        try {
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            //console.log('Response status:', response.status);
            //console.log('Response ok:', response.ok);

            if (!response.ok) {
                const errorText = await response.text();
                //console.error('Response error text:', errorText);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            const data = await response.json();
            
            return {
                url: data.data.url,
                token: data.data.token 
            };
        } catch (error) {
            //console.error('Error generating game URL:', error);
            throw error;
        }
    }

    /**
     * Initialize the game with token generation
     * This method should be called when the game starts to get the game token
     * Only generates a new token if token URL parameter is not present
     */
    public async initializeGame(): Promise<string> {
        const isDemo = this.getDemoState();
        localStorage.setItem('demo', isDemo ? 'true' : 'false');
        sessionStorage.setItem('demo', isDemo ? 'true' : 'false');
        
        if(isDemo){
            return '';
        }

        try {
            // Check if token is already in the URL parameters
            const existingToken = getUrlParameter('token');
            
            if (existingToken) {
                console.log('Game token found in URL parameters:', existingToken);
                
                // Store the existing token in localStorage and sessionStorage
                localStorage.setItem('token', existingToken);
                sessionStorage.setItem('token', existingToken);
                
                console.log('Game initialized with existing token from URL');
                return existingToken;
            } else {
                console.log('No game token in URL, generating new token...');
                const { token } = await this.generateGameUrlToken();
                
                // Store the token in localStorage and sessionStorage
                localStorage.setItem('token', token);
                sessionStorage.setItem('token', token);
                
                console.log('Game initialized successfully with new token:', token);
                return token;
            }
            
        } catch (error) {
            console.error('Error initializing game:', error);
            throw error;
        }
    }

    /**
     * Call the backend game initialization endpoint.
     * This should be called once at the very start of the game after the token is available.
     */
    public async initializeSlotSession(): Promise<SlotInitializeData> {
        // Demo mode: don't call backend; return a minimal safe payload and cache it.
        const isDemo = this.getDemoState() || localStorage.getItem('demo') === 'true' || sessionStorage.getItem('demo') === 'true';
        if (isDemo) {
            const payload: SlotInitializeData = {
                gameId: GameAPI.GAME_ID,
                playerId: '',
                sessionId: '',
                lang: 'en',
                currency: 'USD',
                currencySymbol: '$',
                hasFreeSpinRound: false,
                freeSpinRound: {},
                hasUnresolvedSpin: false,
                unresolvedSpinIndex: 0,
                unresolvedSpin: {},
            };
            this.initializationData = payload;
            this.remainingInitFreeSpins = 0;
            this.initFreeSpinBet = null;
            return payload;
        }

        const token =
            localStorage.getItem('token') ||
            sessionStorage.getItem('token') ||
            '';

        if (!token) {
            throw new Error('No game token available. Please initialize the game first.');
        }

        const apiUrl = `${getApiBaseUrl()}/api/v1/slots/initialize`;

        try {
            console.log('[GameAPI] Calling slots initialize endpoint...', apiUrl);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            const raw = await response.json();
            const payload: SlotInitializeData = (raw && raw.data) ? raw.data : raw;

            // // TEST OVERRIDE: force free spin round for local testing with new format.
            // // Remove or comment this block out for production.
            // payload.hasFreeSpinRound = true;
            // payload.freeSpinRound = [
            //     {
            //         bet: '10.00',
            //         totalFreeSpin: 2,
            //         usedFreeSpin: 0,
            //         remainingFreeSpin: 2
            //     }
            // ];

            // Cache the initialization data for later retrieval
            this.initializationData = payload;
            // Initialize remaining free spin rounds from init data (if provided)
            this.remainingInitFreeSpins = this.extractRemainingInitFreeSpins(payload);

            console.log('[GameAPI] Slot initialization data received (possibly overridden for testing):', payload);

            return payload;
        } catch (error) {
            console.error('[GameAPI] Error calling slots initialize endpoint:', error);
            throw error;
        }
    }

    /**
     * Helper to extract the remaining free spins from the initialization payload,
     * supporting both the legacy numeric format and the new array format.
     */
    private extractRemainingInitFreeSpins(payload: SlotInitializeData | null): number {
        if (!payload || !payload.hasFreeSpinRound || payload.freeSpinRound == null) {
            return 0;
        }

        const fs: any = payload.freeSpinRound;
        if (typeof fs === 'number') {
            return fs;
        }

        if (Array.isArray(fs) && fs.length > 0) {
            const first = fs[0] as InitFreeSpinRound;
            if (typeof first.remainingFreeSpin === 'number') {
                return first.remainingFreeSpin;
            }
            if (typeof first.totalFreeSpin === 'number' && typeof first.usedFreeSpin === 'number') {
                return Math.max(0, first.totalFreeSpin - first.usedFreeSpin);
            }
        }

        return 0;
    }

    /**
     * Get the cached initialization data, if available.
     */
    public getInitializationData(): SlotInitializeData | null {
        return this.initializationData;
    }

    /**
     * Get the remaining free spin rounds from initialization (derived from payload).
     */
    public getRemainingInitFreeSpins(): number {
        return this.remainingInitFreeSpins;
    }

    /**
     * Get the bet size associated with initialization free spins, if available.
     */
    public getInitFreeSpinBet(): number | null {
        // Prefer cached value if already extracted
        if (this.initFreeSpinBet != null) {
            return this.initFreeSpinBet;
        }

        const payload = this.initializationData;
        if (!payload || !payload.hasFreeSpinRound || payload.freeSpinRound == null) {
            return null;
        }

        const fs: any = payload.freeSpinRound;
        if (Array.isArray(fs) && fs.length > 0) {
            const first = fs[0] as InitFreeSpinRound;
            if (typeof first.bet === 'string') {
                const parsed = parseFloat(first.bet);
                if (!isNaN(parsed)) {
                    this.initFreeSpinBet = parsed;
                    return parsed;
                }
            }
        }

        return null;
    }

    public async gameLauncher(): Promise<void> {
        try {
            localStorage.removeItem('token');
            localStorage.removeItem('exit_url');
            localStorage.removeItem('what_device');
            localStorage.removeItem('demo');

            sessionStorage.removeItem('token');
            sessionStorage.removeItem('exit_url');
            sessionStorage.removeItem('what_device');
            sessionStorage.removeItem('demo');
            
            console.log('Starting gameLauncher...');
            let token1 = '';
            let tokenParam = getUrlParameter('token');
            
            if(tokenParam){
                token1 = tokenParam;
                localStorage.setItem('token', token1);
                sessionStorage.setItem('token', token1);
            }

            let deviceUrl = getUrlParameter('device');
            if(deviceUrl){
                localStorage.setItem('what_device',deviceUrl);
                sessionStorage.setItem('what_device',deviceUrl);
            }

            let apiUrl = getUrlParameter('api_exit');
            if(apiUrl){
                this.exitURL = apiUrl;
                localStorage.setItem('exit_url',apiUrl);
                sessionStorage.setItem('exit_url',apiUrl);
            }

            let startGame = getUrlParameter('start_game');
            if(startGame){
                console.log('startGame');
                let {token} = await this.generateGameUrlToken();
                token1 = token;
                localStorage.setItem('token', token);
                sessionStorage.setItem('token', token);
            }

            if (!token1 && !startGame) {
                throw new Error();
            }
        } catch (error) {
            throw new Error();
        }
    }
    public async getBalance(): Promise<any> {
        // Demo mode: return mock balance, no API call, no token requirement.
        const isDemo = this.getDemoState() || localStorage.getItem('demo') === 'true' || sessionStorage.getItem('demo') === 'true';
        if (isDemo) {
            return {
                data: {
                    balance: GameAPI.DEMO_BALANCE
                }
            };
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                this.showTokenExpiredPopup();
                throw new Error('No authentication token available');
            }

            const response = await fetch(`${getApiBaseUrl()}/api/v1/slots/balance`, {
            //const response = await fetch('http://192.168.0.17:3000/api/v1/slots/balance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const error = new Error(`HTTP error! status: ${response.status}`);
                
                // Show token expired popup for 400 or 401 status
                if (response.status === 400 || response.status === 401) {
                    this.showTokenExpiredPopup();
                    localStorage.removeItem('token');
                }
                
                throw error;
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error in getBalance:', error);
            
            // Handle network errors or other issues
            if (this.isTokenExpiredError(error)) {
                this.showTokenExpiredPopup();
            }
            
            throw error;
        }
    }

    /**
     * Show token expired popup to the user
     */
    private showTokenExpiredPopup(): void {
        try {
            // Find the game scene using phaserGame (as set in main.ts line 238)
            const gameScene = (window as any).phaserGame?.scene?.getScene('Game');
            if (gameScene) {
                // Import dynamically to avoid circular dependency
                import('../game/components/TokenExpiredPopup').then(module => {
                    const TokenExpiredPopup = module.TokenExpiredPopup;
                    const popup = new TokenExpiredPopup(gameScene as any);
                    popup.show();
                }).catch(() => {
                    console.warn('Failed to load TokenExpiredPopup module');
                });
            } else {
                console.error('Game scene not found. Cannot show token expired popup.');
            }
        } catch (e) {
            console.warn('Failed to show token expired popup:', e);
        }
    }

    /**
     * Check if an error is related to token expiration
     */
    private isTokenExpiredError(error: any): boolean {
        const errorMessage = error?.message?.toLowerCase() || '';
        return (
            errorMessage.includes('token') || 
            errorMessage.includes('expired') || 
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('401') ||
            errorMessage.includes('400')
        );
    }

    /**
     * 2. Post a spin request to the server
     * This method sends a spin request and returns the server response
     */
    public async doSpin(bet: number, isBuyFs: boolean, isEnhancedBet: boolean, isFs: boolean = false): Promise<SpinData> {
        // Optional debug helper: first manual spin returns mocked data with 3 scatters
        // Manual spin heuristic: not autoplaying and not an autoplay-requested spin.
        // Also exclude buy feature spins and initialization free rounds.
        if (
            GameAPI.MOCK_FIRST_MANUAL_SCATTER_SPIN_ENABLED &&
            !this.mockedFirstManualScatterSpin &&
            !gameStateManager.isBonus &&
            !gameStateManager.isAutoPlaying &&
            !gameStateManager.isAutoPlaySpinRequested &&
            !isBuyFs &&
            !isFs
        ) {
            this.mockedFirstManualScatterSpin = true;
            const mock = this.createMockFirstManualScatterSpinData(bet);
            this.currentSpinData = mock;
            console.log('[GameAPI] 🧪 Mocking first manual spin: 3 scatters in columns 0/1/2', {
                bet,
                scatterSymbolId: 0,
            });
            return this.currentSpinData;
        }

        // TEST MODE: If enabled, return test data immediately without API call
        if (GameAPI.TEST_MODE_ENABLED) {
            console.log('[GameAPI] 🧪 TEST MODE ENABLED - Using test data instead of API call');
            const testData = JSON.parse(JSON.stringify(GameAPI.TEST_SPIN_DATA)); // Deep copy
            // Update bet to match the requested bet
            testData.bet = bet.toString();
            // Set playerId if available from current spin data
            if (this.currentSpinData?.playerId) {
                testData.playerId = this.currentSpinData.playerId;
            }
            this.currentSpinData = testData as SpinData;
            console.log('[GameAPI] Test data applied:', testData);
            return this.currentSpinData;
        }

        // Demo mode: no token required, use analytics endpoint and simplified payload.
        const isDemo = this.getDemoState() || localStorage.getItem('demo') === 'true' || sessionStorage.getItem('demo') === 'true';
        if (isDemo) {
            try {
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                };
                const token = localStorage.getItem('token');
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                const url = `${getApiBaseUrl()}/api/v1/analytics/spin`;
                const requestBody = {
                    bet: bet.toString(),
                    gameId: GameAPI.GAME_ID,
                    isEnhancedBet: isEnhancedBet,
                    isBuyFs: isBuyFs,
                    // Keep parity with rainbow_fist demo payload
                    isFs: false,
                };

                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(requestBody),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }

                const responseData = await response.json();

                // Ensure bet is included in the response data (server might not return it)
                if (!responseData.bet) {
                    responseData.bet = bet.toString();
                }

                this.currentSpinData = responseData as SpinData;
                return this.currentSpinData;
            } catch (error) {
                console.error('Error in doSpin (demo):', error);
                throw error;
            }
        }
        
        const token = localStorage.getItem('token');
        if (!token) {
            this.showTokenExpiredPopup();
            throw new Error('No game token available. Please initialize the game first.');
        }
        
        try {
            // Determine whether this spin should be treated as a free spin round from initialization.
            // We only consume these free rounds for normal spins (not Buy Feature spins).
            // Override isFs if we have remaining initialization free spins
            if (!isBuyFs && this.remainingInitFreeSpins > 0) {
                isFs = true;
                this.remainingInitFreeSpins--;
                console.log('[GameAPI] Consuming initialization free spin round. Remaining:', this.remainingInitFreeSpins);
            }

            const response = await fetch(`${getApiBaseUrl()}/api/v1/slots/bet`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    action: 'spin',
                    bet: bet.toString(),
                    line: 1, // Try different line count
                    isBuyFs: isBuyFs, // Use the parameter value
                    isEnhancedBet: isEnhancedBet, // Use the parameter value
                    // Mark whether this spin is using a free spin round granted at initialization
                    isFs: isFs
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                
                // Special handling for 422 "No valid freespins available" during free spin rounds
                // This means the free spins have ended, so we should treat it as a graceful completion
                if (response.status === 422 && isFs && errorText.includes('No valid freespins available')) {
                    console.log('[GameAPI] 422 error: No valid freespins available - ending free spin round gracefully');
                    
                    // Reset the remaining free spins counter
                    this.remainingInitFreeSpins = 0;
                    console.log('[GameAPI] Reset remainingInitFreeSpins to 0');
                    
                    // Clear the isInFreeSpinRound flag
                    import('../managers/GameStateManager').then(module => {
                        const { gameStateManager } = module;
                        (gameStateManager as any).isInFreeSpinRound = false;
                        console.log('[GameAPI] Cleared isInFreeSpinRound flag');
                    }).catch(err => {
                        console.warn('[GameAPI] Failed to clear isInFreeSpinRound flag:', err);
                    });
                    
                    // Emit event to update the FreeRoundManager with count 0 to trigger completion
                    import('../event/EventManager').then(module => {
                        const { gameEventManager, GameEventType } = module;
                        gameEventManager.emit(GameEventType.FREEROUND_COUNT_UPDATE, 0 as any);
                        console.log('[GameAPI] Emitted FREEROUND_COUNT_UPDATE event with count 0 to end free round');
                    }).catch(err => {
                        console.warn('[GameAPI] Failed to emit FREEROUND_COUNT_UPDATE event:', err);
                    });
                    
                    // Return null to signal that no spin data is available (free spins ended)
                    return null as any;
                }
                
                const error = new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                
                // Show token expired popup for 400 or 401 status
                if (response.status === 400 || response.status === 401) {
                    this.showTokenExpiredPopup();
                    localStorage.removeItem('token');
                }
                
                throw error;
            }

            const responseData = await response.json();
            
            // If this spin was a free spin (isFs === true), check for fsCount in response
            // and emit an event to update the FreeRoundManager display
            if (isFs && typeof responseData.fsCount === 'number') {
                console.log('[GameAPI] Free spin response received with fsCount:', responseData.fsCount);
                // Import gameEventManager dynamically to emit the event
                import('../event/EventManager').then(module => {
                    const { gameEventManager, GameEventType } = module;
                    // Emit event with the fsCount from backend
                    gameEventManager.emit(GameEventType.FREEROUND_COUNT_UPDATE, responseData.fsCount);
                    console.log('[GameAPI] Emitted FREEROUND_COUNT_UPDATE event with count:', responseData.fsCount);
                }).catch(err => {
                    console.warn('[GameAPI] Failed to emit FREEROUND_COUNT_UPDATE event:', err);
                });
            }
            
            // 3. Store the spin data to SpinData.ts
            // If this response contains free spin data, save it for bonus mode
            console.log('[GameAPI] Checking response for free spin data...');
            console.log('[GameAPI] Response has slot:', !!responseData.slot);
            console.log('[GameAPI] Response has freespin:', !!responseData.slot?.freespin);
            console.log('[GameAPI] Response has freespin.items:', !!responseData.slot?.freespin?.items);
            console.log('[GameAPI] Response has freeSpin:', !!responseData.slot?.freeSpin);
            console.log('[GameAPI] Response has freeSpin.items:', !!responseData.slot?.freeSpin?.items);
            console.log('[GameAPI] Current isBonus state:', gameStateManager.isBonus);
            console.log('[GameAPI] Current currentSpinData has freespin:', !!this.currentSpinData?.slot?.freespin?.items);
            
            if (responseData.slot && (responseData.slot.freespin?.items || responseData.slot.freeSpin?.items)) {
                const items = responseData.slot.freespin?.items || responseData.slot.freeSpin?.items;
                console.log('[GameAPI] Free spin data detected in response - evaluating for save');
                console.log('[GameAPI] Free spin items count:', items.length);

                if (gameStateManager.isBonus && this.currentSpinData && (this.currentSpinData.slot?.freespin?.items || this.currentSpinData.slot?.freeSpin?.items)) {
                    // During bonus, prefer to keep original items unless the server indicates a retrigger
                    try {
                        const currentItems = this.currentSpinData.slot?.freespin?.items || this.currentSpinData.slot?.freeSpin?.items || [];
                        const currentMaxSpinsLeft = currentItems.reduce((m: number, it: any) => Math.max(m, Number(it?.spinsLeft || 0)), 0);
                        const nextMaxSpinsLeft = items.reduce((m: number, it: any) => Math.max(m, Number(it?.spinsLeft || 0)), 0);
                        const hasMoreItems = items.length > currentItems.length;
                        const hasMoreSpinsLeft = nextMaxSpinsLeft > currentMaxSpinsLeft;

                        if (hasMoreItems || hasMoreSpinsLeft) {
                            console.log('[GameAPI] Detected retrigger/update in bonus mode - updating free spin data');
                            this.currentSpinData = responseData as SpinData;
                        } else {
                            console.log('[GameAPI] Preserving original free spin data during bonus mode');
                        }
                    } catch (e) {
                        console.warn('[GameAPI] Failed comparing free spin items; preserving original data:', e);
                    }
                } else {
                    console.log('[GameAPI] Free spin data saved to currentSpinData');
                    this.currentSpinData = responseData as SpinData;
                }
            } else if (gameStateManager.isBonus && this.currentSpinData && (this.currentSpinData.slot?.freespin?.items || this.currentSpinData.slot?.freeSpin?.items)) {
                console.log('[GameAPI] Preserving original free spin data during bonus mode');
                // Don't overwrite the original free spin data - keep it for simulation
            } else {
                console.log('[GameAPI] No free spin data detected - storing regular response');
                this.currentSpinData = responseData as SpinData;
            }

            console.log('🎰 ===== SERVER RESPONSE DEBUG =====');
            console.log('📊 Full server response:', responseData);
            console.log('🎯 Freespin data:', responseData.slot?.freespin);
            console.log('🎯 Freespin count:', responseData.slot?.freespin?.count);
            console.log('🎯 Freespin items:', responseData.slot?.freespin?.items);
            console.log('🎯 Freespin items length:', responseData.slot?.freespin?.items?.length);
            console.log('🎲 Grid symbols:', responseData.slot?.area);
            console.log('💰 Paylines:', responseData.slot?.paylines);
            console.log('🎰 ===== END SERVER RESPONSE =====');
            
            return this.currentSpinData;
            
        } catch (error) {
            console.error('Error in doSpin:', error);
            
            // Handle network errors or other issues
            if (this.isTokenExpiredError(error)) {
                this.showTokenExpiredPopup();
            }
            
            throw error;
        }
    }

    /**
     * Simulate a free spin using pre-determined data from SpinData.freespin.items
     * This method uses the area and paylines from the freespin items instead of calling the API
     */
    public async simulateFreeSpin(): Promise<SpinData> {
        if (!this.currentSpinData || (!this.currentSpinData.slot?.freespin?.items && !this.currentSpinData.slot?.freeSpin?.items)) {
            console.error('[GameAPI] No free spin data available. Current spin data:', this.currentSpinData);
            console.error('[GameAPI] Available freespin data:', this.currentSpinData?.slot?.freespin);
            throw new Error('No free spin data available. Please ensure SpinData contains freespin items.');
        }

        const freespinData = this.currentSpinData.slot.freespin || this.currentSpinData.slot.freeSpin;
        const items = freespinData.items;
        
        // Check if we have more items to process
        if (this.currentFreeSpinIndex >= items.length) {
            // Try to recover by finding any remaining spins (retrigger may have added items)
            const nextIdx = items.findIndex((it: any) => Number(it?.spinsLeft || 0) > 0);
            if (nextIdx >= 0) {
                console.warn('[GameAPI] Free spin index past items length; recovering to next available index:', nextIdx);
                this.currentFreeSpinIndex = nextIdx;
            } else {
                throw new Error('No more free spins available');
            }
        }
        
        // Get the current item based on index
        let currentItem = items[this.currentFreeSpinIndex];
        
        if (!currentItem || currentItem.spinsLeft <= 0) {
            // Attempt to recover if current index is exhausted but other spins remain
            const nextIdx = items.findIndex((it: any) => Number(it?.spinsLeft || 0) > 0);
            if (nextIdx >= 0) {
                console.warn('[GameAPI] Current free spin item exhausted; moving to next available index:', nextIdx);
                this.currentFreeSpinIndex = nextIdx;
                currentItem = items[this.currentFreeSpinIndex];
            } else {
                throw new Error('No more free spins available');
            }
        }

        // Play spin sound effect for free spin simulation
        if ((window as any).audioManager) {
            (window as any).audioManager.playSoundEffect(SoundEffectType.SPIN);
            console.log('[GameAPI] Playing spin sound effect for free spin simulation');
        }

        console.log('🎰 ===== SIMULATING FREE SPIN =====');
        console.log('📊 Using pre-determined free spin data');
        console.log('🎯 Current free spin index:', this.currentFreeSpinIndex);
        console.log('🎯 Spins left:', currentItem.spinsLeft);
        console.log('💰 Sub total win:', currentItem.subTotalWin);
        console.log('🎲 Area:', currentItem.area);
        console.log('💎 Paylines:', currentItem.payline);

        // Build slot object with area/paylines and preserve freespin items
        const slotObj: any = {
            area: currentItem.area,
            paylines: currentItem.payline,
            freespin: {
                count: freespinData.count, // Preserve original count from API response
                totalWin: freespinData.totalWin,
                items: items // Keep all items as they are
            }
        };

        // If the current free spin item contains tumble data, attach it
        try {
            const sourceTumbles =
                (currentItem as any)?.tumbles ??
                (currentItem as any)?.tumble ??
                (currentItem as any)?.tumbleSteps ??
                (currentItem as any)?.tumbling ??
                [];
            if (Array.isArray(sourceTumbles) && sourceTumbles.length > 0) {
                console.log(`[GameAPI] Including ${sourceTumbles.length} tumble step(s) for free spin simulation`);
                slotObj.tumbles = sourceTumbles;
            } else {
                console.log('[GameAPI] No tumble steps found on current free spin item');
            }
        } catch (e) {
            console.warn('[GameAPI] Failed to attach tumble data to free spin simulation:', e);
        }

        // Create a new SpinData object for this free spin
        const freeSpinData: SpinData = {
            playerId: this.currentSpinData.playerId,
            bet: this.currentSpinData.bet,
            slot: slotObj
        };

        // Update the current spin data
        this.currentSpinData = freeSpinData;
        
        // Increment the index for the next free spin
        this.currentFreeSpinIndex++;

        console.log('🎰 ===== FREE SPIN SIMULATION COMPLETE =====');
        console.log('📊 New SpinData:', freeSpinData);
        console.log('🎯 Remaining free spins:', freeSpinData.slot.freespin.count);
        console.log('🎯 Next free spin will use index:', this.currentFreeSpinIndex);
        console.log('🎰 ===== END FREE SPIN SIMULATION =====');

        return freeSpinData;
    }

    /**
     * Get the current spin data
     * Returns the last spin data that was received from the server
     */
    public getCurrentSpinData(): SpinData | null {
        return this.currentSpinData;
    }

    /**
     * Reset the free spin index when starting a new scatter bonus
     * This should be called when a new scatter bonus is triggered
     */
    public resetFreeSpinIndex(): void {
        console.log('🎰 Resetting free spin index to 0');
        this.currentFreeSpinIndex = 0;
    }

    /**
     * Clear the current spin data
     * Useful for resetting state between spins
     */
    public clearCurrentSpinData(): void {
        this.currentSpinData = null;
    }

    /**
     * Set the free spin data for simulation
     * This method should be called when free spins are triggered to provide the data for simulation
     */
    public setFreeSpinData(spinData: SpinData): void {
        console.log('[GameAPI] Setting free spin data for simulation:', spinData);
        this.currentSpinData = spinData;
        this.resetFreeSpinIndex(); // Reset the index when setting new data
    }

    /**
     * Initialize the player's balance on game start
     * This method calls getBalance and updates the GameData with the current balance
     */
    public async initializeBalance(): Promise<number> {
        const isDemo = this.getDemoState() || localStorage.getItem('demo') === 'true' || sessionStorage.getItem('demo') === 'true';
        if (isDemo) {
            return GameAPI.DEMO_BALANCE;
        }

        try {
            console.log('[GameAPI] Initializing player balance...');
            
            const balanceResponse = await this.getBalance();
            console.log('[GameAPI] Balance response received:', balanceResponse);
            
            // Extract balance from response - adjust this based on actual API response structure
            let balance = 0;
            if (balanceResponse && balanceResponse.data && balanceResponse.data.balance !== undefined) {
                balance = parseFloat(balanceResponse.data.balance);
            } else if (balanceResponse && balanceResponse.balance !== undefined) {
                balance = parseFloat(balanceResponse.balance);
            } else {
                console.warn('[GameAPI] Unexpected balance response structure:', balanceResponse);
                // Fallback to a default balance if structure is unexpected
                balance = 0;
            }
            
            console.log(`[GameAPI] Initialized balance: $${balance}`);
            return balance;
            
        } catch (error) {
            console.error('[GameAPI] Error initializing balance:', error);
            // Return a default balance if API call fails
            const defaultBalance = 0;
            console.log(`[GameAPI] Using default balance: $${defaultBalance}`);
            return defaultBalance;
        }
    }

    public async getHistory(page: number, limit: number): Promise<any> {
        // Demo mode: return empty history without API calls.
        const isDemo = this.getDemoState();
        if (isDemo) {
            return {
                data: [],
                meta: {
                    page: 1,
                    pageCount: 1,
                    totalPages: 1,
                    total: 0
                }
            };
        }

        const apiUrl = `${getApiBaseUrl()}/api/v1/games/me/histories`;
        const token = localStorage.getItem('token')
            || localStorage.getItem('token')
            || sessionStorage.getItem('token')
            || '';

        const response = await fetch(`${apiUrl}?limit=${limit}&page=${page}`,{
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        return data;
    }

    /**
     * Get the demo state from URL parameters
     * @returns The value of the 'demo' URL parameter, or false if not found
     */
    public getDemoState(): boolean | false {
        const demoValue = getUrlParameter('demo') === 'true';
        return demoValue;
    }

    /**
     * Get the game ID constant
     */
    public getGameId(): string {
        return GameAPI.GAME_ID;
    }

    /**
     * Get the demo balance constant
     */
    public getDemoBalance(): number {
        return GameAPI.DEMO_BALANCE;
    }

    /**
     * Update the demo balance value
     */
    public updateDemoBalance(newBalance: number): void {
        console.log(`[GameAPI] Demo balance updated from $${GameAPI.DEMO_BALANCE} to: $${newBalance}`);
        GameAPI.DEMO_BALANCE = newBalance;
    }
}   
