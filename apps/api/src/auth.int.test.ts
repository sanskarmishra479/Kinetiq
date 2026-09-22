import {resetDb, testDb} from '@kinetiq/db/testing';
import {MeResponse} from '@kinetiq/shared';
import request from 'supertest';
import {beforeEach, describe, expect, it} from 'vitest';
import {DEPLOYED_ENV, testApi, WEB} from './testing/index.js';

// End-to-end authentication against a real database (FR-AUTH-01…07).
const db = testDb();

beforeEach(async () => {
	await resetDb(db);
});

type Api = ReturnType<typeof testApi>;

async function requestLink(api: Api, email: string, extra: Record<string, unknown> = {}, origin = WEB) {
	return request(api.app)
		.post('/api/auth/sign-in/magic-link')
		.set('Origin', origin)
		.set('x-turnstile-token', 'ok')
		.send({email, callbackURL: `${origin}/app`, ...extra});
}

/** Requests a link, "clicks" it and returns a cookie-carrying agent. */
async function logIn(api: Api, email = 'asha@acme.com') {
	expect((await requestLink(api, email)).status).toBe(200);
	const sent = api.email.sent.at(-1);
	if (sent?.template !== 'magicLink') throw new Error('no login email sent');
	const link = new URL(sent.url);
	const agent = request.agent(api.app);
	const verify = await agent.get(link.pathname + link.search);
	return {agent, verify};
}

describe('magic link login', () => {
	it('logs in, sets a safe session cookie and loads /v1/me', async () => {
		const api = testApi({db});
		const {agent, verify} = await logIn(api);
		expect(verify.status).toBe(302);
		expect(verify.headers.location).toBe(`${WEB}/app`);
		const cookie = (verify.headers['set-cookie'] as unknown as string[]).find((c) =>
			c.startsWith('kinetiq.session_token='),
		);
		expect(cookie).toMatch(/HttpOnly/i);
		expect(cookie).toMatch(/SameSite=Lax/i);

		const me = await agent.get('/v1/me');
		expect(me.status).toBe(200);
		const body = MeResponse.parse(me.body);
		expect(body.user.email).toBe('asha@acme.com');
		expect(body.user.id).toMatch(/^usr_/);
		expect(body.credits).toEqual({total: 0, reserved: 0, buckets: []});
		expect(body.plan).toBeNull();
		expect(body.limits.concurrentJobs).toBe(1);
	});

	it('uses a login link only once', async () => {
		const api = testApi({db});
		await logIn(api);
		const link = new URL((api.email.sent[0] as {url: string}).url);
		const reuse = await request(api.app).get(link.pathname + link.search);
		expect(reuse.headers['set-cookie']?.toString() ?? '').not.toContain('kinetiq.session_token=');
	});

	it('stores login tokens hashed, never in plain text', async () => {
		const api = testApi({db});
		await requestLink(api, 'asha@acme.com');
		const token = new URL((api.email.sent[0] as {url: string}).url).searchParams.get('token') ?? '';
		const rows = await db.verification.findMany();
		expect(rows.length).toBeGreaterThan(0);
		expect(JSON.stringify(rows)).not.toContain(token);
	});

	it('rejects a failed captcha without sending an email (FR-AUTH-03)', async () => {
		const api = testApi({db});
		const res = await request(api.app)
			.post('/api/auth/sign-in/magic-link')
			.set('Origin', WEB)
			.set('x-turnstile-token', 'fail')
			.send({email: 'asha@acme.com', callbackURL: `${WEB}/app`});
		expect(res.status).toBe(403);
		expect(api.email.sent).toHaveLength(0);
	});

	it('limits login emails per address (FR-AUTH-06)', async () => {
		const api = testApi({db});
		for (let i = 0; i < 3; i++) expect((await requestLink(api, 'Victim@Acme.com')).status).toBe(200);
		const blocked = await requestLink(api, 'victim@acme.com');
		expect(blocked.status).toBe(429);
		expect(api.email.sent).toHaveLength(3);
		expect((await requestLink(api, 'someone-else@acme.com')).status).toBe(200);
	});

	it('answers the same for known and unknown emails (no user enumeration)', async () => {
		const api = testApi({db});
		await logIn(api, 'known@acme.com');
		const known = await requestLink(api, 'known@acme.com');
		const unknown = await requestLink(api, 'never-seen@acme.com');
		expect(known.status).toBe(unknown.status);
		expect(known.body).toEqual(unknown.body);
	});

	it('refuses callback URLs outside our web app (open redirect)', async () => {
		const api = testApi({db});
		const res = await requestLink(api, 'asha@acme.com', {callbackURL: 'https://evil.example/steal'});
		expect(res.status).toBe(403);
		expect(api.email.sent).toHaveLength(0);
	});

	it('never lets a sign-up choose its own role', async () => {
		const api = testApi({db});
		await requestLink(api, 'sneaky@acme.com', {role: 'admin'});
		const link = new URL((api.email.sent[0] as {url: string}).url);
		await request(api.app).get(link.pathname + link.search);
		const user = await db.user.findUnique({where: {email: 'sneaky@acme.com'}});
		expect(user?.role).toBe('user');
	});

	it('limits auth requests per IP', async () => {
		const api = testApi({db});
		let last = 0;
		for (let i = 0; i < 11; i++) last = (await request(api.app).get('/api/auth/get-session')).status;
		expect(last).toBe(429);
	});

	it('sets Secure, domain-scoped cookies when deployed (FR-AUTH-02)', async () => {
		const api = testApi({db, env: DEPLOYED_ENV});
		const res = await requestLink(api, 'asha@acme.com', {}, 'https://kinetiq.so');
		expect(res.status).toBe(200);
		const link = new URL((api.email.sent[0] as {url: string}).url);
		const verify = await request(api.app).get(link.pathname + link.search);
		const cookie = (verify.headers['set-cookie'] as unknown as string[]).find((c) => c.includes('session_token='));
		expect(cookie).toMatch(/^__Secure-kinetiq\.session_token=/);
		expect(cookie).toMatch(/; Secure/i);
		expect(cookie).toMatch(/Domain=\.?kinetiq\.so/i);
		expect(cookie).toMatch(/HttpOnly/i);
	});
});

describe('/v1 access rules', () => {
	it('requires a session', async () => {
		const res = await request(testApi({db}).app).get('/v1/me');
		expect(res.status).toBe(401);
		expect(res.body.error).toMatchObject({code: 'UNAUTHENTICATED'});
		expect(res.body.error.requestId).toMatch(/^req_/);
	});

	it('deletes the account only with confirmation and our Origin (NFR-LEG-02, NFR-SEC-11)', async () => {
		const api = testApi({db});
		const {agent} = await logIn(api);
		expect((await agent.delete('/v1/me').send({confirm: true})).status).toBe(403); // no Origin
		expect((await agent.delete('/v1/me').set('Origin', WEB).send({})).status).toBe(400);
		const res = await agent.delete('/v1/me').set('Origin', WEB).send({confirm: true});
		expect(res.status).toBe(204);
		expect(await db.user.count({where: {email: 'asha@acme.com'}})).toBe(0);
		expect(await db.session.count()).toBe(0);
		expect((await agent.get('/v1/me')).status).toBe(401);
	});

	it('returns JSON 404 for unknown routes', async () => {
		const res = await request(testApi({db}).app).get('/v1/does-not-exist');
		expect(res.status).toBe(404);
		expect(res.body.error.code).toBe('NOT_FOUND');
	});
});

describe('health checks', () => {
	it('reports liveness and readiness', async () => {
		expect((await request(testApi({db}).app).get('/healthz')).body).toEqual({ok: true});
		expect((await request(testApi({db}).app).get('/readyz')).status).toBe(200);
		const down = testApi({db, health: {check: async () => ['redis']}});
		const res = await request(down.app).get('/readyz');
		expect(res.status).toBe(503);
		expect(res.body).toEqual({ok: false, down: ['redis']});
	});
});
