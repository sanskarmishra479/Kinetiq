import {describe, expect, it} from 'vitest';
import {EstimateResponse, Job, PIPELINE_NODES} from './api/jobs.js';
import {
	CREDIT_COSTS,
	CREDIT_ITEMS,
	CREDIT_PACKS,
	DESIGN_PRESETS,
	DesignPreset,
	DesignTokens,
	PLANS,
	Plan,
	CreditPack,
	PRESET_IDS,
	VIDEO_MODEL_IDS,
	VIDEO_MODELS,
	Voice,
	VOICE_IDS,
	VOICES,
} from './catalog.js';
import {ApiError, ERROR_STATUS, ErrorCode} from './errors.js';
import {ProjectEvent, projectChannel} from './events.js';
import {EditPayload, EmailPayload, GeneratePayload, MediaPollPayload, QUEUES, RenderPayload} from './queues.js';
import {accepts, ids, now, rejects} from './test-helpers.js';

describe('errors', () => {
	it('maps every error code to an HTTP status', () => {
		for (const code of ErrorCode.options) expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
	});

	it('validates the error envelope', () => {
		accepts(ApiError, {
			error: {code: 'INSUFFICIENT_CREDITS', message: 'Need 23', details: {required: 23}, requestId: 'req_1'},
		});
		rejects(ApiError, {error: {code: 'TEAPOT', message: 'x', requestId: 'req_1'}});
	});
});

describe('catalog data is self-consistent', () => {
	it('has exactly 5 valid, unique voices (decided in the PRD)', () => {
		expect(VOICES).toHaveLength(5);
		expect(VOICES.map((v) => v.id)).toEqual([...VOICE_IDS]);
		for (const v of VOICES) accepts(Voice, v);
	});

	it('has one valid preset per preset id, with valid tokens', () => {
		expect(DESIGN_PRESETS.map((p) => p.id)).toEqual([...PRESET_IDS]);
		for (const p of DESIGN_PRESETS) {
			accepts(DesignPreset, p);
			accepts(DesignTokens, p.tokens);
		}
	});

	it('uses only generic preset names, never brand names (NFR-LEG-01)', () => {
		const brands = /apple|google|stripe|linear|vercel|figma|notion|nike|tesla|claude|cursor|spotify|shopify|airbnb/i;
		for (const p of DESIGN_PRESETS) expect(`${p.name} ${p.description}`).not.toMatch(brands);
	});

	it('has a positive whole-number cost for every credit item', () => {
		expect(Object.keys(CREDIT_COSTS).sort()).toEqual([...CREDIT_ITEMS].sort());
		for (const cost of Object.values(CREDIT_COSTS)) expect(Number.isInteger(cost) && cost > 0).toBe(true);
	});

	it('has valid plans and packs (MVP: 1 plan + 2 packs)', () => {
		expect(PLANS).toHaveLength(1);
		expect(CREDIT_PACKS).toHaveLength(2);
		for (const p of PLANS) accepts(Plan, p);
		for (const p of CREDIT_PACKS) accepts(CreditPack, p);
	});

	it('keeps AI video models disabled for the MVP', () => {
		for (const id of VIDEO_MODEL_IDS) expect(VIDEO_MODELS[id].enabled).toBe(false);
	});

	it('rejects bad design tokens', () => {
		const tokens = DESIGN_PRESETS[0]?.tokens;
		rejects(DesignTokens, {...tokens, accent: 'purple'});
		rejects(DesignTokens, {...tokens, radius: 100});
		rejects(DesignTokens, {...tokens, script: 'alert(1)'});
		accepts(DesignTokens, {...tokens, border: 'rgba(0, 0, 0, .5)'});
	});
});

describe('jobs', () => {
	const job = {
		id: ids.job,
		type: 'generate',
		status: 'running',
		reservedCredits: 23,
		chargedCredits: null,
		queuePosition: null,
		steps: [
			{node: 'research', status: 'done', startedAt: now, endedAt: now},
			{node: 'sceneCoder', status: 'running', progress: {done: 2, total: 5}, startedAt: now, endedAt: null},
		],
		versionId: null,
		error: null,
	};

	it('validates jobs and steps', () => {
		accepts(Job, job);
		accepts(Job, {...job, status: 'failed', error: {code: 'DEGRADED', message: 'Provider down'}});
		rejects(Job, {...job, steps: [{node: 'hack', status: 'done', startedAt: null, endedAt: null}]});
		rejects(Job, {...job, reservedCredits: -5});
	});

	it('lists the pipeline nodes in order', () => {
		expect(PIPELINE_NODES[0]).toBe('research');
		expect(PIPELINE_NODES.at(-1)).toBe('notify');
	});

	it('validates estimates', () => {
		accepts(EstimateResponse, {
			credits: 23,
			breakdown: [{item: 'video_30s', credits: 20}],
			balance: 140,
			canAfford: true,
		});
		rejects(EstimateResponse, {
			credits: 23,
			breakdown: [{item: 'free_stuff', credits: 0}],
			balance: 1,
			canAfford: false,
		});
	});
});

describe('ProjectEvent (SSE)', () => {
	it.each([
		{type: 'job.queued', jobId: ids.job, position: 2},
		{type: 'step.started', jobId: ids.job, node: 'research'},
		{
			type: 'step.progress',
			jobId: ids.job,
			node: 'sceneCoder',
			done: 2,
			total: 5,
			thumbUrl: 'https://x.kinetiqcontent.com/t.png',
		},
		{type: 'step.done', jobId: ids.job, node: 'designMd', summary: 'Dark theme'},
		{type: 'step.failed', jobId: ids.job, node: 'aiClips', retrying: true, attempt: 2},
		{type: 'message.created', message: {id: ids.message, role: 'assistant', content: 'Done!', createdAt: now}},
		{type: 'version.ready', versionId: ids.version, number: 2, posterUrl: null},
		{type: 'job.finished', jobId: ids.job, status: 'succeeded', chargedCredits: 21, refunded: 2},
		{type: 'credits.updated', total: 119},
	])('accepts $type', (event) => {
		accepts(ProjectEvent, event);
	});

	it('rejects unknown events and non-final job statuses', () => {
		rejects(ProjectEvent, {type: 'job.hacked', jobId: ids.job});
		rejects(ProjectEvent, {type: 'job.finished', jobId: ids.job, status: 'running', chargedCredits: 0, refunded: 0});
		rejects(ProjectEvent, {type: 'step.progress', jobId: ids.job, node: 'sceneCoder', done: 1, total: 0});
	});

	it('names the project channel', () => {
		expect(projectChannel(ids.project)).toBe('project:prj_abc12345');
	});
});

describe('queue payloads', () => {
	it('validates each payload strictly', () => {
		accepts(GeneratePayload, {jobId: ids.job, projectId: ids.project, userId: ids.user});
		accepts(EditPayload, {jobId: ids.job, projectId: ids.project, userId: ids.user, messageId: ids.message});
		accepts(RenderPayload, {
			jobId: ids.job,
			kind: 'final',
			versionId: ids.version,
			inputPropsKey: 'jobs/job_1/props.json',
		});
		accepts(MediaPollPayload, {jobId: ids.job, clipId: ids.clip, providerJobId: 'abc123'});
		accepts(EmailPayload, {to: 'a@b.com', template: 'receipt', data: {amount: 12, plan: 'go'}});

		rejects(GeneratePayload, {jobId: ids.job, projectId: ids.project, userId: ids.user, admin: true});
		rejects(GeneratePayload, {jobId: ids.project, projectId: ids.project, userId: ids.user});
		rejects(RenderPayload, {jobId: ids.job, kind: 'gif', versionId: ids.version, inputPropsKey: 'k'});
		rejects(EmailPayload, {to: 'not-an-email', template: 'receipt', data: {}});
		rejects(EmailPayload, {to: 'a@b.com', template: 'receipt', data: {nested: {x: 1}}});
	});

	it('names every queue', () => {
		expect(Object.values(QUEUES)).toEqual(['generate', 'edit', 'render', 'media-poll', 'email', 'cron']);
	});
});
