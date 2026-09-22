// Credit accounting as pure functions (docs/SRS.md §4.7, TEST_PLAN rule T1).
// Nothing here touches a database, a clock or randomness: every function takes
// plain data and returns the exact bucket changes and ledger lines to write.
//
// The invariant every operation preserves:
//   Σ bucket.remaining == max(0, Σ ledger.amount)
// i.e. the credits in buckets always equal the ledger balance, except while the
// user owes credits after a clawback (then buckets are empty and the ledger is
// negative). Buckets never go below 0 or above what was granted.

export type BucketSource = 'subscription' | 'purchase' | 'grant';

export type Bucket = {
	id: string;
	source: BucketSource;
	granted: number;
	remaining: number;
	/** Epoch ms, or null for credits that never expire. */
	expiresAt: number | null;
};

export type LedgerType = 'grant' | 'reserve' | 'settle' | 'refund' | 'expire' | 'clawback';
export type LedgerLine = {type: LedgerType; amount: number; bucketId: string | null};
export type BucketChange = {id: string; remaining: number};

/** What an operation wants written: new bucket balances and ledger lines. */
export type CreditOp = {buckets: BucketChange[]; lines: LedgerLine[]};

/** Credits held by one job, per bucket, in the order they were taken. */
export type ReservationLine = {bucketId: string; amount: number};

export class InsufficientCredits extends Error {
	constructor(
		readonly required: number,
		readonly available: number,
	) {
		super(`Not enough credits: need ${required}, have ${available}`);
		this.name = 'InsufficientCredits';
	}
}

export class InvalidCreditAmount extends Error {
	constructor(amount: number) {
		super(`Credit amounts must be positive whole numbers (got ${amount})`);
		this.name = 'InvalidCreditAmount';
	}
}

function assertPositiveInt(amount: number) {
	if (!Number.isInteger(amount) || amount <= 0) throw new InvalidCreditAmount(amount);
}

const isExpired = (b: Bucket, now: number) => b.expiresAt !== null && b.expiresAt <= now;

/**
 * Buckets that can be spent, in spending order (FR-CRD-03):
 * subscription credits first, then soonest expiry, then oldest.
 */
export function spendOrder(buckets: readonly Bucket[], now: number): Bucket[] {
	return buckets
		.filter((b) => b.remaining > 0 && !isExpired(b, now))
		.sort((a, b) => {
			const sub = Number(b.source === 'subscription') - Number(a.source === 'subscription');
			if (sub !== 0) return sub;
			const ea = a.expiresAt ?? Number.POSITIVE_INFINITY;
			const eb = b.expiresAt ?? Number.POSITIVE_INFINITY;
			if (ea !== eb) return ea - eb;
			return Number(a.id > b.id) - Number(a.id < b.id);
		});
}

/** Credits the user can spend right now. */
export const available = (buckets: readonly Bucket[], now: number) =>
	spendOrder(buckets, now).reduce((sum, b) => sum + b.remaining, 0);

/**
 * Credits owed after a clawback: how far the ledger balance is below zero.
 * `ledgerBalance` is Σ ledger.amount.
 */
export const debtOf = (ledgerBalance: number) => Math.max(0, -ledgerBalance);

/**
 * Grants credits into a new bucket. If the user is in debt, the debt is paid
 * off first, so the new bucket starts with less remaining (never below 0).
 */
export function grant(
	amount: number,
	bucketId: string,
	ledgerBalance: number,
): {remaining: number; lines: LedgerLine[]} {
	assertPositiveInt(amount);
	return {
		remaining: Math.max(0, amount - debtOf(ledgerBalance)),
		lines: [{type: 'grant', amount, bucketId}],
	};
}

/**
 * Holds `amount` credits for a job (FR-CRD-04). Throws InsufficientCredits,
 * writing nothing, when the user can't afford it or owes credits.
 */
export function reserve(
	buckets: readonly Bucket[],
	amount: number,
	now: number,
	ledgerBalance: number,
): CreditOp & {reservation: ReservationLine[]} {
	assertPositiveInt(amount);
	const have = debtOf(ledgerBalance) > 0 ? 0 : available(buckets, now);
	if (have < amount) throw new InsufficientCredits(amount, have);

	let left = amount;
	const changes: BucketChange[] = [];
	const reservation: ReservationLine[] = [];
	for (const b of spendOrder(buckets, now)) {
		if (left === 0) break;
		const take = Math.min(b.remaining, left);
		left -= take;
		changes.push({id: b.id, remaining: b.remaining - take});
		reservation.push({bucketId: b.id, amount: take});
	}
	return {
		buckets: changes,
		lines: reservation.map((r) => ({type: 'reserve', amount: -r.amount, bucketId: r.bucketId})),
		reservation,
	};
}

/**
 * Ends a reservation: charges `actual` (never more than was reserved,
 * FR-CRD-05) and returns the rest to the buckets it came from, last-taken
 * first, so the soonest-expiring credits stay spent. `actual = 0` is a full
 * refund (FR-CRD-06).
 *
 * If the user owes credits (a clawback happened while the job ran), refunded
 * credits pay the debt first and only the rest refills buckets. The refund
 * line still names its bucket, so the job's hold is released exactly once.
 */
export function settle(
	buckets: readonly Bucket[],
	reservation: readonly ReservationLine[],
	actual: number,
	ledgerBalance: number,
): CreditOp & {charged: number; refunded: number} {
	if (!Number.isInteger(actual) || actual < 0) throw new InvalidCreditAmount(actual);
	const reserved = reservation.reduce((sum, r) => sum + r.amount, 0);
	const charged = Math.min(actual, reserved);
	let refundLeft = reserved - charged;
	let debtLeft = debtOf(ledgerBalance);

	const byId = new Map(buckets.map((b) => [b.id, b]));
	const remaining = new Map<string, number>();
	const lines: LedgerLine[] = [];
	for (const r of [...reservation].reverse()) {
		if (refundLeft === 0) break;
		const bucket = byId.get(r.bucketId);
		if (!bucket) throw new Error(`Unknown bucket ${r.bucketId} in reservation`);
		const back = Math.min(r.amount, refundLeft);
		refundLeft -= back;
		const toDebt = Math.min(back, debtLeft);
		debtLeft -= toDebt;
		if (back - toDebt > 0) remaining.set(r.bucketId, (remaining.get(r.bucketId) ?? bucket.remaining) + back - toDebt);
		lines.push({type: 'refund', amount: back, bucketId: r.bucketId});
	}
	return {
		buckets: [...remaining].map(([id, value]) => ({id, remaining: value})),
		lines,
		charged,
		refunded: reserved - charged,
	};
}

/**
 * Rebuilds what an UNSETTLED job holds from its ledger lines (reserve lines
 * minus refunds), in the order the credits were taken. Charged credits leave
 * no closing line, so callers must only settle a job once; the service
 * enforces that with job.chargedCredits in the same transaction.
 */
export function outstandingReservation(jobLines: readonly LedgerLine[]): ReservationLine[] {
	const held = new Map<string, number>();
	for (const line of jobLines) {
		if (line.bucketId === null) continue;
		// Reserve lines are negative (credits taken), refund lines positive (given back).
		if (line.type === 'reserve' || line.type === 'refund') {
			held.set(line.bucketId, (held.get(line.bucketId) ?? 0) - line.amount);
		}
	}
	return [...held].filter(([, amount]) => amount > 0).map(([bucketId, amount]) => ({bucketId, amount}));
}

/** Empties buckets whose expiry has passed (subscription periods ending). */
export function expire(buckets: readonly Bucket[], now: number): CreditOp {
	const expired = buckets.filter((b) => b.remaining > 0 && isExpired(b, now));
	return {
		buckets: expired.map((b) => ({id: b.id, remaining: 0})),
		lines: expired.map((b) => ({type: 'expire', amount: -b.remaining, bucketId: b.id})),
	};
}

/**
 * Takes back `amount` credits after a refund or chargeback (FR-CRD-09).
 * Credits are removed from the refunded payment's bucket first, then any
 * other bucket. Whatever can't be covered becomes debt (a ledger line with
 * no bucket), which blocks new jobs until it's paid off by a later grant.
 */
export function clawback(buckets: readonly Bucket[], amount: number, preferredBucketId?: string): CreditOp {
	assertPositiveInt(amount);
	const order = [...buckets]
		.filter((b) => b.remaining > 0)
		.sort((a, b) => Number(b.id === preferredBucketId) - Number(a.id === preferredBucketId));
	let left = amount;
	const changes: BucketChange[] = [];
	const lines: LedgerLine[] = [];
	for (const b of order) {
		if (left === 0) break;
		const take = Math.min(b.remaining, left);
		left -= take;
		changes.push({id: b.id, remaining: b.remaining - take});
		lines.push({type: 'clawback', amount: -take, bucketId: b.id});
	}
	if (left > 0) lines.push({type: 'clawback', amount: -left, bucketId: null});
	return {buckets: changes, lines};
}
