// Test helpers for integration tests (never imported by production code).
// The test database is created fresh from the migrations by
// tooling/int-db-setup.ts before the integration suite runs.
import {FixedClock, SeqId} from '@kinetiq/domain/testing';
import {inject} from 'vitest';
import {createDb, type Db} from '../client.js';
import {createRepos} from '../index.js';

declare module 'vitest' {
	export interface ProvidedContext {
		databaseUrl: string;
	}
}

let shared: Db | undefined;

/** One client per test file, connected to the throwaway test database. */
export function testDb(): Db {
	shared ??= createDb(inject('databaseUrl'), 4);
	return shared;
}

/** Empties every table (keeps the schema). TRUNCATE doesn't fire the ledger's no-update trigger. */
export async function resetDb(db: Db): Promise<void> {
	const tables = await db.$queryRaw<{tablename: string}[]>`
		SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
	const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
	if (list) await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export const T0 = Date.UTC(2026, 8, 21, 10, 0, 0);

/** Repos wired to a fixed clock and predictable ids. */
export function testRepos(db: Db = testDb()) {
	const clock = new FixedClock(T0);
	const ids = new SeqId();
	return {db, clock, ids, repos: createRepos({db, clock, ids})};
}

let userSeq = 0;

export async function makeUser(db: Db, overrides: {id?: string; email?: string; role?: 'user' | 'admin'} = {}) {
	userSeq += 1;
	const n = String(userSeq).padStart(8, '0');
	return db.user.create({
		data: {
			id: overrides.id ?? `usr_${n}`,
			email: overrides.email ?? `user${n}@example.com`,
			name: `User ${n}`,
			emailVerified: true,
			role: overrides.role ?? 'user',
		},
	});
}

export async function grantCredits(db: Db, userId: string, amount: number, key: string) {
	const bucketId = `bkt_${key.padEnd(8, '0')}`;
	await db.creditBucket.create({
		data: {id: bucketId, userId, source: 'purchase', granted: amount, remaining: amount},
	});
	await db.creditLedger.create({
		data: {id: `led_${key.padEnd(8, '0')}`, userId, type: 'grant', amount, bucketId, idempotencyKey: `grant:${key}`},
	});
	return bucketId;
}
