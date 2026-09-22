import {describe, expect, it} from 'vitest';
import {darkCinematic, minimalLight, resolveStyle, type Theme} from '../theme';
import {bentoSpan, cardColorIndex, cardStart, cardSurface} from './cardStyle';

const brand: Theme = {
	...minimalLight,
	palette: ['#5b2bff', '#ffd43b'],
	style: {surface: 'brand', border: 'bold', shadow: 'hard'},
};

describe('resolveStyle', () => {
	it('gives a neutral default look when a theme has no style', () => {
		expect(resolveStyle(darkCinematic)).toEqual({
			surface: 'solid',
			border: 'hairline',
			shadow: 'soft',
			headingWeight: 600,
			headingTracking: -0.02,
			headingFont: darkCinematic.fontFamily,
			palette: [darkCinematic.accent],
		});
	});
});

describe('cardSurface', () => {
	it('solid cards use the theme surface with a hairline and soft shadow', () => {
		const c = cardSurface(darkCinematic, resolveStyle(darkCinematic), 0);
		expect(c.background).toBe(darkCinematic.surface);
		expect(c.border).toBe(`1px solid ${darkCinematic.border}`);
		expect(c.boxShadow).toContain('rgba(0,0,0,0.45)');
	});

	it('brand cards cycle through the palette with readable text', () => {
		const s = resolveStyle(brand);
		expect(cardSurface(brand, s, 0)).toMatchObject({background: '#5b2bff', color: '#ffffff'});
		expect(cardSurface(brand, s, 1)).toMatchObject({background: '#ffd43b', color: '#000000'});
		expect(cardSurface(brand, s, 2).background).toBe('#5b2bff');
	});

	it('bold borders and hard shadows use the ink color and scale with size', () => {
		const c = cardSurface(brand, resolveStyle(brand), 0, 2);
		expect(c.border).toBe(`6px solid ${brand.fg}`);
		expect(c.boxShadow).toBe(`12px 12px 0 ${brand.fg}`);
	});

	it('outline cards are transparent with no soft shadow', () => {
		const t: Theme = {...darkCinematic, style: {surface: 'outline'}};
		const c = cardSurface(t, resolveStyle(t), 0);
		expect(c.background).toBe('transparent');
		expect(c.boxShadow).toBe('none');
	});

	it('emphasis forces a brand fill (the bento hero)', () => {
		const c = cardSurface(darkCinematic, resolveStyle(darkCinematic), 3, 1, true);
		expect(c.background).toBe(darkCinematic.accent);
	});
});

describe('card layout and timing', () => {
	it('makes the first bento card the big hero', () => {
		expect(bentoSpan(0, 3)).toEqual({col: 2, row: 2});
		expect(bentoSpan(0, 2)).toEqual({col: 2, row: 1});
		expect(bentoSpan(1, 3)).toEqual({col: 1, row: 1});
	});

	it('orders cards per layout', () => {
		// grid: diagonal waves.
		expect([0, 1, 2, 3].map((i) => cardStart(i, 'grid', 3, 0, 6))).toEqual([0, 6, 12, 6]);
		// bento: hero first, then a beat, then the rest.
		expect(cardStart(0, 'bento', 3, 10, 6)).toBe(10);
		expect(cardStart(1, 'bento', 3, 10, 6)).toBe(19);
		// list and steps: strictly in reading order.
		expect([0, 1, 2].map((i) => cardStart(i, 'list', 1, 0, 5))).toEqual([0, 8, 16]);
	});
});

describe('cardColorIndex', () => {
	it('keeps the bento hero color for the hero only', () => {
		expect([0, 1, 2, 3, 4, 5].map((i) => cardColorIndex(i, true, 4))).toEqual([0, 1, 2, 3, 1, 2]);
	});

	it('cycles the whole palette in a plain grid, and copes with one color', () => {
		expect([0, 1, 2].map((i) => cardColorIndex(i, false, 2))).toEqual([0, 1, 0]);
		expect(cardColorIndex(3, true, 1)).toBe(0);
	});
});
