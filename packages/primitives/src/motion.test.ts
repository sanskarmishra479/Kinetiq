import {describe, expect, it} from 'vitest';
import {cursorAt, isPressed} from './primitives/Cursor';
import {menuRowY, MENU_PAD, MENU_ROW} from './primitives/Menu';
import {ease, keyframes, openClose, tween} from './motion';

const linear = (t: number) => t;

describe('tween', () => {
	it('clamps before and after the range', () => {
		expect(tween(-5, [0, 10], [100, 200], linear)).toBe(100);
		expect(tween(50, [0, 10], [100, 200], linear)).toBe(200);
	});

	it('interpolates inside the range', () => {
		expect(tween(5, [0, 10], [100, 200], linear)).toBe(150);
	});

	it('uses ease.out by default (ahead of linear at the midpoint)', () => {
		expect(tween(5, [0, 10], [0, 1])).toBeGreaterThan(0.5);
	});
});

describe('keyframes', () => {
	const kfs = [
		{frame: 0, x: 0, y: 0},
		{frame: 10, x: 100, y: 50},
		{frame: 20, x: 100, y: 150},
	];

	it('holds the first keyframe before it starts', () => {
		expect(keyframes(-3, kfs, ['x', 'y'], linear)).toEqual({x: 0, y: 0, t: 0, segment: 0});
	});

	it('interpolates within the right segment', () => {
		expect(keyframes(5, kfs, ['x', 'y'], linear)).toEqual({x: 50, y: 25, t: 0.5, segment: 0});
		expect(keyframes(15, kfs, ['x', 'y'], linear)).toEqual({x: 100, y: 100, t: 0.5, segment: 1});
	});

	it('holds the last keyframe after it ends', () => {
		expect(keyframes(99, kfs, ['x', 'y'], linear)).toEqual({x: 100, y: 150, t: 1, segment: 1});
	});

	it('handles a single keyframe', () => {
		expect(keyframes(50, [{frame: 0, x: 7}], ['x'])).toEqual({x: 7, t: 1, segment: 0});
	});

	it('rejects an empty keyframe list', () => {
		expect(() => keyframes(0, [], ['x'])).toThrow('at least one keyframe');
	});

	it('uses ease.inOut by default (symmetric at the midpoint)', () => {
		expect(keyframes(5, kfs, ['x']).x).toBeCloseTo(50, 5);
		expect(ease.inOut(0.25)).toBeLessThan(0.25);
	});
});

describe('openClose', () => {
	it('is 0 before opening, reaches 1, and returns to 0 after closing', () => {
		expect(openClose(0, 30, 10)).toBe(0);
		expect(openClose(60, 30, 10)).toBeCloseTo(1, 2);
		expect(openClose(60 + 10, 30, 10, 60)).toBe(0);
	});

	it('stays open when there is no close frame', () => {
		expect(openClose(500, 30, 0)).toBeCloseTo(1, 3);
	});
});

describe('cursor helpers', () => {
	const path = [
		{frame: 0, x: 0, y: 0},
		{frame: 10, x: 100, y: 0},
	];

	it('cursorAt follows the path', () => {
		expect(cursorAt(0, path)).toMatchObject({x: 0, y: 0});
		expect(cursorAt(10, path)).toMatchObject({x: 100, y: 0});
	});

	it('isPressed is true only around a click', () => {
		expect(isPressed(20, [20])).toBe(true);
		expect(isPressed(17, [20])).toBe(false);
		expect(isPressed(25, [20])).toBe(true);
		expect(isPressed(26, [20])).toBe(false);
	});
});

describe('menuRowY', () => {
	it('returns the center of a menu row', () => {
		expect(menuRowY(100, 0)).toBe(100 + MENU_PAD + MENU_ROW / 2);
		expect(menuRowY(100, 2)).toBe(100 + MENU_PAD + 2 * MENU_ROW + MENU_ROW / 2);
	});
});
