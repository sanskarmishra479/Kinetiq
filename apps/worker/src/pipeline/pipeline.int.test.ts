import {Prisma} from '@kinetiq/db';
import {estimate} from '@kinetiq/domain';
import {grantCredits, makeUser, resetDb, testDb, testRepos} from '@kinetiq/db/testing';
import {RENDER_FPS, type QaReport} from '@kinetiq/shared';
import {beforeEach, describe, expect, it} from 'vitest';
import {mockLlm, mockScraper} from '../adapters/mock/index.js';
import {processGenerate} from '../processors/generate.js';
import {fakeRender, testPipeline, testWorker} from '../testing/index.js';
import type {WorkerContainer} from '../container.js';
import type {LlmPort} from '../ports.js';

// The whole generation pipeline on mock providers (docs/TODO.md Phase 8).
// Rendering is faked here so the tests stay fast; pipeline.e2e.int.test.ts
// runs the same pipeline through the real renderer.

const db = testDb();
let t: ReturnType<typeof testRepos>;
let userId: string;

beforeEach(async () => {
	await resetDb(db);
	t = testRepos(db);
	userId = (await makeUser(db)).id;
	await grantCredits(db, userId, 100, 'seed');
});

type Options = {
	voiceover?: boolean;
	durationSec?: 15 | 30 | 45;
	url?: string;
	qa?: (input: {sceneIndex: number; round: number}) => QaReport;
	fail?: (role: string, callIndex: number) => Error | null;
	maxFixRounds?: number;
	/** Wraps the mock model, e.g. to give its answers a price. */
	wrapLlm?: (llm: LlmPort) => LlmPort;
};

/** A project ready to generate, plus the worker wired to the real pipeline. */
async function setup(options: Options = {}) {
	const project = await t.repos.projects.create(userId, {
		url: options.url ?? 'https://acme-analytics.com',
		durationSec: options.durationSec ?? 15,
		ratio: '16:9',
		assetIds: [],
		prompt: 'keep it punchy',
	});
	if (options.voiceover) {
		await t.repos.projects.updateSettings(userId, project.id, {
			voiceover: {enabled: true, voiceId: 'kira', language: 'en', scriptBy: 'ai'},
			design: null,
		});
	}
	await t.repos.projects.setStatus(userId, project.id, 'generating');
	const job = (await t.repos.jobs.create(userId, project.id, {
		type: 'generate',
		reservedCredits: 0,
		deadlineMinutes: 20,
	}))!;
	const reserved = estimate({
		durationSec: options.durationSec ?? 15,
		voiceover: options.voiceover === true,
		aiClips: 0,
		templateDiscountPct: 0,
	}).credits;
	await t.repos.credits.reserveForJob(userId, job.id, reserved);

	const w = testWorker({...t});
	const render = fakeRender(w.storage);
	w.container.render = render;
	const llm = mockLlm({
		...(options.qa ? {qa: options.qa} : {}),
		...(options.fail ? {fail: options.fail as never} : {}),
	});
	w.container.pipeline = testPipeline(
		w.container,
		{llm: options.wrapLlm ? options.wrapLlm(llm) : llm, scraper: mockScraper(w.storage)},
		options.maxFixRounds === undefined ? {} : {maxFixRounds: options.maxFixRounds},
	);
	return {...w, render, llm, payload: {jobId: job.id, projectId: project.id, userId}, reserved};
}

const run = (container: WorkerContainer, payload: {jobId: string; projectId: string; userId: string}) =>
	processGenerate(container, payload);

describe('the whole pipeline on mocks', () => {
	it('turns a URL into a finished video, a version and a charge', async () => {
		const s = await setup();
		expect(await run(s.container, s.payload)).toBe('succeeded');

		// Every node ran, in order.
		const job = await t.repos.jobs.get(userId, s.payload.jobId);
		expect(job!.steps.filter((step) => step.status === 'done').map((step) => step.node)).toEqual([
			'research',
			'designMd',
			'director',
			'sceneCoder',
			'validate',
			'previewStills',
			'visualQA',
			'audio',
			'finalRender',
			'settle',
			'notify',
		]);

		// The video and its scenes are saved as version 1.
		const version = await db.version.findFirstOrThrow({include: {scenes: true}});
		expect(version).toMatchObject({projectId: s.payload.projectId, number: 1, jobId: s.payload.jobId});
		expect(version.durationSec).toBeCloseTo(15, 1);
		expect(version.scenes.length).toBeGreaterThanOrEqual(3);
		expect(version.scenes.every((scene) => scene.code.includes('export default'))).toBe(true);
		expect(version.scenes.every((scene) => scene.codeHash.length === 64)).toBe(true);
		expect(s.storage.has(version.videoKey!)).toBe(true);
		expect(s.storage.has(version.posterKey!)).toBe(true);
		// Everything lives under the user's folder, so deleting the account removes it (NFR-LEG-02).
		expect(version.videoKey!.startsWith(`u/${userId}/`)).toBe(true);

		// Credits: charged what the estimate said, nothing left reserved.
		expect(job).toMatchObject({status: 'succeeded', chargedCredits: s.reserved});
		expect((await t.repos.credits.balance(userId)).available).toBe(100 - s.reserved);

		// The browser saw the result.
		const types = s.events.published.map((e) => e.event.type);
		expect(types).toContain('version.ready');
		expect(types).toContain('message.created');
		expect(types.at(-1)).toBe('credits.updated');
		expect((await t.repos.messages.list(userId, s.payload.projectId, {limit: 10})).items[0]?.content).toMatch(
			/video is ready/i,
		);

		// The working files are cleaned up; the video and poster stay.
		expect(s.storage.has(`u/${userId}/tmp/${s.payload.jobId}/still-0-0.png`)).toBe(false);
		expect(await db.jobCheckpoint.count()).toBe(0);
	});

	it('adds voiceover audio and captions when the user asked for it', async () => {
		const s = await setup({voiceover: true, durationSec: 30});
		expect(await run(s.container, s.payload)).toBe('succeeded');

		const steps = (await t.repos.jobs.get(userId, s.payload.jobId))!.steps;
		expect(steps.find((step) => step.node === 'voiceover')?.status).toBe('done');
		const finalRender = s.render.calls.find((c) => c.kind === 'final');
		expect(finalRender).toBeDefined();
		// The video is at least as long as the narration (FR-GEN-08).
		const version = await db.version.findFirstOrThrow();
		expect(version.durationSec!).toBeGreaterThanOrEqual(30);
		expect((await t.repos.jobs.get(userId, s.payload.jobId))!.chargedCredits).toBe(s.reserved);
	});

	it('skips the voiceover node when the video has no narration', async () => {
		const s = await setup();
		await run(s.container, s.payload);
		const steps = (await t.repos.jobs.get(userId, s.payload.jobId))!.steps;
		expect(steps.find((step) => step.node === 'voiceover')).toBeUndefined();
		expect(s.llm.calls).not.toContain('voiceover');
	});
});

describe('visual QA and the fix loop (FR-GEN-07, NFR-COST-04)', () => {
	const failing = (sceneIndex: number): QaReport => ({
		sceneIndex,
		pass: false,
		issues: [{kind: 'cut_off_text', severity: 'high', frame: 5, description: 'the headline is cut off'}],
	});

	it('rewrites a scene once when QA finds a real problem, then moves on', async () => {
		const s = await setup({
			qa: ({sceneIndex, round}) =>
				sceneIndex === 0 && round === 1 ? failing(0) : {sceneIndex, pass: true, issues: []},
		});
		expect(await run(s.container, s.payload)).toBe('succeeded');

		const steps = (await t.repos.jobs.get(userId, s.payload.jobId))!.steps;
		expect(steps.find((step) => step.node === 'sceneFix')?.status).toBe('done');
		expect(s.llm.calls.filter((c) => c === 'sceneFix')).toHaveLength(1);
		const scene = await db.scene.findFirstOrThrow({where: {index: 0}});
		expect((scene.qaReport as QaReport).pass).toBe(true);
	});

	it('stops after the allowed rounds instead of burning credits forever', async () => {
		// QA never passes this scene.
		const s = await setup({
			qa: ({sceneIndex}) => (sceneIndex === 0 ? failing(0) : {sceneIndex, pass: true, issues: []}),
		});
		expect(await run(s.container, s.payload)).toBe('succeeded');
		expect(s.llm.calls.filter((c) => c === 'sceneFix')).toHaveLength(1);
		// The video still ships: a scene that can't be perfected is accepted (FR-GEN-07).
		expect(await db.version.count()).toBe(1);
	});

	it('falls back to the real screenshot when the rebuilt product UI keeps failing', async () => {
		const s = await setup({
			durationSec: 30,
			qa: ({sceneIndex, round}) => (round === 1 ? failing(sceneIndex) : {sceneIndex, pass: true, issues: []}),
		});
		expect(await run(s.container, s.payload)).toBe('succeeded');

		const scenes = await db.scene.findMany({orderBy: {index: 'asc'}});
		const demo = scenes.find((scene) => scene.code.includes('Browser'));
		expect(demo).toBeDefined();
		// The product-UI scene now renders the screenshot the scraper captured.
		const stillCalls = s.render.calls.filter((c) => c.kind === 'still');
		expect(stillCalls.length).toBeGreaterThan(scenes.length);
	});
});

describe('retries and resuming (FR-GEN-05)', () => {
	it('retries a failing node and keeps going', async () => {
		let failures = 0;
		const s = await setup({
			fail: (role) => {
				if (role === 'director' && failures < 2) {
					failures++;
					return new Error('model timed out');
				}
				return null;
			},
		});
		expect(await run(s.container, s.payload)).toBe('succeeded');
		expect(s.llm.calls.filter((c) => c === 'director')).toHaveLength(3);
		expect(await db.version.count()).toBe(1);
	});

	it('resumes from the last finished node instead of paying twice', async () => {
		const s = await setup({fail: (role) => (role === 'sceneCoder' ? new Error('model is down') : null)});
		expect(await run(s.container, s.payload)).toBe('failed');
		const firstRunCalls = [...s.llm.calls];
		expect(firstRunCalls).toContain('research');

		// The state was saved up to the last good node.
		const checkpoint = await db.jobCheckpoint.findUniqueOrThrow({where: {jobId: s.payload.jobId}});
		// The voiceover node is skipped (no narration) but still counts as finished.
		expect((checkpoint.state as {completed: string[]}).completed).toEqual([
			'research',
			'designMd',
			'director',
			'voiceover',
		]);

		// A new attempt at the same job starts again from sceneCoder.
		await db.job.update({
			where: {id: s.payload.jobId},
			data: {status: 'queued', chargedCredits: null, error: Prisma.DbNull},
		});
		const llm = mockLlm();
		s.container.pipeline = testPipeline(s.container, {llm, scraper: mockScraper(s.storage)});
		expect(await run(s.container, s.payload)).toBe('succeeded');
		expect(llm.calls).not.toContain('research');
		expect(llm.calls).not.toContain('director');
		expect(llm.calls).toContain('sceneCoder');
	});

	it('refunds everything when a node keeps failing', async () => {
		const s = await setup({fail: (role) => (role === 'research' ? new Error('scraper is down') : null)});
		expect(await run(s.container, s.payload)).toBe('failed');
		expect((await t.repos.credits.balance(userId)).available).toBe(100);
		const job = await db.job.findUniqueOrThrow({where: {id: s.payload.jobId}});
		expect(job).toMatchObject({status: 'failed', chargedCredits: 0});
		expect(JSON.stringify(job.error)).not.toContain('scraper is down');
		expect(await db.version.count()).toBe(0);
	});
});

describe('cost and caching', () => {
	it('caches research per site for a day (FR-GEN-12)', async () => {
		const first = await setup();
		await run(first.container, first.payload);
		expect(first.llm.calls).toContain('research');

		// A second project for the same URL reuses it, sharing the container's cache.
		const second = await setup();
		second.container.kv = first.container.kv;
		const llm = mockLlm();
		second.container.pipeline = testPipeline(second.container, {llm, scraper: mockScraper(second.storage)});
		await run(second.container, second.payload);
		expect(llm.calls).not.toContain('research');
		expect(llm.calls).toContain('director');
	});

	it('records what each provider call cost (NFR-COST-01)', async () => {
		const priced = (llm: LlmPort): LlmPort => ({
			complete: async (request) => {
				const {result} = await llm.complete(request);
				return {result, cost: {provider: 'openrouter', units: 1200, usdMicros: 3400}};
			},
		});
		const s = await setup({wrapLlm: priced});
		expect(await run(s.container, s.payload)).toBe('succeeded');
		const costs = await db.providerCost.findMany({where: {jobId: s.payload.jobId}});
		expect(costs.length).toBeGreaterThan(3);
		expect(costs.every((c) => c.provider === 'openrouter')).toBe(true);
		expect(await t.repos.costs.totalFor(s.payload.jobId)).toBe(costs.length * 3400);
	});

	it('works for a site that is not one of the fixtures', async () => {
		const s = await setup({url: 'https://some-unknown-startup.dev'});
		expect(await run(s.container, s.payload)).toBe('succeeded');
		const version = await db.version.findFirstOrThrow({include: {scenes: true}});
		expect(version.scenes.length).toBeGreaterThanOrEqual(3);
	});

	it('handles the longest video with narration on every scene', async () => {
		// Regression: a 45 s video has nine scenes, so nine voiceover tracks.
		const s = await setup({durationSec: 45, voiceover: true});
		expect(await run(s.container, s.payload)).toBe('succeeded');
		const version = await db.version.findFirstOrThrow({include: {scenes: true}});
		expect(version.scenes).toHaveLength(9);
	});

	it('keeps the video the length the user paid for', async () => {
		const s = await setup({durationSec: 45});
		await run(s.container, s.payload);
		const version = await db.version.findFirstOrThrow({include: {scenes: true}});
		const frames = version.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0);
		expect(frames).toBe(45 * RENDER_FPS);
	});
});
