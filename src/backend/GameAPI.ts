import { SpinData } from "./SpinData";
import { GameData } from "../game/components/GameData";
import { gameStateManager } from "../managers/GameStateManager";
import { SoundEffectType } from "../managers/AudioManager";

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
    return 'https://game-launcher.torrospins.com/'; // 192.168.0.17:3000/

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
    sessionId: string;
    lang: string;
    currency: string;
    hasFreeSpinRound: boolean;
    // New backend format: array of free spin round entries.
    // Kept as `any` union-friendly type for backwards compatibility,
    // but we always treat it as InitFreeSpinRound[] in our helper.
    freeSpinRound: InitFreeSpinRound[] | number;
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
    private static readonly GAME_ID: string = '00010525';
    private static DEMO_BALANCE: number = 10000;

    gameData: GameData;
    exitURL: string = '';
    private currentSpinData: SpinData | null = null;
    private isFirstSpin: boolean = false; // Flag to track first spin
    private currentFreeSpinIndex: number = 0; // Track current free spin item index
    private initializationData: SlotInitializeData | null = null; // Cached initialization response
    private remainingInitFreeSpins: number = 0; // Free spin rounds from initialization still available
    private initFreeSpinBet: number | null = null; // Bet size associated with initialization free spins
    private useFakeSpinData: boolean = false;
    
    constructor(gameData: GameData) {
        this.gameData = gameData;
        this.useFakeSpinData = this.resolveUseFakeSpinDataFlag();
    }   

    public setUseFakeSpinData(enabled: boolean): void {
        this.useFakeSpinData = !!enabled;
        try {
            localStorage.setItem('useFakeSpinData', this.useFakeSpinData ? 'true' : 'false');
        } catch { }
    }

    public getUseFakeSpinData(): boolean {
        return this.useFakeSpinData;
    }

    private resolveUseFakeSpinDataFlag(): boolean {
        const appConfig = (window as any)?.APP_CONFIG;
        const appFlag = appConfig?.useFakeSpinData ?? appConfig?.useFakeData;
        if (typeof appFlag === 'boolean') {
            return appFlag;
        }

        const urlFlag = getUrlParameter('useFakeData');
        if (urlFlag) {
            return urlFlag === 'true';
        }
        
        // Only enable fake data explicitly via URL or app config.
        return false;
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

        if (isDemo) {
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
        // Check if demo mode is active
        const isDemo = this.getDemoState();

        // Return mock balance for demo mode
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

            const response = await fetch(`${getApiBaseUrl()}api/v1/slots/balance`, {
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

    private shouldUseFallbackSpinData(error: any): boolean {
        const message = (error?.message || '').toString().toLowerCase();
        const statusMatch = message.match(/status:\s*(\d{3})/);
        if (statusMatch) {
            const status = Number(statusMatch[1]);
            return Number.isFinite(status) && status >= 500;
        }
        return (
            message.includes('failed to fetch') ||
            message.includes('networkerror') ||
            message.includes('cors') ||
            message.includes('err_failed')
        );
    }

    private async loadFallbackSpinData(bet: number, useBonus: boolean): Promise<SpinData> {
        const url = `${window.location.origin}/fake_spin_data.json`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Fallback spin data not available (status: ${response.status})`);
        }

        const payload = await response.json();
        const spinDataPool = useBonus ? payload?.bonusGame : payload?.normalGame;
        let spinData: SpinData | undefined;

        if (Array.isArray(spinDataPool)) {
            if (spinDataPool.length === 0) {
                throw new Error(`Fallback spin data list empty: ${useBonus ? 'bonusGame' : 'normalGame'}`);
            }
            const randomIndex = Math.floor(Math.random() * spinDataPool.length);
            spinData = spinDataPool[randomIndex] as SpinData;
        } else {
            spinData = spinDataPool as SpinData | undefined;
        }

        if (!spinData) {
            throw new Error(`Fallback spin data missing: ${useBonus ? 'bonusGame' : 'normalGame'}`);
        }

        return this.scaleFallbackSpinData(spinData, bet);
    }

    private scaleFallbackSpinData(spinData: SpinData, bet: number): SpinData {
        const cloned = JSON.parse(JSON.stringify(spinData)) as SpinData;
        const baseBet = Number(cloned.bet) || bet;
        const scale = baseBet > 0 ? bet / baseBet : 1;

        const scaleWin = (value: number): number => {
            if (!Number.isFinite(value)) return value;
            return Number((value * scale).toFixed(4));
        };

        const scaleTumbles = (tumbles: any[] | undefined): void => {
            if (!Array.isArray(tumbles)) return;
            tumbles.forEach((tumble) => {
                if (tumble && typeof tumble.win === 'number') {
                    tumble.win = scaleWin(tumble.win);
                }
                const outs = tumble?.symbols?.out;
                if (Array.isArray(outs)) {
                    outs.forEach((out) => {
                        if (out && typeof out.win === 'number') {
                            out.win = scaleWin(out.win);
                        }
                    });
                }
            });
        };

        cloned.bet = bet.toString();

        if (cloned.slot?.paylines) {
            cloned.slot.paylines.forEach((payline) => {
                if (payline && typeof payline.win === 'number') {
                    payline.win = scaleWin(payline.win);
                }
            });
        }

        scaleTumbles(cloned.slot?.tumbles);

        const freespinData = cloned.slot?.freespin;
        if (freespinData) {
            freespinData.totalWin = scaleWin(freespinData.totalWin);
            freespinData.items?.forEach((item) => {
                if (typeof item.subTotalWin === 'number') {
                    item.subTotalWin = scaleWin(item.subTotalWin);
                }
                if (typeof item.totalWin === 'number') {
                    item.totalWin = scaleWin(item.totalWin);
                }
                item.payline?.forEach((line) => {
                    if (line && typeof line.win === 'number') {
                        line.win = scaleWin(line.win);
                    }
                });
                scaleTumbles((item as any)?.tumbles);
            });
        }

        const freeSpinData = cloned.slot?.freeSpin;
        if (freeSpinData) {
            freeSpinData.totalWin = scaleWin(freeSpinData.totalWin);
            freeSpinData.items?.forEach((item) => {
                if (typeof item.subTotalWin === 'number') {
                    item.subTotalWin = scaleWin(item.subTotalWin);
                }
                if (typeof item.totalWin === 'number') {
                    item.totalWin = scaleWin(item.totalWin);
                }
                item.payline?.forEach((line) => {
                    if (line && typeof line.win === 'number') {
                        line.win = scaleWin(line.win);
                    }
                });
                scaleTumbles((item as any)?.tumbles);
            });
        }

        return cloned;
    }

    /**
     * 2. Post a spin request to the server
     * This method sends a spin request and returns the server response
     */
    public async doSpin(bet: number, isBuyFs: boolean, isEnhancedBet: boolean, isFs: boolean = false): Promise<SpinData> {
        if (this.useFakeSpinData) {
            const useBonus = isBuyFs || isFs || gameStateManager.isBonus;
            console.warn('[GameAPI] useFakeSpinData enabled - bypassing API', { useBonus });
            const fallbackSpin = await this.loadFallbackSpinData(bet, useBonus);
            const hasFreeSpinItems = !!(fallbackSpin?.slot?.freespin?.items?.length || fallbackSpin?.slot?.freeSpin?.items?.length);
            if (useBonus && hasFreeSpinItems) {
                this.setFreeSpinData(fallbackSpin);
                return this.currentSpinData as SpinData;
            }
            this.currentSpinData = fallbackSpin;
            return this.currentSpinData;
        }

        // Check if demo mode is active
        const isDemo = this.getDemoState();

        // Only require token if not in demo mode
        const token = localStorage.getItem('token');
        if (!isDemo && !token) {
            this.showTokenExpiredPopup();
            throw new Error('No game token available. Please initialize the game first.');
        }
        
        try {
            // Demo mode uses analytics endpoint with simplified request body
            if (isDemo) {
                console.log('[GameAPI] Demo mode detected - using analytics endpoint');
                // Build headers - include Authorization only if token exists
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json'
                };

                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                const response = await fetch(`${getApiBaseUrl()}/api/v1/analytics/spin`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        bet: bet.toString(),
                        gameId: GameAPI.GAME_ID,
                        isEnhancedBet: isEnhancedBet,
                        isBuyFs: isBuyFs,
                        isFs: false,
                        rtp: "99"
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                }

                const responseData = await response.json();
                if (!responseData.bet) {
                    responseData.bet = bet.toString();
                }

                this.currentSpinData = responseData as SpinData;
                return this.currentSpinData;
            }

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
                console.log('[GameAPI] Free spin data detected in response - saving for bonus mode');
                const items = responseData.slot.freespin?.items || responseData.slot.freeSpin?.items;
                console.log('[GameAPI] Free spin items count:', items.length);
                this.currentSpinData = responseData as SpinData;
                console.log('[GameAPI] Free spin data saved to currentSpinData');
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

            if (this.shouldUseFallbackSpinData(error) && this.useFakeSpinData) {
                const useBonus = isBuyFs || isFs || gameStateManager.isBonus;
                try {
                    console.warn('[GameAPI] Using fallback spin data', { useBonus });
                    const fallbackSpin = await this.loadFallbackSpinData(bet, useBonus);
                    this.currentSpinData = fallbackSpin;
                    return this.currentSpinData;
                } catch (fallbackError) {
                    console.warn('[GameAPI] Failed to load fallback spin data:', fallbackError);
                }
            } else if (this.shouldUseFallbackSpinData(error)) {
                console.warn('[GameAPI] Fallback spin data disabled (useFakeSpinData is false)');
            }

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
            throw new Error('No more free spins available');
        }
        
        // Get the current item based on index
        const currentItem = items[this.currentFreeSpinIndex];
        
        if (!currentItem || currentItem.spinsLeft <= 0) {
            throw new Error('No more free spins available');
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
        const isDemo = this.getDemoState();
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
        // Check if demo mode is active - don't make API call in demo mode
        const isDemo = this.getDemoState();
        if (isDemo) {
            // Return empty history data for demo mode
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
    public getDemoState(): boolean {
        const demoValue = getUrlParameter('demo') === 'true';
        console.log('[GameAPI] Getting demo state from URL parameters', demoValue);
        return demoValue;
    }

    /**
     * Get the game ID constant
     * @returns The game ID string
     */
    public getGameId(): string {
        return GameAPI.GAME_ID;
    }

    /**
     * Get the demo balance constant
     * @returns The demo balance number
     */
    public getDemoBalance(): number {
        return GameAPI.DEMO_BALANCE;
    }

    /**
     * Update the demo balance value
     * @param newBalance - The new balance value to set
     */
    public updateDemoBalance(newBalance: number): void {
        console.log(`[GameAPI] Demo balance updated from $${GameAPI.DEMO_BALANCE} to: $${newBalance}`);
        GameAPI.DEMO_BALANCE = newBalance;
    }
}   
