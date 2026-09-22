import {InsufficientCredits} from '@kinetiq/domain';
import fc from 'fast-check';
import {beforeEach, describe, expect, it} from 'vitest';
import {AlreadySettled} from './credits.js';
import {makeUser, resetDb, T0, testDb, testRepos} from './testing/index.js';

// Credits against a real Postgres (FR-CRD-01…09).
const db = testDb();

let t: ReturnType<typeof testRepos>;
let userId: string;

beforeEach(async () => {
	await resetDb(db);
	t = testRepos(db);
	userId = (await makeUser(db)).id;
});

const credits = () => t.repos.credits;

async function newJob(owner = userId) {
	const project = await t.repos.projects.create(owner, {
		url: 'https://acme.com',
		durationSec: 30,
		ratio: '16:9',
		assetIds: [],
	});
	const job = await t.repos.jobs.create(owner, project.id, {type: 'generate', reservedCredits: 0, deadlineMinutes: 20});
	return job!.id;
}

/** Checks the stored books balance: Σ remaining == max(0, Σ ledger), buckets within bounds. */
async function expectBooksBalance(owner = userId) {
	const buckets = await db.creditBucket.findMany({where: {userId: owner}});
	const {_sum} = await db.creditLedger.aggregate({where: {userId: owner}, _sum: {amount: true}});
	const ledger = _sum.amount ?? 0;
	expect(buckets.reduce((s, b) => s + b.remaining, 0)).toBe(Math.max(0, ledger));
	for (const b of buckets) {
		expect(b.remaining).toBeGreaterThanOrEqual(0);
		expect(b.remaining).toBeLessThanOrEqual(b.granted);
	}
}

describe('grant', () => {
	it('adds credits once per key (a repeated webhook grants once, FR-CRD-01)', async () => {
		expect((await credits().grant(userId, {amount: 60, source: 'purchase', key: 'pay:1'})).granted).toBe(true);
		expect((await credits().grant(userId, {amount: 60, source: 'purchase', key: 'pay:1'})).granted).toBe(false);
		expect(await credits().balance(userId)).toEqual({available: 60, debt: 0});
		await expectBooksBalance();
	});
});

describe('reserve and settle', () => {
	it('spends subscription credits first and records the reservation on the job (FR-CRD-03/04)', async () => {
		await credits().grant(userId, {amount: 50, source: 'purchase', key: 'p'});
		await credits().grant(userId, {amount: 10, source: 'subscription', key: 's', expiresAt: new Date(T0 + 86_400_000)});
		const jobId = await newJob();
		await credits().reserveForJob(userId, jobId, 25);
		const buckets = await db.creditBucket.findMany({where: {userId}, orderBy: {source: 'asc'}});
		expect(buckets.map((b) => [b.source, b.remaining])).toEqual([
			['subscription', 0],
			['purchase', 35],
		]);
		expect((await db.job.findUnique({where: {id: jobId}}))?.reservedCredits).toBe(25);
		expect(await credits().balance(userId)).toEqual({available: 35, debt: 0});
		await expectBooksBalance();
	});

	it('refuses without enough credits and writes nothing (402, FR-CRD-04)', async () => {
		await credits().grant(userId, {amount: 10, source: 'purchase', key: 'p'});
		const jobId = await newJob();
		await expect(credits().reserveForJob(userId, jobId, 11)).rejects.toBeInstanceOf(InsufficientCredits);
		expect(await db.creditLedger.count({where: {jobId}})).toBe(0);
		expect(await credits().balance(userId)).toEqual({available: 10, debt: 0});
	});

	it('reserving twice for the same job only holds once', async () => {
		await credits().grant(userId, {amount: 50, source: 'purchase', key: 'p'});
		const jobId = await newJob();
		await credits().reserveForJob(userId, jobId, 20);
		await credits().reserveForJob(userId, jobId, 20);
		expect(await credits().balance(userId)).toEqual({available: 30, debt: 0});
	});

	it('charges the real cost and refunds the rest (FR-CRD-05)', async () => {
		await credits().grant(userId, {amount: 50, source: 'purchase', key: 'p'});
		const jobId = await newJob();
		await credits().reserveForJob(userId, jobId, 23);
		expect(await credits().settleJob(userId, jobId, 20)).toEqual({charged: 20, refunded: 3});
		expect(await credits().balance(userId)).toEqual({available: 30, debt: 0});
		expect((await db.job.findUnique({where: {id: jobId}}))?.chargedCredits).toBe(20);
		await expectBooksBalance();
	});

	it('never settles a job twice (no double refund)', async () => {
		await credits().grant(userId, {amount: 50, source: 'purchase', key: 'p'});
		const jobId = await newJob();
		await credits().reserveForJob(userId, jobId, 20);
		await credits().settleJob(userId, jobId, 20);
		await expect(credits().settleJob(userId, jobId, 0)).rejects.toBeInstanceOf(AlreadySettled);
		expect(await credits().balance(userId)).toEqual({available: 30, debt: 0});
	});

	it('refunds everything when a job fails (FR-CRD-06)', async () => {
		await credits().grant(userId, {amount: 50, source: 'purchase', key: 'p'});
		const jobId = await newJob();
		await credits().reserveForJob(userId, jobId, 20);
		expect(await credits().settleJob(userId, jobId, 0)).toEqual({charged: 0, refunded: 20});
		expect(await credits().balance(userId)).toEqual({available: 50, debt: 0});
	});

	it("can't touch another user's job", async () => {
		const other = (await makeUser(db)).id;
		const theirJob = await newJob(other);
		await credits().grant(userId, {amount: 50, source: 'purchase', key: 'p'});
		await expect(credits().reserveForJob(userId, theirJob, 5)).rejects.toThrow('not found');
		await expect(credits().settleJob(userId, theirJob, 0)).rejects.toThrow('not found');
	});
});

describe('two requests racing for the same credits (FR-CRD-04)', () => {
	it('lets exactly one win, 50 times in a row', async () => {
		for (let round = 0; round < 50; round++) {
			const owner = (await makeUser(db)).id;
			await credits().grant(owner, {amount: 20, source: 'purchase', key: `race:${round}`});
			const [a, b] = [await newJob(owner), await newJob(owner)];
			const results = await Promise.allSettled([
				credits().reserveForJob(owner, a, 20),
				credits().reserveForJob(owner, b, 20),
			]);
			expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
			const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
			expect(failed.reason).toBeInstanceOf(InsufficientCredits);
			expect(await credits().balance(owner)).toEqual({available: 0, debt: 0});
			await expectBooksBalance(owner);
		}
	}, 120_000);
});

describe('expiry, clawback and stale reservations', () => {
	it('expires subscription credits at period end', async () => {
		await credits().grant(userId, {amount: 100, source: 'subscription', key: 's', expiresAt: new Date(T0 + 1000)});
		await credits().grant(userId, {amount: 5, source: 'purchase', key: 'p'});
		expect(await credits().systemExpireDue()).toBe(0);
		t.clock.advance(1000);
		expect(await credits().balance(userId)).toEqual({available: 5, debt: 0}); // expired credits aren't spendable
		expect(await credits().systemExpireDue()).toBe(1);
		expect(await db.creditLedger.count({where: {userId, type: 'expire'}})).toBe(1);
		await expectBooksBalance();
	});

	it('claws back refunds, blocks new jobs while in debt, and a later purchase pays the debt (FR-CRD-09)', async () => {
		await credits().grant(userId, {amount: 60, source: 'purchase', key: 'pay:1'});
		const spent = await newJob();
		await credits().reserveForJob(userId, spent, 40);
		await credits().settleJob(userId, spent, 40);
		// The 60-credit payment is charged back after 40 were spent.
		expect((await credits().clawback(userId, 60, 'refund:pay:1')).applied).toBe(true);
		expect((await credits().clawback(userId, 60, 'refund:pay:1')).applied).toBe(false); // repeated webhook
		expect(await credits().balance(userId)).toEqual({available: 0, debt: 40});
		await expect(credits().reserveForJob(userId, await newJob(), 1)).rejects.toBeInstanceOf(InsufficientCredits);
		await credits().grant(userId, {amount: 100, source: 'purchase', key: 'pay:2'});
		expect(await credits().balance(userId)).toEqual({available: 60, debt: 0});
		await expectBooksBalance();
	});

	it('refunds stale reservations of jobs that are not running (FR-CRD-08)', async () => {
		await credits().grant(userId, {amount: 100, source: 'purchase', key: 'p'});
		const stale = await newJob();
		const running = await newJob();
		const settled = await newJob();
		for (const j of [stale, running, settled]) await credits().reserveForJob(userId, j, 10);
		await db.job.update({where: {id: running}, data: {status: 'running'}});
		await credits().settleJob(userId, settled, 10);
		expect(await credits().systemRefundStale()).toBe(0); // too young
		t.clock.advance(2 * 60 * 60 * 1000 + 1);
		await db.job.updateMany({data: {createdAt: new Date(T0 - 1)}});
		expect(await credits().systemRefundStale()).toBe(1);
		expect(await credits().balance(userId)).toEqual({available: 80, debt: 0});
		await expectBooksBalance();
	});

	it('lists only your own ledger, newest first', async () => {
		await credits().grant(userId, {amount: 10, source: 'purchase', key: 'a'});
		await credits().grant(userId, {amount: 20, source: 'purchase', key: 'b'});
		await credits().grant((await makeUser(db)).id, {amount: 99, source: 'purchase', key: 'c'});
		const page = await credits().ledger(userId, {limit: 1});
		expect(page.items).toMatchObject([{type: 'grant', amount: 20}]);
		const next = await credits().ledger(userId, {limit: 5, cursor: page.nextCursor ?? undefined});
		expect(next.items).toMatchObject([{type: 'grant', amount: 10}]);
	});
});

describe('random sequences keep the stored books balanced (FR-CRD-07)', () => {
	type Op = {kind: 'grant' | 'reserve' | 'settle' | 'clawback'; amount: number};
	const op = fc.record({
		kind: fc.constantFrom<Op['kind']>('grant', 'reserve', 'settle', 'clawback'),
		amount: fc.integer({min: 1, max: 80}),
	});

	it('holds after every step', async () => {
		let run = 0;
		await fc.assert(
			fc.asyncProperty(fc.array(op, {minLength: 1, maxLength: 10}), async (ops) => {
				const owner = (await makeUser(db)).id;
				const open: string[] = [];
				let i = 0;
				for (const o of ops) {
					const key = `r${run}:${i++}`;
					if (o.kind === 'grant') await credits().grant(owner, {amount: o.amount, source: 'purchase', key});
					if (o.kind === 'clawback') await credits().clawback(owner, o.amount, key);
					if (o.kind === 'reserve') {
						const job = await newJob(owner);
						try {
							await credits().reserveForJob(owner, job, o.amount);
							open.push(job);
						} catch (e) {
							expect(e).toBeInstanceOf(InsufficientCredits);
						}
					}
					if (o.kind === 'settle' && open.length > 0) await credits().settleJob(owner, open.shift()!, o.amount % 30);
					await expectBooksBalance(owner);
				}
				run++;
			}),
			{numRuns: 25},
		);
	}, 120_000);
});
