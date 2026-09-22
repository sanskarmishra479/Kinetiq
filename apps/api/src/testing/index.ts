// Builds the real API app with in-memory adapters, for tests only
// (docs/TEST_PLAN.md rule T4). Nothing here is used in production.
import {createIdGenerator, type Db} from '@kinetiq/db';
import {loadConfig} from '@kinetiq/shared';
import {pino} from 'pino';
import {fakeCaptcha, memoryEmail, memoryLocks} from '../adapters/misc.js';
import {memoryRateLimiter} from '../adapters/rate-limit.js';
import {buildApp} from '../app.js';
import {assemble} from '../container.js';
import type {HealthPort} from '../ports.js';

export const WEB = 'http://localhost:3000';

export const TEST_ENV: Record<string, string> = {
	WEB_ORIGIN: WEB,
	API_ORIGIN: 'http://localhost:4000',
	CONTENT_ORIGIN: 'http://localhost:9000',
	PUBLIC_CDN_ORIGIN: 'http://localhost:9000',
	DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
	REDIS_URL: 'redis://localhost:6379',
	S3_ENDPOINT: 'http://localhost:9000',
	S3_ACCESS_KEY_ID: 'test',
	S3_SECRET_ACCESS_KEY: 'test',
	S3_BUCKET_CONTENT: 'content',
	S3_BUCKET_PUBLIC: 'public',
	BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters-long', // gitleaks:allow (test-only fake)
	MOCK_PROVIDERS: 'true',
	LOG_LEVEL: 'silent',
};

/** A staging-like config: secure cookies, cookie domain, strict checks. */
export const DEPLOYED_ENV: Record<string, string> = {
	...TEST_ENV,
	NODE_ENV: 'production',
	APP_ENV: 'staging',
	WEB_ORIGIN: 'https://kinetiq.so',
	API_ORIGIN: 'https://api.kinetiq.so',
	CONTENT_ORIGIN: 'https://files.kinetiqcontent.com',
	PUBLIC_CDN_ORIGIN: 'https://cdn.kinetiq.so',
	COOKIE_DOMAIN: '.kinetiq.so',
	MOCK_PROVIDERS: 'false',
	RENDER_MODE: 'lambda',
	OPENROUTER_API_KEY: 'x',
	ELEVENLABS_API_KEY: 'x',
	FIRECRAWL_API_KEY: 'x',
	GOOGLE_CLIENT_ID: 'x',
	GOOGLE_CLIENT_SECRET: 'x',
	TURNSTILE_SECRET_KEY: 'x',
	DODO_API_KEY: 'x',
	DODO_WEBHOOK_SECRET: 'x',
	RESEND_API_KEY: 'x',
	REMOTION_AWS_REGION: 'us-east-1',
	REMOTION_AWS_ACCESS_KEY_ID: 'x',
	REMOTION_AWS_SECRET_ACCESS_KEY: 'x',
	REMOTION_FUNCTION_NAME: 'x',
	REMOTION_SERVE_URL: 'https://remotion.example.com/site',
	RENDER_WEBHOOK_SECRET: 'x',
};

export function testApi(options: {db: Db; env?: Record<string, string>; health?: HealthPort}) {
	const config = loadConfig({...TEST_ENV, ...options.env});
	const email = memoryEmail();
	const container = assemble({
		config,
		logger: pino({level: 'silent'}),
		clock: {now: () => Date.now()},
		ids: createIdGenerator(),
		db: options.db,
		email,
		captcha: fakeCaptcha(),
		rateLimiter: memoryRateLimiter(),
		locks: memoryLocks(),
		health: options.health ?? {check: async () => []},
	});
	return {app: buildApp(container), container, email};
}
