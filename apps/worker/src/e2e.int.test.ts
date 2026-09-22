import {loginAs, testApi, WEB} from '@kinetiq/api/testing';
import {resetDb, testDb} from '@kinetiq/db/testing';
import {memoryEventBus, memoryQueues, parsePayload} from '@kinetiq/platform';
import {FixedClock, SeqId} from '@kinetiq/domain/testing';
import type {AddressInfo} from 'node:net';
import {afterAll, describe, expect, it} from 'vitest';
import {processGenerate} from './processors/generate.js';
import {testWorker} from './testing/index.js';

// Phase 6 exit criterion: a job flows API → queue → worker → SSE, end to end.
const db = testDb();

describe('generate end to end', () => {
	const queues = memoryQueues();
	const events = memoryEventBus();
	const api = testApi({db, queues, events, app: {sse: {maxPerUser: 5, heartbeatMs: 60_000, leaseMs: 120_000}}});
	const server = api.app.listen(0);
	afterAll(() => new Promise<void>((r) => server.close(() => r())));

	it('the browser sees the job queued, every step, the result and the new balance, in order', async () => {
		await resetDb(db);
		const alice = await loginAs(api, 'alice@acme.com');
		await api.container.repos.credits.grant(alice.userId, {amount: 30, source: 'purchase', key: 'e2e'});
		const created = await alice.agent
			.post('/v1/projects')
			.set('Origin', WEB)
			.send({url: 'https://acme.com', durationSec: 15, ratio: '16:9', prompt: 'x'});
		const projectId = created.body.project.id as string;
		await api.container.repos.projects.setStatus(alice.userId, projectId, 'ready');

		// The browser opens the live stream.
		const {port} = server.address() as AddressInfo;
		const controller = new AbortController();
		const stream = await fetch(`http://127.0.0.1:${port}/v1/projects/${projectId}/events`, {
			headers: {cookie: alice.cookie, origin: WEB},
			signal: controller.signal,
		});
		expect(stream.status).toBe(200);

		// The user clicks Generate.
		const res = await alice.agent
			.post(`/v1/projects/${projectId}/generate`)
			.set('Origin', WEB)
			.set('Idempotency-Key', 'e2e_generate_key_0001')
			.send({expectedCredits: 10});
		expect(res.status).toBe(202);

		// A worker takes the job from the queue.
		const queued = queues.jobs.find((j) => j.queue === 'generate');
		const worker = testWorker({
			db,
			clock: new FixedClock(Date.now()),
			ids: new SeqId(),
			events,
			queues,
			pipeline: {
				async run(ctx) {
					await ctx.step(
						'research',
						async () => 'ok',
						() => 'Read acme.com',
					);
					await ctx.step('director', async () => 'ok');
					return {charge: 8};
				},
			},
		});
		expect(await processGenerate(worker.container, parsePayload('generate', queued?.payload))).toBe('succeeded');

		// Read the stream until the job's final events arrive.
		const reader = stream.body!.getReader();
		const decoder = new TextDecoder();
		let text = '';
		const types = () => [...text.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);
		while (types().filter((t) => t === 'credits.updated').length < 2) {
			const {value, done} = await reader.read();
			if (done) break;
			text += decoder.decode(value, {stream: true});
		}
		controller.abort();

		expect(types()).toEqual([
			'job.queued',
			'credits.updated',
			'step.started',
			'step.done',
			'step.started',
			'step.done',
			'job.finished',
			'credits.updated',
		]);
		const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
		expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
		expect(text).toContain('"chargedCredits":8');
		expect(text).toContain('"refunded":2');

		const me = await alice.agent.get('/v1/me');
		expect(me.body.credits.total).toBe(22);
		const job = await alice.agent.get(`/v1/jobs/${res.body.job.id}`);
		expect(job.body.job).toMatchObject({status: 'succeeded', chargedCredits: 8});
		expect((await alice.agent.get(`/v1/projects/${projectId}`)).body.project.status).toBe('done');
	});
});
