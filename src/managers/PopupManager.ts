import type { Scene } from 'phaser';

export enum PopupType {
	TOKEN_EXPIRED = 'TOKEN_EXPIRED',
	OUT_OF_BALANCE = 'OUT_OF_BALANCE',
	BET_FAILED = 'BET_FAILED',
	CURRENCY_ERROR = 'CURRENCY_ERROR',
}

export type BackendErrorResponse = {
	status?: number;
	errorCode?: string;
	message_text?: string;
	message?: string;
};

type ManagedPopup = {
	show(): void;
	hide(callback?: () => void): void;
	updateMessage?(message: string): void;
};

type CurrentPopup = {
	type: PopupType;
	priority: number;
	hide: () => void;
};

type PendingPopup = {
	type: PopupType;
	priority: number;
	token: number;
};

const PRIORITY: Record<PopupType, number> = {
	[PopupType.TOKEN_EXPIRED]: 100,
	[PopupType.OUT_OF_BALANCE]: 50,
	[PopupType.BET_FAILED]: 40,
	[PopupType.CURRENCY_ERROR]: 30,
};

let current: CurrentPopup | null = null;
let pending: PendingPopup | null = null;
let pendingTokenSeq = 0;

function getGameScene(): Scene | null {
	try {
		const scene = (window as any).phaserGame?.scene?.getScene?.('Game');
		return scene ?? null;
	} catch {
		return null;
	}
}

async function loadPopup(type: PopupType, scene: Scene, opts?: { onClose?: () => void }): Promise<ManagedPopup> {
	switch (type) {
		case PopupType.TOKEN_EXPIRED: {
			const m = await import('../game/components/TokenExpiredPopup');
			return new m.TokenExpiredPopup(scene as any) as any;
		}
		case PopupType.OUT_OF_BALANCE: {
			const m = await import('../game/components/OutOfBalancePopup');
			const combinedOnClose = () => {
				clearCurrentPopupIfType(PopupType.OUT_OF_BALANCE);
				try { opts?.onClose?.(); } catch {}
			};
			return new m.OutOfBalancePopup(scene as any, 0, 0, { onClose: combinedOnClose }) as any;
		}
		case PopupType.BET_FAILED: {
			const m = await import('../game/components/BetFailedPopup');
			const combinedOnClose = () => {
				clearCurrentPopupIfType(PopupType.BET_FAILED);
				try { opts?.onClose?.(); } catch {}
			};
			return new m.BetFailedPopup(scene as any, 0, 0, { onClose: combinedOnClose }) as any;
		}
		default:
			throw new Error(`Unknown PopupType: ${String(type)}`);
	}
}

function clearCurrentPopupIfType(type: PopupType): void {
	if (current?.type === type) {
		current = null;
	}
}

function registerCurrentPopup(type: PopupType, popup: ManagedPopup): void {
	const hideWrapped = () => {
		try {
			popup.hide(() => clearCurrentPopupIfType(type));
		} catch {
			clearCurrentPopupIfType(type);
		}
	};
	current = { type, priority: PRIORITY[type] ?? 0, hide: hideWrapped };
}

async function showPopupInternal(
	type: PopupType,
	{
		scene,
		message,
		onClose,
	}: {
		scene: Scene;
		message?: string;
		onClose?: () => void;
	}
): Promise<void> {
	const priority = PRIORITY[type] ?? 0;
	const requestToken = ++pendingTokenSeq;
	pending = { type, priority, token: requestToken };

	try {
		const popup = await loadPopup(type, scene, { onClose });

		if (pending?.token !== requestToken) {
			try { popup.hide(); } catch {}
			return;
		}

		if (current) {
			if (current.type === type) return;
			if (current.priority >= priority) {
				try { popup.hide(); } catch {}
				return;
			}
			current.hide();
		}

		registerCurrentPopup(type, popup);

		if (typeof message === 'string' && message.trim().length > 0 && typeof popup.updateMessage === 'function') {
			popup.updateMessage(message);
		}

		popup.show();
	} finally {
		if (pending?.token === requestToken) {
			pending = null;
		}
	}
}

export function showPopup(
	type: PopupType,
	options?: {
		scene?: Scene | null;
		message?: string;
		onClose?: () => void;
	}
): void {
	const scene = options?.scene ?? getGameScene();
	if (!scene) return;

	const priority = PRIORITY[type] ?? 0;
	if (pending?.type === type || current?.type === type) return;
	if (current && current.priority >= priority) return;

	void showPopupInternal(type, { scene, message: options?.message, onClose: options?.onClose });
}

export function checkAndHandlePopup(response: BackendErrorResponse | null | undefined): boolean {
	const errorCode = (response?.errorCode ?? '').trim();
	if (!errorCode) return false;

	const overrideMessage = (response?.message_text ?? '').trim();

	switch (errorCode) {
		case 'DJ401UA':
			showPopup(PopupType.TOKEN_EXPIRED, { message: overrideMessage });
			return true;
		case 'DJ400NEB':
			showPopup(PopupType.OUT_OF_BALANCE, { message: overrideMessage });
			return true;
		case 'DJ400BF':
			showPopup(PopupType.BET_FAILED, { message: overrideMessage });
			return true;
		default:
			return false;
	}
}

