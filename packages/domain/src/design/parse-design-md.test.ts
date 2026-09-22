import {DESIGN_PRESETS, DesignTokens} from '@kinetiq/shared';
import {describe, expect, it} from 'vitest';
import {luminance, parseDesignMd} from './parse-design-md.js';

const dark = DESIGN_PRESETS.find((p) => p.id === 'dark-cinematic')!.tokens;
const light = DESIGN_PRESETS.find((p) => p.id === 'minimal-premium')!.tokens;

describe('parseDesignMd', () => {
	it('reads colors by role, the font and the radius', () => {
		const {tokens, found} = parseDesignMd(`
# Acme brand
- Primary color: #16A34A
- Background: #FFFFFF
- Card surface: #F7F7F7
- Body text: #111
- Muted captions: #6b7280
- Border: #e5e7eb
- Font family: "Geist", sans-serif
- Corner radius: 12px
`);
		expect(tokens).toMatchObject({
			accent: '#16a34a',
			bg: '#ffffff',
			surface: '#f7f7f7',
			fg: '#111111',
			muted: '#6b7280',
			border: '#e5e7eb',
			fontFamily: 'Geist',
			radius: 12,
		});
		expect(found.sort()).toEqual(['accent', 'bg', 'border', 'fg', 'fontFamily', 'muted', 'radius', 'surface']);
		expect(DesignTokens.safeParse(tokens).success).toBe(true);
	});

	it('fills everything else from the dark preset for dark or unknown backgrounds', () => {
		const {tokens, found} = parseDesignMd('Accent: #ff00aa');
		expect(tokens).toEqual({...dark, accent: '#ff00aa', accentFg: '#ffffff'});
		expect(found).toEqual(['accent']);
		expect(parseDesignMd('nothing useful here').tokens).toEqual(dark);
	});

	it('uses the light preset as the base for light backgrounds', () => {
		const {tokens} = parseDesignMd('Background: #fafafa');
		expect(tokens.fg).toBe(light.fg);
		expect(tokens.surfaceAlt).toBe(light.surfaceAlt);
	});

	it('picks readable text for the accent and keeps the first match per role', () => {
		expect(parseDesignMd('Brand: #1d4ed8').tokens.accentFg).toBe('#ffffff');
		expect(parseDesignMd('Primary: #111111\nPrimary: #eeeeee').tokens.accent).toBe('#111111');
	});

	it('clamps silly radii and ignores lines without a role', () => {
		expect(parseDesignMd('radius: 200px').tokens.radius).toBe(48);
		expect(parseDesignMd('Random: #123456').found).toEqual([]);
	});
});

describe('luminance', () => {
	it('is 0 for black and 1 for white', () => {
		expect(luminance('#000')).toBe(0);
		expect(luminance('#ffffff')).toBeCloseTo(1, 5);
		expect(luminance('#808080')).toBeGreaterThan(0.2);
	});
});
