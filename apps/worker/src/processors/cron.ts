import type {WorkerContainer} from '../container.js';
import {finishJob} from '../jobs.js';
import {keys} from '../pipeline/state.js';

// Scheduled housekeeping (FR-GEN-11, FR-CRD-08, NFR-SCALE-06). Each task is
// idempotent, so a task that runs twice (two workers, a retry) is harmless.

export const CRON_TASKS = {
	/** Fails and refunds jobs past their deadline (FR-GEN-11). */
	'deadline-sweep': {everyMs: 60_000, run: deadlineSweep},
	/** Refunds reservations of jobs that ended without settling (FR-CRD-08). */
	'refund-stale': {everyMs: 15 * 60_000, run: (c: WorkerContainer) => c.repos.credits.systemRefundStale()},
	/** Empties credit buckets whose period ended. */
	'expire-credits': {everyMs: 15 * 60_000, run: (c: WorkerContainer) => c.repos.credits.systemExpireDue()},
	/** Deletes uploads nobody can use any more (never finished, rejected, or unattached for a week). */
	'cleanup-uploads': {everyMs: 60 * 60_000, run: cleanupUploads},
	/** Removes saved progress and working files of jobs that ended over a day ago (the retry window). */
	'cleanup-job-leftovers': {everyMs: 60 * 60_000, run: cleanupJobLeftovers},
	/** Drops expired Idempotency-Key records. */
	'purge-idempotency': {everyMs: 60 * 60_000, run: (c: WorkerContainer) => c.repos.idempotency.systemPurgeExpired()},
} as const satisfies Record<string, {everyMs: number; run: (c: WorkerContainer) => Promise<number>}>;

export type CronTask = keyof typeof CRON_TASKS;

export const isCronTask = (name: string): name is CronTask => Object.hasOwn(CRON_TASKS, name);

async function deadlineSweep(c: WorkerContainer): Promise<number> {
	let failed = 0;
	for (const job of await c.repos.jobs.systemFindOverdue()) {
		const ended = await finishJob(c, job, {
			status: 'failed',
			error: {code: 'INTERNAL', message: 'The video took too long. Your credits were refunded.'},
		});
		if (ended) failed++;
	}
	return failed;
}

async function cleanupUploads({repos, storage}: WorkerContainer): Promise<number> {
	const unused = await repos.assets.systemFindUnused();
	const done: string[] = [];
	for (const asset of unused) {
		await storage.delete(asset.storageKey);
		done.push(asset.id);
	}
	return done.length > 0 ? repos.assets.systemDelete(done) : 0;
}

const RETRY_WINDOW_MS = 24 * 60 * 60_000;

async function cleanupJobLeftovers({repos, storage, clock}: WorkerContainer): Promise<number> {
	const jobs = await repos.jobs.systemFindLeftovers(clock.now() - RETRY_WINDOW_MS);
	for (const job of jobs) {
		await storage.deletePrefix(keys.temp(job.userId, job.id));
		await repos.checkpoints.clear(job.id);
	}
	return jobs.length;
}
