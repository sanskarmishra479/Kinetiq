import {describe, expect, it} from 'vitest';
import {ConfigError, loadConfig, siteOf} from './config.js';

const local = {
	WEB_ORIGIN: 'http://localhost:3000',
	API_ORIGIN: 'http://localhost:4000',
	CONTENT_ORIGIN: 'http://localhost:9000',
	PUBLIC_CDN_ORIGIN: 'http://localhost:9000',
	DATABASE_URL: 'postgresql://kinetiq:kinetiq@localhost:5432/kinetiq',
	REDIS_URL: 'redis://localhost:6379',
	S3_ENDPOINT: 'http://localhost:9000',
	S3_ACCESS_KEY_ID: 'minio',
	S3_SECRET_ACCESS_KEY: 'minio-secret',
	S3_BUCKET_CONTENT: 'kinetiq-content',
	S3_BUCKET_PUBLIC: 'kinetiq-public',
	BETTER_AUTH_SECRET: 'x'.repeat(32),
	MOCK_PROVIDERS: 'true',
};

const production = {
	...local,
	NODE_ENV: 'production',
	APP_ENV: 'production',
	WEB_ORIGIN: 'https://kinetiq.so',
	API_ORIGIN: 'https://api.kinetiq.so',
	CONTENT_ORIGIN: 'https://files.kinetiqcontent.com',
	PUBLIC_CDN_ORIGIN: 'https://cdn.kinetiq.so',
	MOCK_PROVIDERS: 'false',
	RENDER_MODE: 'lambda',
	OPENROUTER_API_KEY: 'or-key',
	ELEVENLABS_API_KEY: 'el-key',
	FIRECRAWL_API_KEY: 'fc-key',
	GOOGLE_CLIENT_ID: 'gid',
	GOOGLE_CLIENT_SECRET: 'gsecret',
	TURNSTILE_SECRET_KEY: 'turnstile',
	DODO_API_KEY: 'dodo',
	DODO_WEBHOOK_SECRET: 'whsec',
	DODO_ENV: 'live_mode',
	RESEND_API_KEY: 'resend',
	REMOTION_AWS_REGION: 'us-east-1',
	REMOTION_AWS_ACCESS_KEY_ID: 'aws-id',
	REMOTION_AWS_SECRET_ACCESS_KEY: 'aws-secret',
	REMOTION_FUNCTION_NAME: 'remotion-render',
	REMOTION_SERVE_URL: 'https://remotion.example.com/site',
	RENDER_WEBHOOK_SECRET: 'render-secret',
};

const issuesOf = (env: Record<string, string | undefined>) => {
	try {
		loadConfig(env);
		return [];
	} catch (e) {
		expect(e).toBeInstanceOf(ConfigError);
		return (e as ConfigError).issues.map((i) => i.path);
	}
};

describe('loadConfig', () => {
	it('accepts a valid local config and applies defaults', () => {
		const c = loadConfig(local);
		expect(c.NODE_ENV).toBe('development');
		expect(c.APP_ENV).toBe('local');
		expect(c.MOCK_PROVIDERS).toBe(true);
		expect(c.RENDER_MODE).toBe('local');
		expect(c.WORKER_CONCURRENCY).toBe(20);
		expect(c.JOB_DEADLINE_MINUTES).toBe(20);
	});

	it('accepts a valid production config', () => {
		expect(loadConfig(production).RENDER_MODE).toBe('lambda');
	});

	it('reports missing required variables by name', () => {
		const {DATABASE_URL: _omit, ...env} = local;
		expect(issuesOf(env)).toContain('DATABASE_URL');
	});

	it('treats blank values as unset', () => {
		expect(issuesOf({...local, REDIS_URL: ''})).toContain('REDIS_URL');
	});

	it('rejects a short auth secret', () => {
		expect(issuesOf({...local, BETTER_AUTH_SECRET: 'short'})).toContain('BETTER_AUTH_SECRET');
	});

	it('coerces and bounds numeric settings', () => {
		expect(loadConfig({...local, WORKER_CONCURRENCY: '5'}).WORKER_CONCURRENCY).toBe(5);
		expect(issuesOf({...local, WORKER_CONCURRENCY: '0'})).toContain('WORKER_CONCURRENCY');
	});

	it('requires provider keys when providers are not mocked', () => {
		expect(issuesOf({...local, MOCK_PROVIDERS: 'false'})).toEqual([
			'OPENROUTER_API_KEY',
			'ELEVENLABS_API_KEY',
			'FIRECRAWL_API_KEY',
		]);
	});

	it('requires the Lambda settings when rendering on Lambda', () => {
		expect(issuesOf({...local, RENDER_MODE: 'lambda'})).toContain('REMOTION_SERVE_URL');
	});

	// NFR-SEC-12: scene code must never be rendered by a process holding secrets.
	it('refuses local rendering outside local', () => {
		expect(issuesOf({...production, RENDER_MODE: 'local'})).toContain('RENDER_MODE');
	});

	it('refuses mocked providers outside local', () => {
		expect(issuesOf({...production, MOCK_PROVIDERS: 'true'})).toContain('MOCK_PROVIDERS');
	});

	it('requires NODE_ENV=production outside local', () => {
		expect(issuesOf({...production, NODE_ENV: 'development'})).toContain('NODE_ENV');
	});

	it('requires auth, payment and email secrets outside local', () => {
		const {DODO_WEBHOOK_SECRET: _omit, ...env} = production;
		expect(issuesOf(env)).toEqual(['DODO_WEBHOOK_SECRET']);
	});

	it('requires https origins outside local', () => {
		expect(issuesOf({...production, API_ORIGIN: 'http://api.kinetiq.so'})).toEqual(['API_ORIGIN']);
	});

	// NFR-SEC-10: user files must not be same-site with the app.
	it('refuses a content domain on the same site as the app', () => {
		expect(issuesOf({...production, CONTENT_ORIGIN: 'https://files.kinetiq.so'})).toEqual(['CONTENT_ORIGIN']);
	});

	it('only allows live payments in production', () => {
		expect(issuesOf({...production, APP_ENV: 'staging'})).toEqual(['DODO_ENV']);
	});

	// NFR-SEC-15: config errors must never leak secret values.
	it('never includes values in error messages', () => {
		const secret = 'sk-live-SUPER-SECRET-VALUE';
		try {
			loadConfig({...local, DATABASE_URL: secret, BETTER_AUTH_SECRET: secret, DODO_ENV: secret});
			expect.unreachable();
		} catch (e) {
			expect((e as Error).message).not.toContain(secret);
			expect((e as Error).message).toContain('DATABASE_URL');
		}
	});
});

describe('siteOf', () => {
	it('returns the registrable domain', () => {
		expect(siteOf('https://api.kinetiq.so')).toBe('kinetiq.so');
		expect(siteOf('https://files.kinetiqcontent.com')).toBe('kinetiqcontent.com');
		expect(siteOf('http://localhost:3000')).toBe('localhost');
	});
});
