import {closeJob, creditsService} from '@kinetiq/db';
import {makeUser, resetDb, T0, testDb, testRepos} from '@kinetiq/db/testing';
import {PipelineError} from '../ports.js';
import {beforeEach, describe, expect, it} from 'vitest';
import {fakeProbe, testWorker} from '../testing/index.js';
import {CRON_TASKS, isCronTask} from './cron.js';
import {processGenerate} from './generate.js';
import {processMaintenance} from './maintenance.js';

// Worker processors against the real database, with a fixed clock (FR-GEN-02…11, FR-CRD-08).
const db = testDb();
let t: ReturnType<typeof testRepos>;
let userId: string;

beforeEach(async () => {
	await resetDb(db);
	t = testRepos(db);
	userId = (await makeUser(db)).id;
	await creditsService(t).grant(userId, {amount: 50, source: 'purchase', key: 'seed'});
});

/** A project with a queued job holding 20 credits, like POST /generate leaves it. */
async function queuedJob() {
	const project = await t.repos.projects.create(userId, {
		url: 'https://acme.com',
		durationSec: 30,
		ratio: '16:9',
		assetIds: [],
	});
	await t.repos.projects.setStatus(userId, project.id, 'generating');
	const job = (await t.repos.jobs.create(userId, project.id, {
		type: 'generate',
		reservedCredits: 0,
		deadlineMinutes: 20,
	}))!;
	await t.repos.credits.reserveForJob(userId, job.id, 20);
	return {jobId: job.id, projectId: project.id, userId};
}

const available = async () => (await t.repos.credits.balance(userId)).available;
const statusOf = async (projectId: string) => (await t.repos.projects.get(userId, projectId))?.status;

describe('processGenerate', () => {
	it('runs the pipeline, records steps, charges the real cost and refunds the rest', async () => {
		const w = testWorker({
			...t,
			pipeline: {
				async run(ctx) {
					await ctx.step(
						'research',
						async () => 'ok',
						() => 'Read 5 pages',
					);
					await ctx.progress('sceneCoder', 1, 3);
					await ctx.emit({type: 'credits.updated', total: 1});
					return {charge: 15};
				},
			},
		});
		const payload = await queuedJob();
		expect(await processGenerate(w.container, payload)).toBe('succeeded');

		const job = await t.repos.jobs.get(userId, payload.jobId);
		expect(job).toMatchObject({status: 'succeeded', chargedCredits: 15});
		expect(job?.steps.map((s) => [s.node, s.status])).toEqual([
			['research', 'done'],
			['sceneCoder', 'running'],
		]);
		expect(await available()).toBe(35);
		expect(await statusOf(payload.projectId)).toBe('done');
		expect(w.events.published.map((e) => e.event.type)).toEqual([
			'step.started',
			'step.done',
			'step.progress',
			'credits.updated',
			'job.finished',
			'credits.updated',
		]);
		expect(w.events.published[1]?.event).toMatchObject({summary: 'Read 5 pages'});
		expect(w.events.published[4]?.event).toEqual({
			type: 'job.finished',
			jobId: payload.jobId,
			status: 'succeeded',
			chargedCredits: 15,
			refunded: 5,
		});

		// Running the same queue job again (a BullMQ retry) does nothing.
		expect(await processGenerate(w.container, payload)).toBe('skipped');
		expect(await available()).toBe(35);
	});

	it('fails and refunds everything when the pipeline fails, showing only safe messages', async () => {
		const known = testWorker({
			...t,
			pipeline: {
				run: async (ctx) =>
					ctx.step('research', async () => {
						throw new PipelineError('DEGRADED', 'The website could not be read.');
					}),
			},
		});
		const a = await queuedJob();
		expect(await processGenerate(known.container, a)).toBe('failed');
		const failedA = await db.job.findUniqueOrThrow({where: {id: a.jobId}});
		expect(failedA).toMatchObject({status: 'failed', chargedCredits: 0});
		expect(failedA.error).toEqual({code: 'DEGRADED', message: 'The website could not be read.'});
		expect(known.events.published.map((e) => e.event.type)).toContain('step.failed');
		expect(await statusOf(a.projectId)).toBe('failed');

		const crash = testWorker({
			...t,
			pipeline: {
				run: async () => {
					throw new Error('secret internal detail');
				},
			},
		});
		const b = await queuedJob();
		expect(await processGenerate(crash.container, b)).toBe('failed');
		const failedB = await db.job.findUniqueOrThrow({where: {id: b.jobId}});
		expect(JSON.stringify(failedB.error)).not.toContain('secret');
		expect(await available()).toBe(50);
	});

	it('stops a running job that gets cancelled; the cancel refund is not repeated', async () => {
		const w = testWorker({
			...t,
			pipeline: {
				async run(ctx) {
					await ctx.step('research', async () => undefined);
					// The user cancels while the pipeline is still busy.
					await closeJob(t.repos, {...ctx.job}, {status: 'cancelled'});
					await new Promise((r) => setTimeout(r, 50));
					await ctx.step('designMd', async () => undefined);
					return {charge: 20};
				},
			},
		});
		const payload = await queuedJob();
		expect(await processGenerate(w.container, payload)).toBe('aborted');
		expect(await db.job.findUniqueOrThrow({where: {id: payload.jobId}})).toMatchObject({
			status: 'cancelled',
			chargedCredits: 0,
		});
		expect(await available()).toBe(50);
		expect(await statusOf(payload.projectId)).toBe('ready');
		expect(w.events.published.map((e) => e.event.type)).not.toContain('job.finished');
	});

	it('fails a job past its deadline and refunds it', async () => {
		const w = testWorker({
			...t,
			pipeline: {
				async run(ctx) {
					t.clock.advance(21 * 60_000);
					await new Promise((r) => setTimeout(r, 50));
					await ctx.step('research', async () => undefined);
					return {charge: 20};
				},
			},
		});
		const payload = await queuedJob();
		expect(await processGenerate(w.container, payload)).toBe('failed');
		const job = await db.job.findUniqueOrThrow({where: {id: payload.jobId}});
		expect(job).toMatchObject({status: 'failed', chargedCredits: 0});
		expect(job.error).toMatchObject({message: expect.stringMatching(/too long/)});
		expect(await available()).toBe(50);
	});

	it('fails an interrupted job (worker crashed mid-run) and ignores unknown or mismatched jobs', async () => {
		const w = testWorker({...t});
		const payload = await queuedJob();
		await t.repos.jobs.systemStart(payload.jobId);
		expect(await processGenerate(w.container, payload)).toBe('failed');
		expect(await available()).toBe(50);

		expect(await processGenerate(w.container, {...payload, jobId: 'job_missing01'})).toBe('skipped');
		const other = await queuedJob();
		expect(await processGenerate(w.container, {...other, userId: 'usr_someone1'})).toBe('skipped');
	});

	it('a pipeline that cannot start (no providers configured) fails and refunds', async () => {
		const w = testWorker({
			...t,
			pipeline: {
				run: async () => {
					throw new PipelineError('DEGRADED', 'Video generation is temporarily unavailable.');
				},
			},
		});
		const payload = await queuedJob();
		expect(await processGenerate(w.container, payload)).toBe('failed');
		expect(await available()).toBe(50);
		const job = await db.job.findUniqueOrThrow({where: {id: payload.jobId}});
		expect(job.error).toMatchObject({code: 'DEGRADED'});
	});
});

describe('cron tasks', () => {
	it('removes saved progress and working files of jobs that ended over a day ago', async () => {
		const w = testWorker({...t});
		await t.repos.credits.grant(userId, {amount: 100, source: 'purchase', key: 'cleanup'});
		const make = async (status: 'failed' | 'cancelled' | 'running') => {
			const payload = await queuedJob();
			if (status === 'running') await t.repos.jobs.systemStart(payload.jobId);
			else await t.repos.jobs.systemFinish(payload.jobId, status);
			await t.repos.checkpoints.save(payload.jobId, 'research', {completed: ['research']});
			w.storage.put(`u/${userId}/tmp/${payload.jobId}/still-0-0a.png`, new Uint8Array([1]), 'image/png');
			return payload.jobId;
		};
		const failed = await make('failed');
		const cancelled = await make('cancelled');
		const running = await make('running');

		// Inside the 24 h retry window nothing is touched.
		expect(await CRON_TASKS['cleanup-job-leftovers'].run(w.container)).toBe(0);
		t.clock.advance(25 * 60 * 60_000);
		expect(await CRON_TASKS['cleanup-job-leftovers'].run(w.container)).toBe(2);
		for (const jobId of [failed, cancelled]) {
			expect(await db.jobCheckpoint.findUnique({where: {jobId}})).toBeNull();
			expect(w.storage.has(`u/${userId}/tmp/${jobId}/still-0-0a.png`)).toBe(false);
		}
		// A job still running keeps everything.
		expect(await db.jobCheckpoint.findUnique({where: {jobId: running}})).not.toBeNull();
		expect(w.storage.has(`u/${userId}/tmp/${running}/still-0-0a.png`)).toBe(true);
		expect(await CRON_TASKS['cleanup-job-leftovers'].run(w.container)).toBe(0);
	});

	it('deadline sweep fails and refunds overdue jobs only', async () => {
		const w = testWorker({...t});
		const overdue = await queuedJob();
		t.clock.advance(21 * 60_000);
		const fresh = await queuedJob();
		expect(await CRON_TASKS['deadline-sweep'].run(w.container)).toBe(1);
		expect((await db.job.findUniqueOrThrow({where: {id: overdue.jobId}})).status).toBe('failed');
		expect((await db.job.findUniqueOrThrow({where: {id: fresh.jobId}})).status).toBe('queued');
		expect(await available()).toBe(30);
		expect(await CRON_TASKS['deadline-sweep'].run(w.container)).toBe(0);
	});

	it('refunds stale reservations after 2 hours (FR-CRD-08)', async () => {
		const w = testWorker({...t});
		const payload = await queuedJob();
		// The job ended but the process died before settling.
		await t.repos.jobs.systemFinish(payload.jobId, 'failed');
		expect(await CRON_TASKS['refund-stale'].run(w.container)).toBe(0);
		t.clock.advance(2 * 60 * 60_000 + 1);
		expect(await CRON_TASKS['refund-stale'].run(w.container)).toBe(1);
		expect(await available()).toBe(50);
	});

	it('expires ended subscription credits and purges old idempotency records', async () => {
		const w = testWorker({...t});
		await t.repos.credits.grant(userId, {
			amount: 100,
			source: 'subscription',
			key: 'sub1',
			expiresAt: new Date(T0 + 60_000),
		});
		expect(await available()).toBe(150);
		t.clock.advance(120_000);
		expect(await CRON_TASKS['expire-credits'].run(w.container)).toBe(1);
		expect(await available()).toBe(50);
		expect(await CRON_TASKS['purge-idempotency'].run(w.container)).toBeGreaterThanOrEqual(0);
	});

	it('deletes uploads nobody can use, and their files', async () => {
		const w = testWorker({...t});
		const make = async (status: 'pending' | 'rejected' | 'ready') => {
			const {asset, storageKey} = await t.repos.assets.createPending(userId, {
				kind: 'screenshot',
				mime: 'image/png',
				size: 3,
				filename: 'a.png',
			});
			if (status === 'ready') await t.repos.assets.markReady(userId, asset.id);
			if (status === 'rejected') await t.repos.assets.markRejected(userId, asset.id);
			w.storage.put(storageKey, new Uint8Array([1, 2, 3]), 'image/png');
			return {id: asset.id, storageKey};
		};
		const oldPending = await make('pending');
		const oldReady = await make('ready');
		t.clock.advance(8 * 24 * 60 * 60_000);
		const rejected = await make('rejected');
		const newPending = await make('pending');
		const newReady = await make('ready');

		expect(await CRON_TASKS['cleanup-uploads'].run(w.container)).toBe(3);
		for (const gone of [oldPending, oldReady, rejected]) expect(w.storage.has(gone.storageKey)).toBe(false);
		for (const kept of [newPending, newReady]) expect(w.storage.has(kept.storageKey)).toBe(true);
		expect(await db.asset.count()).toBe(2);
		expect(await CRON_TASKS['cleanup-uploads'].run(w.container)).toBe(0);
	});

	it('knows its task names', () => {
		expect(isCronTask('deadline-sweep')).toBe(true);
		expect(isCronTask('toString')).toBe(false);
	});
});

describe('processMaintenance', () => {
	async function video(mime: 'video/mp4' | 'image/png' = 'video/mp4') {
		const {asset, storageKey} = await t.repos.assets.createPending(userId, {
			kind: mime === 'video/mp4' ? 'recording' : 'screenshot',
			mime,
			size: 3,
			filename: 'x',
		});
		await t.repos.assets.markProcessing(userId, asset.id);
		return {assetId: asset.id, storageKey};
	}

	it('marks a good video ready with its length', async () => {
		const probe = fakeProbe({durationSec: 30, video: {codec: 'h264', width: 1280, height: 720}, formats: ['mp4']});
		const w = testWorker({...t, probe});
		const {assetId, storageKey} = await video();
		expect(await processMaintenance(w.container, {kind: 'probe-asset', userId, assetId})).toBe('ready');
		expect((await db.asset.findUniqueOrThrow({where: {id: assetId}})).durationSec).toBe(30);
		expect(probe.urls[0]).toContain(storageKey);
		// Probing again is a no-op.
		expect(await processMaintenance(w.container, {kind: 'probe-asset', userId, assetId})).toBe('skipped');
	});

	it('rejects and deletes a video that breaks the rules or cannot be read', async () => {
		for (const facts of [
			{durationSec: 600, video: {codec: 'h264', width: 1280, height: 720}, formats: ['mp4']},
			new Error('moov atom not found'),
		]) {
			const w = testWorker({...t, probe: fakeProbe(facts)});
			const {assetId, storageKey} = await video();
			w.storage.put(storageKey, new Uint8Array([1]), 'video/mp4');
			expect(await processMaintenance(w.container, {kind: 'probe-asset', userId, assetId})).toMatch(/^rejected/);
			expect((await db.asset.findUniqueOrThrow({where: {id: assetId}})).status).toBe('rejected');
			expect(w.storage.has(storageKey)).toBe(false);
		}
	});

	it("skips other users' files and non-videos", async () => {
		const w = testWorker({...t});
		const {assetId} = await video();
		expect(await processMaintenance(w.container, {kind: 'probe-asset', userId: 'usr_someone1', assetId})).toBe(
			'skipped',
		);
		const png = await video('image/png');
		expect(await processMaintenance(w.container, {kind: 'probe-asset', userId, assetId: png.assetId})).toBe('skipped');
	});

	it('deletes every file of a deleted account, and only theirs', async () => {
		const w = testWorker({...t});
		w.storage.put(`u/${userId}/a`, new Uint8Array([1]), 'image/png');
		w.storage.put(`u/${userId}/b`, new Uint8Array([1]), 'image/png');
		w.storage.put('u/usr_other001/a', new Uint8Array([1]), 'image/png');
		expect(await processMaintenance(w.container, {kind: 'purge-user-files', userId})).toBe('deleted 2');
		expect(w.storage.has('u/usr_other001/a')).toBe(true);
	});
});
