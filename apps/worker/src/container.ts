import {createDb, createIdGenerator, createRepos, type Db, type Repos} from '@kinetiq/db';
import type {ClockPort, IdPort} from '@kinetiq/domain';
import {
	bullQueues,
	redisEventBus,
	s3Storage,
	type EventBusPort,
	type QueuePort,
	type StoragePort,
} from '@kinetiq/platform';
import {localRender, unavailableRender, type RenderPort} from '@kinetiq/renderer/node';
import type {Config} from '@kinetiq/shared';
import {Redis} from 'ioredis';
import {pino, type Logger} from 'pino';
import {ffprobe} from './adapters/ffprobe.js';
import {placeholderPipeline} from './pipeline.js';
import type {MediaProbePort, PipelinePort} from './ports.js';

// Composition root for the worker (docs/TEST_PLAN.md rule T4). Tests build
// the same shape with fakes (./testing).

export type WorkerContainer = {
	config: Config;
	logger: Logger;
	clock: ClockPort;
	ids: IdPort;
	db: Db;
	repos: Repos;
	events: EventBusPort;
	queues: QueuePort;
	storage: StoragePort;
	probe: MediaProbePort;
	/** Local Chrome in development; Remotion Lambda in production (Phase 12). */
	render: RenderPort;
	pipeline: PipelinePort;
	/** How often a running job checks whether it was cancelled. */
	watchMs: number;
	/** Redis connection for BullMQ workers (null in tests that don't start workers). */
	bullConnection: Redis | null;
	close(): Promise<void>;
};

export function buildWorkerContainer(config: Config): WorkerContainer {
	const logger = pino({level: config.LOG_LEVEL, base: {service: 'worker'}});
	const clock: ClockPort = {now: () => Date.now()};
	const ids = createIdGenerator();
	const db = createDb(config.DATABASE_URL);
	const redis = new Redis(config.REDIS_URL, {maxRetriesPerRequest: 2});
	const subscriber = new Redis(config.REDIS_URL, {maxRetriesPerRequest: null});
	// BullMQ workers need maxRetriesPerRequest: null (they block on Redis).
	const bull = new Redis(config.REDIS_URL, {maxRetriesPerRequest: null});
	for (const conn of [redis, subscriber, bull]) conn.on('error', (err) => logger.error({err}, 'redis error'));
	const queues = bullQueues(bull);
	const storage = s3Storage({
		endpoint: config.S3_ENDPOINT,
		region: config.S3_REGION,
		accessKeyId: config.S3_ACCESS_KEY_ID,
		secretAccessKey: config.S3_SECRET_ACCESS_KEY,
		bucket: config.S3_BUCKET_CONTENT,
	});

	return {
		config,
		logger,
		clock,
		ids,
		db,
		repos: createRepos({db, ids, clock}),
		events: redisEventBus(redis, subscriber),
		queues,
		storage,
		probe: ffprobe(),
		render:
			config.RENDER_MODE === 'local'
				? localRender({storage, env: {NODE_ENV: config.NODE_ENV}})
				: unavailableRender('Remotion Lambda rendering is not connected yet (TODO Phase 12)'),
		pipeline: placeholderPipeline(),
		watchMs: 5000,
		bullConnection: bull,
		close: async () => {
			await queues.close();
			await Promise.allSettled([db.$disconnect(), redis.quit(), subscriber.quit(), bull.quit()]);
		},
	};
}
