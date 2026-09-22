import {
	EditPayload,
	EmailPayload,
	GeneratePayload,
	MaintenancePayload,
	MediaPollPayload,
	RenderPayload,
	type QueueName,
} from '@kinetiq/shared';
import {Queue} from 'bullmq';
import type {Redis} from 'ioredis';
import type {z} from 'zod';

// Background job queues (docs/API.md §16). Payloads are validated when they
// go in AND when a worker takes them out, so a bad payload can't reach
// business code.

export const PAYLOADS = {
	generate: GeneratePayload,
	edit: EditPayload,
	render: RenderPayload,
	'media-poll': MediaPollPayload,
	email: EmailPayload,
	maintenance: MaintenancePayload,
} as const;

export type PayloadQueue = keyof typeof PAYLOADS;
export type PayloadOf<Q extends PayloadQueue> = z.infer<(typeof PAYLOADS)[Q]>;

export type EnqueueOptions = {
	/** Stable id: enqueueing the same id twice creates one job (dedup). */
	jobId?: string;
	delayMs?: number;
	attempts?: number;
};

export interface QueuePort {
	enqueue<Q extends PayloadQueue>(queue: Q, payload: PayloadOf<Q>, options?: EnqueueOptions): Promise<void>;
	/** Removes a job that hasn't started yet. Returns false if it's running or gone. */
	remove(queue: PayloadQueue, jobId: string): Promise<boolean>;
	close(): Promise<void>;
}

/** BullMQ rejects custom ids containing ":"; the fake enforces the same rule. */
function checkJobId(jobId: string | undefined) {
	if (jobId !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(jobId)) throw new Error(`Invalid queue job id "${jobId}"`);
}

export const parsePayload = <Q extends PayloadQueue>(queue: Q, data: unknown): PayloadOf<Q> =>
	PAYLOADS[queue].parse(data) as PayloadOf<Q>;

/** Shared defaults: keep a bounded history so Redis memory stays flat. */
export const JOB_DEFAULTS = {
	removeOnComplete: {count: 1000, age: 24 * 3600},
	removeOnFail: {count: 5000, age: 7 * 24 * 3600},
} as const;

export function bullQueues(connection: Redis): QueuePort {
	const queues = new Map<QueueName, Queue>();
	const queueFor = (name: QueueName) => {
		let q = queues.get(name);
		if (!q) {
			q = new Queue(name, {connection, defaultJobOptions: JOB_DEFAULTS});
			queues.set(name, q);
		}
		return q;
	};

	return {
		async enqueue(queue, payload, options = {}) {
			const data = parsePayload(queue, payload);
			checkJobId(options.jobId);
			await queueFor(queue).add(queue, data, {
				...(options.jobId ? {jobId: options.jobId} : {}),
				...(options.delayMs ? {delay: options.delayMs} : {}),
				attempts: options.attempts ?? 1,
				backoff: {type: 'exponential', delay: 2000},
			});
		},

		async remove(queue, jobId) {
			const job = await queueFor(queue).getJob(jobId);
			if (!job) return false;
			const state = await job.getState();
			if (state !== 'waiting' && state !== 'delayed' && state !== 'prioritized') return false;
			await job.remove();
			return true;
		},

		async close() {
			await Promise.all([...queues.values()].map((q) => q.close()));
		},
	};
}

/** Tests: records jobs instead of sending them to Redis. */
export function memoryQueues(): QueuePort & {jobs: {queue: PayloadQueue; payload: unknown; options: EnqueueOptions}[]} {
	const jobs: {queue: PayloadQueue; payload: unknown; options: EnqueueOptions}[] = [];
	return {
		jobs,
		async enqueue(queue, payload, options = {}) {
			const data = parsePayload(queue, payload);
			checkJobId(options.jobId);
			if (options.jobId && jobs.some((j) => j.queue === queue && j.options.jobId === options.jobId)) return;
			jobs.push({queue, payload: data, options});
		},
		async remove(queue, jobId) {
			const i = jobs.findIndex((j) => j.queue === queue && j.options.jobId === jobId);
			if (i === -1) return false;
			jobs.splice(i, 1);
			return true;
		},
		async close() {},
	};
}
