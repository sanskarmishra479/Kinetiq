// Builds the worker's container with in-memory adapters, for tests only
// (docs/TEST_PLAN.md rule T4). Nothing here is used in production.
import {createRepos, type Db} from '@kinetiq/db';
import type {ClockPort, IdPort} from '@kinetiq/domain';
import {memoryEventBus, memoryQueues, memoryStorage} from '@kinetiq/platform';
import {loadConfig} from '@kinetiq/shared';
import {pino} from 'pino';
import type {WorkerContainer} from '../container.js';
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
		pipeline: options.pipeline ?? {run: async () => ({charge: 0})},
		watchMs: 10,
		bullConnection: null,
		close: async () => {},
	};
	return {container, storage, events, queues};
}
