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

    public playAnimation(animationName: string, loop: boolean = true): void {
        if (this.spineObject) {
            try {
                const animState = (this.spineObject as any).animationState;
                if (animState) {
                    animState.setAnimation(0, animationName, loop);
                    console.log(`[Character] Playing animation '${animationName}' (loop: ${loop})`);
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
