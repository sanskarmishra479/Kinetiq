import {creditsService, createIdGenerator} from '@kinetiq/db';
import {resetDb, testDb} from '@kinetiq/db/testing';
import {JobResponse} from '@kinetiq/shared';
import type {AddressInfo} from 'node:net';
import type TestAgent from 'supertest/lib/agent.js';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {loginAs, testApi, WEB} from '../testing/index.js';

// Generate, jobs, cancel and live events (FR-GEN-02…10, docs/API.md §6, §8).
const db = testDb();
const credits = creditsService({db, ids: createIdGenerator(), clock: {now: () => Date.now()}});

type User = {agent: TestAgent; userId: string; cookie: string};
let api: ReturnType<typeof testApi>;
let alice: User;
let bob: User;
let keySeq = 0;

beforeEach(async () => {
	await resetDb(db);
	api = testApi({db, app: {sse: {maxPerUser: 2, heartbeatMs: 50, leaseMs: 1000}}});
	alice = await loginAs(api, 'alice@acme.com');
	bob = await loginAs(api, 'bob@acme.com');
});

/** A project whose setup is finished (15 s, no voiceover → 10 credits). */
async function readyProject(who: User = alice) {
	const res = await who.agent
		.post('/v1/projects')
		.set('Origin', WEB)
		.send({url: 'https://acme.com', durationSec: 15, ratio: '16:9', prompt: 'x'});
	const id = res.body.project.id as string;
	await api.container.repos.projects.setStatus(who.userId, id, 'ready');
	return id;
}

const newKey = () => `generate_key_${String(++keySeq).padStart(8, '0')}`;

function generate(who: User, projectId: string, body: object = {expectedCredits: 10}, key = newKey()) {
	return who.agent.post(`/v1/projects/${projectId}/generate`).set('Origin', WEB).set('Idempotency-Key', key).send(body);
}

const balance = async (userId: string) => (await credits.balance(userId)).available;

describe('POST /v1/projects/:id/generate', () => {
	it('reserves credits, queues the job and announces its queue position', async () => {
		await credits.grant(alice.userId, {amount: 25, source: 'purchase', key: 'g1'});
		const id = await readyProject();
		const res = await generate(alice, id);

		expect(res.status).toBe(202);
		const {job} = JobResponse.parse(res.body);
		expect(job).toMatchObject({status: 'queued', reservedCredits: 10, chargedCredits: null, queuePosition: 1});
		expect(await balance(alice.userId)).toBe(15);
		expect(api.queues.jobs).toEqual([
			{queue: 'generate', payload: {jobId: job.id, projectId: id, userId: alice.userId}, options: {jobId: job.id}},
		]);
		expect((await alice.agent.get(`/v1/projects/${id}`)).body.project.status).toBe('generating');
		expect(api.events.published.map((e) => e.event)).toEqual([
			{type: 'job.queued', jobId: job.id, position: 1},
			{type: 'credits.updated', total: 15},
		]);
	});

	it('replays the same response for a repeated Idempotency-Key (a double click charges once)', async () => {
		await credits.grant(alice.userId, {amount: 25, source: 'purchase', key: 'g1'});
		const id = await readyProject();
		const key = newKey();
		const first = await generate(alice, id, {expectedCredits: 10}, key);
		const second = await generate(alice, id, {expectedCredits: 10}, key);
		expect(second.status).toBe(202);
		expect(second.body.job.id).toBe(first.body.job.id);
		expect(await balance(alice.userId)).toBe(15);
		expect(api.queues.jobs).toHaveLength(1);
	});

	it('returns 402 without enough credits and leaves nothing behind', async () => {
		await credits.grant(alice.userId, {amount: 5, source: 'purchase', key: 'g1'});
		const id = await readyProject();
		const res = await generate(alice, id);
		expect(res.status).toBe(402);
		expect(res.body.error).toMatchObject({code: 'INSUFFICIENT_CREDITS', details: {needed: 10}});
		expect(await db.job.count()).toBe(0);
		expect(await balance(alice.userId)).toBe(5);
		expect(api.queues.jobs).toHaveLength(0);
		expect((await alice.agent.get(`/v1/projects/${id}`)).body.project.status).toBe('ready');
	});

	it('rejects a price the user did not see (409 with the current price)', async () => {
		await credits.grant(alice.userId, {amount: 50, source: 'purchase', key: 'g1'});
		const id = await readyProject();
		const res = await generate(alice, id, {expectedCredits: 3});
		expect(res.status).toBe(409);
		expect(res.body.error.details).toEqual({credits: 10});
		expect((await generate(alice, id, {expectedCredits: 'ten'})).status).toBe(400);
		expect((await generate(alice, id, {})).status).toBe(400);
	});

	it('allows one active job per project (409), even when requests race', async () => {
		await credits.grant(alice.userId, {amount: 100, source: 'purchase', key: 'g1'});
		const id = await readyProject();
		expect((await generate(alice, id)).status).toBe(202);
		expect((await generate(alice, id)).status).toBe(409);

		// The database itself refuses a second active job for the project.
		const job = await db.job.findFirstOrThrow();
		await expect(
			db.job.create({
				data: {id: 'job_race0001', userId: alice.userId, projectId: id, type: 'generate', deadlineAt: new Date()},
			}),
		).rejects.toThrow();
		expect(job.status).toBe('queued');
	});

	it('limits concurrent jobs per plan (429 CONCURRENCY_LIMIT)', async () => {
		await credits.grant(alice.userId, {amount: 100, source: 'purchase', key: 'g1'});
		const [a, b] = [await readyProject(), await readyProject()];
		expect((await generate(alice, a)).status).toBe(202);
		const res = await generate(alice, b);
		expect(res.status).toBe(429);
		expect(res.body.error).toMatchObject({code: 'CONCURRENCY_LIMIT', details: {limit: 1}});
		expect(await balance(alice.userId)).toBe(90);
	});

	it('limits jobs per day (429)', async () => {
		await credits.grant(alice.userId, {amount: 500, source: 'purchase', key: 'g1'});
		const id = await readyProject();
		// Ten finished jobs today.
		for (let i = 0; i < 10; i++) {
			await db.job.create({
				data: {
					id: `job_done${String(i).padStart(4, '0')}`,
					userId: alice.userId,
					projectId: id,
					type: 'generate',
					status: 'failed',
					deadlineAt: new Date(),
				},
			});
		}
		const res = await generate(alice, id);
		expect(res.status).toBe(429);
		expect(res.body.error).toMatchObject({code: 'RATE_LIMITED', details: {limit: 10}});
	});

	it('returns 503 while new jobs are paused, and refuses projects still in setup', async () => {
		await credits.grant(alice.userId, {amount: 50, source: 'purchase', key: 'g1'});
		const id = await readyProject();
		await api.container.repos.featureFlags.set('pause_new_jobs', true);
		expect((await generate(alice, id)).status).toBe(503);
		await api.container.repos.featureFlags.set('pause_new_jobs', false);

		await api.container.repos.projects.setStatus(alice.userId, id, 'setup');
		const res = await generate(alice, id);
		expect(res.status).toBe(409);
		expect(res.body.error.message).toMatch(/setup/);
	});

	it("can't generate someone else's project (404) or without logging in (401)", async () => {
		await credits.grant(bob.userId, {amount: 50, source: 'purchase', key: 'g1'});
		const id = await readyProject();
		expect((await generate(bob, id)).status).toBe(404);
		const {default: request} = await import('supertest');
		expect((await request(api.app).post(`/v1/projects/${id}/generate`).set('Origin', WEB).send({})).status).toBe(401);
	});

	it('refunds right away when the queue is down', async () => {
		await credits.grant(alice.userId, {amount: 25, source: 'purchase', key: 'g1'});
		const id = await readyProject();
		api.queues.enqueue = async () => {
			throw new Error('redis down');
		};
		const res = await generate(alice, id);
		expect(res.status).toBe(503);
		expect(await balance(alice.userId)).toBe(25);
		expect(await db.job.findFirstOrThrow()).toMatchObject({status: 'failed', chargedCredits: 0});
		expect((await alice.agent.get(`/v1/projects/${id}`)).body.project.status).toBe('ready');
	});
});

describe('GET /v1/jobs/:id and POST /v1/jobs/:id/cancel', () => {
	it('shows the job, and cancelling refunds every credit and removes it from the queue', async () => {
		await credits.grant(alice.userId, {amount: 25, source: 'purchase', key: 'g1'});
		const id = await readyProject();
		const jobId = (await generate(alice, id)).body.job.id as string;

		expect((await alice.agent.get(`/v1/jobs/${jobId}`)).body.job).toMatchObject({status: 'queued', queuePosition: 1});
		expect((await bob.agent.get(`/v1/jobs/${jobId}`)).status).toBe(404);
		expect((await bob.agent.post(`/v1/jobs/${jobId}/cancel`).set('Origin', WEB)).status).toBe(404);

		const res = await alice.agent.post(`/v1/jobs/${jobId}/cancel`).set('Origin', WEB);
		expect(res.status).toBe(200);
		expect(res.body.job).toMatchObject({status: 'cancelled', chargedCredits: 0, queuePosition: null});
		expect(await balance(alice.userId)).toBe(25);
		expect(api.queues.jobs).toHaveLength(0);
		expect((await alice.agent.get(`/v1/projects/${id}`)).body.project.status).toBe('ready');
		expect(api.events.published.at(-2)?.event).toEqual({
			type: 'job.finished',
			jobId,
			status: 'cancelled',
			chargedCredits: 0,
			refunded: 10,
		});

		// Cancelling twice is a conflict, not a second refund.
		expect((await alice.agent.post(`/v1/jobs/${jobId}/cancel`).set('Origin', WEB)).status).toBe(409);
		expect(await balance(alice.userId)).toBe(25);
		// The project can be generated again.
		expect((await generate(alice, id)).status).toBe(202);
	});

	it('404s for unknown jobs', async () => {
		expect((await alice.agent.get('/v1/jobs/job_missing01')).status).toBe(404);
	});
});

describe('POST /v1/uploads/:id/complete and DELETE /v1/me queue background work', () => {
	it('queues an ffprobe check for uploaded videos', async () => {
		const mp4 = new Uint8Array([
			0,
			0,
			0,
			0x20,
			...[...'ftypisom'].map((c) => c.charCodeAt(0)),
			...new Array(52).fill(0),
		]);
		const res = await alice.agent
			.post('/v1/uploads')
			.set('Origin', WEB)
			.send({kind: 'recording', mime: 'video/mp4', size: mp4.length, filename: 'demo.mp4'});
		const assetId = res.body.assetId as string;
		api.storage.put(new URL(res.body.upload.url).pathname.slice(1), mp4, 'video/mp4');
		const done = await alice.agent.post(`/v1/uploads/${assetId}/complete`).set('Origin', WEB);
		expect(done.body.asset.status).toBe('processing');
		expect(api.queues.jobs).toEqual([
			{
				queue: 'maintenance',
				payload: {kind: 'probe-asset', userId: alice.userId, assetId},
				options: {jobId: `probe-${assetId}`, attempts: 3},
			},
		]);
	});

	it("queues deletion of the user's files", async () => {
		const res = await alice.agent.delete('/v1/me').set('Origin', WEB).send({confirm: true});
		expect(res.status).toBe(204);
		expect(api.queues.jobs).toEqual([
			{
				queue: 'maintenance',
				payload: {kind: 'purge-user-files', userId: alice.userId},
				options: {jobId: `purge-${alice.userId}`, attempts: 5},
			},
		]);
	});
});

describe('GET /v1/projects/:id/events (SSE)', () => {
	let server: ReturnType<typeof api.app.listen> | undefined;
	const open: AbortController[] = [];

	afterEach(async () => {
		for (const c of open.splice(0)) c.abort();
		await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
		server = undefined;
	});

	async function connect(who: User, projectId: string, headers: Record<string, string> = {}) {
		server ??= api.app.listen(0);
		const {port} = server.address() as AddressInfo;
		const controller = new AbortController();
		open.push(controller);
		const res = await fetch(`http://127.0.0.1:${port}/v1/projects/${projectId}/events`, {
			headers: {cookie: who.cookie, origin: WEB, ...headers},
			signal: controller.signal,
		});
		const reader = res.body!.getReader();
		const decoder = new TextDecoder();
		let text = '';
		/** Reads until `count` events have arrived; returns [id, type, data] per event. */
		const read = async (count: number) => {
			const events = () =>
				text
					.split('\n\n')
					.filter((block) => block.includes('data: '))
					.map((block) => {
						const field = (name: string) => block.match(new RegExp(`^${name}: (.*)$`, 'm'))?.[1] ?? '';
						return {id: Number(field('id')), type: field('event'), data: JSON.parse(field('data'))};
					});
			while (events().length < count) {
				const {value, done} = await reader.read();
				if (done) break;
				text += decoder.decode(value, {stream: true});
			}
			return events();
		};
		/** Keeps reading until the raw stream contains `needle`. */
		const waitFor = async (needle: string) => {
			while (!text.includes(needle)) {
				const {value, done} = await reader.read();
				if (done) break;
				text += decoder.decode(value, {stream: true});
			}
			return text.includes(needle);
		};
		return {res, read, waitFor, close: () => controller.abort()};
	}

	it('streams events in order, replays after a reconnect, and sends heartbeats', async () => {
		const id = await readyProject();
		const jobId = 'job_00000001';
		await api.events.publish(id, {type: 'job.queued', jobId, position: 1});

		const first = await connect(alice, id);
		expect(first.res.status).toBe(200);
		expect(first.res.headers.get('content-type')).toContain('text/event-stream');
		expect(first.res.headers.get('cache-control')).toContain('no-cache');
		await api.events.publish(id, {type: 'step.started', jobId, node: 'research'});
		await api.events.publish(id, {type: 'step.done', jobId, node: 'research'});
		const got = await first.read(3);
		expect(got.map((e) => [e.id, e.type])).toEqual([
			[1, 'job.queued'],
			[2, 'step.started'],
			[3, 'step.done'],
		]);
		expect(got[1]?.data).toEqual({type: 'step.started', jobId, node: 'research'});
		expect(await first.waitFor(': ping')).toBe(true);
		first.close();

		// Reconnect with Last-Event-ID: only newer events are sent.
		await api.events.publish(id, {type: 'step.started', jobId, node: 'designMd'});
		const second = await connect(alice, id, {'last-event-id': '3'});
		expect((await second.read(1)).map((e) => e.id)).toEqual([4]);
	});

	it("refuses someone else's project, logged-out clients and a 3rd connection", async () => {
		const id = await readyProject();
		expect((await connect(bob, id)).res.status).toBe(404);
		expect((await connect({...alice, cookie: ''}, id)).res.status).toBe(401);

		const a = await connect(alice, id);
		const b = await connect(alice, id);
		expect([a.res.status, b.res.status]).toEqual([200, 200]);
		const third = await connect(alice, id);
		expect(third.res.status).toBe(429);
		expect(third.res.headers.get('retry-after')).toBe('15');

		// Closing one frees a slot.
		a.close();
		await expect
			.poll(async () => {
				const c = await connect(alice, id);
				return c.res.status;
			})
			.toBe(200);
	});
});
