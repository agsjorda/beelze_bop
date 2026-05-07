import { Boot } from './scenes/Boot';
import { Game as MainGame } from './scenes/Game';
import { Game } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { SpinePlugin } from '@esotericsoftware/spine-phaser-v3';

const GAME_DESIGN_WIDTH = 428;
const GAME_DESIGN_HEIGHT = 926;

// Install guards to prevent InvalidStateError when resuming/suspending a closed AudioContext
function installAudioContextGuards(): void {
	try {
		const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
		if (!Ctx || !Ctx.prototype) return;
		const proto = Ctx.prototype as any;
		if (typeof proto.resume === 'function') {
			const originalResume = proto.resume;
			proto.resume = function (...args: any[]) {
				try {
					if ((this as any)?.state === 'closed') {
						return Promise.resolve();
					}
					const result = originalResume.apply(this, args);
					if (result && typeof result.catch === 'function') {
						return result.catch(() => Promise.resolve());
					}
					return result;
				} catch (_e) {
					return Promise.resolve();
				}
			};
		}
		if (typeof proto.suspend === 'function') {
			const originalSuspend = proto.suspend;
			proto.suspend = function (...args: any[]) {
				try {
					if ((this as any)?.state === 'closed') {
						return Promise.resolve();
					}
					const result = originalSuspend.apply(this, args);
					if (result && typeof result.catch === 'function') {
						return result.catch(() => Promise.resolve());
					}
					return result;
				} catch (_e) {
					return Promise.resolve();
				}
			};
		}
	} catch (_e) {
		// no-op
	}
}

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig

const config: Phaser.Types.Core.GameConfig = {
	type: Phaser.AUTO,
	width: GAME_DESIGN_WIDTH,
	height: GAME_DESIGN_HEIGHT,
	parent: 'game-container',
	backgroundColor: 'transparent',
	scale: {
		mode: Phaser.Scale.FIT,
		autoCenter: Phaser.Scale.CENTER_BOTH,
		/** Preset device emulation uses non-1 DPR; rounding avoids FIT drift vs CSS layout. */
		autoRound: true,
	},
	physics: {
		default: 'arcade',
		arcade: {
			gravity: { x: 0, y: 1000 },
			debug: false,
		},
	},
	scene: [Boot, Preloader, MainGame],
	plugins: {
		scene: [
			{
				key: 'spine.SpinePlugin',
				plugin: SpinePlugin,
				mapping: 'spine',
			},
		],
	},
	render: {
		antialias: true,
		clearBeforeRender: false,
	},
};

function getViewportSize(): { width: number; height: number } {
	const vv = window.visualViewport;
	const width = vv?.width ? Math.round(vv.width) : window.innerWidth;
	const height = vv?.height ? Math.round(vv.height) : window.innerHeight;
	return { width: Math.max(1, width), height: Math.max(1, height) };
}

const StartGame = (parent: string) => {
	installAudioContextGuards();

	// Visibility-aware audio muting without suspending AudioContext
	const installAudioVisibilityPolicy = (game: Phaser.Game) => {
		let windowHasFocus =
			typeof document.hasFocus === 'function' ? document.hasFocus() : true;

		const applyMuteToAllScenes = (muted: boolean) => {
			try {
				const gameSound = (game as any).sound;
				if (gameSound) {
					gameSound.mute = !!muted;
				}
			} catch {}
			try {
				const scenes = ((game.scene as any).getScenes(false) as Phaser.Scene[]) || [];
				for (const s of scenes) {
					if ((s as any).sound) {
						((s as any).sound as any).mute = !!muted;
					}
				}
			} catch {}
		};

		const applyPauseToGameLoop = (paused: boolean) => {
			try {
				if (paused) {
					game.loop.sleep();
				} else {
					game.loop.wake();
				}
			} catch {}
		};

		const shouldUnmute = (): boolean => {
			try {
				const am: any = (window as any).audioManager;
				// Respect user's own mute choice
				if (am && typeof am.isAudioMuted === 'function' && am.isAudioMuted()) {
					return false;
				}
			} catch {}
			return true;
		};

		const onHidden = () => {
			applyMuteToAllScenes(true);
			applyPauseToGameLoop(true);
		};

		const isPageHidden = (): boolean => {
			try {
				return document.visibilityState === 'hidden' || (document as any).hidden;
			} catch {
				return false;
			}
		};

		const handleActivityState = () => {
			if (isPageHidden()) {
				onHidden();
			} else {
				// Keep gameplay running when page is visible.
				// Blur-visible state mutes audio only; hidden state pauses the game loop.
				applyPauseToGameLoop(false);
				if (!windowHasFocus) {
					applyMuteToAllScenes(true);
					return;
				}
				applyMuteToAllScenes(!shouldUnmute());
			}
		};

		const handleWindowBlur = () => {
			windowHasFocus = false;
			handleActivityState();
		};

		const handleWindowFocus = () => {
			windowHasFocus =
				typeof document.hasFocus === 'function' ? document.hasFocus() : true;
			handleActivityState();
		};

		const handlePageShow = () => {
			windowHasFocus =
				typeof document.hasFocus === 'function' ? document.hasFocus() : true;
			handleActivityState();
		};

		// Keep focus status in sync even if some browsers don't reliably emit blur/focus
		// during DevTools interaction.
		const focusPoll = window.setInterval(() => {
			try {
				if (typeof document.hasFocus !== 'function') return;
				const hasFocus = document.hasFocus();
				if (hasFocus !== windowHasFocus) {
					windowHasFocus = hasFocus;
					handleActivityState();
				}
			} catch {}
		}, 100);
		try {
			const coreEvents: any = (Phaser as any).Core?.Events;
			if (coreEvents?.DESTROY) {
				game.events.once(coreEvents.DESTROY, () => {
					window.clearInterval(focusPoll);
				});
			}
		} catch {}

		document.addEventListener('visibilitychange', handleActivityState);
		window.addEventListener('blur', handleWindowBlur);
		window.addEventListener('focus', handleWindowFocus);
		window.addEventListener('pagehide', onHidden);
		window.addEventListener('pageshow', handlePageShow);
		// Initial application
		handleActivityState();
	};

	// Helper to detect mobile devices (coarse heuristic)
	const isMobile = (): boolean => {
		try {
			const ua = navigator.userAgent || (navigator as any).vendor || (window as any).opera;
			return /android|iphone|ipad|ipod|iemobile|blackberry|mobile/i.test(ua);
		} catch (_e) {
			return false;
		}
	};

	const game = new Game({ ...config, parent });
	installAudioVisibilityPolicy(game);

	// Viewport sizing + refresh (Shuten-Doji-style).
	try {
		const rootEl = document.getElementById('root') as HTMLElement | null;
		const appEl = (document.getElementById('app') as HTMLElement | null) || rootEl;
		const containerEl = (document.getElementById(parent) as HTMLElement | null) || appEl || rootEl;

		const refreshScale = () => {
			try {
				game.scale.refresh();
			} catch {
				/* no-op */
			}
		};

		const applyViewportHeights = () => {
			const { height } = getViewportSize();
			try {
				if (rootEl) rootEl.style.height = `${height}px`;
				if (appEl) appEl.style.height = `${height}px`;
				if (containerEl) containerEl.style.height = `${height}px`;
			} catch {
				/* no-op */
			}
		};

		let ro: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined' && containerEl) {
			ro = new ResizeObserver(() => refreshScale());
			try {
				ro.observe(containerEl);
			} catch {
				/* no-op */
			}
		}

		const onViewportChange = () => {
			if (isMobile()) {
				applyViewportHeights();
			}
			refreshScale();
			[60, 180, 360].forEach((ms) => {
				window.setTimeout(() => {
					if (isMobile()) applyViewportHeights();
					refreshScale();
				}, ms);
			});
		};

		window.addEventListener('resize', onViewportChange);
		window.addEventListener('orientationchange', onViewportChange as any);
		const vv = (window as any).visualViewport as VisualViewport | undefined;
		vv?.addEventListener?.('resize', onViewportChange);

		const cleanupResizeHooks = () => {
			try { window.removeEventListener('resize', onViewportChange); } catch {}
			try { window.removeEventListener('orientationchange', onViewportChange as any); } catch {}
			try { vv?.removeEventListener?.('resize', onViewportChange); } catch {}
			try { ro?.disconnect?.(); } catch {}
			ro = null;
		};
		try {
			game.events.once((Phaser as any).Core?.Events?.DESTROY, cleanupResizeHooks);
		} catch {
			/* no-op */
		}

		onViewportChange();
	} catch {
		/* no-op */
	}

	if (isMobile()) {
		try {
			const appElement = document.getElementById('root');
			const container = document.getElementById(parent) || appElement;
			const canvas = game.canvas as HTMLCanvasElement | null;
			if (canvas) {
				const noopPrevent = (e: Event) => {
					e.preventDefault();
				};
				canvas.addEventListener('touchstart', noopPrevent, { passive: false });
				canvas.addEventListener('touchmove', noopPrevent, { passive: false });
				canvas.addEventListener('touchend', noopPrevent, { passive: false });
				canvas.addEventListener('touchcancel', noopPrevent, { passive: false });
			}
			const applyTouchSafeStyles = (el: HTMLElement | null | undefined) => {
				if (!el) return;
				el.style.touchAction = 'none';
				(el.style as any).msTouchAction = 'none';
				el.style.userSelect = 'none';
				(el.style as any).webkitUserSelect = 'none';
				(el.style as any).webkitTapHighlightColor = 'transparent';
				(el.style as any).overscrollBehavior = 'contain';
			};
			applyTouchSafeStyles(appElement as HTMLElement);
			applyTouchSafeStyles(container as HTMLElement);
			applyTouchSafeStyles(canvas as unknown as HTMLElement);
		} catch (_e) {
			/* no-op */
		}
		if (game.canvas && !game.canvas.hasAttribute('tabindex')) {
			game.canvas.setAttribute('tabindex', '0');
		}
	}

	(window as any).phaserGame = game;
	const appElement = document.getElementById('root');
	if (appElement) {
		(game.scale as any).fullscreenTarget = appElement as unknown as HTMLElement;
	}
	game.scale.on('leavefullscreen', () => {
		game.canvas?.focus();
	});
	const onFsChange = () => {
		if (!game.scale.isFullscreen) {
			game.canvas?.focus();
		}
	};
	document.addEventListener('fullscreenchange', onFsChange);
	// @ts-ignore - Safari legacy prefix
	document.addEventListener('webkitfullscreenchange', onFsChange);
	const lockPortraitIfPossible = async () => {
		try {
			// @ts-ignore - not universally typed
			if ((screen as any) && (screen as any).orientation && (screen as any).orientation.lock) {
				// @ts-ignore
				await (screen as any).orientation.lock('portrait');
			}
		} catch (_e) {
			/* no-op */
		}
	};
	game.scale.on('enterfullscreen', lockPortraitIfPossible);

	return game;
};

export default StartGame;
