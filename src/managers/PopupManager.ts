/**
 * Popup types that participate in priority ordering.
 * Higher priority = more important; a higher-priority popup can replace a lower-priority one.
 * When two popups are requested, only the higher-priority one is shown.
 *
 * Current priorities (higher number = higher priority):
 * - TOKEN_EXPIRED (100): session timeout / token invalid
 * - OUT_OF_BALANCE (50): insufficient balance
 * - BET_FAILED (40): backend rejected bet
 * - NETWORK_OFFLINE (40): no network response / offline (client-side bet failure)
 * - CURRENCY_ERROR (30): missing or invalid currency
 *
 * Other UI overlays in the project (not in this priority system; add to PopupType if they should compete):
 * - Win amount display (Symbols.ts scheduleWinAmountPopup): floating win text, not a modal
 * - Dialogs / Menu modals: if any modal dialogs should be ranked, add a PopupType and wire through showPopup
 */

import { gameEventManager, GameEventType } from '../event/EventManager';
import { TokenExpiredPopup } from '../game/components/TokenExpiredPopup';
import { OutOfBalancePopup } from '../game/components/OutOfBalancePopup';
import { BetFailedPopup } from '../game/components/BetFailedPopup';
import { NetworkOfflinePopup } from '../game/components/NetworkOfflinePopup';

export enum PopupType {
	/** Session expired / token invalid; user must re-authenticate. */
	TOKEN_EXPIRED = 'TOKEN_EXPIRED',
	/** Insufficient balance for bet or action. */
	OUT_OF_BALANCE = 'OUT_OF_BALANCE',
	/** Bet failed (backend rejected bet; refund expected). */
	BET_FAILED = 'BET_FAILED',
	/** No network / fetch failed before a response (spin or buy feature). */
	NETWORK_OFFLINE = 'NETWORK_OFFLINE',
	/** Currency / missing currency error. */
	CURRENCY_ERROR = 'CURRENCY_ERROR',
}

/** Hide function for a visible popup; optional callback when hide animation completes. */
export type PopupHideFn = (callback?: () => void) => void;

/** Call this to register the hide function after your popup is shown. */
export type RegisterHideFn = (hideFn: PopupHideFn) => void;

/** Action that shows a popup and registers its hide function with the manager. */
export type PopupShowAction = (registerHide: RegisterHideFn) => void;

/** Priority values: higher number = higher priority. Session timeout > insufficient balance > currency error. */
const PRIORITY: Record<PopupType, number> = {
	[PopupType.TOKEN_EXPIRED]: 100,
	[PopupType.OUT_OF_BALANCE]: 50,
	[PopupType.BET_FAILED]: 40,
	[PopupType.NETWORK_OFFLINE]: 40,
	[PopupType.CURRENCY_ERROR]: 30,
};

interface CurrentPopup {
	type: PopupType;
	priority: number;
	hide: PopupHideFn;
}

let current: CurrentPopup | null = null;
let pending: { type: PopupType; priority: number; token: number } | null = null;
let tokenCounter = 0;

/**
 * Show a popup with priority handling:
 * - If the same popup type is already visible, do nothing (prevents double show).
 * - If a lower-priority popup is visible, close it and then show the new one.
 * - If a higher- or equal-priority popup is visible, do not show the requested one.
 *
 * @param type - Popup type (determines priority).
 * @param showAction - Function that creates/shows the popup and calls registerHide with the popup's hide function.
 */
export function showPopup(type: PopupType, showAction: PopupShowAction): void {
	const priority = PRIORITY[type];

	// Same type already visible or already pending: do not show again.
	if ((current && current.type === type) || (pending && pending.type === type)) {
		return;
	}

	// A higher- or equal-priority popup is already visible (or pending): do not replace.
	if ((current && current.priority >= priority) || (pending && pending.priority >= priority)) {
		return;
	}

	const doShow = (): void => {
		const token = ++tokenCounter;
		pending = { type, priority, token };
		showAction((hideFn: PopupHideFn) => {
			// If another popup request superseded this one while it was loading, immediately hide it.
			if (!pending || pending.token !== token) {
				try {
					hideFn();
				} catch {
					/* noop */
				}
				return;
			}
			pending = null;
			current = { type, priority, hide: hideFn };
		});
	};

	// A lower-priority popup is visible: close it first, then show the new one.
	if (current) {
		const prevHide = current.hide;
		current = null;
		prevHide(doShow);
		return;
	}

	// A lower-priority popup is pending (async loading): supersede it.
	// When the stale popup eventually registers, it will be auto-hidden by the token check above.
	if (pending) {
		pending = null;
	}

	doShow();
}

/**
 * Clear the current popup reference (e.g. when user dismisses the popup).
 * Call this from the popup's hide() completion if you want the manager to know it's closed.
 */
export function clearCurrentPopup(): void {
	current = null;
}

/**
 * Return the priority value for a popup type (for documentation or tests).
 */
export function getPopupPriority(type: PopupType): number {
	return PRIORITY[type];
}

export type BackendErrorResponse = {
	status?: number;
	errorCode?: string;
	message?: string;
	message_text?: string;
};

type PopupInstance = {
	show: () => void;
	hide: (callback?: () => void) => void;
	updateMessage?: (message: string) => void;
};

type PopupFactory = (scene: any) => PopupInstance;

const ERROR_CODE_TO_POPUP: Record<string, { popupType: PopupType }> = {
	DJ401UA: { popupType: PopupType.TOKEN_EXPIRED },
	DJ400NEB: { popupType: PopupType.OUT_OF_BALANCE },
	DJ400BF: { popupType: PopupType.BET_FAILED },
};

function loadPopupFactory(errorCode: string): PopupFactory | null {
	switch (errorCode) {
		case 'DJ401UA':
			return (scene) => new TokenExpiredPopup(scene as any) as any;
		case 'DJ400NEB':
			return (scene) =>
				new OutOfBalancePopup(scene as any, 0, 0, {
					onHideCallback: () => {
						clearCurrentPopup();
					},
				}) as any;
		case 'DJ400BF':
			return (scene) => {
				const popup = new BetFailedPopup(scene as any, 0, 0, {
					onHideCallback: () => clearCurrentPopup(),
				}) as PopupInstance;
				const originalShow = popup.show.bind(popup);
				popup.show = () => {
					originalShow();
					gameEventManager.emit(GameEventType.BET_FAILED_ERROR);
				};
				return popup;
			};
		default:
			return null;
	}
}

function getGameScene(): any | null {
	try {
		return (
			(window as any).phaserGame?.scene?.getScene?.('Game') ??
			(window as any).phaserGame?.scene?.scenes?.find?.((s: any) => s?.scene?.key === 'Game') ??
			null
		);
	} catch {
		return null;
	}
}

function popupMessageFromResponse(response: BackendErrorResponse | null | undefined): string | undefined {
	const fromMessageText =
		typeof response?.message_text === 'string' && response.message_text.trim().length > 0
			? response.message_text.trim()
			: undefined;
	if (fromMessageText) return fromMessageText;
	const fromMessage =
		typeof response?.message === 'string' && response.message.trim().length > 0
			? response.message.trim()
			: undefined;
	return fromMessage;
}

/**
 * One-stop-shop for API-driven popup handling.
 * Returns true if a popup was shown (or requested) based on errorCode.
 */
export function checkAndHandlePopup(response: BackendErrorResponse | null | undefined): boolean {
	const errorCode = typeof response?.errorCode === 'string' ? response.errorCode : '';
	if (!errorCode) return false;

	const messageText = popupMessageFromResponse(response);

	const scene = getGameScene();
	if (!scene) return false;

	const config = ERROR_CODE_TO_POPUP[errorCode];
	if (!config) return false;

	showPopup(config.popupType, (registerHide) => {
		const factory = loadPopupFactory(errorCode);
		if (!factory) return;
		const popup = factory(scene);
		if (messageText && popup.updateMessage) popup.updateMessage(messageText);
		popup.show();
		registerHide((cb) =>
			popup.hide(() => {
				clearCurrentPopup();
				if (cb) cb();
			})
		);
	});
	return true;
}

/**
 * True when a bet/spin failed with no usable HTTP response (client offline or fetch failed before response).
 */
export function isNetworkOfflineBetError(error: unknown): boolean {
	if (typeof navigator !== 'undefined' && navigator.onLine === false) {
		return true;
	}
	const msg =
		error instanceof Error
			? error.message
			: typeof error === 'string'
				? error
				: '';
	const m = msg.toLowerCase();
	if (!m) return false;
	return (
		m.includes('failed to fetch') ||
		m.includes('networkerror when attempting to fetch') ||
		m.includes('networkerror') ||
		m.includes('load failed') ||
		m.includes('network request failed')
	);
}

/**
 * Show bet-failed or network-offline modal after a spin/buy-feature request throws (not DJ400BF from API).
 */
export function showBetFailurePopupFromError(scene: unknown, error: unknown): void {
	if (!scene) return;
	const popupType = isNetworkOfflineBetError(error) ? PopupType.NETWORK_OFFLINE : PopupType.BET_FAILED;
	showPopup(popupType, (registerHide) => {
		if (popupType === PopupType.NETWORK_OFFLINE) {
			const popup = new NetworkOfflinePopup(scene as any, 0, 0, {
				onHideCallback: () => clearCurrentPopup(),
			}) as PopupInstance;
			const originalShow = popup.show.bind(popup);
			popup.show = () => {
				originalShow();
				gameEventManager.emit(GameEventType.BET_FAILED_ERROR);
			};
			popup.show();
			registerHide((cb) =>
				popup.hide(() => {
					clearCurrentPopup();
					if (cb) cb();
				})
			);
		} else {
			const popup = new BetFailedPopup(scene as any, 0, 0, {
				onHideCallback: () => clearCurrentPopup(),
			}) as PopupInstance;
			const originalShow = popup.show.bind(popup);
			popup.show = () => {
				originalShow();
				gameEventManager.emit(GameEventType.BET_FAILED_ERROR);
			};
			popup.show();
			registerHide((cb) =>
				popup.hide(() => {
					clearCurrentPopup();
					if (cb) cb();
				})
			);
		}
	});
}
