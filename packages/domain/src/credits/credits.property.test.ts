import fc from 'fast-check';
import {describe, expect, it} from 'vitest';
import {
	available,
	clawback,
	expire,
	grant,
	InsufficientCredits,
	outstandingReservation,
	reserve,
	settle,
	type Bucket,
	type CreditOp,
	type LedgerLine,
} from './credits.js';

// FR-CRD-07 as a property: after ANY random sequence of grants, reservations,
// settlements, refunds, expiries and clawbacks, the books still balance.

type Op =
	| {kind: 'grant'; amount: number; source: 'subscription' | 'purchase'; ttl: number | null}
	| {kind: 'reserve'; amount: number}
	| {kind: 'settle'; pick: number; actual: number}
	| {kind: 'tick'; ms: number}
	| {kind: 'clawback'; amount: number};

const opArb: fc.Arbitrary<Op> = fc.oneof(
	fc.record({
		kind: fc.constant('grant' as const),
		amount: fc.integer({min: 1, max: 200}),
		source: fc.constantFrom('subscription' as const, 'purchase' as const),
		ttl: fc.option(fc.integer({min: 1, max: 5000}), {nil: null}),
	}),
	fc.record({kind: fc.constant('reserve' as const), amount: fc.integer({min: 1, max: 120})}),
	fc.record({kind: fc.constant('settle' as const), pick: fc.nat(), actual: fc.integer({min: 0, max: 150})}),
	fc.record({kind: fc.constant('tick' as const), ms: fc.integer({min: 1, max: 3000})}),
	fc.record({kind: fc.constant('clawback' as const), amount: fc.integer({min: 1, max: 150})}),
);

type Entry = LedgerLine & {jobId: string | null};

function run(ops: Op[]) {
	let now = 0;
	let buckets: Bucket[] = [];
	const ledger: Entry[] = [];
	const activeJobs: string[] = [];
	let seq = 0;
	const balance = () => ledger.reduce((s, l) => s + l.amount, 0);

	const apply = (op: CreditOp, jobId: string | null) => {
		for (const change of op.buckets) {
			buckets = buckets.map((b) => (b.id === change.id ? {...b, remaining: change.remaining} : b));
		}
		ledger.push(...op.lines.map((l) => ({...l, jobId})));
	};

	const check = () => {
		const inBuckets = buckets.reduce((s, b) => s + b.remaining, 0);
		// Reserved credits are already out of both the buckets and the ledger balance,
		// so the credits in buckets always equal the ledger balance, or 0 while in debt.
		expect(inBuckets).toBe(Math.max(0, balance()));
		for (const b of buckets) {
			expect(b.remaining).toBeGreaterThanOrEqual(0);
			expect(b.remaining).toBeLessThanOrEqual(b.granted);
		}
		for (const l of ledger) {
			expect(Number.isInteger(l.amount) && l.amount !== 0).toBe(true);
		}
	};

	for (const op of ops) {
		switch (op.kind) {
			case 'grant': {
				const id = `b${seq++}`;
				const g = grant(op.amount, id, balance());
				buckets.push({
					id,
					source: op.source,
					granted: op.amount,
					remaining: g.remaining,
					expiresAt: op.ttl === null ? null : now + op.ttl,
				});
				ledger.push(...g.lines.map((l) => ({...l, jobId: null})));
				break;
			}
			case 'reserve': {
				const before = available(buckets, now);
				try {
					const job = `j${seq++}`;
					const r = reserve(buckets, op.amount, now, balance());
					apply(r, job);
					activeJobs.push(job);
					expect(available(buckets, now)).toBe(before - op.amount);
				} catch (e) {
					expect(e).toBeInstanceOf(InsufficientCredits);
					expect(available(buckets, now)).toBe(before); // a refused reserve changes nothing
				}
				break;
			}
			case 'settle': {
				if (activeJobs.length === 0) break;
				const job = activeJobs.splice(op.pick % activeJobs.length, 1)[0]!;
				const reservation = outstandingReservation(ledger.filter((l) => l.jobId === job));
				const reserved = reservation.reduce((s, r) => s + r.amount, 0);
				const s = settle(buckets, reservation, op.actual, balance());
				expect(s.charged).toBe(Math.min(op.actual, reserved));
				expect(s.charged + s.refunded).toBe(reserved);
				apply(s, job);
				// The job is now settled; the service marks it (job.chargedCredits) in the same
				// transaction so it can never be settled again (tested in the db package).
				break;
			}
			case 'tick':
				now += op.ms;
				apply(expire(buckets, now), null);
				break;
			case 'clawback':
				apply(clawback(buckets, op.amount), null);
				break;
		}
		check();
	}
}

describe('credit ledger invariants (property-based)', () => {
	it('always balances: buckets = max(0, ledger), never negative, never above granted', () => {
		fc.assert(
			fc.property(fc.array(opArb, {maxLength: 60}), (ops) => {
				run(ops);
			}),
			{numRuns: 1000},
		);
	});
});
