import {beforeEach, describe, expect, it} from 'vitest';
import {grantCredits, makeUser, resetDb, testDb, testRepos} from './testing/index.js';

// Database-level safety rules (hand-written in the init migration).
// These hold even if application code has a bug.
const db = testDb();

beforeEach(async () => {
	await resetDb(db);
});

async function projectRow(overrides: {ratio?: string; durationSec?: number} = {}) {
	const user = await makeUser(db);
	return db.project.create({
		data: {
			id: `prj_${Math.random().toString(36).slice(2, 12)}`,
			userId: user.id,
			url: 'https://acme.com',
			durationSec: overrides.durationSec ?? 30,
			ratio: overrides.ratio ?? '16:9',
		},
	});
}

describe('migrations', () => {
	it('applied cleanly (tables exist)', async () => {
		const tables = await db.$queryRaw<{tablename: string}[]>`
			SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
		expect(tables.map((t) => t.tablename)).toEqual(
			expect.arrayContaining(['user', 'project', 'job', 'credit_ledger', 'credit_bucket', 'webhook_event']),
		);
	});
});

describe('CHECK constraints', () => {
	it('only allows supported ratios and durations (FR-PRJ-01)', async () => {
		await expect(projectRow({ratio: '4:3'})).rejects.toThrow(/project_ratio_check/);
		await expect(projectRow({durationSec: 60})).rejects.toThrow(/project_duration_check/);
		await expect(projectRow()).resolves.toBeTruthy();
	});

	it('only allows safe upload types (NFR-SEC-10)', async () => {
		const user = await makeUser(db);
		await expect(
			db.asset.create({
				data: {
					id: 'ast_svg00001',
					userId: user.id,
					kind: 'logo',
					mime: 'image/svg+xml',
					size: 10,
					filename: 'x.svg',
					storageKey: 'k1',
				},
			}),
		).rejects.toThrow(/asset_mime_check/);
	});

	it('never lets a bucket go negative or above what was granted', async () => {
		const user = await makeUser(db);
		const bucketId = await grantCredits(db, user.id, 50, 'b1');
		await expect(db.creditBucket.update({where: {id: bucketId}, data: {remaining: -1}})).rejects.toThrow(
			/credit_bucket_remaining_check/,
		);
		await expect(db.creditBucket.update({where: {id: bucketId}, data: {remaining: 51}})).rejects.toThrow(
			/credit_bucket_remaining_check/,
		);
	});

	it('enforces the sign of each ledger entry type', async () => {
		const user = await makeUser(db);
		const entry = (type: 'grant' | 'reserve' | 'settle', amount: number, key: string) =>
			db.creditLedger.create({data: {id: `led_${key}`, userId: user.id, type, amount, idempotencyKey: key}});
		await expect(entry('grant', -5, 'k0000001')).rejects.toThrow(/credit_ledger_amount_check/);
		await expect(entry('reserve', 5, 'k0000002')).rejects.toThrow(/credit_ledger_amount_check/);
		await expect(entry('settle', 0, 'k0000003')).rejects.toThrow(/credit_ledger_amount_check/);
		await expect(entry('settle', -2, 'k0000004')).resolves.toBeTruthy();
	});

	it('keeps charged credits within the reservation', async () => {
		const {repos} = testRepos(db);
		const user = await makeUser(db);
		const project = await repos.projects.create(user.id, {
			url: 'https://acme.com',
			durationSec: 30,
			ratio: '16:9',
			assetIds: [],
		});
		const job = await repos.jobs.create(user.id, project.id, {
			type: 'generate',
			reservedCredits: 20,
			deadlineMinutes: 20,
		});
		await expect(db.job.update({where: {id: job?.id ?? ''}, data: {chargedCredits: 21}})).rejects.toThrow(
			/job_charged_check/,
		);
	});
});

describe('credit ledger is append-only (FR-CRD-07)', () => {
	it('blocks updates to ledger rows', async () => {
		const user = await makeUser(db);
		await grantCredits(db, user.id, 50, 'b2');
		await expect(db.creditLedger.updateMany({where: {userId: user.id}, data: {amount: 5000}})).rejects.toThrow(
			/append-only/,
		);
	});

	it('rejects a second entry with the same idempotency key (exactly-once)', async () => {
		const user = await makeUser(db);
		await grantCredits(db, user.id, 50, 'b3');
		await expect(
			db.creditLedger.create({
				data: {id: 'led_dup00001', userId: user.id, type: 'grant', amount: 50, idempotencyKey: 'grant:b3'},
			}),
		).rejects.toThrow();
	});
});
