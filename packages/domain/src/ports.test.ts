import {describe, expect, it} from 'vitest';
import {seededRandom} from './ports/random.js';
import {FixedClock, SeqId} from './testing/fakes.js';

describe('FixedClock', () => {
	it('only moves when told to', () => {
		const clock = new FixedClock(1_000);
		expect(clock.now()).toBe(1_000);
		clock.advance(500);
		expect(clock.now()).toBe(1_500);
		clock.set(42);
		expect(clock.now()).toBe(42);
	});
});

describe('SeqId', () => {
	it('counts per prefix', () => {
		const ids = new SeqId();
		expect([ids.next('prj'), ids.next('prj'), ids.next('job')]).toEqual([
			'prj_00000001',
			'prj_00000002',
			'job_00000001',
		]);
	});
});

describe('seededRandom', () => {
	it('is reproducible for the same seed', () => {
		const a = seededRandom(7);
		const b = seededRandom(7);
		const seqA = Array.from({length: 5}, () => a.next());
		const seqB = Array.from({length: 5}, () => b.next());
		expect(seqA).toEqual(seqB);
	});

	it('differs across seeds and stays in [0, 1)', () => {
		const a = Array.from(
			{length: 1000},
			(() => {
				const r = seededRandom(1);
				return () => r.next();
			})(),
		);
		expect(a.every((x) => x >= 0 && x < 1)).toBe(true);
		expect(seededRandom(1).next()).not.toBe(seededRandom(2).next());
	});
});
