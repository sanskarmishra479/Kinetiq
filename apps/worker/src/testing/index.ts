// Builds the worker's container with in-memory adapters, for tests only
// (docs/TEST_PLAN.md rule T4). Nothing here is used in production.
import {createRepos, type Db} from '@kinetiq/db';
import type {ClockPort, IdPort} from '@kinetiq/domain';
import {memoryEventBus, memoryKv, memoryQueues, memoryStorage, type KvPort} from '@kinetiq/platform';
import {loadConfig, RenderInput} from '@kinetiq/shared';
import {pino} from 'pino';
import type {WorkerContainer} from '../container.js';
import {unavailableRender, type RenderPort} from '@kinetiq/renderer/node';
import {mockLlm, mockMusic, mockScraper, mockVoice} from '../adapters/mock/index.js';
import {generationPipeline} from '../pipeline/index.js';
import {alwaysMoving, type MotionPort} from '../adapters/motion.js';
import type {LlmPort, MusicPort, ScraperPort, VoicePort} from '../ports.js';
import type {MediaProbePort, PipelinePort, ProbeFacts} from '../ports.js';

const ENV = {
	WEB_ORIGIN: 'http://localhost:3000',
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

/** A probe that always returns the given facts. */
export const fakeProbe = (facts: ProbeFacts | Error): MediaProbePort & {urls: string[]} => {
	const urls: string[] = [];
	return {
		urls,
		async probe(url) {
			urls.push(url);
			if (facts instanceof Error) throw facts;
			return facts;
		},
	};
};

export function testWorker(options: {
	db: Db;
	clock: ClockPort;
	ids: IdPort;
	pipeline?: PipelinePort;
	probe?: MediaProbePort;
	render?: RenderPort;
	kv?: KvPort;
	/** Pass the API's buses to connect the API and the worker in one test. */
	events?: ReturnType<typeof memoryEventBus>;
	queues?: ReturnType<typeof memoryQueues>;
}) {
	const storage = memoryStorage();
	const events = options.events ?? memoryEventBus();
	const queues = options.queues ?? memoryQueues();
	const container: WorkerContainer = {
		config: loadConfig(ENV),
		logger: pino({level: 'silent'}),
		clock: options.clock,
		ids: options.ids,
		db: options.db,
		repos: createRepos({db: options.db, ids: options.ids, clock: options.clock}),
		events,
		queues,
		storage,
		probe:
			options.probe ??
			fakeProbe({durationSec: 10, video: {codec: 'h264', width: 1920, height: 1080}, formats: ['mp4']}),
		kv: options.kv ?? memoryKv(),
		render: options.render ?? unavailableRender('no renderer in this test'),
		pipeline: options.pipeline ?? {run: async () => ({charge: 0})},
		watchMs: 10,
		bullConnection: null,
		close: async () => {},
	};
	return {container, storage, events, queues};
}

/** A renderer that writes plausible files instantly, for tests that aren't about rendering. */
export function fakeRender(
	storage: ReturnType<typeof memoryStorage>,
): RenderPort & {calls: {kind: string; key: string}[]} {
	const calls: {kind: string; key: string}[] = [];
	const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
	const MP4 = new Uint8Array([0, 0, 0, 0x20, ...[...'ftypisom'].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
	const write = async (kind: 'still' | 'final', key: string, input: unknown) => {
		// The fake enforces the render contract too, so a bad input fails here as well.
		RenderInput.parse(input);
		calls.push({kind, key});
		const body = kind === 'still' ? PNG : MP4;
		await storage.putObject(key, body, kind === 'still' ? 'image/png' : 'video/mp4');
		return {key, bytes: body.length};
	};
	return {
		calls,
		renderStill: (input, {outputKey}) => write('still', outputKey, input),
		renderFinal: async (input, {outputKey, onProgress}) => {
			onProgress?.(1);
			return write('final', outputKey, input);
		},
	};
}

export type TestProviders = {
	llm?: LlmPort;
	scraper?: ScraperPort;
	voice?: VoicePort;
	music?: MusicPort;
	/** Defaults to "every scene moves"; pass pngMotion() to measure real renders. */
	motion?: MotionPort;
};

/**
 * The real generation pipeline wired to the mock providers: what the worker
 * runs with MOCK_PROVIDERS=true, and what the Phase 8 tests exercise.
 */
export function testPipeline(
	container: WorkerContainer,
	providers: TestProviders = {},
	options: {maxFixRounds?: number; models?: Record<string, string>} = {},
) {
	return generationPipeline({
		retryDelayMs: 0,
		deps: {
			repos: container.repos,
			storage: container.storage,
			events: container.events,
			render: container.render,
			kv: container.kv,
			logger: container.logger,
			assetOrigins: [container.config.CONTENT_ORIGIN],
			llm: providers.llm ?? mockLlm(),
			scraper: providers.scraper ?? mockScraper(container.storage),
			voice: providers.voice ?? mockVoice(),
			music: providers.music ?? mockMusic(),
			motion: providers.motion ?? alwaysMoving(),
			...(options.maxFixRounds === undefined ? {} : {maxFixRounds: options.maxFixRounds}),
			...(options.models ? {models: options.models} : {}),
		},
	});
}
