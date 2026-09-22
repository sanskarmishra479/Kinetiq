import type {ErrorCode} from '@kinetiq/shared';
import {AlreadySettled, type CreditsService} from './credits.js';
import type {jobsRepo} from './repos/jobs.js';
import type {projectsRepo} from './repos/projects.js';

// Ending a job, shared by the worker (success/failure), the cancel endpoint
// and the deadline sweep (FR-GEN-09, FR-GEN-11, FR-CRD-05/06).
// 1. Flip the job to its final status. Only the first caller wins, so a
//    cancel racing with the worker can't settle twice.
// 2. Settle credits: charge `charge` (capped at the reservation), refund the rest.
// 3. Move the project to its next status.
// If the process dies between 1 and 2, the stale-reservation cron refunds later.

export type JobOutcome =
	| {status: 'succeeded'; charge: number}
	| {status: 'failed'; error: {code: ErrorCode; message: string}}
	| {status: 'cancelled'};

type Deps = {
	jobs: ReturnType<typeof jobsRepo>;
	projects: ReturnType<typeof projectsRepo>;
	credits: CreditsService;
};

export async function closeJob(
	{jobs, projects, credits}: Deps,
	job: {id: string; userId: string; projectId: string},
	outcome: JobOutcome,
): Promise<{charged: number; refunded: number} | null> {
	const error = outcome.status === 'failed' ? outcome.error : null;
	if (!(await jobs.systemFinish(job.id, outcome.status, error))) return null;

	let result = {charged: 0, refunded: 0};
	try {
		result = await credits.settleJob(job.userId, job.id, outcome.status === 'succeeded' ? outcome.charge : 0);
	} catch (e) {
		if (!(e instanceof AlreadySettled)) throw e;
	}

	const next = outcome.status === 'succeeded' ? 'done' : outcome.status === 'failed' ? 'failed' : 'ready';
	await projects.setStatus(job.userId, job.projectId, next);
	return result;
}
