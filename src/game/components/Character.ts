import { Scene } from 'phaser';
import { SpineGameObject } from '@esotericsoftware/spine-phaser-v3';

export interface CharacterOptions {
    x?: number; // X position (default: center)
    y?: number; // Y position (default: center)
    scale?: number; // Scale of the character
    depth?: number; // Depth (z-index)
    characterKey: string; // Spine asset key (e.g., 'character1')
    animation?: string; // Animation to play (default: 'idle')
    loop?: boolean; // Whether to loop the animation (default: true)
}

export class Character {
    private scene: Scene;
    private options: CharacterOptions;
    private spineObject?: SpineGameObject;

    constructor(scene: Scene, options: CharacterOptions) {
        this.scene = scene;
        // Allow all options to be overridden for any character
        this.options = {
            x: options.x ?? scene.scale.width * 0.5,
            y: options.y ?? scene.scale.height * 0.5,
            scale: options.scale ?? 0.5,
            depth: options.depth ?? 10,
            characterKey: options.characterKey,
            animation: options.animation ?? 'idle',
            loop: options.loop ?? true
        };
    }

    public create(): SpineGameObject | null {
        try {
            console.log(`[Character] Attempting to create ${this.options.characterKey}...`);

            // Check if add.spine factory exists
            if (typeof (this.scene.add as any).spine !== 'function') {
                console.error(`[Character] add.spine factory not available`);
                return null;
            }

            console.log(`[Character] Creating spine object for ${this.options.characterKey}...`);

            // Create spine with the character key and atlas reference
            // The atlas key should match what's loaded in AssetConfig
            
            this.spineObject = (this.scene.add as any).spine(
                this.options.x!,
                this.options.y!,
                this.options.characterKey,
                `${this.options.characterKey}-atlas`
            );

            if (!this.spineObject) {
                console.error(`[Character] Failed to create spine object for ${this.options.characterKey}`);
                return null;
            }

            this.spineObject.setOrigin(0.5, 0.5);
            this.spineObject.setScale(this.options.scale!);
            this.spineObject.setDepth(this.options.depth!);
            
            console.log(`[Character] Created ${this.options.characterKey} spine object successfully`);

            // Play the animation after creation
            if (this.options.animation) {
                try {
                    const animState = (this.spineObject as any).animationState;
                    if (animState) {
                        animState.setAnimation(0, this.options.animation, this.options.loop);
                        console.log(`[Character] Playing animation '${this.options.animation}'`);
                    } else {
                        console.warn(`[Character] animationState not available for ${this.options.characterKey}`);
                    }
                } catch (animError) {
                    console.error(`[Character] Failed to play animation:`, animError);
                }
            }

            return this.spineObject;
        } catch (error) {
            console.error(`[Character] Failed to create ${this.options.characterKey}:`, error);
            console.error(`[Character] Error stack:`, (error as Error).stack);
            return null;
        }
    }


    private idleListenerObj?: any;
    private idleTimeout?: any;
    private getIdleAnimationName(): string {
        // Use the correct idle animation name for each character
        // Accepts both 'character1'/'character2' and 'Character1_BZ'/'Character2_BZ' as keys
        // Note: idle animations in assets are lowercase (character1_BZ_idle, character2_BZ_idle)
        const key = this.options.characterKey;
        if (/character1/i.test(key)) return 'character1_BZ_idle';
        if (/character2/i.test(key)) return 'character2_BZ_idle';
        // fallback: try key + '_idle'
        return key + '_idle';
    }

    public playAnimation(animationName: string, loop: boolean = true, revertToIdle: boolean = false): void {
        if (this.spineObject) {
            try {
                const animState = (this.spineObject as any).animationState;
                if (animState) {
                    // Remove previous idle listener and timeout if they exist
                    if (this.idleListenerObj) {
                        animState.removeListener(this.idleListenerObj);
                        this.idleListenerObj = undefined;
                    }
                    if (this.idleTimeout) {
                        clearTimeout(this.idleTimeout);
                        this.idleTimeout = undefined;
                    }
                    animState.setAnimation(0, animationName, loop);
                    console.log(`[Character] Playing animation '${animationName}' (loop: ${loop})`);
                    if (revertToIdle && !loop) {
                        const idleAnim = this.getIdleAnimationName();
                        console.log(`[Character] Will revert to idle animation '${idleAnim}' after '${animationName}' completes.`);
                        // Listen for animation complete
                        const listenerObj = {
                            complete: (trackIndex: number, animation: any) => {
                                console.log(`[Character] Animation complete event: trackIndex=${trackIndex}, animation=${animation && animation.name}`);
                                if (animation && animation.name === animationName) {
                                    console.log(`[Character] Reverting to idle animation '${idleAnim}' after '${animationName}' complete event.`);
                                    animState.setAnimation(0, idleAnim, true);
                                    animState.removeListener(listenerObj);
                                    this.idleListenerObj = undefined;
                                    if (this.idleTimeout) {
                                        clearTimeout(this.idleTimeout);
                                        this.idleTimeout = undefined;
                                    }
                                }
                            }
                        };
                        this.idleListenerObj = listenerObj;
                        animState.addListener(listenerObj);
                        // Fallback: force idle after 1.5s if complete event is missed
                        this.idleTimeout = setTimeout(() => {
                            if (this.idleListenerObj) {
                                console.log(`[Character] Fallback: Forcing idle animation '${idleAnim}' after 1.5s timeout.`);
                                animState.removeListener(this.idleListenerObj);
                                this.idleListenerObj = undefined;
                            }
                            animState.setAnimation(0, idleAnim, true);
                            this.idleTimeout = undefined;
                        }, 1500);
                    }
                } else {
                    console.warn(`[Character] animationState not available for playAnimation`);
                }
            } catch (error) {
                console.error(`[Character] Failed to play animation '${animationName}':`, error);
            }
        }
    }

    public setPosition(x: number, y: number): void {
        if (this.spineObject) {
            this.spineObject.setPosition(x, y);
        }
    }

    public setScale(scale: number): void {
        if (this.spineObject) {
            this.spineObject.setScale(scale);
        }
    }

    public setDepth(depth: number): void {
        if (this.spineObject) {
            this.spineObject.setDepth(depth);
        }
    }

    public destroy(): void {
        if (this.spineObject) {
            this.spineObject.destroy();
            this.spineObject = undefined;
        }
    }

    public getSpineObject(): SpineGameObject | undefined {
        return this.spineObject;
    }
}
