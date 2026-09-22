// Pure styling and timing for <CardGrid>: how a card is filled, bordered and
// shadowed from the theme's style tokens, and when each card appears.
import {isDark} from '../color';
import type {ResolvedStyle, Theme} from '../theme';

export type CardVariant = 'grid' | 'bento' | 'list' | 'steps';

export type CardSurface = {
	background: string;
	color: string;
	muted: string;
	border: string;
	boxShadow: string;
};

// Readable text on a brand-colored fill.
const onColor = (fill: string) => (isDark(fill) ? '#ffffff' : '#000000');
const fade = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// `emphasis` forces a brand fill (the one bold card in a bento).
export function cardSurface(theme: Theme, s: ResolvedStyle, i: number, k = 1, emphasis = false): CardSurface {
	const brand = s.palette[i % s.palette.length] ?? theme.accent;
	const surface = emphasis ? 'brand' : s.surface;
	const fill =
		surface === 'brand'
			? brand
			: surface === 'tint'
				? fade(theme.accent, 10)
				: surface === 'outline'
					? 'transparent'
					: theme.surface;
	const color = surface === 'brand' ? onColor(brand) : theme.fg;
	const border =
		s.border === 'none'
			? 'none'
			: s.border === 'bold'
				? `${Math.max(2, 3 * k)}px solid ${theme.fg}`
				: `1px solid ${surface === 'outline' ? fade(theme.fg, 22) : theme.border}`;
	const boxShadow =
		s.shadow === 'hard'
			? `${6 * k}px ${6 * k}px 0 ${theme.fg}`
			: s.shadow === 'soft' && surface !== 'outline'
				? `0 ${24 * k}px ${60 * k}px -${28 * k}px rgba(0,0,0,0.45)`
				: 'none';
	return {background: fill, color, muted: surface === 'brand' ? fade(color, 72) : theme.muted, border, boxShadow};
}

// Which palette color a card uses. In a bento the hero keeps the first color
// and the other cards cycle through the rest, so none of them blends into it.
export function cardColorIndex(i: number, bento: boolean, paletteSize: number): number {
	if (!bento || paletteSize < 2) return i % Math.max(1, paletteSize);
	return i === 0 ? 0 : 1 + ((i - 1) % (paletteSize - 1));
}

// Bento: the first card is the hero (2×2 in wide frames, full width in narrow ones).
export const bentoSpan = (i: number, cols: number) =>
	i === 0 ? {col: Math.min(2, cols), row: cols >= 3 ? 2 : 1} : {col: 1, row: 1};

// Frame each card starts appearing.
// grid: diagonal waves · bento: hero first, then the rest · list/steps: one by one, in reading order.
export function cardStart(i: number, variant: CardVariant, cols: number, at: number, stagger: number): number {
	if (variant === 'grid') return at + (Math.floor(i / cols) + (i % cols)) * stagger;
	if (variant === 'bento') return i === 0 ? at : at + stagger * 1.5 + (i - 1) * stagger;
	return at + i * stagger * 1.6;
}
