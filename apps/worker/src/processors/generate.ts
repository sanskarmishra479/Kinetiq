import type {GeneratePayload} from '@kinetiq/shared';
import type {WorkerContainer} from '../container.js';
import {finishJob} from '../jobs.js';
import {PipelineError, type PipelineContext} from '../ports.js';

// Runs one generate job (FR-GEN-02…11).
// - Safe to run twice: only a queued job starts; a job found "running" was
//   interrupted by a crash and is failed with a full refund (resuming from a
//   checkpoint arrives with the real pipeline, Phase 8).
// - While it runs, a watcher aborts it if it is cancelled or passes its deadline.
// - Every ending goes through finishJob, so credits are settled exactly once.

export type GenerateResult = 'succeeded' | 'failed' | 'aborted' | 'skipped';

class JobAborted extends Error {
	constructor() {
		super('Job was cancelled or timed out');
		this.name = 'JobAborted';
	}
}

const GENERIC_FAILURE = 'Something went wrong while making your video. Your credits were refunded.';

export async function processGenerate(c: WorkerContainer, payload: GeneratePayload): Promise<GenerateResult> {
	const {repos, events, logger, clock} = c;
	const row = await repos.jobs.systemGet(payload.jobId);
	if (!row || row.userId !== payload.userId || row.projectId !== payload.projectId) return 'skipped';
	const job = {id: row.id, userId: row.userId, projectId: row.projectId};

	if (row.status === 'running') {
		await finishJob(c, job, {
			status: 'failed',
			error: {code: 'INTERNAL', message: 'The video was interrupted. Your credits were refunded.'},
		});
		return 'failed';
	}
	if (row.status !== 'queued' || !(await repos.jobs.systemStart(job.id))) return 'skipped';

	const controller = new AbortController();
	const deadline = row.deadlineAt.getTime();
	const watcher = setInterval(() => {
		void (async () => {
			const current = await repos.jobs.systemGet(job.id);
			if (current?.status !== 'running' || clock.now() > deadline) controller.abort();
		})().catch((err: unknown) => logger.warn({err}, 'job watcher failed'));
	}, c.watchMs);

	const ctx: PipelineContext = {
		job,
		signal: controller.signal,
		emit: async (event) => {
			await events.publish(job.projectId, event);
		},
		progress: async (node, done, total) => {
			await repos.jobs.systemRecordStep(job.id, node, 'running', {done, total});
			await events.publish(job.projectId, {type: 'step.progress', jobId: job.id, node, done, total});
		},
		step: async (node, run, summary) => {
			if (controller.signal.aborted) throw new JobAborted();
			await repos.jobs.systemRecordStep(job.id, node, 'running');
			await events.publish(job.projectId, {type: 'step.started', jobId: job.id, node});
			try {
				const result = await run();
				if (controller.signal.aborted) throw new JobAborted();
				await repos.jobs.systemRecordStep(job.id, node, 'done');
				const text = summary?.(result)?.slice(0, 300);
				await events.publish(job.projectId, {
					type: 'step.done',
					jobId: job.id,
					node,
					...(text ? {summary: text} : {}),
				});
				return result;
			} catch (error) {
				if (!(error instanceof JobAborted)) {
					await repos.jobs.systemRecordStep(job.id, node, 'failed');
					await events.publish(job.projectId, {type: 'step.failed', jobId: job.id, node, retrying: false, attempt: 1});
				}
				throw error;
			}
		},
	};

	try {
		const {charge} = await c.pipeline.run(ctx);
		if (controller.signal.aborted) throw new JobAborted();
		return (await finishJob(c, job, {status: 'succeeded', charge})) ? 'succeeded' : 'aborted';
	} catch (error) {
		if (error instanceof JobAborted || controller.signal.aborted) {
			// Cancelled: the cancel endpoint already refunded. Timed out: fail and refund here.
			const ended = await finishJob(c, job, {
				status: 'failed',
				error: {code: 'INTERNAL', message: 'The video took too long. Your credits were refunded.'},
			});
			return ended ? 'failed' : 'aborted';
		}
		if (!(error instanceof PipelineError)) logger.error({err: error, jobId: job.id}, 'pipeline crashed');
		const failure =
			error instanceof PipelineError
				? {code: error.code, message: error.message}
				: {code: 'INTERNAL' as const, message: GENERIC_FAILURE};
		await finishJob(c, job, {status: 'failed', error: failure});
		return 'failed';
	} finally {
		clearInterval(watcher);
	}
}
