import {describe, expect, it} from 'vitest';
import {
	available,
	clawback,
	debtOf,
	expire,
	grant,
	InsufficientCredits,
	InvalidCreditAmount,
	outstandingReservation,
	reserve,
	settle,
	spendOrder,
	type Bucket,
} from './credits.js';
import {editCost, estimate} from './estimate.js';

const NOW = 1_000_000;
const sub = (id: string, remaining: number, expiresAt = NOW + 1000): Bucket => ({
	id,
	source: 'subscription',
	granted: Math.max(remaining, 100),
	remaining,
	expiresAt,
});
const purchase = (id: string, remaining: number): Bucket => ({
	id,
	source: 'purchase',
	granted: Math.max(remaining, 100),
	remaining,
	expiresAt: null,
});

describe('spendOrder (FR-CRD-03)', () => {
	it('spends subscription credits first, soonest expiry first, then purchases', () => {
		const buckets = [purchase('p1', 50), sub('s-late', 10, NOW + 5000), sub('s-soon', 10, NOW + 10), purchase('p0', 5)];
		expect(spendOrder(buckets, NOW).map((b) => b.id)).toEqual(['s-soon', 's-late', 'p0', 'p1']);
	});

	it('skips empty and expired buckets', () => {
		const buckets = [sub('expired', 50, NOW), purchase('empty', 0), purchase('ok', 3)];
		expect(spendOrder(buckets, NOW).map((b) => b.id)).toEqual(['ok']);
		expect(available(buckets, NOW)).toBe(3);
	});

	it('breaks ties by id, and grant buckets sort like purchases', () => {
		const buckets: Bucket[] = [
			{id: 'b', source: 'grant', granted: 5, remaining: 5, expiresAt: null},
			{id: 'a', source: 'purchase', granted: 5, remaining: 5, expiresAt: null},
		];
		expect(spendOrder(buckets, NOW).map((b) => b.id)).toEqual(['a', 'b']);
		expect(spendOrder([...buckets].reverse(), NOW).map((b) => b.id)).toEqual(['a', 'b']);
	});
});

describe('grant', () => {
	it('fills a new bucket and records a positive ledger line', () => {
		expect(grant(100, 'b1', 0)).toEqual({remaining: 100, lines: [{type: 'grant', amount: 100, bucketId: 'b1'}]});
	});

	it('pays off debt first (FR-CRD-09)', () => {
		expect(grant(100, 'b1', -30).remaining).toBe(70);
		expect(grant(20, 'b1', -30).remaining).toBe(0);
		expect(debtOf(-30)).toBe(30);
		expect(debtOf(12)).toBe(0);
	});

	it('rejects zero, negative and fractional amounts', () => {
		for (const bad of [0, -5, 1.5, Number.NaN]) expect(() => grant(bad, 'b', 0)).toThrow(InvalidCreditAmount);
	});
});

describe('reserve (FR-CRD-04)', () => {
	it('takes credits in spending order across buckets', () => {
		const op = reserve([purchase('p', 50), sub('s', 10)], 25, NOW, 60);
		expect(op.reservation).toEqual([
			{bucketId: 's', amount: 10},
			{bucketId: 'p', amount: 15},
		]);
		expect(op.buckets).toEqual([
			{id: 's', remaining: 0},
			{id: 'p', remaining: 35},
		]);
		expect(op.lines).toEqual([
			{type: 'reserve', amount: -10, bucketId: 's'},
			{type: 'reserve', amount: -15, bucketId: 'p'},
		]);
	});

	it('refuses when there are not enough usable credits, writing nothing', () => {
		const err = (() => {
			try {
				reserve([purchase('p', 10), sub('old', 100, NOW - 1)], 11, NOW, 110);
			} catch (e) {
				return e as InsufficientCredits;
			}
		})();
		expect(err).toBeInstanceOf(InsufficientCredits);
		expect(err).toMatchObject({required: 11, available: 10});
	});

	it('refuses anything while the user owes credits', () => {
		expect(() => reserve([purchase('p', 50)], 1, NOW, -5)).toThrow(InsufficientCredits);
	});

	it('uses exactly the whole balance when needed', () => {
		expect(reserve([purchase('p', 20)], 20, NOW, 20).buckets).toEqual([{id: 'p', remaining: 0}]);
		expect(() => reserve([purchase('p', 20)], 0, NOW, 20)).toThrow(InvalidCreditAmount);
	});
});

describe('settle (FR-CRD-05, FR-CRD-06)', () => {
	const afterReserve = [sub('s', 0), purchase('p', 35)];
	const reservation = [
		{bucketId: 's', amount: 10},
		{bucketId: 'p', amount: 15},
	];

	it('charges the actual cost and refunds the rest, last-taken bucket first', () => {
		const op = settle(afterReserve, reservation, 20, 35);
		expect(op).toMatchObject({charged: 20, refunded: 5});
		expect(op.buckets).toEqual([{id: 'p', remaining: 40}]);
		expect(op.lines).toEqual([{type: 'refund', amount: 5, bucketId: 'p'}]);
	});

	it('refunds across buckets when needed', () => {
		const op = settle(afterReserve, reservation, 3, 35);
		expect(op.buckets).toEqual([
			{id: 'p', remaining: 50},
			{id: 's', remaining: 7},
		]);
	});

	it('never charges more than was reserved', () => {
		expect(settle(afterReserve, reservation, 999, 35)).toMatchObject({charged: 25, refunded: 0, lines: []});
	});

	it('refunds everything when the job fails (actual = 0)', () => {
		const op = settle(afterReserve, reservation, 0, 35);
		expect(op).toMatchObject({charged: 0, refunded: 25});
		expect(op.lines.reduce((s, l) => s + l.amount, 0)).toBe(25);
	});

	it('pays off debt before refilling buckets (clawback during a running job)', () => {
		// Buckets are empty and the user owes 30; the job fails and 25 comes back.
		const empty = [sub('s', 0), purchase('p', 0)];
		const all = settle(empty, reservation, 0, -30);
		expect(all.buckets).toEqual([]);
		expect(all.lines.reduce((sum, l) => sum + l.amount, 0)).toBe(25);
		// Owing only 12: 12 pays the debt, 13 refills buckets (last-taken first).
		const part = settle(empty, reservation, 0, -12);
		expect(part.buckets).toEqual([
			{id: 'p', remaining: 3},
			{id: 's', remaining: 10},
		]);
	});

	it('rejects bad amounts and unknown buckets', () => {
		expect(() => settle(afterReserve, reservation, -1, 35)).toThrow(InvalidCreditAmount);
		expect(() => settle(afterReserve, reservation, 1.5, 35)).toThrow(InvalidCreditAmount);
		expect(() => settle([], reservation, 0, 35)).toThrow('Unknown bucket');
	});
});

describe('outstandingReservation', () => {
	it('rebuilds what a job still holds from its ledger lines', () => {
		expect(
			outstandingReservation([
				{type: 'reserve', amount: -10, bucketId: 's'},
				{type: 'reserve', amount: -15, bucketId: 'p'},
				{type: 'refund', amount: 5, bucketId: 'p'},
				{type: 'clawback', amount: -3, bucketId: null},
				{type: 'settle', amount: 1, bucketId: 'x'},
			]),
		).toEqual([
			{bucketId: 's', amount: 10},
			{bucketId: 'p', amount: 10},
		]);
		expect(
			outstandingReservation([
				{type: 'reserve', amount: -4, bucketId: 's'},
				{type: 'refund', amount: 4, bucketId: 's'},
			]),
		).toEqual([]);
	});
});

describe('expire', () => {
	it('empties expired buckets and records the loss', () => {
		const op = expire([sub('old', 30, NOW), sub('empty-old', 0, NOW - 5), sub('fresh', 10), purchase('p', 5)], NOW);
		expect(op).toEqual({
			buckets: [{id: 'old', remaining: 0}],
			lines: [{type: 'expire', amount: -30, bucketId: 'old'}],
		});
	});
});

describe('clawback (FR-CRD-09)', () => {
	it('takes from the refunded payment first, then others', () => {
		const op = clawback([purchase('a', 10), purchase('paid', 20)], 25, 'paid');
		expect(op.buckets).toEqual([
			{id: 'paid', remaining: 0},
			{id: 'a', remaining: 5},
		]);
		expect(op.lines).toEqual([
			{type: 'clawback', amount: -20, bucketId: 'paid'},
			{type: 'clawback', amount: -5, bucketId: 'a'},
		]);
	});

	it('records the uncovered part as debt', () => {
		const op = clawback([purchase('a', 10), purchase('empty', 0)], 25);
		expect(op.lines).toEqual([
			{type: 'clawback', amount: -10, bucketId: 'a'},
			{type: 'clawback', amount: -15, bucketId: null},
		]);
		expect(clawback([], 5).lines).toEqual([{type: 'clawback', amount: -5, bucketId: null}]);
		expect(() => clawback([], 0)).toThrow(InvalidCreditAmount);
	});
});

describe('estimate (FR-GEN-01)', () => {
	it('prices the video by duration, plus voiceover and AI clips', () => {
		expect(estimate({durationSec: 30, voiceover: false, aiClips: 0, templateDiscountPct: 0})).toEqual({
			credits: 20,
			breakdown: [{item: 'video_30s', credits: 20}],
		});
		expect(estimate({durationSec: 45, voiceover: true, aiClips: 2, templateDiscountPct: 0})).toEqual({
			credits: 30 + 3 + 30,
			breakdown: [
				{item: 'video_45s', credits: 30},
				{item: 'voiceover', credits: 3},
				{item: 'ai_clip', credits: 30},
			],
		});
	});

	it('applies template discounts, rounding up and clamping', () => {
		expect(estimate({durationSec: 15, voiceover: false, aiClips: 0, templateDiscountPct: 20}).credits).toBe(8);
		expect(estimate({durationSec: 15, voiceover: false, aiClips: 0, templateDiscountPct: 500}).credits).toBe(1);
		expect(estimate({durationSec: 15, voiceover: false, aiClips: -3, templateDiscountPct: -10}).credits).toBe(10);
		const tiny = {video_15s: 1, video_30s: 1, video_45s: 1, voiceover: 1, ai_clip: 1, edit: 1};
		expect(estimate({durationSec: 15, voiceover: false, aiClips: 0, templateDiscountPct: 90}, tiny).credits).toBe(1);
	});

	it('makes the first 3 edits free (FR-EDIT-05)', () => {
		expect([0, 1, 2, 3, 10].map((used) => editCost(used))).toEqual([0, 0, 0, 2, 2]);
	});
});
