import {
	available,
	clawback as clawbackOp,
	debtOf,
	expire as expireOp,
	grant as grantOp,
	outstandingReservation,
	reserve as reserveOp,
	settle as settleOp,
	type Bucket,
	type CreditOp,
	type LedgerType,
} from '@kinetiq/domain';
import type {LedgerEntry, PageQuery} from '@kinetiq/shared';
import {Prisma} from './generated/prisma/client.js';
import {iso, paginate, type RepoDeps} from './repos/shared.js';

// Applies the pure credit functions (packages/domain/src/credits) to the
// database (FR-CRD-01…09).
// - Every operation runs in a SERIALIZABLE transaction, retried on conflict,
//   so two requests can never spend the same credits (FR-CRD-04).
// - Every ledger row carries a unique idempotency key derived from the
//   operation, so repeating an operation (a retried webhook, a re-run job)
//   is applied exactly once (FR-CRD-07).
// - A job is settled exactly once: job.chargedCredits is set in the same
//   transaction as the refund.

type Tx = Prisma.TransactionClient;

const MAX_ATTEMPTS = 8;

export class AlreadySettled extends Error {
	constructor(readonly jobId: string) {
		super(`Job ${jobId} is already settled`);
		this.name = 'AlreadySettled';
	}
}

function isSerializationFailure(error: unknown): boolean {
	if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return true;
	const text = String((error as {message?: unknown})?.message ?? '') + JSON.stringify(error ?? {});
	return text.includes('40001') || text.includes('could not serialize') || text.includes('40P01');
}

export function creditsService({db, ids, clock}: RepoDeps) {
	/** Runs `fn` in a SERIALIZABLE transaction, retrying with backoff when Postgres reports a conflict. */
	async function serializable<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
		for (let attempt = 1; ; attempt++) {
			try {
				return await db.$transaction(fn, {
					isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
					timeout: 15_000,
				});
			} catch (error) {
				if (attempt >= MAX_ATTEMPTS || !isSerializationFailure(error)) throw error;
				await new Promise((r) => setTimeout(r, 5 * 2 ** attempt + Math.random() * 20));
			}
		}
	}

	async function loadBuckets(tx: Tx, userId: string): Promise<Bucket[]> {
		const rows = await tx.creditBucket.findMany({where: {userId}, orderBy: {id: 'asc'}});
		return rows.map((b) => ({
			id: b.id,
			source: b.source,
			granted: b.granted,
			remaining: b.remaining,
			expiresAt: b.expiresAt?.getTime() ?? null,
		}));
	}

	async function ledgerBalance(tx: Tx, userId: string): Promise<number> {
		const {_sum} = await tx.creditLedger.aggregate({where: {userId}, _sum: {amount: true}});
		return _sum.amount ?? 0;
	}

	/**
	 * True if an operation with this key already wrote its ledger lines. Grant,
	 * reserve and clawback always write at least line #0, so an exact lookup on
	 * the unique index is enough (and fast).
	 */
	async function alreadyApplied(tx: Tx, key: string): Promise<boolean> {
		return (await tx.creditLedger.findUnique({where: {idempotencyKey: `${key}#0`}, select: {id: true}})) !== null;
	}

	async function write(tx: Tx, userId: string, op: CreditOp, key: string, jobId: string | null) {
		for (const change of op.buckets) {
			await tx.creditBucket.update({where: {id: change.id}, data: {remaining: change.remaining}});
		}
		if (op.lines.length === 0) return;
		const now = new Date(clock.now());
		await tx.creditLedger.createMany({
			data: op.lines.map((line, i) => ({
				id: ids.next('led'),
				userId,
				type: line.type as LedgerType,
				amount: line.amount,
				bucketId: line.bucketId,
				jobId,
				idempotencyKey: `${key}#${i}`,
				createdAt: now,
			})),
		});
	}

	return {
		/** What the user can spend now, and what they owe (FR-CRD-09). */
		async balance(userId: string): Promise<{available: number; debt: number}> {
			const [buckets, balance] = await Promise.all([loadBuckets(db, userId), ledgerBalance(db, userId)]);
			const debt = debtOf(balance);
			return {available: debt > 0 ? 0 : available(buckets, clock.now()), debt};
		},

		/**
		 * Adds credits (a purchase, a subscription period, or a manual grant).
		 * `key` must be unique per real-world event (e.g. the payment id), so a
		 * repeated webhook grants once (FR-CRD-01).
		 */
		grant(
			userId: string,
			input: {
				amount: number;
				source: Bucket['source'];
				key: string;
				expiresAt?: Date | null;
				subscriptionId?: string | null;
				paymentId?: string | null;
			},
		): Promise<{bucketId: string | null; granted: boolean}> {
			return serializable(async (tx) => {
				if (await alreadyApplied(tx, input.key)) return {bucketId: null, granted: false};
				const bucketId = ids.next('bkt');
				const g = grantOp(input.amount, bucketId, await ledgerBalance(tx, userId));
				await tx.creditBucket.create({
					data: {
						id: bucketId,
						userId,
						source: input.source,
						granted: input.amount,
						remaining: g.remaining,
						expiresAt: input.expiresAt ?? null,
						subscriptionId: input.subscriptionId ?? null,
						paymentId: input.paymentId ?? null,
						createdAt: new Date(clock.now()),
					},
				});
				await write(tx, userId, {buckets: [], lines: g.lines}, input.key, null);
				return {bucketId, granted: true};
			});
		},

		/**
		 * Holds credits for a job and records the amount on the job (FR-CRD-04).
		 * Throws InsufficientCredits (→ 402) and writes nothing when the user
		 * can't afford it or owes credits.
		 */
		reserveForJob(userId: string, jobId: string, amount: number): Promise<{reserved: number}> {
			return serializable(async (tx) => {
				const key = `reserve:${jobId}`;
				const job = await tx.job.findFirst({where: {id: jobId, userId}, select: {id: true, chargedCredits: true}});
				if (!job) throw new Error(`Job ${jobId} not found for this user`);
				if (await alreadyApplied(tx, key)) return {reserved: amount};
				const op = reserveOp(await loadBuckets(tx, userId), amount, clock.now(), await ledgerBalance(tx, userId));
				await write(tx, userId, op, key, jobId);
				await tx.job.update({where: {id: jobId}, data: {reservedCredits: amount}});
				return {reserved: amount};
			});
		},

		/**
		 * Charges the real cost (never more than reserved) and refunds the rest
		 * (FR-CRD-05). `actual = 0` refunds everything (FR-CRD-06). Settling a job
		 * twice throws AlreadySettled.
		 */
		settleJob(userId: string, jobId: string, actual: number): Promise<{charged: number; refunded: number}> {
			return serializable(async (tx) => {
				const job = await tx.job.findFirst({where: {id: jobId, userId}, select: {chargedCredits: true}});
				if (!job) throw new Error(`Job ${jobId} not found for this user`);
				if (job.chargedCredits !== null) throw new AlreadySettled(jobId);
				const jobLines = await tx.creditLedger.findMany({
					where: {jobId, userId},
					orderBy: {id: 'asc'},
					select: {type: true, amount: true, bucketId: true},
				});
				const op = settleOp(
					await loadBuckets(tx, userId),
					outstandingReservation(jobLines),
					actual,
					await ledgerBalance(tx, userId),
				);
				await write(tx, userId, op, `settle:${jobId}`, jobId);
				await tx.job.update({where: {id: jobId}, data: {chargedCredits: op.charged}});
				return {charged: op.charged, refunded: op.refunded};
			});
		},

		/**
		 * Takes credits back after a payment refund or chargeback (FR-CRD-09).
		 * Uncovered credits become debt, which blocks new jobs.
		 */
		clawback(userId: string, amount: number, key: string, preferredBucketId?: string): Promise<{applied: boolean}> {
			return serializable(async (tx) => {
				if (await alreadyApplied(tx, key)) return {applied: false};
				await write(tx, userId, clawbackOp(await loadBuckets(tx, userId), amount, preferredBucketId), key, null);
				return {applied: true};
			});
		},

		/** SYSTEM (cron): empties expired buckets for every user. Returns how many users were touched. */
		async systemExpireDue(): Promise<number> {
			const now = new Date(clock.now());
			const users = await db.creditBucket.findMany({
				where: {remaining: {gt: 0}, expiresAt: {lte: now}},
				distinct: ['userId'],
				select: {userId: true},
			});
			for (const {userId} of users) {
				await serializable(async (tx) => {
					const op = expireOp(await loadBuckets(tx, userId), clock.now());
					if (op.lines.length > 0) await write(tx, userId, op, `expire:${userId}:${ids.next('exp')}`, null);
				});
			}
			return users.length;
		},

		/**
		 * SYSTEM (cron, FR-CRD-08): refunds reservations older than `maxAgeMs`
		 * whose job is no longer running and was never settled.
		 */
		async systemRefundStale(maxAgeMs = 2 * 60 * 60 * 1000): Promise<number> {
			const stale = await db.job.findMany({
				where: {
					chargedCredits: null,
					reservedCredits: {gt: 0},
					status: {not: 'running'},
					createdAt: {lt: new Date(clock.now() - maxAgeMs)},
				},
				select: {id: true, userId: true},
			});
			let refunded = 0;
			for (const job of stale) {
				try {
					await this.settleJob(job.userId, job.id, 0);
					refunded++;
				} catch (error) {
					if (!(error instanceof AlreadySettled)) throw error;
				}
			}
			return refunded;
		},

		/** The user's ledger, newest first (GET /v1/billing/ledger). */
		ledger(userId: string, page: PageQuery) {
			return paginate(
				(args) => db.creditLedger.findMany({where: {userId, ...args.where}, orderBy: {id: 'desc'}, take: args.take}),
				page,
				(row): LedgerEntry => ({
					id: row.id,
					type: row.type,
					amount: row.amount,
					bucketId: row.bucketId,
					jobId: row.jobId,
					createdAt: iso(row.createdAt),
				}),
			);
		},
	};
}

export type CreditsService = ReturnType<typeof creditsService>;
