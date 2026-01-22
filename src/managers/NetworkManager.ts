export class NetworkManager {
    private isHighSpeed: boolean;

    constructor() {
        this.isHighSpeed = this.detectNetworkSpeed();
        console.log(`[NetworkManager] Network speed detected: ${this.isHighSpeed ? 'HIGH' : 'LOW'}`);
    }

    private detectNetworkSpeed(): boolean {
        const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
        if (!connection) {
            console.log('[NetworkManager] Network API unavailable, defaulting to HIGH speed');
            return true; // Default to high speed if API unavailable
        }
        const effectiveType = connection.effectiveType;
        console.log(`[NetworkManager] Network effective type: ${effectiveType}`);
        return effectiveType !== 'slow-2g' && effectiveType !== '2g';
    }

    public getNetworkSpeed(): boolean {
        return this.isHighSpeed;
    }

    public getAssetScale(): number {
        return this.isHighSpeed ? 1 : 2; // Scale low quality assets by 2x
    }
}