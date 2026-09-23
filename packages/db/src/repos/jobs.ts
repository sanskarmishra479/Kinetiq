import {ErrorCode, PipelineNode, type Job, type PageQuery, type Version} from '@kinetiq/shared';
import {createHash} from 'node:crypto';
import type {Prisma} from '../generated/prisma/client.js';
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
			if (!row) return null;
			const position = row.status === 'queued' ? await this.queuePosition(row.id) : null;
			return toJob(row, position);
		},

		/** Jobs still queued or running, for per-plan concurrency limits (FR-GEN-10). */
		countActive(userId: string): Promise<number> {
			return db.job.count({where: {userId, status: {in: [...ACTIVE]}}});
		},

		/** The project's queued or running job, if any. */
		async getActiveForProject(userId: string, projectId: string): Promise<Job | null> {
			const row = await db.job.findFirst({
				where: {userId, projectId, status: {in: [...ACTIVE]}},
				orderBy: {id: 'desc'},
				include: {steps: true, version: {select: {id: true}}},
			});
			return row ? toJob(row) : null;
		},

		/** Whether this project already has a queued or running job (409 CONFLICT). */
		async hasActiveForProject(userId: string, projectId: string): Promise<boolean> {
			return (await db.job.count({where: {userId, projectId, status: {in: [...ACTIVE]}}})) > 0;
		},

		/** Jobs started in the last 24 hours, for the per-plan daily cap. */
		countSince(userId: string, sinceMs: number): Promise<number> {
			return db.job.count({where: {userId, createdAt: {gte: new Date(sinceMs)}}});
		},

		/** 1-based position among queued jobs (ids are time-sortable), or null if not queued. */
		async queuePosition(jobId: string): Promise<number | null> {
			const job = await db.job.findUnique({where: {id: jobId}, select: {status: true}});
			if (job?.status !== 'queued') return null;
			return db.job.count({where: {status: 'queued', id: {lte: jobId}}});
		},

		/** Removes a job that never started (its credit reservation failed). */
		async discard(userId: string, jobId: string): Promise<void> {
			await db.job.deleteMany({where: {id: jobId, userId, status: 'queued', reservedCredits: 0}});
		},

		/** SYSTEM (worker): internal view, not scoped by user. */
		systemGet(jobId: string) {
			return db.job.findUnique({
				where: {id: jobId},
				select: {
					id: true,
					userId: true,
					projectId: true,
					type: true,
					status: true,
					reservedCredits: true,
					deadlineAt: true,
				},
			});
		},

		/** SYSTEM (worker): queued → running. False if the job was cancelled or already taken. */
		async systemStart(jobId: string): Promise<boolean> {
			const {count} = await db.job.updateMany({
				where: {id: jobId, status: 'queued'},
				data: {status: 'running', startedAt: new Date(clock.now())},
			});
			return count > 0;
		},

		/**
		 * queued/running → a final status. Returns false if the job had already
		 * finished, so only one caller (worker, cancel, deadline sweep) wins.
		 */
		async systemFinish(
			jobId: string,
			status: 'succeeded' | 'failed' | 'cancelled',
			error: {code: ErrorCode; message: string} | null = null,
		): Promise<boolean> {
			const {count} = await db.job.updateMany({
				where: {id: jobId, status: {in: [...ACTIVE]}},
				data: {status, finishedAt: new Date(clock.now()), ...(error ? {error} : {})},
			});
			return count > 0;
		},

		/** SYSTEM (worker): records a pipeline step's state for GET /v1/jobs/:id. */
		async systemRecordStep(
			jobId: string,
			node: PipelineNode,
			status: 'running' | 'done' | 'failed' | 'skipped',
			progress?: {done: number; total: number},
		): Promise<void> {
			const now = new Date(clock.now());
			const times = status === 'running' ? {startedAt: now} : {endedAt: now};
			await db.jobStep.upsert({
				where: {jobId_node: {jobId, node}},
				create: {id: ids.next('stp'), jobId, node, status, ...times, ...(progress ? {progress} : {})},
				update: {
					status,
					...times,
					...(progress ? {progress} : {}),
					...(status === 'running' ? {attempt: {increment: 1}} : {}),
				},
			});
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

/** Pipeline progress, so a retried job resumes where it stopped (FR-GEN-05). */
export function checkpointsRepo({db, clock}: RepoDeps) {
	return {
		async load(jobId: string): Promise<unknown | null> {
			const row = await db.jobCheckpoint.findUnique({where: {jobId}});
			return row?.state ?? null;
		},

		async save(jobId: string, node: string, state: unknown): Promise<void> {
			const data = {node, state: state as Prisma.InputJsonValue, updatedAt: new Date(clock.now())};
			await db.jobCheckpoint.upsert({where: {jobId}, create: {jobId, ...data}, update: data});
		},

		/** Called when a job ends: the state is no longer needed (NFR-SCALE-07). */
		async clear(jobId: string): Promise<void> {
			await db.jobCheckpoint.deleteMany({where: {jobId}});
		},
	};
}

/** What each provider call cost us, for margin tracking (NFR-COST-01). */
export function costsRepo({db, ids, clock}: RepoDeps) {
	return {
		async record(jobId: string, cost: {provider: string; units: number; usdMicros: number}): Promise<void> {
			if (cost.units === 0 && cost.usdMicros === 0) return;
			await db.providerCost.create({
				data: {id: ids.next('cst'), jobId, ...cost, createdAt: new Date(clock.now())},
			});
		},

		/** Total spend on a job, in millionths of a dollar. */
		async totalFor(jobId: string): Promise<number> {
			const {_sum} = await db.providerCost.aggregate({where: {jobId}, _sum: {usdMicros: true}});
			return _sum.usdMicros ?? 0;
		},
	};
}

export function versionsRepo({db, ids, clock}: RepoDeps) {
	return {
		/** Saves the finished video and its scenes as the project's next version (FR-EDIT-03). */
		async createFromJob(
			userId: string,
			input: {
				projectId: string;
				jobId: string;
				videoKey: string;
				posterKey: string;
				durationSec: number;
				parentVersionId?: string | null;
				scenes: {index: number; code: string; durationFrames: number; qaReport?: unknown}[];
			},
		): Promise<{id: string; number: number}> {
			const last = await db.version.findFirst({
				where: {projectId: input.projectId},
				orderBy: {number: 'desc'},
				select: {number: true},
			});
			const id = ids.next('ver');
			const version = await db.version.create({
				data: {
					id,
					projectId: input.projectId,
					userId,
					number: (last?.number ?? 0) + 1,
					parentVersionId: input.parentVersionId ?? null,
					jobId: input.jobId,
					videoKey: input.videoKey,
					posterKey: input.posterKey,
					durationSec: input.durationSec,
					createdAt: new Date(clock.now()),
					scenes: {
						create: input.scenes.map((scene) => ({
							id: ids.next('scn'),
							index: scene.index,
							code: scene.code,
							codeHash: createHash('sha256').update(scene.code).digest('hex'),
							durationFrames: scene.durationFrames,
							qaReport: (scene.qaReport ?? null) as Prisma.InputJsonValue,
						})),
					},
				},
				select: {id: true, number: true},
			});
			return version;
		},

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
