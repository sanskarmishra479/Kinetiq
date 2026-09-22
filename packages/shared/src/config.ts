import {z} from 'zod';

// Typed, validated configuration for the API and worker.
// Every variable is documented in /.env.example. The app refuses to start with
// an invalid or unsafe config, and error messages never include values
// (NFR-SEC-15), only variable names.

const optionalString = z.string().min(1).optional();
const flag = z.stringbool().default(false);

const schema = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
	LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

	/** Port the API listens on (hosts like Railway set PORT). */
	PORT: z.coerce.number().int().min(1).max(65535).default(4000),
	WEB_ORIGIN: z.url(),
	API_ORIGIN: z.url(),
	CONTENT_ORIGIN: z.url(),
	PUBLIC_CDN_ORIGIN: z.url(),

	DATABASE_URL: z.url(),
	DATABASE_DIRECT_URL: z.url().optional(),
	REDIS_URL: z.url(),

	S3_ENDPOINT: z.url(),
	S3_REGION: z.string().min(1).default('auto'),
	S3_ACCESS_KEY_ID: z.string().min(1),
	S3_SECRET_ACCESS_KEY: z.string().min(1),
	S3_BUCKET_CONTENT: z.string().min(1),
	S3_BUCKET_PUBLIC: z.string().min(1),

	BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
	/** Cookie domain shared by the app and API, e.g. ".kinetiq.so". Unset locally. */
	COOKIE_DOMAIN: z
		.string()
		.regex(/^\.[a-z0-9.-]+$/, 'must look like ".example.com"')
		.optional(),
	/** Number of trusted proxy hops in front of the API (Cloudflare + Railway = 2). */
	TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
	GOOGLE_CLIENT_ID: optionalString,
	GOOGLE_CLIENT_SECRET: optionalString,
	TURNSTILE_SECRET_KEY: optionalString,

	MOCK_PROVIDERS: flag,
	RENDER_MODE: z.enum(['local', 'lambda']).default('local'),

	OPENROUTER_API_KEY: optionalString,
	ELEVENLABS_API_KEY: optionalString,
	FIRECRAWL_API_KEY: optionalString,
	SARVAM_API_KEY: optionalString,

	DODO_API_KEY: optionalString,
	DODO_WEBHOOK_SECRET: optionalString,
	DODO_ENV: z.enum(['test_mode', 'live_mode']).default('test_mode'),

	REMOTION_AWS_REGION: optionalString,
	REMOTION_AWS_ACCESS_KEY_ID: optionalString,
	REMOTION_AWS_SECRET_ACCESS_KEY: optionalString,
	REMOTION_FUNCTION_NAME: optionalString,
	REMOTION_SERVE_URL: z.url().optional(),
	RENDER_WEBHOOK_SECRET: optionalString,

	RESEND_API_KEY: optionalString,
	EMAIL_FROM: z.string().min(3).default('Kinetiq <hello@kinetiq.so>'),
	SENTRY_DSN: z.url().optional(),
	LANGSMITH_API_KEY: optionalString,

	WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(20),
	JOB_DEADLINE_MINUTES: z.coerce.number().int().min(1).max(120).default(20),
});

export type Config = z.infer<typeof schema>;

/** Every variable the app reads. .env.example must document exactly these. */
export const CONFIG_KEYS = Object.keys(schema.shape) as (keyof Config)[];

type Issue = {path: string; message: string};

// Rules that depend on several variables at once.
function crossChecks(c: Config): Issue[] {
	const issues: Issue[] = [];
	const need = (keys: (keyof Config)[], why: string) => {
		for (const key of keys) if (!c[key]) issues.push({path: key, message: `is required ${why}`});
	};

	if (!c.MOCK_PROVIDERS) {
		need(['OPENROUTER_API_KEY', 'ELEVENLABS_API_KEY', 'FIRECRAWL_API_KEY'], 'when MOCK_PROVIDERS=false');
	}
	if (c.RENDER_MODE === 'lambda') {
		need(
			[
				'REMOTION_AWS_REGION',
				'REMOTION_AWS_ACCESS_KEY_ID',
				'REMOTION_AWS_SECRET_ACCESS_KEY',
				'REMOTION_FUNCTION_NAME',
				'REMOTION_SERVE_URL',
				'RENDER_WEBHOOK_SECRET',
			],
			'when RENDER_MODE=lambda',
		);
	}

	// A production build never renders scene code in-process, even if APP_ENV is misconfigured (NFR-SEC-12).
	if (c.NODE_ENV === 'production' && c.RENDER_MODE === 'local') {
		issues.push({path: 'RENDER_MODE', message: 'must be "lambda" when NODE_ENV=production'});
	}

	const deployed = c.APP_ENV !== 'local';
	if (deployed) {
		// Untrusted scene code must never run next to secrets (NFR-SEC-12).
		if (c.RENDER_MODE !== 'lambda') issues.push({path: 'RENDER_MODE', message: 'must be "lambda" outside local'});
		if (c.MOCK_PROVIDERS) issues.push({path: 'MOCK_PROVIDERS', message: 'must be false outside local'});
		if (c.NODE_ENV !== 'production') issues.push({path: 'NODE_ENV', message: 'must be "production" outside local'});
		need(
			[
				'COOKIE_DOMAIN',
				'GOOGLE_CLIENT_ID',
				'GOOGLE_CLIENT_SECRET',
				'TURNSTILE_SECRET_KEY',
				'DODO_API_KEY',
				'DODO_WEBHOOK_SECRET',
				'RESEND_API_KEY',
			],
			'outside local',
		);
		for (const key of ['WEB_ORIGIN', 'API_ORIGIN', 'CONTENT_ORIGIN', 'PUBLIC_CDN_ORIGIN'] as const) {
			if (!c[key].startsWith('https://')) issues.push({path: key, message: 'must use https outside local'});
		}
		// User files must live on a different site than the app (NFR-SEC-10).
		if (siteOf(c.CONTENT_ORIGIN) === siteOf(c.WEB_ORIGIN)) {
			issues.push({path: 'CONTENT_ORIGIN', message: 'must be on a different domain than WEB_ORIGIN'});
		}
	}
	if (c.DODO_ENV === 'live_mode' && c.APP_ENV !== 'production') {
		issues.push({path: 'DODO_ENV', message: 'live_mode is only allowed in production'});
	}
	return issues;
}

// Registrable domain approximation: the last two labels of the hostname
// ("api.kinetiq.so" → "kinetiq.so"). Enough to tell our two domains apart.
export function siteOf(origin: string): string {
	return new URL(origin).hostname.split('.').slice(-2).join('.');
}

export class ConfigError extends Error {
	constructor(readonly issues: Issue[]) {
		super(`Invalid configuration:\n${issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`);
		this.name = 'ConfigError';
	}
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
	// Treat blank values ("KEY=") as unset, like most dotenv tools do.
	const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
	const parsed = schema.safeParse(cleaned);
	if (!parsed.success) {
		throw new ConfigError(
			parsed.error.issues.map((i) => ({
				path: i.path.join('.'),
				// Zod's own messages can echo input for some checks; use a generic one per code.
				message: i.code === 'invalid_type' ? 'is required' : `is invalid (${i.code})`,
			})),
		);
	}
	const issues = crossChecks(parsed.data);
	if (issues.length > 0) throw new ConfigError(issues);
	return parsed.data;
}
