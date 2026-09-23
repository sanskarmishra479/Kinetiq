import {loginAs, testApi, WEB} from '@kinetiq/api/testing';
import {resetDb, testDb} from '@kinetiq/db/testing';
import {FixedClock, SeqId} from '@kinetiq/domain/testing';
import {memoryEventBus, memoryQueues, parsePayload, s3Storage} from '@kinetiq/platform';
import {localRender} from '@kinetiq/renderer/node';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {mockLlm, mockScraper, mockVoice} from '../adapters/mock/index.js';
import {processGenerate} from '../processors/generate.js';
import {testPipeline, testWorker} from '../testing/index.js';

// Phase 8 exit criterion: with mock providers, a URL becomes a real MP4
// through the API, with the steps visible live over SSE.
// Everything except the AI providers is real here: Postgres, MinIO, the
// renderer (headless Chrome) and ffmpeg.

const db = testDb();
const dir = mkdtempSync(join(tmpdir(), 'kinetiq-e2e-'));
const origin = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const storage = s3Storage({
	endpoint: origin,
	region: 'auto',
	accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minio',
	secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minio-secret',
	bucket: process.env.S3_BUCKET_CONTENT ?? 'kinetiq-content',
});

afterAll(() => rmSync(dir, {recursive: true, force: true}));

describe('URL to video, end to end', () => {
	const queues = memoryQueues();
	const events = memoryEventBus();
	const api = testApi({db, queues, events, app: {sse: {maxPerUser: 5, heartbeatMs: 60_000, leaseMs: 120_000}}});
	const server = api.app.listen(0);
	afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

	it('makes a real video with voiceover and shows every step live', async () => {
		await resetDb(db);
		const alice = await loginAs(api, 'alice@acme.com');
		await api.container.repos.credits.grant(alice.userId, {amount: 100, source: 'purchase', key: 'e2e'});

		// 1. The user creates a project and answers the setup questions.
		const created = await alice.agent
			.post('/v1/projects')
			.set('Origin', WEB)
			.send({url: 'https://fernpay.io', durationSec: 15, ratio: '16:9', prompt: 'confident and clear'});
		const projectId = created.body.project.id as string;
		for (const answer of [
			{key: 'voiceover', value: true},
			{key: 'voice', value: 'kira'},
			{key: 'language', value: 'en'},
			{key: 'scriptBy', value: 'ai'},
			{key: 'design', value: {kind: 'auto'}},
		]) {
			await alice.agent
				.post(`/v1/projects/${projectId}/messages`)
				.set('Origin', WEB)
				.set('Idempotency-Key', `e2e_setup_${answer.key}_001`)
				.send({answer});
		}
		expect((await alice.agent.get(`/v1/projects/${projectId}`)).body.project.status).toBe('ready');

		// 2. The browser opens the live stream, then presses Generate.
		const {port} = server.address() as AddressInfo;
		const controller = new AbortController();
		const stream = await fetch(`http://127.0.0.1:${port}/v1/projects/${projectId}/events`, {
			headers: {cookie: alice.cookie, origin: WEB},
			signal: controller.signal,
		});
		const price = await alice.agent.post(`/v1/projects/${projectId}/estimate`).set('Origin', WEB).send({});
		const generate = await alice.agent
			.post(`/v1/projects/${projectId}/generate`)
			.set('Origin', WEB)
			.set('Idempotency-Key', 'e2e_generate_key_0001')
			.send({expectedCredits: price.body.credits});
		expect(generate.status).toBe(202);

		// 3. A worker picks the job up and runs the real pipeline.
		const worker = testWorker({db, clock: new FixedClock(Date.now()), ids: new SeqId(), events, queues});
		worker.container.storage = storage;
		worker.container.render = localRender({storage, timeoutMs: 8 * 60_000});
		worker.container.pipeline = testPipeline(worker.container, {
			llm: mockLlm(),
			scraper: mockScraper(storage),
			voice: mockVoice(),
		});
		const queued = queues.jobs.find((job) => job.queue === 'generate');
		expect(await processGenerate(worker.container, parsePayload('generate', queued?.payload))).toBe('succeeded');

		// 4. The browser saw the whole run.
		const reader = stream.body!.getReader();
		const decoder = new TextDecoder();
		let text = '';
		while (!text.includes('job.finished')) {
			const {value, done} = await reader.read();
			if (done) break;
			text += decoder.decode(value, {stream: true});
		}
		controller.abort();
		const types = [...text.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);
		expect(types[0]).toBe('job.queued');
		for (const expected of ['step.started', 'step.progress', 'step.done', 'version.ready', 'message.created']) {
			expect(types).toContain(expected);
		}
		const steps = [...text.matchAll(/"node":"([a-zA-Z]+)"/g)].map((m) => m[1]);
		expect(steps).toContain('research');
		expect(steps).toContain('sceneCoder');
		expect(steps).toContain('finalRender');

		// 5. There is a real MP4 with the right spec and an audio track.
		const version = (await alice.agent.get(`/v1/projects/${projectId}`)).body.latestVersion as {
			id: string;
			number: number;
			durationSec: number;
		};
		expect(version.number).toBe(1);
		const keys = await db.version.findUniqueOrThrow({where: {id: version.id}});
		const head = await storage.head(keys.videoKey!);
		expect(head?.contentType).toBe('video/mp4');

		const file = join(dir, 'out.mp4');
		writeFileSync(file, await storage.readStart(keys.videoKey!, head!.size));
		const probe = JSON.parse(
			execFileSync('ffprobe', [
				'-v',
				'error',
				'-print_format',
				'json',
				'-show_format',
				'-show_streams',
				file,
			]).toString(),
		) as {format: {duration: string}; streams: {codec_type: string; width?: number; height?: number}[]};
		const video = probe.streams.find((s) => s.codec_type === 'video')!;
		expect([video.width, video.height]).toEqual([1920, 1080]);
		expect(probe.streams.some((s) => s.codec_type === 'audio')).toBe(true);
		expect(Number(probe.format.duration)).toBeGreaterThanOrEqual(15);
		expect(Math.abs(Number(probe.format.duration) - version.durationSec)).toBeLessThanOrEqual(0.5);

		// 6. The user was charged what they were quoted, and the project is done.
		const me = await alice.agent.get('/v1/me');
		expect(me.body.credits.total).toBe(100 - price.body.credits);
		expect((await alice.agent.get(`/v1/projects/${projectId}`)).body.project.status).toBe('done');

		await storage.deletePrefix(`u/${alice.userId}/`);
	}, 600_000);
});
