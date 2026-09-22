import {createDb, createIdGenerator, createRepos, type Db, type Repos} from '@kinetiq/db';
import type {ClockPort, IdPort} from '@kinetiq/domain';
import type {Config} from '@kinetiq/shared';
import {Redis} from 'ioredis';
import type {Logger} from 'pino';
import {
	consoleEmail,
	dependencyHealth,
	fakeCaptcha,
	redisLocks,
	resendEmail,
	turnstileCaptcha,
} from './adapters/misc.js';
import {redisConnectionLimiter, redisRateLimiter} from './adapters/rate-limit.js';
import {bullQueues, redisEventBus, s3Storage, type EventBusPort, type QueuePort} from '@kinetiq/platform';
import {createAuth, type Auth} from './auth.js';
import {createLogger} from './middleware/logging.js';
import type {
	CaptchaPort,
	ConnectionLimitPort,
	EmailPort,
	HealthPort,
	LockPort,
	RateLimitPort,
	StoragePort,
} from './ports.js';

// Composition root: the only place that picks real implementations
// (docs/TEST_PLAN.md rule T4). Tests build the same shape with fakes.

export type Container = {
	config: Config;
	logger: Logger;
	clock: ClockPort;
	ids: IdPort;
	db: Db;
	repos: Repos;
	auth: Auth;
	email: EmailPort;
	captcha: CaptchaPort;
	rateLimiter: RateLimitPort;
	locks: LockPort;
	storage: StoragePort;
	queues: QueuePort;
	events: EventBusPort;
	connections: ConnectionLimitPort;
	health: HealthPort;
	close(): Promise<void>;
};

export type ContainerParts = Omit<Container, 'auth' | 'repos' | 'close'> & {close?: () => Promise<void>};

/** Wires repos and auth on top of the given parts. Shared by production and tests. */
export function assemble(parts: ContainerParts): Container {
	const repos = createRepos({db: parts.db, ids: parts.ids, clock: parts.clock});
	const auth = createAuth(parts);
	return {...parts, repos, auth, close: parts.close ?? (async () => {})};
}

export function buildContainer(config: Config): Container {
	const logger = createLogger(config.LOG_LEVEL);
	const clock: ClockPort = {now: () => Date.now()};
	const db = createDb(config.DATABASE_URL);
	const redis = new Redis(config.REDIS_URL, {maxRetriesPerRequest: 2, enableOfflineQueue: false});
	// Separate connections: pub/sub puts a connection in subscriber mode, and
	// BullMQ needs its own settings.
	const subscriber = new Redis(config.REDIS_URL, {maxRetriesPerRequest: null});
	const bull = new Redis(config.REDIS_URL, {maxRetriesPerRequest: 1});
	for (const conn of [redis, subscriber, bull]) conn.on('error', (err) => logger.error({err}, 'redis error'));
	const queues = bullQueues(bull);

	return assemble({
		config,
		logger,
		clock,
		ids: createIdGenerator(),
		db,
		// Outside local, config validation guarantees these keys exist.
		email: config.RESEND_API_KEY ? resendEmail(config.RESEND_API_KEY, config.EMAIL_FROM) : consoleEmail(),
		captcha: config.TURNSTILE_SECRET_KEY ? turnstileCaptcha(config.TURNSTILE_SECRET_KEY) : fakeCaptcha(),
		rateLimiter: redisRateLimiter(redis),
		locks: redisLocks(redis),
		storage: s3Storage({
			endpoint: config.S3_ENDPOINT,
			region: config.S3_REGION,
			accessKeyId: config.S3_ACCESS_KEY_ID,
			secretAccessKey: config.S3_SECRET_ACCESS_KEY,
			bucket: config.S3_BUCKET_CONTENT,
		}),
		queues,
		events: redisEventBus(redis, subscriber),
		connections: redisConnectionLimiter(redis),
		health: dependencyHealth({database: () => db.$queryRaw`SELECT 1`, redis: () => redis.ping()}),
		close: async () => {
			await queues.close();
			await Promise.allSettled([db.$disconnect(), redis.quit(), subscriber.quit(), bull.quit()]);
		},
	});
}
