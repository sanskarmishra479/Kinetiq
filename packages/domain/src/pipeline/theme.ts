import {DESIGN_PRESETS, type DesignTokens} from '@kinetiq/shared';
import {luminance} from '../design/parse-design-md.js';

// Turning what we know about a site into design tokens (FR-GEN-03).
// Pure: the same website always gives the same theme, so renders are repeatable.

const DEFAULT_PRESET = DESIGN_PRESETS[0]!;

const hex = (value: string) => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);

/** Brightness 0…1; non-hex colors (rgba(), names) count as dark. */
const light = (color: string) => (hex(color) ? luminance(color) : 0);

/** Mixes `color` toward white or black by `amount` (0…1). */
export function shade(color: string, amount: number): string {
	if (!hex(color)) return color;
	const full =
		color.length === 4
			? `#${color[1]!}${color[1]!}${color[2]!}${color[2]!}${color[3]!}${color[3]!}`
			: color.toLowerCase();
	const channels = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16));
	const target = amount >= 0 ? 255 : 0;
	const mixed = channels.map((c) => Math.round(c + (target - c) * Math.abs(amount)));
	return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Readable text color on a background. */
export const onColor = (background: string) => (light(background) > 0.45 ? '#0b0b0d' : '#ffffff');

export type BrandInput = {colors: readonly string[]; fonts: readonly string[]};

/**
 * Builds a theme from the colors and fonts found on the website (FR-GEN-03).
 * Falls back to the default preset for anything the site doesn't give us, so
 * the result is always a complete, readable theme.
 */
export function themeFromBrand(brand: BrandInput): DesignTokens {
	const usable = brand.colors.filter(hex);
	const dark = usable.filter((c) => light(c) < 0.2);
	const bright = usable.filter((c) => light(c) >= 0.08 && light(c) <= 0.75);
	// A dark canvas looks best; a brand with only light colors keeps its light canvas.
	const veryLight = usable.filter((c) => light(c) > 0.8);
	const bg = dark[0] ?? veryLight[0] ?? DEFAULT_PRESET.tokens.bg;
	const accent = bright.find((c) => c !== bg) ?? DEFAULT_PRESET.tokens.accent;
	const onBg = onColor(bg);
	const lift = light(bg) > 0.45 ? -0.06 : 0.06;

	return {
		bg,
		surface: shade(bg, lift),
		surfaceAlt: shade(bg, lift * 2),
		border: onBg === '#ffffff' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
		fg: onBg,
		muted: shade(onBg, onBg === '#ffffff' ? -0.45 : 0.45),
		accent,
		accentFg: onColor(accent),
		radius: DEFAULT_PRESET.tokens.radius,
		fontFamily: fontStack(brand.fonts[0]),
		motion: DEFAULT_PRESET.tokens.motion,
	};
}

/**
 * A CSS font stack: the brand's font if the page can load it, then Inter,
 * which the renderer always loads, so text never falls back to a system font.
 */
export function fontStack(font: string | undefined): string {
	const name = font
		?.replace(/["\\;{}]/g, '')
		.trim()
		.slice(0, 40);
	return name && name !== 'Inter' ? `"${name}", Inter, sans-serif` : 'Inter, sans-serif';
}

/** The tokens of a preset the user picked, by id. */
export const themeFromPreset = (presetId: string): DesignTokens =>
	(DESIGN_PRESETS.find((p) => p.id === presetId) ?? DEFAULT_PRESET).tokens;
