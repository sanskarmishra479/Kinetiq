import {describe, expect, it} from 'vitest';
import {mapLimit} from './pool.js';

describe('mapLimit', () => {
	it('keeps the order and never runs more than the limit at once', async () => {
		let running = 0;
		let peak = 0;
		const result = await mapLimit([30, 5, 20, 10, 1], 2, async (ms, i) => {
			running++;
			peak = Math.max(peak, running);
			await new Promise((r) => setTimeout(r, ms));
			running--;
			return i * 10;
		});
		expect(result).toEqual([0, 10, 20, 30, 40]);
		expect(peak).toBe(2);
	});

	it('stops starting new work after a failure, and handles empty input', async () => {
		const started: number[] = [];
		await expect(
			mapLimit([1, 2, 3, 4], 1, async (n) => {
				started.push(n);
				if (n === 2) throw new Error('boom');
				return n;
			}),
		).rejects.toThrow('boom');
		expect(started).toEqual([1, 2]);
		expect(await mapLimit([], 3, async () => 1)).toEqual([]);
	});
});
