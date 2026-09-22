import {creditsService, createIdGenerator} from '@kinetiq/db';
import {resetDb, testDb} from '@kinetiq/db/testing';
import {EstimateResponse, MeResponse} from '@kinetiq/shared';
import type TestAgent from 'supertest/lib/agent.js';
import {beforeEach, describe, expect, it} from 'vitest';
import {loginAs, testApi, WEB} from '../testing/index.js';

// Estimates, ledger and balances through the API (FR-GEN-01, FR-BILL-03, FR-CRD-09).
const db = testDb();
const credits = creditsService({db, ids: createIdGenerator(), clock: {now: () => Date.now()}});

let api: ReturnType<typeof testApi>;
let alice: {agent: TestAgent; userId: string};
let bob: {agent: TestAgent; userId: string};

beforeEach(async () => {
	await resetDb(db);
	api = testApi({db});
	alice = await loginAs(api, 'alice@acme.com');
	bob = await loginAs(api, 'bob@acme.com');
});

async function project(durationSec = 30) {
	const res = await alice.agent
		.post('/v1/projects')
		.set('Origin', WEB)
		.send({url: 'https://acme.com', durationSec, ratio: '16:9', prompt: 'x'});
	return res.body.project.id as string;
}

const estimateFor = (who: {agent: TestAgent}, id: string) =>
	who.agent.post(`/v1/projects/${id}/estimate`).set('Origin', WEB).send({});

describe('POST /v1/projects/:id/estimate', () => {
	it('prices the video and says whether the user can afford it', async () => {
		const id = await project(30);
		const broke = EstimateResponse.parse((await estimateFor(alice, id)).body);
		expect(broke).toEqual({credits: 20, breakdown: [{item: 'video_30s', credits: 20}], balance: 0, canAfford: false});

		await credits.grant(alice.userId, {amount: 25, source: 'purchase', key: 'p1'});
		expect((await estimateFor(alice, id)).body).toMatchObject({balance: 25, canAfford: true});
	});

	it('adds the voiceover once it is chosen', async () => {
		const id = await project(15);
		await alice.agent
			.post(`/v1/projects/${id}/messages`)
			.set('Origin', WEB)
			.set('Idempotency-Key', 'key_voiceover_000001')
			.send({answer: {key: 'voiceover', value: true}});
		expect((await estimateFor(alice, id)).body).toMatchObject({
			credits: 13,
			breakdown: [
				{item: 'video_15s', credits: 10},
				{item: 'voiceover', credits: 3},
			],
		});
	});

	it("is not available for someone else's project", async () => {
		const id = await project();
		expect((await estimateFor(bob, id)).status).toBe(404);
	});
});

describe('GET /v1/billing/ledger and /v1/me', () => {
	it('shows only your own credit history', async () => {
		await credits.grant(alice.userId, {amount: 60, source: 'purchase', key: 'a'});
		await credits.grant(bob.userId, {amount: 99, source: 'purchase', key: 'b'});
		const res = await alice.agent.get('/v1/billing/ledger');
		expect(res.body.items).toMatchObject([{type: 'grant', amount: 60}]);
		expect((await bob.agent.get('/v1/billing/ledger')).body.items).toMatchObject([{type: 'grant', amount: 99}]);
	});

	it('reports spendable credits, and debt as a negative total', async () => {
		await credits.grant(alice.userId, {amount: 60, source: 'purchase', key: 'pay'});
		expect(MeResponse.parse((await alice.agent.get('/v1/me')).body).credits.total).toBe(60);
		await credits.clawback(alice.userId, 80, 'chargeback:pay');
		expect((await alice.agent.get('/v1/me')).body.credits.total).toBe(-20);
	});
});
