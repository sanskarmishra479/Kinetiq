import {describe, expect, it} from 'vitest';
import {cardWave, fitRect, gridColumns, rectAt, toScreen} from './focus';

describe('rectAt', () => {
	it('returns a fixed rect as is', () => {
		expect(rectAt(50, {x: 1, y: 2, w: 3, h: 4})).toEqual({x: 1, y: 2, w: 3, h: 4});
	});

	it('glides between keyframed rects', () => {
		const keys = [
			{frame: 0, x: 0, y: 0, w: 100, h: 100},
			{frame: 10, x: 100, y: 0, w: 200, h: 100},
		];
		expect(rectAt(0, keys)).toEqual({x: 0, y: 0, w: 100, h: 100});
		expect(rectAt(10, keys)).toEqual({x: 100, y: 0, w: 200, h: 100});
		expect(rectAt(5, keys).x).toBeCloseTo(50, 5);
	});
});

describe('fitRect', () => {
	it('centers on the rect and zooms so it fills the frame with padding', () => {
		const cam = fitRect({x: 600, y: 600, w: 720, h: 70}, 1920, 1080, 0.2);
		expect(cam.x).toBe(960);
		expect(cam.y).toBe(635);
		// Width is the limit: 1920 × 0.8 / 720.
		expect(cam.scale).toBeCloseTo(2.1333, 3);
	});

	it('never zooms out and caps the zoom', () => {
		expect(fitRect({x: 0, y: 0, w: 5000, h: 5000}, 1920, 1080).scale).toBe(1);
		expect(fitRect({x: 0, y: 0, w: 10, h: 10}, 1920, 1080, 0.2, 3).scale).toBe(3);
	});

	it('puts the rect in the middle of the screen', () => {
		const r = {x: 600, y: 600, w: 720, h: 70};
		const cam = fitRect(r, 1920, 1080);
		const topLeft = toScreen(r.x, r.y, cam, 1920, 1080);
		const bottomRight = toScreen(r.x + r.w, r.y + r.h, cam, 1920, 1080);
		expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(960, 5);
		expect((topLeft.y + bottomRight.y) / 2).toBeCloseTo(540, 5);
	});
});

describe('card grid layout', () => {
	it('uses 3 columns in 16:9, 2 in 1:1, 1–2 in 9:16', () => {
		expect(gridColumns(6, 1920, 1080)).toBe(3);
		expect(gridColumns(6, 1080, 1080)).toBe(2);
		expect(gridColumns(6, 1080, 1920)).toBe(2);
		expect(gridColumns(3, 1080, 1920)).toBe(1);
	});

	it('keeps 4 cards as a 2×2 block and never has more columns than cards', () => {
		expect(gridColumns(4, 1920, 1080)).toBe(2);
		expect(gridColumns(2, 1920, 1080)).toBe(2);
	});

	it('orders cards in diagonal waves', () => {
		// 3 columns: row 0 = 0,1,2; row 1 = 1,2,3.
		expect([0, 1, 2, 3, 4, 5].map((i) => cardWave(i, 3))).toEqual([0, 1, 2, 1, 2, 3]);
	});
});
