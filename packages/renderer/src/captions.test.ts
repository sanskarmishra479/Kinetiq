import {describe, expect, it} from 'vitest';
import {captionLines} from './captions';

describe('captionLines', () => {
	it('splits words into spoken lines at pauses', () => {
		const words = [
			{text: 'Meet', start: 0, end: 10},
			{text: 'FernPay.', start: 12, end: 22},
			{text: 'Built', start: 60, end: 70},
			{text: 'for', start: 72, end: 80},
		];
		expect(captionLines(words).map((line) => line.map((w) => w.text))).toEqual([
			['Meet', 'FernPay.'],
			['Built', 'for'],
		]);
	});

	it('handles unsorted input and no words', () => {
		expect(captionLines([])).toEqual([]);
		expect(
			captionLines([
				{text: 'b', start: 5, end: 8},
				{text: 'a', start: 0, end: 4},
			]).map((l) => l.length),
		).toEqual([2]);
	});
});
