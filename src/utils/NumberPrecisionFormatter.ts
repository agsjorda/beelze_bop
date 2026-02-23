const DEFAULT_DECIMAL_PLACES = 2;
const MIN_DISPLAY_DECIMAL_PLACES = 2;

let currentDecimalPlaces = DEFAULT_DECIMAL_PLACES;

export function setDecimalPlaces(places: number): void {
	if (!Number.isFinite(places)) {
		return;
	}
	const normalized = Math.max(0, Math.min(10, Math.floor(places)));
	currentDecimalPlaces = normalized;
}

export function formatCurrencyNumber(value: number, trimZeroValueDecimals = false): string {
	const safe = Number.isFinite(value) ? value : 0;
	const normalizedSafe = Math.abs(safe) < Number.EPSILON ? 0 : safe;
	const effectiveDecimalPlaces = Math.max(currentDecimalPlaces, MIN_DISPLAY_DECIMAL_PLACES);
	const fixedValue = normalizedSafe.toFixed(effectiveDecimalPlaces);
	const roundedValue = Number(fixedValue);
	const decimalPart = fixedValue.split(".")[1] ?? "";

	const hasNonZeroTenths = decimalPart.length > 0 && decimalPart[0] !== "0";
	const hasOnlyZeroesAfterTenths =
		decimalPart.length <= 1 || /^0+$/.test(decimalPart.slice(1));
	const enforceTwoDecimalsWhenTrimmed =
		trimZeroValueDecimals && hasNonZeroTenths && hasOnlyZeroesAfterTenths;

	const baseMinDecimals = trimZeroValueDecimals ? 0 : effectiveDecimalPlaces;
	const minimumFractionDigits = Math.min(
		enforceTwoDecimalsWhenTrimmed ? MIN_DISPLAY_DECIMAL_PLACES : baseMinDecimals,
		effectiveDecimalPlaces
	);

	return roundedValue.toLocaleString("en-US", {
		minimumFractionDigits,
		maximumFractionDigits: effectiveDecimalPlaces,
	});
}
