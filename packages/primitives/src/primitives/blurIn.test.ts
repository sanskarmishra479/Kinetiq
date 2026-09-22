import {describe, expect, it} from 'vitest';
import {blurInEnd, focusPull, splitUnits, unitLook, unitProgress} from './blurIn';

const texts = (lines: ReturnType<typeof splitUnits>['lines']) => lines.map((l) => l.map((w) => w.map((u) => u.text)));

describe('splitUnits', () => {
	it('splits words, keeping the space with the word before it', () => {
		const {lines, count} = splitUnits('We built  a', 'word');
		expect(texts(lines)).toEqual([[['We '], ['built '], ['a']]]);
		expect(count).toBe(3);
	});

	it('splits letters inside their words, with spaces sharing the previous letter’s timing', () => {
		const {lines, count} = splitUnits('Hi yo', 'char');
		expect(texts(lines)).toEqual([
			[
				['H', 'i', ' '],
				['y', 'o'],
			],
		]);
		expect(lines[0]?.[0]?.map((u) => u.index)).toEqual([0, 1, 1]);
		expect(count).toBe(4);
	});

	it('splits lines on newlines, and keeps the stagger order across lines', () => {
		const {lines, count} = splitUnits('Step out\nof the loop', 'line');
		expect(texts(lines)).toEqual([[['Step out']], [['of the loop']]]);
		expect(count).toBe(2);
		expect(splitUnits('a b\nc', 'word').lines[1]?.[0]?.[0]?.index).toBe(2);
	});
});

describe('unit timing', () => {
	it('starts each unit one stagger after the previous', () => {
		expect(unitProgress(10, 2, 0, 5, 18)).toBe(0);
		expect(unitProgress(11, 2, 0, 5, 18)).toBeGreaterThan(0);
		expect(unitProgress(28, 2, 0, 5, 18)).toBe(1);
	});

	it('knows when the last unit lands', () => {
		expect(blurInEnd(3, 10, 5, 18)).toBe(38);
		expect(blurInEnd(0, 10, 5, 18)).toBe(28);
	});

	it('goes from faint, soft and offset to solid, sharp and in place', () => {
		expect(unitLook(0, 10, 20)).toEqual({opacity: 0, blur: 10, x: 20});
		expect(unitLook(1, 10, 20)).toEqual({opacity: 1, blur: 0, x: 0});
		// Opacity leads the blur: half-way it is already mostly visible but still soft.
		const mid = unitLook(0.5, 10, 20);
		expect(mid.opacity).toBeGreaterThan(0.5);
		expect(mid.blur).toBe(5);
	});
});

describe('focusPull', () => {
	it('is blurred before entering, sharp while held, blurred after leaving', () => {
		expect(focusPull(0, {inAt: 0, duration: 30})).toMatchObject({soft: 1, opacity: 0});
		expect(focusPull(40, {inAt: 0, outAt: 100, duration: 30})).toEqual({soft: 0, opacity: 1, scale: 1});
		expect(focusPull(130, {inAt: 0, outAt: 100, duration: 30})).toMatchObject({soft: 1, opacity: 0});
	});
});
