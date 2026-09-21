// Tiny color helpers, so primitives can pick light or dark chrome from a Theme.

// Relative luminance (0 = black, 1 = white) of a #rgb or #rrggbb color.
// Returns null for anything else (rgba(), named colors), so callers can fall back.
export function luminance(color: string): number | null {
	const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
	const raw = m?.[1];
	if (!raw) return null;
	const hex = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw;
	const [r = 0, g = 0, b = 0] = [0, 2, 4].map((i) => {
		const v = parseInt(hex.slice(i, i + 2), 16) / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const isDark = (color: string) => (luminance(color) ?? 1) < 0.2;
