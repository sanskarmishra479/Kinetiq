import {Writable} from 'node:stream';
import express, {type RequestHandler} from 'express';
import request from 'supertest';
import {describe, expect, it} from 'vitest';
import {z} from 'zod';
import {memoryLocks} from '../adapters/misc.js';
import {memoryRateLimiter} from '../adapters/rate-limit.js';
import {AppError, errorHandler, notFoundHandler} from '../errors.js';
import {idempotent, type IdempotencyStore} from './idempotency.js';
import {createLogger, httpLogger, pathOnly} from './logging.js';
import {byIp, byUser, rateLimit} from './rate-limit.js';
import {corsFor, originCheck, securityHeaders} from './security.js';
import {requireAdmin, requireAuth, type RequestIdentity} from './session.js';

const WEB = 'https://kinetiq.so';

/** A tiny app: optional identity, the middleware under test, a route, the error handler. */
function appWith(
	middleware: RequestHandler[],
	identity?: RequestIdentity | ((req: express.Request) => RequestIdentity),
) {
	const app = express();
	app.use(express.json());
	if (identity)
		app.use((req, _res, next) => ((req.auth = typeof identity === 'function' ? identity(req) : identity), next()));
	app.all('/v1/{*path}', ...middleware, (req, res) => void res.json({ok: true, body: req.body ?? null}));
	app.use(notFoundHandler);
	app.use(errorHandler);
	return app;
}

const alice: RequestIdentity = {userId: 'usr_alice0001', role: 'user', twoFactorEnabled: false, sessionId: 'ses_1'};

describe('error handler', () => {
	const app = express();
	app.use(express.json({limit: '10b'}));
	app.get('/app', () => {
		throw new AppError('INSUFFICIENT_CREDITS', 'Need more', {required: 23}, {'Retry-After': '5'});
	});
	app.get('/zod', () => {
		z.object({url: z.string()}).parse({});
	});
	app.get('/boom', () => {
		throw new Error('database password is hunter2');
	});
	app.post('/json', (_req, res) => void res.json({}));
	app.use(notFoundHandler);
	app.use(errorHandler);

	it('maps AppError to its status, envelope and headers', async () => {
		const res = await request(app).get('/app');
		expect(res.status).toBe(402);
		expect(res.headers['retry-after']).toBe('5');
		expect(res.body.error).toMatchObject({code: 'INSUFFICIENT_CREDITS', message: 'Need more', details: {required: 23}});
	});

	it('turns validation errors into 400 with field messages', async () => {
		const res = await request(app).get('/zod');
		expect(res.status).toBe(400);
		expect(res.body.error.code).toBe('VALIDATION_ERROR');
		expect(res.body.error.details.fields).toHaveProperty('url');
	});

	it('hides internal error details behind a generic 500', async () => {
		const res = await request(app).get('/boom');
		expect(res.status).toBe(500);
		expect(res.body.error.code).toBe('INTERNAL');
		expect(JSON.stringify(res.body)).not.toContain('hunter2');
	});

	it('handles bad JSON, oversized bodies and unknown routes', async () => {
		expect((await request(app).post('/json').set('content-type', 'application/json').send('{bad')).status).toBe(400);
		const big = await request(app)
			.post('/json')
			.send({x: 'a'.repeat(100)});
		expect(big.status).toBe(413);
		expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
		const missing = await request(app).get('/nope');
		expect(missing.status).toBe(404);
		expect(missing.body.error.code).toBe('NOT_FOUND');
	});
});

describe('security headers and CORS (NFR-SEC-09)', () => {
	const make = (hsts: boolean) => {
		const app = express();
		app.disable('x-powered-by');
		app.use(securityHeaders(hsts), corsFor(WEB));
		app.get('/x', (_req, res) => void res.json({}));
		return app;
	};

	it('sets a locked-down CSP and safe defaults', async () => {
		const res = await request(make(true)).get('/x');
		expect(res.headers['content-security-policy']).toContain("default-src 'none'");
		expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
		expect(res.headers['x-content-type-options']).toBe('nosniff');
		expect(res.headers['referrer-policy']).toBe('no-referrer');
		expect(res.headers['strict-transport-security']).toContain('max-age=63072000');
		expect(res.headers['x-powered-by']).toBeUndefined();
	});

	it('only sends HSTS when deployed', async () => {
		expect((await request(make(false)).get('/x')).headers['strict-transport-security']).toBeUndefined();
	});

	it('allows credentials only from the web origin', async () => {
		const ok = await request(make(true)).options('/x').set('Origin', WEB).set('Access-Control-Request-Method', 'POST');
		expect(ok.headers['access-control-allow-origin']).toBe(WEB);
		expect(ok.headers['access-control-allow-credentials']).toBe('true');
		const evil = await request(make(true))
			.options('/x')
			.set('Origin', 'https://evil.example')
			.set('Access-Control-Request-Method', 'POST');
		expect(evil.headers['access-control-allow-origin']).not.toBe('https://evil.example');
	});
});

describe('Origin check (NFR-SEC-11)', () => {
	const app = appWith([originCheck(WEB)]);

	it('blocks state-changing requests from other or missing origins', async () => {
		expect((await request(app).post('/v1/projects').set('Origin', 'https://evil.example')).status).toBe(403);
		expect((await request(app).post('/v1/projects')).status).toBe(403);
		expect((await request(app).delete('/v1/me').set('Origin', 'https://kinetiq.so.evil.example')).status).toBe(403);
	});

	it('allows our origin, safe methods and signed webhooks', async () => {
		expect((await request(app).post('/v1/projects').set('Origin', WEB)).status).toBe(200);
		expect((await request(app).get('/v1/projects')).status).toBe(200);
		expect((await request(app).post('/v1/webhooks/dodo')).status).toBe(200);
	});
});

describe('rate limits (NFR-SEC-03)', () => {
	it('returns 429 with Retry-After after the limit, per key', async () => {
		const limiter = memoryRateLimiter();
		const rule = {name: 'test', points: 3, durationSec: 60};
		const app = appWith([rateLimit(limiter, rule, byUser)], (req) => ({
			...alice,
			userId: req.header('x-user') ?? 'usr_x',
		}));
		for (let i = 0; i < 3; i++) {
			const res = await request(app).get('/v1/x').set('x-user', 'usr_alice0001');
			expect(res.status).toBe(200);
			expect(res.headers['ratelimit-remaining']).toBe(String(2 - i));
		}
		const blocked = await request(app).get('/v1/x').set('x-user', 'usr_alice0001');
		expect(blocked.status).toBe(429);
		expect(blocked.body.error.code).toBe('RATE_LIMITED');
		expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
		expect((await request(app).get('/v1/x').set('x-user', 'usr_bob000001')).status).toBe(200);
	});

	it('skips the user rule for anonymous requests and keys IPs', async () => {
		const limiter = memoryRateLimiter();
		const app = appWith([rateLimit(limiter, {name: 'u', points: 1, durationSec: 60}, byUser)]);
		expect((await request(app).get('/v1/x')).status).toBe(200);
		expect((await request(app).get('/v1/x')).status).toBe(200);
		expect(byIp({ip: '1.2.3.4'} as express.Request)).toBe('ip:1.2.3.4');
	});
});

describe('auth guards', () => {
	it('requireAuth rejects anonymous callers', async () => {
		const res = await request(appWith([requireAuth])).get('/v1/me');
		expect(res.status).toBe(401);
		expect(res.body.error.code).toBe('UNAUTHENTICATED');
		expect((await request(appWith([requireAuth], alice)).get('/v1/me')).status).toBe(200);
	});

	it('requireAdmin needs the admin role AND two-factor (FR-AUTH-07)', async () => {
		expect((await request(appWith([requireAdmin])).get('/v1/admin')).status).toBe(401);
		expect((await request(appWith([requireAdmin], alice)).get('/v1/admin')).status).toBe(403);
		const adminNo2fa = {...alice, role: 'admin' as const};
		expect((await request(appWith([requireAdmin], adminNo2fa)).get('/v1/admin')).status).toBe(403);
		expect(
			(await request(appWith([requireAdmin], {...adminNo2fa, twoFactorEnabled: true})).get('/v1/admin')).status,
		).toBe(200);
	});
});

describe('idempotency (FR-CHAT-04, NFR-SEC-16)', () => {
	function memoryStore(): IdempotencyStore & {rows: Map<string, {requestHash: string; status: number; body: unknown}>} {
		const rows = new Map<string, {requestHash: string; status: number; body: unknown}>();
		return {
			rows,
			find: async (u, k) => rows.get(`${u}:${k}`) ?? null,
			save: async (u, k, r) => (rows.has(`${u}:${k}`) ? false : (rows.set(`${u}:${k}`, r), true)),
		};
	}

	function counted(store: IdempotencyStore, fail = false) {
		let calls = 0;
		const app = express();
		app.use(express.json());
		app.use((req, _res, next) => ((req.auth = {...alice, userId: req.header('x-user') ?? alice.userId}), next()));
		app.post('/v1/jobs', idempotent(store, memoryLocks()), (req, res) => {
			calls += 1;
			res.status(fail ? 500 : 202).json({call: calls, body: req.body});
		});
		app.use(errorHandler);
		return {app, calls: () => calls};
	}

	const KEY = 'key_0123456789abcdef'; // gitleaks:allow (test idempotency key)

	it('requires a well-formed key', async () => {
		const {app} = counted(memoryStore());
		expect((await request(app).post('/v1/jobs').send({})).status).toBe(400);
		expect((await request(app).post('/v1/jobs').set('Idempotency-Key', 'short').send({})).status).toBe(400);
	});

	it('runs once and replays the stored response', async () => {
		const store = memoryStore();
		const {app, calls} = counted(store);
		const first = await request(app).post('/v1/jobs').set('Idempotency-Key', KEY).send({a: 1});
		await new Promise((r) => setTimeout(r, 10));
		const again = await request(app).post('/v1/jobs').set('Idempotency-Key', KEY).send({a: 1});
		expect(first.status).toBe(202);
		expect(again.status).toBe(202);
		expect(again.body).toEqual(first.body);
		expect(again.headers['idempotent-replayed']).toBe('true');
		expect(calls()).toBe(1);
	});

	it('rejects the same key with a different body', async () => {
		const {app} = counted(memoryStore());
		await request(app).post('/v1/jobs').set('Idempotency-Key', KEY).send({a: 1});
		await new Promise((r) => setTimeout(r, 10));
		const res = await request(app).post('/v1/jobs').set('Idempotency-Key', KEY).send({a: 2});
		expect(res.status).toBe(409);
		expect(res.body.error.code).toBe('IDEMPOTENCY_MISMATCH');
	});

	it("never returns another user's stored response", async () => {
		const {app, calls} = counted(memoryStore());
		await request(app).post('/v1/jobs').set('Idempotency-Key', KEY).send({a: 1});
		await new Promise((r) => setTimeout(r, 10));
		const bob = await request(app)
			.post('/v1/jobs')
			.set('x-user', 'usr_bob000001')
			.set('Idempotency-Key', KEY)
			.send({a: 1});
		expect(bob.status).toBe(202);
		expect(bob.headers['idempotent-replayed']).toBeUndefined();
		expect(calls()).toBe(2);
	});

	it('does not store server errors, so they can be retried', async () => {
		const store = memoryStore();
		const {app} = counted(store, true);
		expect((await request(app).post('/v1/jobs').set('Idempotency-Key', KEY).send({})).status).toBe(500);
		expect(store.rows.size).toBe(0);
	});

	it('refuses a duplicate that arrives while the first is still running', async () => {
		const store = memoryStore();
		const locks = memoryLocks();
		await locks.acquire(`idem:${alice.userId}:${KEY}`, 1000);
		const app = express();
		app.use(express.json());
		app.use((req, _res, next) => ((req.auth = alice), next()));
		app.post('/v1/jobs', idempotent(store, locks), (_req, res) => void res.json({}));
		app.use(errorHandler);
		const res = await request(app).post('/v1/jobs').set('Idempotency-Key', KEY).send({});
		expect(res.status).toBe(409);
		expect(res.body.error.code).toBe('CONFLICT');
	});
});

describe('logging (NFR-SEC-15)', () => {
	it('logs a request id and path only, never secrets', async () => {
		const lines: string[] = [];
		const sink = new Writable({write: (chunk, _enc, cb) => (lines.push(chunk.toString()), cb())});
		const logger = createLogger('info', sink);
		const app = express();
		app.use(httpLogger(logger));
		app.use(express.json());
		app.post('/api/auth/magic-link/verify', (req, res) => {
			req.log.info({email: 'asha@acme.com', token: 'tok-secret'}, 'handled');
			res.json({});
		});
		const res = await request(app)
			.post('/api/auth/magic-link/verify?token=MAGIC-SECRET')
			.set('Cookie', 'kinetiq.session_token=COOKIE-SECRET')
			.set('Authorization', 'Bearer BEARER-SECRET')
			.send({email: 'asha@acme.com'});
		const log = lines.join('\n');
		expect(res.headers['x-request-id']).toMatch(/^req_/);
		expect(log).toContain(res.headers['x-request-id']);
		expect(log).toContain('/api/auth/magic-link/verify');
		for (const secret of ['MAGIC-SECRET', 'COOKIE-SECRET', 'BEARER-SECRET', 'asha@acme.com', 'tok-secret']) {
			expect(log).not.toContain(secret);
		}
	});

	it('reuses a well-formed incoming request id and replaces a bad one', async () => {
		const app = express();
		app.use(httpLogger(createLogger('silent')));
		app.get('/x', (_req, res) => void res.json({}));
		expect((await request(app).get('/x').set('X-Request-Id', 'lb-12345678')).headers['x-request-id']).toBe(
			'lb-12345678',
		);
		expect((await request(app).get('/x').set('X-Request-Id', '<script>')).headers['x-request-id']).toMatch(/^req_/);
		expect(pathOnly('/a?b=c')).toBe('/a');
		expect(pathOnly(undefined)).toBe('');
	});
});
