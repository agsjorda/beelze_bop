import { Scene } from 'phaser';
import { RadialDimmerTransition } from '../components/RadialDimmerTransition';
import { SoundEffectType } from '../../managers/AudioManager';

export function playRadialDimmerTransition(scene: Scene, onComplete: () => void) {
    const dimmer = new RadialDimmerTransition(scene);
    const centerX = scene.scale.width * 0.5;
    const centerY = scene.scale.height * 0.5;
    const startRadius = Math.ceil(Math.hypot(scene.scale.width, scene.scale.height));
    const endRadius = 0;
    const durationMs = 1200;
    const postUnlockDelayMs = 60;
    const warmupDurationMs = 120;
    dimmer.setCenter(centerX, centerY);
    dimmer.setRadiusImmediate(startRadius);
    let playedWhistle = false;
    let transitionFinished = false;
    let whistleFinished = true;
    let completionTriggered = false;
    let transitionStarted = false;

    const finishTransition = () => {
        if (completionTriggered || !transitionFinished || !whistleFinished) return;
        completionTriggered = true;
        dimmer.hide();
        onComplete();
    };

    const startVisualTransition = () => {
        if (transitionStarted) return;
        transitionStarted = true;
        dimmer.show();
        dimmer.zoomInToRadius(endRadius, durationMs);
        scene.time.delayedCall(durationMs, () => {
            transitionFinished = true;
            finishTransition();
        });
    };

    const trackWhistleCompletion = (sound: any) => {
        if (!sound) return;

        whistleFinished = false;
        let whistleCompletionHandled = false;
        const markWhistleFinished = () => {
            if (whistleCompletionHandled) return;
            whistleCompletionHandled = true;
            whistleFinished = true;
            finishTransition();
        };

        try {
            if (typeof sound.once === 'function') {
                sound.once('complete', markWhistleFinished);
            }
        } catch {}

        const soundDurationSeconds = Number(
            sound.totalDuration
            ?? sound.duration
            ?? sound.config?.duration
        );
        if (Number.isFinite(soundDurationSeconds) && soundDurationSeconds > 0) {
            scene.time.delayedCall(Math.ceil(soundDurationSeconds * 1000) + 50, markWhistleFinished);
        } else {
            // Fall back to the dimmer duration if the runtime cannot provide the clip length.
            scene.time.delayedCall(durationMs, markWhistleFinished);
        }
    };

    const playWhistleNow = () => {
        try {
            const primedWhistle: any = (scene as any).__preloaderWhistle;
            if (primedWhistle) {
                try {
                    if (primedWhistle.isPlaying) primedWhistle.stop();
                } catch {}
                try {
                    if (typeof primedWhistle.destroy === 'function') {
                        primedWhistle.destroy();
                    }
                } catch {}
                (scene as any).__preloaderWhistle = undefined;
            }

            if ((scene.cache.audio as any)?.exists?.('whistle_bz')) {
                const whistle = scene.sound.add('whistle_bz');
                whistle.play({
                    seek: 0
                } as any);
                playedWhistle = true;
                trackWhistleCompletion(whistle);
                return;
            }
        } catch { }
        if (!playedWhistle) {
            try {
                const audioManager = (window as any)?.audioManager;
                if (audioManager && typeof audioManager.playSoundEffect === 'function') {
                    audioManager.playSoundEffect(SoundEffectType.WHISTLE_BB);
                    whistleFinished = true;
                }
            } catch { }
        }
    };

    const warmUpWhistleOnce = (done: () => void) => {
        const warmupState = window as any;
        if (warmupState.__beelzeBopWhistleWarmed) {
            done();
            return;
        }

        try {
            if (!(scene.cache.audio as any)?.exists?.('whistle_bz')) {
                warmupState.__beelzeBopWhistleWarmed = true;
                done();
                return;
            }

            const warmupWhistle: any = scene.sound.add('whistle_bz');
            try {
                if (typeof warmupWhistle.setVolume === 'function') {
                    warmupWhistle.setVolume(0);
                } else {
                    warmupWhistle.volume = 0;
                }
            } catch {}

            let completed = false;
            const finishWarmup = () => {
                if (completed) return;
                completed = true;
                try {
                    if (warmupWhistle.isPlaying) warmupWhistle.stop();
                } catch {}
                try {
                    if (typeof warmupWhistle.destroy === 'function') {
                        warmupWhistle.destroy();
                    }
                } catch {}
                warmupState.__beelzeBopWhistleWarmed = true;
                done();
            };

            try {
                warmupWhistle.play({ seek: 0 } as any);
            } catch {
                warmupState.__beelzeBopWhistleWarmed = true;
                done();
                return;
            }

            scene.time.delayedCall(warmupDurationMs, finishWarmup);
            return;
        } catch {}

        warmupState.__beelzeBopWhistleWarmed = true;
        done();
    };

    const startAfterUnlock = () => {
        scene.time.delayedCall(postUnlockDelayMs, () => {
            warmUpWhistleOnce(() => {
                playWhistleNow();
                startVisualTransition();
            });
        });
    };

    try {
        const soundMgr: any = scene.sound as any;
        if (typeof soundMgr?.unlock === 'function') {
            try { soundMgr.unlock(); } catch {}
        }
        const ctx: any = soundMgr?.context;
        if (ctx && typeof ctx.resume === 'function' && ctx.state === 'suspended') {
            try {
                const resumeResult = ctx.resume();
                if (resumeResult && typeof resumeResult.then === 'function') {
                    let resumed = false;
                    resumeResult
                        .then(() => {
                            resumed = true;
                            startAfterUnlock();
                        })
                        .catch(() => {
                            resumed = true;
                            startAfterUnlock();
                        });
                    scene.time.delayedCall(250, () => {
                        if (!resumed) startAfterUnlock();
                    });
                    return;
                }
            } catch {}
        }
    } catch {}
    startAfterUnlock();
}
