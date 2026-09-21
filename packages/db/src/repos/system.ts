import {PlanCode, type CreditBucket} from '@kinetiq/shared';
import type {z} from 'zod';
import {iso, isoOrNull, isUniqueViolation, json, type RepoDeps} from './shared.js';

// Accounts, idempotency, webhook dedup and feature flags.

export function accountsRepo({db, clock}: RepoDeps) {
	return {
		async getProfile(userId: string) {
			const user = await db.user.findUnique({
				where: {id: userId},
				select: {id: true, email: true, name: true, image: true, role: true},
			});
			if (!user) return null;
			const sub = await db.subscription.findFirst({
				where: {userId, status: {in: ['active', 'past_due']}},
				orderBy: {currentPeriodEnd: 'desc'},
			});
			return {
				user,
				plan: sub
					? {code: PlanCode.parse(sub.planCode), status: sub.status, currentPeriodEnd: iso(sub.currentPeriodEnd)}
					: null,
			};
		},

		/** Buckets with credits left that haven't expired (FR-CRD-02). */
		async usableBuckets(userId: string): Promise<z.infer<typeof CreditBucket>[]> {
			const now = new Date(clock.now());
			const rows = await db.creditBucket.findMany({
				where: {userId, remaining: {gt: 0}, OR: [{expiresAt: null}, {expiresAt: {gt: now}}]},
				orderBy: [{expiresAt: {sort: 'asc', nulls: 'last'}}, {id: 'asc'}],
			});
			return rows.map((b) => ({
				id: b.id,
				source: b.source === 'subscription' ? 'subscription' : 'purchase',
				remaining: b.remaining,
				expiresAt: isoOrNull(b.expiresAt),
			}));
		},

		/** Balance = sum of the append-only ledger (FR-CRD-07). */
		async ledgerBalance(userId: string): Promise<number> {
			const {_sum} = await db.creditLedger.aggregate({where: {userId}, _sum: {amount: true}});
			return _sum.amount ?? 0;
		},

		/** Deletes the account and everything it owns (NFR-LEG-02). Storage cleanup is queued by the caller. */
		async deleteUser(userId: string): Promise<boolean> {
			const {count} = await db.user.deleteMany({where: {id: userId}});
			return count > 0;
		},
	};
}

export function idempotencyRepo({db, ids, clock}: RepoDeps) {
	return {
		/** Scoped by user: one user can never read another's stored response (NFR-SEC-16). */
		async find(userId: string, key: string) {
			const row = await db.idempotencyRecord.findUnique({where: {userId_key: {userId, key}}});
			if (!row || row.expiresAt.getTime() <= clock.now()) return null;
			return {requestHash: row.requestHash, status: row.responseStatus, body: row.responseBody};
		},

		/** Returns false if a response for this key was already saved (a concurrent duplicate). */
		async save(
			userId: string,
			key: string,
			record: {requestHash: string; status: number; body: unknown; ttlHours?: number},
		): Promise<boolean> {
			const now = clock.now();
			try {
				await db.idempotencyRecord.create({
					data: {
						id: ids.next('idm'),
						userId,
						key,
						requestHash: record.requestHash,
						responseStatus: record.status,
						responseBody: json(record.body),
						createdAt: new Date(now),
						expiresAt: new Date(now + (record.ttlHours ?? 24) * 3_600_000),
					},
				});
				return true;
			} catch (error) {
				if (isUniqueViolation(error)) return false;
				throw error;
			}
		},

		/** SYSTEM (cron): drop expired records. */
		async systemPurgeExpired(): Promise<number> {
			const {count} = await db.idempotencyRecord.deleteMany({where: {expiresAt: {lte: new Date(clock.now())}}});
			return count;
		},
	};
}

export function webhookEventsRepo({db, ids, clock}: RepoDeps) {
	return {
		/**
		 * Records a provider event. Returns true the first time, false for
		 * duplicates, so the caller processes each event exactly once (NFR-SEC-04).
		 */
		async recordOnce(provider: string, eventId: string, type: string): Promise<boolean> {
			try {
				await db.webhookEvent.create({
					data: {id: ids.next('whe'), provider, eventId, type, receivedAt: new Date(clock.now())},
				});
				return true;
			} catch (error) {
				if (isUniqueViolation(error)) return false;
				throw error;
			}
		},

		async markProcessed(provider: string, eventId: string) {
			await db.webhookEvent.update({
				where: {provider_eventId: {provider, eventId}},
				data: {processedAt: new Date(clock.now())},
			});
		},
	};
}

export function featureFlagsRepo({db}: RepoDeps) {
	return {
		async get<T>(key: string, fallback: T): Promise<T> {
			const row = await db.featureFlag.findUnique({where: {key}});
			return row ? (row.value as T) : fallback;
		},

		async set(key: string, value: unknown) {
			await db.featureFlag.upsert({where: {key}, create: {key, value: json(value)}, update: {value: json(value)}});
		},
	};
}
