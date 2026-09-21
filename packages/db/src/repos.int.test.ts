import {CreateProjectRequest} from '@kinetiq/shared';
import {beforeEach, describe, expect, it} from 'vitest';
import {grantCredits, makeUser, resetDb, T0, testDb, testRepos} from './testing/index.js';

// Repositories against a real Postgres. The most important property:
// a user can never read or change another user's data (NFR-SEC-08, FR-PRJ-03).
const db = testDb();

const newProject = (overrides: Record<string, unknown> = {}) =>
	CreateProjectRequest.parse({url: 'https://acme.com', durationSec: 30, ratio: '16:9', ...overrides});

let t: ReturnType<typeof testRepos>;
let alice: {id: string};
let bob: {id: string};

beforeEach(async () => {
	await resetDb(db);
	t = testRepos(db);
	alice = await makeUser(db);
	bob = await makeUser(db);
});

describe('projects', () => {
	it('creates and reads back a project in the API shape', async () => {
		const project = await t.repos.projects.create(alice.id, newProject({prompt: 'Focus on search'}));
		expect(project).toMatchObject({
			id: 'prj_00000001',
			status: 'setup',
			url: 'https://acme.com',
			durationSec: 30,
			ratio: '16:9',
			prompt: 'Focus on search',
			settings: {voiceover: null, design: null},
			createdAt: new Date(T0).toISOString(),
		});
		expect(await t.repos.projects.get(alice.id, project.id)).toEqual(project);
	});

	it("never exposes or changes another user's project", async () => {
		const project = await t.repos.projects.create(alice.id, newProject());
		expect(await t.repos.projects.get(bob.id, project.id)).toBeNull();
		expect((await t.repos.projects.list(bob.id, {limit: 20})).items).toEqual([]);
		expect(
			await t.repos.projects.updateSettings(bob.id, project.id, {voiceover: null, design: {kind: 'auto'}}),
		).toBeNull();
		expect(await t.repos.projects.delete(bob.id, project.id)).toBe(false);
		expect(await t.repos.projects.get(alice.id, project.id)).not.toBeNull();
	});

	it('paginates newest first with a cursor', async () => {
		for (let i = 0; i < 5; i++) await t.repos.projects.create(alice.id, newProject());
		const first = await t.repos.projects.list(alice.id, {limit: 2});
		expect(first.items.map((p) => p.id)).toEqual(['prj_00000005', 'prj_00000004']);
		expect(first.nextCursor).toBe('prj_00000004');
		const second = await t.repos.projects.list(alice.id, {limit: 2, cursor: first.nextCursor ?? undefined});
		expect(second.items.map((p) => p.id)).toEqual(['prj_00000003', 'prj_00000002']);
		const last = await t.repos.projects.list(alice.id, {limit: 2, cursor: second.nextCursor ?? undefined});
		expect(last.items.map((p) => p.id)).toEqual(['prj_00000001']);
		expect(last.nextCursor).toBeNull();
	});

	it('saves validated settings and deletes projects', async () => {
		const project = await t.repos.projects.create(alice.id, newProject());
		t.clock.advance(1000);
		const updated = await t.repos.projects.updateSettings(alice.id, project.id, {
			voiceover: {enabled: true, voiceId: 'kira', language: 'en', scriptBy: 'ai'},
			design: {kind: 'preset', presetId: 'bold-kinetic'},
		});
		expect(updated?.settings.design).toEqual({kind: 'preset', presetId: 'bold-kinetic'});
		expect(updated?.updatedAt).toBe(new Date(T0 + 1000).toISOString());
		await expect(
			t.repos.projects.updateSettings(alice.id, project.id, {
				voiceover: null,
				design: {kind: 'preset', presetId: 'apple'},
			} as never),
		).rejects.toThrow();
		expect(await t.repos.projects.delete(alice.id, project.id)).toBe(true);
		expect(await t.repos.projects.get(alice.id, project.id)).toBeNull();
	});
});

describe('assets', () => {
	const upload = {filename: 'hero.png', mime: 'image/png', kind: 'screenshot', size: 1000} as const;

	it('generates the storage key on the server and scopes reads', async () => {
		const {asset, storageKey} = await t.repos.assets.createPending(alice.id, upload);
		expect(storageKey).toBe(`u/${alice.id}/${asset.id}`);
		expect(asset.status).toBe('pending');
		expect(await t.repos.assets.get(bob.id, asset.id)).toBeNull();
		expect(await t.repos.assets.getForUpload(bob.id, asset.id)).toBeNull();
		expect(await t.repos.assets.markReady(bob.id, asset.id, {sha256: 'x'})).toBe(false);
	});

	it('only lets a user attach their own ready, unattached assets', async () => {
		const a = (await t.repos.assets.createPending(alice.id, upload)).asset;
		const b = (await t.repos.assets.createPending(alice.id, upload)).asset;
		const bobs = (await t.repos.assets.createPending(bob.id, upload)).asset;
		expect(await t.repos.assets.allUsable(alice.id, [a.id])).toBe(false); // still pending
		await t.repos.assets.markReady(alice.id, a.id, {sha256: 'aa'});
		await t.repos.assets.markReady(alice.id, b.id, {sha256: 'bb'});
		await t.repos.assets.markReady(bob.id, bobs.id, {sha256: 'cc'});
		expect(await t.repos.assets.allUsable(alice.id, [])).toBe(true);
		expect(await t.repos.assets.allUsable(alice.id, [a.id, b.id])).toBe(true);
		expect(await t.repos.assets.allUsable(alice.id, [a.id, bobs.id])).toBe(false);

		const project = await t.repos.projects.create(alice.id, newProject({assetIds: [a.id]}));
		expect(project.id).toBeTruthy();
		expect(await t.repos.assets.allUsable(alice.id, [a.id])).toBe(false); // now attached
		expect(await t.repos.assets.markRejected(alice.id, b.id)).toBe(true);
		expect((await t.repos.assets.get(alice.id, b.id))?.status).toBe('rejected');
	});
});

describe('messages and brand kits', () => {
	it('appends and lists messages only for the owner', async () => {
		const project = await t.repos.projects.create(alice.id, newProject());
		const msg = await t.repos.messages.append(alice.id, project.id, {
			role: 'assistant',
			content: 'Want a voiceover?',
			ui: {type: 'choice', key: 'voiceover', options: ['yes', 'no']},
		});
		await t.repos.messages.append(alice.id, project.id, {role: 'user', content: 'yes'});
		expect(msg?.ui).toEqual({type: 'choice', key: 'voiceover', options: ['yes', 'no']});
		expect(await t.repos.messages.append(bob.id, project.id, {role: 'user', content: 'hijack'})).toBeNull();
		const page = await t.repos.messages.list(alice.id, project.id, {limit: 10});
		expect(page.items.map((m) => m.content)).toEqual(['yes', 'Want a voiceover?']);
		expect(page.items[0]).not.toHaveProperty('ui');
		expect((await t.repos.messages.list(bob.id, project.id, {limit: 10})).items).toEqual([]);
	});

	it('stores validated brand kits per user', async () => {
		const tokens = {
			bg: '#ffffff',
			surface: '#ffffff',
			surfaceAlt: '#f5f5f5',
			border: 'rgba(0,0,0,0.1)',
			fg: '#111111',
			muted: '#666666',
			accent: '#16a34a',
			accentFg: '#ffffff',
			radius: 12,
			fontFamily: 'Inter',
			motion: {pace: 'medium', easing: 'soft'},
		} as const;
		const kit = await t.repos.brandKits.create(alice.id, '# Brand', tokens);
		expect((await t.repos.brandKits.get(alice.id, kit.id))?.tokens).toEqual(tokens);
		expect(await t.repos.brandKits.get(bob.id, kit.id)).toBeNull();
		await expect(t.repos.brandKits.create(alice.id, '# x', {...tokens, accent: 'green'})).rejects.toThrow();
	});
});

describe('jobs and versions', () => {
	it('creates jobs for owned projects only and counts active ones', async () => {
		const project = await t.repos.projects.create(alice.id, newProject());
		expect(
			await t.repos.jobs.create(bob.id, project.id, {type: 'generate', reservedCredits: 20, deadlineMinutes: 20}),
		).toBeNull();
		const job = await t.repos.jobs.create(alice.id, project.id, {
			type: 'generate',
			reservedCredits: 20,
			deadlineMinutes: 20,
		});
		expect(job).toMatchObject({
			status: 'queued',
			reservedCredits: 20,
			chargedCredits: null,
			steps: [],
			versionId: null,
			error: null,
		});
		expect(await t.repos.jobs.get(bob.id, job?.id ?? '')).toBeNull();
		expect(await t.repos.jobs.countActive(alice.id)).toBe(1);
		expect(await t.repos.jobs.countActive(bob.id)).toBe(0);
		expect(await t.repos.jobs.hasActiveForProject(alice.id, project.id)).toBe(true);
	});

	it('orders steps by pipeline order and parses progress and errors', async () => {
		const project = await t.repos.projects.create(alice.id, newProject());
		const job = await t.repos.jobs.create(alice.id, project.id, {
			type: 'generate',
			reservedCredits: 20,
			deadlineMinutes: 20,
		});
		const jobId = job?.id ?? '';
		await db.jobStep.createMany({
			data: [
				{id: 'stp_00000002', jobId, node: 'sceneCoder', status: 'running', progress: {done: 1, total: 4}},
				{id: 'stp_00000001', jobId, node: 'research', status: 'done'},
			],
		});
		await db.job.update({where: {id: jobId}, data: {status: 'failed', error: {code: 'DEGRADED', message: 'down'}}});
		const loaded = await t.repos.jobs.get(alice.id, jobId);
		expect(loaded?.steps.map((s) => s.node)).toEqual(['research', 'sceneCoder']);
		expect(loaded?.steps[1]?.progress).toEqual({done: 1, total: 4});
		expect(loaded?.error).toEqual({code: 'DEGRADED', message: 'down'});
		expect(await t.repos.jobs.countActive(alice.id)).toBe(0);
	});

	it('finds overdue jobs for the deadline cron (FR-GEN-11)', async () => {
		const project = await t.repos.projects.create(alice.id, newProject());
		const job = await t.repos.jobs.create(alice.id, project.id, {
			type: 'generate',
			reservedCredits: 20,
			deadlineMinutes: 20,
		});
		expect(await t.repos.jobs.systemFindOverdue()).toEqual([]);
		t.clock.advance(21 * 60_000);
		expect(await t.repos.jobs.systemFindOverdue()).toEqual([{id: job?.id, userId: alice.id, projectId: project.id}]);
	});

	it('lists and reads versions only for the owner', async () => {
		const project = await t.repos.projects.create(alice.id, newProject());
		await db.version.create({
			data: {
				id: 'ver_00000001',
				projectId: project.id,
				userId: alice.id,
				number: 1,
				durationSec: 30,
				videoKey: 'r/v1.mp4',
			},
		});
		expect((await t.repos.versions.list(alice.id, project.id, {limit: 10})).items).toMatchObject([
			{id: 'ver_00000001', number: 1},
		]);
		expect((await t.repos.versions.list(bob.id, project.id, {limit: 10})).items).toEqual([]);
		expect(await t.repos.versions.get(bob.id, 'ver_00000001')).toBeNull();
		expect(await t.repos.versions.getKeys(alice.id, 'ver_00000001')).toEqual({videoKey: 'r/v1.mp4', posterKey: null});
		expect(await t.repos.versions.getKeys(bob.id, 'ver_00000001')).toBeNull();
	});
});

describe('accounts, idempotency, webhooks, flags', () => {
	it('returns usable buckets (soonest-expiring first) and the ledger balance', async () => {
		await grantCredits(db, alice.id, 50, 'p1');
		await db.creditBucket.create({
			data: {
				id: 'bkt_sub00001',
				userId: alice.id,
				source: 'subscription',
				granted: 100,
				remaining: 90,
				expiresAt: new Date(T0 + 86_400_000),
			},
		});
		await db.creditBucket.create({
			data: {
				id: 'bkt_old00001',
				userId: alice.id,
				source: 'subscription',
				granted: 100,
				remaining: 100,
				expiresAt: new Date(T0 - 1),
			},
		});
		const buckets = await t.repos.accounts.usableBuckets(alice.id);
		expect(buckets.map((b) => b.id)).toEqual(['bkt_sub00001', 'bkt_p1000000']);
		expect(await t.repos.accounts.ledgerBalance(alice.id)).toBe(50);
		expect(await t.repos.accounts.ledgerBalance(bob.id)).toBe(0);
		expect(await t.repos.accounts.usableBuckets(bob.id)).toEqual([]);
	});

	it('reads the profile with the active plan', async () => {
		expect((await t.repos.accounts.getProfile(alice.id))?.plan).toBeNull();
		await db.subscription.create({
			data: {
				id: 'sub_00000001',
				userId: alice.id,
				dodoSubscriptionId: 'dodo_sub_1',
				planCode: 'go',
				status: 'active',
				currentPeriodStart: new Date(T0),
				currentPeriodEnd: new Date(T0 + 30 * 86_400_000),
			},
		});
		expect((await t.repos.accounts.getProfile(alice.id))?.plan).toMatchObject({code: 'go', status: 'active'});
		expect(await t.repos.accounts.getProfile('usr_missing01')).toBeNull();
	});

	it('scopes idempotency records per user (NFR-SEC-16) and expires them', async () => {
		expect(
			await t.repos.idempotency.save(alice.id, 'key-1', {requestHash: 'h', status: 202, body: {jobId: 'job_1'}}),
		).toBe(true);
		expect(await t.repos.idempotency.save(alice.id, 'key-1', {requestHash: 'h', status: 202, body: {}})).toBe(false);
		expect(await t.repos.idempotency.find(alice.id, 'key-1')).toEqual({
			requestHash: 'h',
			status: 202,
			body: {jobId: 'job_1'},
		});
		expect(await t.repos.idempotency.find(bob.id, 'key-1')).toBeNull();
		expect(await t.repos.idempotency.save(bob.id, 'key-1', {requestHash: 'x', status: 200, body: {}})).toBe(true);
		t.clock.advance(25 * 3_600_000);
		expect(await t.repos.idempotency.find(alice.id, 'key-1')).toBeNull();
		expect(await t.repos.idempotency.systemPurgeExpired()).toBe(2);
	});

	it('records each webhook event exactly once (NFR-SEC-04)', async () => {
		expect(await t.repos.webhookEvents.recordOnce('dodo', 'evt_1', 'payment.succeeded')).toBe(true);
		expect(await t.repos.webhookEvents.recordOnce('dodo', 'evt_1', 'payment.succeeded')).toBe(false);
		expect(await t.repos.webhookEvents.recordOnce('render', 'evt_1', 'done')).toBe(true);
		await t.repos.webhookEvents.markProcessed('dodo', 'evt_1');
		const row = await db.webhookEvent.findUnique({where: {provider_eventId: {provider: 'dodo', eventId: 'evt_1'}}});
		expect(row?.processedAt?.getTime()).toBe(T0);
	});

	it('stores feature flags with defaults', async () => {
		expect(await t.repos.featureFlags.get('pause_new_jobs', false)).toBe(false);
		await t.repos.featureFlags.set('pause_new_jobs', true);
		expect(await t.repos.featureFlags.get('pause_new_jobs', false)).toBe(true);
		await t.repos.featureFlags.set('pause_new_jobs', false);
		expect(await t.repos.featureFlags.get('pause_new_jobs', true)).toBe(false);
	});

	it('deletes an account and everything it owns, including ledger history (NFR-LEG-02)', async () => {
		const project = await t.repos.projects.create(alice.id, newProject());
		await t.repos.messages.append(alice.id, project.id, {role: 'user', content: 'hi'});
		await grantCredits(db, alice.id, 50, 'd1');
		await grantCredits(db, bob.id, 50, 'd2');
		expect(await t.repos.accounts.deleteUser(alice.id)).toBe(true);
		expect(await db.project.count({where: {userId: alice.id}})).toBe(0);
		expect(await db.creditLedger.count({where: {userId: alice.id}})).toBe(0);
		expect(await db.creditBucket.count({where: {userId: alice.id}})).toBe(0);
		expect(await t.repos.accounts.ledgerBalance(bob.id)).toBe(50);
		expect(await t.repos.accounts.deleteUser(alice.id)).toBe(false);
	});
});
