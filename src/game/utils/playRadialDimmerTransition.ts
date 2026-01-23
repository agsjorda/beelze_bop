import { Scene } from 'phaser';
import { RadialDimmerTransition } from '../components/RadialDimmerTransition';

export function playRadialDimmerTransition(scene: Scene, onComplete: () => void) {
    const dimmer = new RadialDimmerTransition(scene);
    const centerX = scene.scale.width * 0.5;
    const centerY = scene.scale.height * 0.5;
    const startRadius = Math.ceil(Math.hypot(scene.scale.width, scene.scale.height));
    const endRadius = 0;
    const durationMs = 1200;
    dimmer.setCenter(centerX, centerY);
    dimmer.setRadiusImmediate(startRadius);
    dimmer.show();
    dimmer.zoomInToRadius(endRadius, durationMs);
    scene.time.delayedCall(durationMs, () => {
        dimmer.hide();
        onComplete();
    });
}
