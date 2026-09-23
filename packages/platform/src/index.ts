// @kinetiq/platform: infrastructure adapters shared by the API and the worker
// (object storage, queues, realtime events, Redis checks). Each port has a
// real adapter and an in-memory fake for tests (docs/TEST_PLAN.md rule T4).
export {EventEnvelope, memoryEventBus, redisEventBus, REPLAY_LIMIT, type EventBusPort} from './events.js';
export {memoryKv, redisKv, type KvPort} from './kv.js';
export type {PresignedPut, StoragePort} from './ports.js';
export {
	bullQueues,
	JOB_DEFAULTS,
	memoryQueues,
	parsePayload,
	PAYLOADS,
	type EnqueueOptions,
	type PayloadOf,
	type PayloadQueue,
	type QueuePort,
} from './queue.js';
export {assertRedisNoEviction, UnsafeRedisPolicy} from './redis.js';
export {assertSafePrefix, memoryStorage, s3Storage, type S3Options} from './storage.js';
