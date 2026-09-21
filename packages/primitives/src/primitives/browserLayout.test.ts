import {describe, expect, it} from 'vitest';
import {isDark, luminance} from '../color';
import {browserLayout, browserTimeline, chromeScale, scrollThumb, splitUrl, typedChars} from './browserLayout';

describe('browserLayout', () => {
	it('scales chrome with the window width, within limits', () => {
		expect(chromeScale(1420)).toBe(1);
		expect(chromeScale(100)).toBe(0.5);
		expect(chromeScale(9999)).toBe(2);
		expect(chromeScale(1640, 1080)).toBeCloseTo(1640 / 1420, 5);
		expect(browserLayout(1420).toolbar).toBe(52);
	});

	it('centers the address field on wide windows', () => {
		const L = browserLayout(1640);
		expect(L.compact).toBe(false);
		expect(L.field.x + L.field.w / 2).toBeCloseTo(820, 5);
		expect(L.field.y + L.field.h / 2).toBeCloseTo(L.toolbar / 2, 5);
	});

	it('never lets the field overlap the toolbar icons', () => {
		for (const width of [400, 700, 900, 1200, 1640, 2400]) {
			const L = browserLayout(width);
			const half = L.iconSize / 2;
			for (const ic of L.icons) {
				const outside = ic.x + half <= L.field.x || ic.x - half >= L.field.x + L.field.w;
				expect(outside, `${ic.name} at width ${width}`).toBe(true);
			}
			expect(L.field.w).toBeGreaterThan(0);
		}
	});

	it('switches to compact chrome on narrow windows (e.g. 9:16 video)', () => {
		expect(browserLayout(600, 1).compact).toBe(true);
		// A 1000px window in a 1080×1920 video keeps readable chrome and goes compact.
		const L = browserLayout(1000, chromeScale(1000, 1080));
		expect(L.scale).toBeGreaterThan(1);
		expect(L.compact).toBe(true);
		expect(L.icons.map((i) => i.name)).toEqual(['back', 'tabs']);
	});
});

describe('browserTimeline', () => {
	it('types, pauses, loads, then reveals, in order', () => {
		const t = browserTimeline('acme.com', 10, 30);
		expect(t.typeStart).toBe(10);
		expect(t.typeEnd).toBeGreaterThan(t.typeStart);
		expect(t.loadStart).toBeGreaterThan(t.typeEnd);
		expect(t.loadEnd).toBeGreaterThan(t.loadStart);
		expect(t.revealEnd).toBeGreaterThan(t.loadEnd);
	});

	it('has typed the whole URL by typeEnd', () => {
		const url = 'kinetiq.so/pricing';
		const t = browserTimeline(url, 0, 30);
		expect(typedChars(t.typeStart, url, 0, 30)).toBe(0);
		expect(typedChars(t.typeEnd, url, 0, 30)).toBe(url.length);
		expect(typedChars(-5, url, 0, 30)).toBe(0);
	});
});

describe('splitUrl', () => {
	it('hides protocol and www, dims the path', () => {
		expect(splitUrl('https://www.acme.com/pricing?x=1')).toEqual({domain: 'acme.com', path: '/pricing?x=1'});
		expect(splitUrl('acme.com')).toEqual({domain: 'acme.com', path: ''});
		expect(splitUrl('http://acme.com/')).toEqual({domain: 'acme.com', path: ''});
	});
});

describe('scrollThumb', () => {
	it('moves from top to bottom as the page scrolls', () => {
		expect(scrollThumb(0, 500, 1500)).toEqual({size: 500 / 3, top: 0});
		const end = scrollThumb(1000, 500, 1500);
		expect(end.top + end.size).toBeCloseTo(500, 5);
	});

	it('has no thumb when the page fits', () => {
		expect(scrollThumb(0, 500, 400).size).toBe(0);
	});
});

describe('color', () => {
	it('knows dark from light theme backgrounds', () => {
		expect(isDark('#0a0a0c')).toBe(true);
		expect(isDark('#f4f4f1')).toBe(false);
		expect(isDark('#fff')).toBe(false);
		expect(luminance('rgba(0,0,0,1)')).toBeNull();
	});
});
