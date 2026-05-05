import { Boot } from './scenes/Boot';
import { Game as MainGame } from './scenes/Game';
import { Game } from 'phaser';
import { Preloader } from './scenes/Preloader';
import { SpinePlugin } from '@esotericsoftware/spine-phaser-v3';

/**
 * Phaser design resolution + mobile shell timing.
 * Keep aligned with `docs/orientation-modal-porting-guide.md` (viewport read, FIT ladder, ResizeObserver).
 */
const GAME_DESIGN_WIDTH = 428;
const GAME_DESIGN_HEIGHT = 926;
/** After our `scale.refresh()`, ignore chained `resize` handlers briefly to avoid FIT feedback loops. */
const MOBILE_SCALE_REFRESH_SUPPRESS_MS = 200;
/** ResizeObserver debounce so DPR / preset layout can settle before another refresh. */
const GAME_CONTAINER_RESIZE_OBSERVER_DEBOUNCE_MS = 64;
/** Follow-up `refresh()` times (ms) after orientation / viewport churn; cancel & replace on each burst. */
const MOBILE_SCALE_REFRESH_LADDER_MS = [100, 300, 700, 1500, 2400];

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
	type: Phaser.WEBGL,
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

/** Conservative layout box: `min(inner, client)` per axis (avoids picking the larger of two layout reads). */
function getLayoutCssCaps(): { width: number; height: number } {
	const docEl = document.documentElement;
	const iw = window.innerWidth || 0;
	const ih = window.innerHeight || 0;
	const cw = docEl?.clientWidth || 0;
	const ch = docEl?.clientHeight || 0;
	const w = iw > 2 && cw > 2 ? Math.min(iw, cw) : Math.max(iw, cw, 1);
	const h = ih > 2 && ch > 2 ? Math.min(ih, ch) : Math.max(ih, ch, 1);
	return { width: Math.max(1, w), height: Math.max(1, h) };
}

/** Last good capped size while visualViewport is briefly invalid during fast rotation. */
let lastStableShellCss: { width: number; height: number } | null = null;

/**
 * Visible viewport in CSS pixels, never larger than the layout cap. Raw `visualViewport` can
 * briefly overshoot the real frame when spamming rotation; `inner*` alone can be larger than
 * what's visible — so we use `min(visualViewport, layoutCap)` and clamp glitches to layout caps.
 */
function readVisibleViewportCssPixels(): { width: number; height: number } {
	const vv = window.visualViewport;
	const caps = getLayoutCssCaps();
	const vw = vv?.width ?? 0;
	const vh = vv?.height ?? 0;
	const vvOk = vw > 2 && vh > 2;
	if (vvOk) {
		const width = Math.max(1, Math.round(Math.min(vw, caps.width)));
		const height = Math.max(1, Math.round(Math.min(vh, caps.height)));
		lastStableShellCss = { width, height };
		return { width, height };
	}
	if (lastStableShellCss) {
		return {
			width: Math.max(1, Math.min(lastStableShellCss.width, caps.width)),
			height: Math.max(1, Math.min(lastStableShellCss.height, caps.height)),
		};
	}
	return { width: caps.width, height: caps.height };
}

function clampShellSizeToLayout(width: number, height: number): { width: number; height: number } {
	const caps = getLayoutCssCaps();
	return {
		width: Math.max(1, Math.min(Math.round(width), caps.width)),
		height: Math.max(1, Math.min(Math.round(height), caps.height)),
	};
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

	/** Keeps #root / game-container in sync when Phaser emits resize (mobile only). */
	let syncMobileDomLayout: (() => void) | null = null;
	/** Full DOM remeasure + scale.refresh ladder (mobile only). */
	let scheduleMobileScaleRefresh: (() => void) | null = null;
	/** Coalesce Phaser scale.resize → mobile refresh (declared before mobile block for destroy cleanup). */
	let resizeReflowRaf: number | null = null;
	/** Ignore scale.resize from our own refresh() so we do not re-queue shell work mid-layout (breaks FIT). */
	let suppressMobileResizeShellSyncUntil = 0;

	if (isMobile()) {
		try {
			const appElement = document.getElementById('root');
			const container = document.getElementById(parent) || appElement;
			const getViewportSize = (): { width: number; height: number } => readVisibleViewportCssPixels();
			let scaleRefreshTimeouts: number[] = [];
			const clearScaleRefreshTimeouts = () => {
				scaleRefreshTimeouts.forEach((id) => window.clearTimeout(id));
				scaleRefreshTimeouts = [];
			};
			/**
			 * Size only #root in CSS px; keep Phaser’s parent (#game-container) at 100% of #app.
			 * Preset devices (iPhone / Galaxy in DevTools) + DPR: giving #root and #game-container
			 * the same explicit px often disagrees with layout after rounding, so FIT reads a parent
			 * “too large” and scales the game up. One layout source (#root) avoids that.
			 */
			const applyShellDimensions = (width: number, height: number) => {
				if (appElement) {
					(appElement as HTMLElement).style.width = `${width}px`;
					(appElement as HTMLElement).style.height = `${height}px`;
				}
				if (container) {
					container.style.removeProperty('width');
					container.style.removeProperty('height');
					container.style.width = '100%';
					container.style.height = '100%';
					container.style.minHeight = '100%';
				}
			};
			const applyContainerSize = () => {
				const { width, height } = getViewportSize();
				applyShellDimensions(width, height);
			};
			/** Apply shell, let layout commit, re-pin design size, then refresh once (FIT stays consistent). */
			const runMobileFitRefresh = () => {
				applyContainerSize();
				window.requestAnimationFrame(() => {
					window.requestAnimationFrame(() => {
						try {
							const sm = game.scale as Phaser.Scale.ScaleManager;
							const setGameSize = (sm as unknown as { setGameSize?: (w: number, h: number) => void })
								.setGameSize;
							if (typeof setGameSize === 'function') {
								setGameSize.call(sm, GAME_DESIGN_WIDTH, GAME_DESIGN_HEIGHT);
							}
							suppressMobileResizeShellSyncUntil =
								performance.now() + MOBILE_SCALE_REFRESH_SUPPRESS_MS;
							sm.refresh();
						} catch (_e) {
							/* no-op */
						}
					});
				});
			};
			const scheduleScaleRefresh = () => {
				clearScaleRefreshTimeouts();
				const tick = () => runMobileFitRefresh();
				tick();
				// Re-run after layout settles; cancel pending runs when orientation flips again.
				MOBILE_SCALE_REFRESH_LADDER_MS.forEach((ms) => {
					scaleRefreshTimeouts.push(window.setTimeout(tick, ms));
				});
			};
			scheduleMobileScaleRefresh = scheduleScaleRefresh;
			syncMobileDomLayout = applyContainerSize;
			applyContainerSize();
			// Do not set display:flex + center on #root: its only child is #app and that shrink-wraps
			// the shell so Phaser never sees full viewport height (same class of bug as centered #app).
			if (container) {
				(container.style as any).aspectRatio = '';
				container.style.maxWidth = '100%';
				container.style.maxHeight = '100%';
			}
			/** Drop stale rAF work when the viewport flaps (DevTools device toolbar, dock toggle). */
			let viewportRafOuter: number | null = null;
			let viewportRafInner: number | null = null;
			const cancelViewportRaf = () => {
				if (viewportRafOuter != null) {
					window.cancelAnimationFrame(viewportRafOuter);
					viewportRafOuter = null;
				}
				if (viewportRafInner != null) {
					window.cancelAnimationFrame(viewportRafInner);
					viewportRafInner = null;
				}
			};
			const onViewportChange = () => {
				cancelViewportRaf();
				viewportRafOuter = window.requestAnimationFrame(() => {
					viewportRafOuter = null;
					const a = getViewportSize();
					viewportRafInner = window.requestAnimationFrame(() => {
						viewportRafInner = null;
						const b = getViewportSize();
						// Avoid max(a,b): transient inflated reads grow past the frame; then clamp to layout caps.
						const pick = (x: number, y: number) =>
							x > 2 && y > 2 ? Math.min(x, y) : Math.max(x, y);
						const merged = clampShellSizeToLayout(
							Math.max(1, pick(a.width, b.width)),
							Math.max(1, pick(a.height, b.height)),
						);
						applyShellDimensions(merged.width, merged.height);
						scheduleScaleRefresh();
					});
				});
			};
			const onOrientationChangeForShell = () => {
				lastStableShellCss = null;
				onViewportChange();
			};
			onViewportChange();
			window.addEventListener('resize', onViewportChange);
			window.addEventListener('orientationchange', onOrientationChangeForShell);
			const vv = (window as any).visualViewport;
			if (vv && vv.addEventListener) {
				vv.addEventListener('resize', onViewportChange);
				vv.addEventListener('scroll', onViewportChange);
			}
			/** DevTools device presets settle layout after our math; refresh when real box size changes. */
			let containerResizeDebounce: number | null = null;
			let containerResizeObserver: ResizeObserver | null = null;
			if (typeof ResizeObserver !== 'undefined' && container) {
				containerResizeObserver = new ResizeObserver(() => {
					if (performance.now() < suppressMobileResizeShellSyncUntil) {
						return;
					}
					if (containerResizeDebounce != null) {
						window.clearTimeout(containerResizeDebounce);
					}
					containerResizeDebounce = window.setTimeout(() => {
						containerResizeDebounce = null;
						window.requestAnimationFrame(() => {
							try {
								const sm = game.scale as Phaser.Scale.ScaleManager;
								const setGameSize = (
									sm as unknown as { setGameSize?: (w: number, h: number) => void }
								).setGameSize;
								if (typeof setGameSize === 'function') {
									setGameSize.call(sm, GAME_DESIGN_WIDTH, GAME_DESIGN_HEIGHT);
								}
								suppressMobileResizeShellSyncUntil =
									performance.now() + MOBILE_SCALE_REFRESH_SUPPRESS_MS;
								sm.refresh();
							} catch (_e) {
								/* no-op */
							}
						});
					}, GAME_CONTAINER_RESIZE_OBSERVER_DEBOUNCE_MS);
				});
				containerResizeObserver.observe(container);
			}
			const coreEvents: any = (Phaser as any).Core?.Events;
			if (coreEvents?.DESTROY) {
				game.events.once(coreEvents.DESTROY, () => {
					cancelViewportRaf();
					clearScaleRefreshTimeouts();
					lastStableShellCss = null;
					if (containerResizeDebounce != null) {
						window.clearTimeout(containerResizeDebounce);
						containerResizeDebounce = null;
					}
					containerResizeObserver?.disconnect();
					containerResizeObserver = null;
					if (resizeReflowRaf != null) {
						window.cancelAnimationFrame(resizeReflowRaf);
						resizeReflowRaf = null;
					}
					window.removeEventListener('resize', onViewportChange);
					window.removeEventListener('orientationchange', onOrientationChangeForShell);
					vv?.removeEventListener?.('resize', onViewportChange);
					vv?.removeEventListener?.('scroll', onViewportChange);
					scheduleMobileScaleRefresh = null;
					syncMobileDomLayout = null;
				});
			}
		} catch (_err) {
			/* no-op */
		}
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

	const syncDesktopShellLayout = () => {
		if (syncMobileDomLayout) {
			return;
		}
		const root = document.getElementById('root');
		const gameContainer = document.getElementById(parent);
		if (!root) {
			return;
		}
		const { width: w, height: h } = readVisibleViewportCssPixels();
		const r = root as HTMLElement;
		r.style.width = `${w}px`;
		r.style.height = `${h}px`;
		if (gameContainer) {
			(gameContainer as HTMLElement).style.width = '100%';
			(gameContainer as HTMLElement).style.height = '100%';
		}
	};

	game.scale.on('resize', () => {
		try {
			if (syncMobileDomLayout && scheduleMobileScaleRefresh) {
				if (performance.now() < suppressMobileResizeShellSyncUntil) {
					return;
				}
				syncMobileDomLayout();
				if (resizeReflowRaf != null) {
					window.cancelAnimationFrame(resizeReflowRaf);
				}
				resizeReflowRaf = window.requestAnimationFrame(() => {
					resizeReflowRaf = null;
					scheduleMobileScaleRefresh?.();
				});
				return;
			}
			syncDesktopShellLayout();
		} catch (_e) {
			/* no-op */
		}
	});

	/** Desktop / non-mobile: first layout before Phaser emits resize can leave #root at auto height. */
	if (!syncMobileDomLayout) {
		window.requestAnimationFrame(() => {
			try {
				syncDesktopShellLayout();
				game.scale.refresh();
			} catch (_e) {
				/* no-op */
			}
		});
	}

	return game;
};

export default StartGame;
