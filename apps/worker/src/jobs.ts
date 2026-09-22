import {closeJob, type JobOutcome} from '@kinetiq/db';
import type {WorkerContainer} from './container.js';

type JobRef = {id: string; userId: string; projectId: string};

/**
 * Ends a job (status, credits, project) and tells the browser. Returns false
 * if someone else (cancel, deadline sweep) already ended it.
 */
export async function finishJob(
	{repos, events}: Pick<WorkerContainer, 'repos' | 'events'>,
	job: JobRef,
	outcome: JobOutcome,
): Promise<boolean> {
	const result = await closeJob(repos, job, outcome);
	if (!result) return false;
	await events.publish(job.projectId, {
		type: 'job.finished',
		jobId: job.id,
		status: outcome.status,
		chargedCredits: result.charged,
		refunded: result.refunded,
	});
	const balance = await repos.credits.balance(job.userId);
	await events.publish(job.projectId, {
		type: 'credits.updated',
		total: balance.debt > 0 ? -balance.debt : balance.available,
	});
	return true;
}
