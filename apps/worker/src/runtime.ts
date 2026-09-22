import {JOB_DEFAULTS, parsePayload} from '@kinetiq/platform';
import {QUEUES} from '@kinetiq/shared';
import {Queue, Worker} from 'bullmq';
import type {WorkerContainer} from './container.js';
import {CRON_TASKS, isCronTask} from './processors/cron.js';
import {processGenerate} from './processors/generate.js';
import {processMaintenance} from './processors/maintenance.js';

// Starts the BullMQ workers and the cron schedules. Returns a stop function
// for graceful shutdown: workers finish their current jobs first (up to
// BullMQ's close timeout); unfinished jobs are picked up again after a restart.

export async function startWorkers(c: WorkerContainer): Promise<() => Promise<void>> {
	const connection = c.bullConnection;
	if (!connection) throw new Error('startWorkers needs a Redis connection');
	const log = c.logger;
	const common = {connection, lockDuration: 60_000, stalledInterval: 30_000, maxStalledCount: 1} as const;

	const workers = [
		new Worker(QUEUES.generate, (job) => processGenerate(c, parsePayload('generate', job.data)), {
			...common,
			concurrency: c.config.WORKER_CONCURRENCY,
		}),
		new Worker(QUEUES.maintenance, (job) => processMaintenance(c, parsePayload('maintenance', job.data)), {
			...common,
			concurrency: 2,
		}),
		new Worker(
			QUEUES.cron,
			async (job) => {
				if (!isCronTask(job.name)) throw new Error(`Unknown cron task ${job.name}`);
				return CRON_TASKS[job.name].run(c);
			},
			{...common, concurrency: 1},
		),
	];
	for (const w of workers) {
		w.on('failed', (job, err) => log.error({err, queue: w.name, jobId: job?.id}, 'queue job failed'));
		w.on('error', (err) => log.error({err, queue: w.name}, 'worker error'));
	}

	// Upserting schedules is idempotent: every worker replica can do it on boot.
	const cron = new Queue(QUEUES.cron, {connection, defaultJobOptions: JOB_DEFAULTS});
	for (const [name, task] of Object.entries(CRON_TASKS)) {
		await cron.upsertJobScheduler(name, {every: task.everyMs}, {name, data: {}});
	}

	log.info({queues: workers.map((w) => w.name), concurrency: c.config.WORKER_CONCURRENCY}, 'worker started');
	return async () => {
		await Promise.all(workers.map((w) => w.close()));
		await cron.close();
	};
}
