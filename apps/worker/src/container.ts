import {createDb, createIdGenerator, createRepos, type Db, type Repos} from '@kinetiq/db';
import type {ClockPort, IdPort} from '@kinetiq/domain';
import {
	bullQueues,
	redisEventBus,
	redisKv,
	s3Storage,
	type EventBusPort,
	type KvPort,
	type QueuePort,
	type StoragePort,
} from '@kinetiq/platform';
import {localRender, unavailableRender, type RenderPort} from '@kinetiq/renderer/node';
import {modelFor, type Config} from '@kinetiq/shared';
import {Redis} from 'ioredis';
import {pino, type Logger} from 'pino';
import {ffprobe} from './adapters/ffprobe.js';
import {pngMotion} from './adapters/motion.js';
import {firecrawlScraper} from './adapters/providers/firecrawl.js';
import {openRouterLlm} from './adapters/providers/openrouter.js';
import {voiceProvider} from './adapters/providers/voices.js';
import {mockLlm, mockMusic, mockScraper, mockVoice} from './adapters/mock/index.js';
import {generationPipeline} from './pipeline/index.js';
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
	kv: KvPort;
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
	const events = redisEventBus(redis, subscriber);
	const kv = redisKv(redis);
	const storage = s3Storage({
		endpoint: config.S3_ENDPOINT,
		region: config.S3_REGION,
		accessKeyId: config.S3_ACCESS_KEY_ID,
		secretAccessKey: config.S3_SECRET_ACCESS_KEY,
		bucket: config.S3_BUCKET_CONTENT,
	});
	const repos = createRepos({db, ids, clock});
	const render =
		config.RENDER_MODE === 'local'
			? localRender({storage, env: {NODE_ENV: config.NODE_ENV}})
			: unavailableRender('Remotion Lambda rendering is not connected yet (TODO Phase 12)');

	return {
		config,
		logger,
		clock,
		ids,
		db,
		repos,
		events,
		kv,
		queues,
		storage,
		probe: ffprobe(),
		render,
		// Providers: mocks locally and in tests, the real ones in Phase 9.
		// Mock providers locally and in tests; real ones chosen from the environment (§5.1).
		pipeline: generationPipeline({
			deps: {
				repos,
				storage,
				events,
				render,
				kv,
				logger,
				assetOrigins: [config.CONTENT_ORIGIN],
				motion: pngMotion(storage),
				...(config.MOCK_PROVIDERS ? mockProviders(storage) : realProviders(config, storage)),
			},
		}),
		watchMs: 5000,
		bullConnection: bull,
		close: async () => {
			await queues.close();
			await Promise.allSettled([db.$disconnect(), redis.quit(), subscriber.quit(), bull.quit()]);
		},
	};
}

const mockProviders = (storage: StoragePort) => ({
	llm: mockLlm(),
	scraper: mockScraper(storage),
	voice: mockVoice(),
	music: mockMusic(),
	models: null,
});

/**
 * The real providers, chosen in the environment (NFR-MNT-05). config.ts has
 * already checked that every key they need is set.
 */
export function realProviders(config: Config, storage: StoragePort) {
	const models = Object.fromEntries(
		(['research', 'designMd', 'director', 'sceneCoder', 'sceneFix', 'visualQA'] as const).map((role) => [
			role,
			modelFor(config, role)!,
		]),
	);
	return {
		llm: openRouterLlm({
			apiKey: config.OPENROUTER_API_KEY!,
			modelFor: (role) => models[role]!,
			fallbackModel: config.LLM_MODEL_FALLBACK,
			appUrl: config.WEB_ORIGIN,
		}),
		scraper: firecrawlScraper({apiKey: config.FIRECRAWL_API_KEY!, storage}),
		voice: voiceProvider({
			provider: config.TTS_PROVIDER,
			apiKey: {
				elevenlabs: config.ELEVENLABS_API_KEY,
				sarvam: config.SARVAM_API_KEY,
				openrouter: config.OPENROUTER_API_KEY,
			}[config.TTS_PROVIDER]!,
			model: config.TTS_MODEL,
			voices: config.TTS_VOICES,
		}),
		// The music library arrives with the audio phase (Phase 10); until then, no music.
		music: mockMusic(),
		models,
	};
}

/** Startup check: the configured OpenRouter models exist, and the QA model accepts images. */
export function modelsToCheck(config: Config) {
	const keys = [
		'LLM_MODEL_DEFAULT',
		'LLM_MODEL_FALLBACK',
		'LLM_MODEL_RESEARCH',
		'LLM_MODEL_DESIGN',
		'LLM_MODEL_DIRECTOR',
		'LLM_MODEL_SCENE_CODER',
		'LLM_MODEL_VISUAL_QA',
	] as const;
	const list = keys.flatMap((key) => (config[key] ? [{key, model: config[key]}] : []));
	const qa = modelFor(config, 'visualQA');
	return qa ? [...list, {key: 'LLM_MODEL_VISUAL_QA (or default)', model: qa, needsImages: true}] : list;
}
