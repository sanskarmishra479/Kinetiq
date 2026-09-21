import {ErrorCode, PipelineNode, type Job, type PageQuery, type Version} from '@kinetiq/shared';
import {z} from 'zod';
import type {Job as JobRow, JobStep as StepRow, Version as VersionRow} from '../generated/prisma/client.js';
import {iso, isoOrNull, paginate, type RepoDeps} from './shared.js';

// Jobs and versions. User-facing reads are scoped by userId; the few
// system-wide queries (for cron) are clearly named `system*`.

const JobError = z.object({code: ErrorCode, message: z.string()});
const StepProgress = z.object({done: z.int().min(0), total: z.int().min(1)});

function toJob(
	row: JobRow & {steps: StepRow[]; version: {id: string} | null},
	queuePosition: number | null = null,
): Job {
	const order = (node: string) => PipelineNode.options.indexOf(node as PipelineNode);
	return {
		id: row.id,
		type: row.type,
		status: row.status,
		reservedCredits: row.reservedCredits,
		chargedCredits: row.chargedCredits,
		queuePosition,
		steps: [...row.steps]
			.sort((a, b) => order(a.node) - order(b.node))
			.map((s) => ({
				node: PipelineNode.parse(s.node),
				status: s.status,
				...(s.progress === null ? {} : {progress: StepProgress.parse(s.progress)}),
				startedAt: isoOrNull(s.startedAt),
				endedAt: isoOrNull(s.endedAt),
			})),
		versionId: row.version?.id ?? null,
		error: row.error === null ? null : JobError.parse(row.error),
	};
}

function toVersion(row: VersionRow): Version {
	return {
		id: row.id,
		number: row.number,
		createdAt: iso(row.createdAt),
		posterUrl: null, // signed URLs are added by the API layer
		durationSec: row.durationSec ?? 0,
		parentVersionId: row.parentVersionId,
	};
}

const ACTIVE = ['queued', 'running'] as const;

export function jobsRepo({db, ids, clock}: RepoDeps) {
	return {
		/** Returns null when the project isn't this user's. Credits are reserved separately (Phase 5). */
		async create(
			userId: string,
			projectId: string,
			input: {type: Job['type']; reservedCredits: number; deadlineMinutes: number},
		): Promise<Job | null> {
			const owned = await db.project.findFirst({where: {id: projectId, userId}, select: {id: true}});
			if (!owned) return null;
			const now = clock.now();
			const row = await db.job.create({
				data: {
					id: ids.next('job'),
					userId,
					projectId,
					type: input.type,
					reservedCredits: input.reservedCredits,
					deadlineAt: new Date(now + input.deadlineMinutes * 60_000),
					createdAt: new Date(now),
				},
				include: {steps: true, version: {select: {id: true}}},
			});
			return toJob(row);
		},

		async get(userId: string, jobId: string): Promise<Job | null> {
			const row = await db.job.findFirst({
				where: {id: jobId, userId},
				include: {steps: true, version: {select: {id: true}}},
			});
			return row ? toJob(row) : null;
		},

		/** Jobs still queued or running, for per-plan concurrency limits (FR-GEN-10). */
		countActive(userId: string): Promise<number> {
			return db.job.count({where: {userId, status: {in: [...ACTIVE]}}});
		},

		/** Whether this project already has a queued or running job (409 CONFLICT). */
		async hasActiveForProject(userId: string, projectId: string): Promise<boolean> {
			return (await db.job.count({where: {userId, projectId, status: {in: [...ACTIVE]}}})) > 0;
		},

		/** SYSTEM (cron): unfinished jobs past their deadline (FR-GEN-11). */
		systemFindOverdue(limit = 100) {
			return db.job.findMany({
				where: {status: {in: [...ACTIVE]}, deadlineAt: {lt: new Date(clock.now())}},
				orderBy: {deadlineAt: 'asc'},
				take: limit,
				select: {id: true, userId: true, projectId: true},
			});
		},
	};
}

export function versionsRepo({db}: RepoDeps) {
	return {
		list(userId: string, projectId: string, page: PageQuery) {
			return paginate(
				(args) =>
					db.version.findMany({where: {projectId, userId, ...args.where}, orderBy: {id: 'desc'}, take: args.take}),
				page,
				toVersion,
			);
		},

		async get(userId: string, versionId: string): Promise<Version | null> {
			const row = await db.version.findFirst({where: {id: versionId, userId}});
			return row ? toVersion(row) : null;
		},

		/** Internal: the storage keys for a download or stream URL. Scoped by user. */
		getKeys(userId: string, versionId: string) {
			return db.version.findFirst({where: {id: versionId, userId}, select: {videoKey: true, posterKey: true}});
		},
	};
}
