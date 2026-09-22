import {DESIGN_PRESETS, DesignTokens} from '@kinetiq/shared';
import type {z} from 'zod';

// Turns a pasted or uploaded DESIGN.md into theme tokens without an LLM:
// finds colors by the words on the same line ("Primary: #16a34a"), plus the
// font and corner radius. Anything not found comes from a sensible base preset.
// The richer "import from website" happens later in the pipeline.

type Tokens = z.infer<typeof DesignTokens>;
type ColorRole = 'accent' | 'bg' | 'surface' | 'fg' | 'muted' | 'border';

// Checked in order; the first matching role wins for a line.
const ROLE_WORDS: [ColorRole, RegExp][] = [
	['border', /\bborders?\b|\bdivider/],
	['muted', /\bmuted\b|\bsubtle\b|\bsecondary text\b|\bcaption/],
	['surface', /\bsurface\b|\bcards?\b|\bpanels?\b/],
	['bg', /\bbackground\b|\bbg\b|\bcanvas\b/],
	['fg', /\btext\b|\bforeground\b|\bfg\b|\bbody\b|\bink\b/],
	['accent', /\bprimary\b|\baccent\b|\bbrand\b|\bhighlight\b|\bcta\b/],
];

const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;

function expand(hex: string): string {
	const h = hex.slice(1).toLowerCase();
	return h.length === 3 ? `#${[...h].map((c) => c + c).join('')}` : `#${h}`;
}

/** Relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
	const h = expand(hex).slice(1);
	const [r, g, b] = [0, 2, 4].map((i) => {
		const c = parseInt(h.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const presetTokens = (id: string) => (DESIGN_PRESETS.find((p) => p.id === id) ?? DESIGN_PRESETS[0])!.tokens;

export type ParsedDesign = {tokens: Tokens; found: string[]};

export function parseDesignMd(markdown: string): ParsedDesign {
	const colors: Partial<Record<ColorRole, string>> = {};
	let font: string | undefined;
	let radius: number | undefined;

	for (const raw of markdown.split('\n')) {
		const line = raw.toLowerCase();
		const hex = raw.match(HEX)?.[0];
		if (hex) {
			const role = ROLE_WORDS.find(([, words]) => words.test(line))?.[0];
			if (role && colors[role] === undefined) colors[role] = expand(hex);
		}
		const fontMatch = raw.match(/font(?:[ -]?family)?\s*[:=-]\s*[`"']?([A-Za-z][A-Za-z0-9 ]{1,39})/i);
		if (fontMatch && font === undefined) font = fontMatch[1]?.trim();
		const radiusMatch = line.match(/radius\s*[:=-]\s*(\d{1,3})\s*(?:px)?/);
		if (radiusMatch && radius === undefined) radius = Math.min(48, Number(radiusMatch[1]));
	}

	// Light backgrounds start from the light preset, everything else from the dark one.
	const base = presetTokens(colors.bg && luminance(colors.bg) > 0.5 ? 'minimal-premium' : 'dark-cinematic');
	const accent = colors.accent ?? base.accent;
	const tokens = DesignTokens.parse({
		...base,
		...colors,
		accent,
		// Readable text on the accent color.
		accentFg: colors.accent ? (luminance(accent) > 0.45 ? '#111111' : '#ffffff') : base.accentFg,
		surfaceAlt: base.surfaceAlt,
		fontFamily: font ?? base.fontFamily,
		radius: radius ?? base.radius,
	});
	const found = [
		...(Object.keys(colors) as string[]),
		...(font ? ['fontFamily'] : []),
		...(radius !== undefined ? ['radius'] : []),
	];
	return {tokens, found};
}
